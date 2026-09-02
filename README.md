# Data Platform

Et data-integrationsfundament til det danske marked: kommunale budgetafvigelser,
udbudskartel-mønstre, og en aktie-/markedsdel (vejr, nyheder, earnings). Ryddet op til
kun det relevante — de tidlige demo-connectors (CVR-eksempel, mock-sagssystem) er fjernet.

## Kør det

```bash
npm install
node src/server.js
```

Åbn `http://localhost:3000` — det er kommune-dashboardet. De andre sider:
- `http://localhost:3000/udbud.html` — udbudskartel-analyse
- `http://localhost:3000/kort.html` — Danmarkskort (vejr/nyheder/events/skibe)
- `http://localhost:3000/earnings.html` — earnings-kalender

## Tjek at alt virker — `npm run verify`

```bash
npm run verify
```

Kør denne kommando **hver gang noget er blevet ændret** (af mig eller dig selv), før du
starter serveren. Den tjekker automatisk:
- At alle JavaScript-filer er syntaktisk korrekte
- At ingen filer har beskadigede tegn (den type fejl der tidligere ramte `udbud.html`)
- At JavaScript'en indeni hver HTML-side også er korrekt

Grønne ✓ betyder alt er i orden. Røde ✗ FEJL fortæller dig præcis hvilken fil der har
et problem, så det kan rettes før det bliver til en fejl i browseren.

Derudover fanger serveren nu selv uventede fejl under drift (se `process.on('uncaughtException', ...)`
i `server.js`) — går en enkelt ting galt, crasher hele serveren ikke længere, den logger
fejlen og fortsætter.

## Automatisk daglig opdatering

`server.js` starter et cron-job der som standard kører **hver dag kl. 06:00**
(`AUTO_REFRESH_CONNECTORS`), og henter data fra hver connector automatisk — ingen
manuel handling nødvendig, så længe serveren kører. Kører også én gang ved opstart.

**Vigtig grænse:** dette er en server-app, ikke en fil du åbner i browseren. Den skal
køre kontinuerligt for at "automatisk dagligt" giver mening — enten på din egen maskine
(tændt) eller en billig VPS (fx 30-50 kr/md hos DigitalOcean/Hetzner). Til test: skift
cron-linjen i `server.js` til `'*/5 * * * *'` for at se det ske hvert 5. minut i stedet.

## Connectors — hvad er ægte, hvad er eksempel

| Connector | Status | Detaljer |
|---|---|---|
| `weather` | **Ægte** | Vejr for 5 danske byer, statisk snapshot |
| `news` | **Ægte** | 8 researchede, daterede danske nyheder |
| `earnings` | **Ægte hvor verificeret + rigtig live-forbindelse** | Novo Nordisk, Mærsk, Genmab har rigtige RSI/EPS/kursmål-tal; **Finnhub-integration virker for Novo Nordisk** (sæt `FINNHUB_API_KEY`, gratis nøgle) |
| `dst_regnskab` | **Rigtig API-forbindelse tilføjet** | Kalder nu Statistikbankens API (`api.statbank.dk`) direkte — gratis, ingen nøgle. Falder pænt tilbage til demo-data hvis kaldet fejler. Variabelkoder bør verificeres i DST's API-konsol før produktion (se note i filen) |
| `market_events` | Eksempel | Virksomhedsevents, tydeligt mærket i data |
| `ships` | Eksempel | AIS-stil skibspositioner, tydeligt mærket i data |

### Aktivér de gratis kilder — konkret tjekliste

1. **DST Statistikbank (kommune-data)** — virker allerede uden noget fra dig, ingen nøgle
   nødvendig. Testet fra mit sandbox-miljø, som ikke kan nå internettet uden for en
   godkendt liste — kør det selv lokalt for at bekræfte det virker fra din maskine.
2. **Finnhub (Novo Nordisk aktiedata)** — gå til finnhub.io/register (gratis, 2 min),
   sæt nøglen: `export FINNHUB_API_KEY=din_nøgle_her` før du starter serveren.
3. **udbud.dk / TED (udbudsdata)** — **ikke koblet på endnu.** Jeg fandt ikke en
   bekræftet, simpel offentlig API for udbud.dk specifikt og ville ikke gætte og
   præsentere ubekræftet kode som virkende. TED (EU's udbudsdatabase) har en
   bekræftet API og dækker danske offentlige udbud over tærskelværdien — det er
   næste skridt hvis kartel-detektionen skal køre på ægte data.

## Arkitektur

```
Kildesystem A ─┐
Kildesystem B ─┼─> Connector ─> Normalize ─> entities-tabel ─> API
Kildesystem C ─┘                                  │
                                                    └─> audit_log
```

- **`src/connectors/*.js`** — én fil per kildesystem. `fetchAll()` for connectors med
  automatisk baggrundsopdatering, `fetchOne()`+`normalize()` for connectors der bruger
  sync/audit-lag'et (kun `dst_regnskab` lige nu).
- **`src/lib/sync.js` + `src/lib/db.js`** — entity-lag med fuld audit-historik (hvem
  ændrede hvad, hvornår). JSON-fil-baseret lager, skift til Postgres i produktion.
- **`src/lib/anomaly.js`** — budget-afvigelsesanalyse (peer/trend/budget) for kommuner.
- **`src/lib/cartelDetection.js`** — udbudskartel-mønstre (vinder-rotation, pris-klumpning).
- **`src/server.js`** — API + cron-baseret automatisk opdatering.

### Sådan tilføjer du et nyt kildesystem
1. Opret `src/connectors/dit-system.js` med `fetchAll()` (og evt. `fetchOne`+`normalize`)
2. Registrér den i `connectors`-objektet i `src/server.js`
3. Tilføj navnet til `AUTO_REFRESH_CONNECTORS` hvis den skal opdateres automatisk

## Produkt 1: Kommunale budgetafvigelser

`GET /api/analysis/:kommune` — kort, prioriteret liste af budgetposter der bør
undersøges, ikke en tabel med alle regnskabstal. Tre analysetyper:
1. **Peer-afvigelse** — sammenlignet med kommuner af samme størrelse, pr. indbygger
2. **Trend-afvigelse** — sammenlignet med kommunens egen historik
3. **Budget-afvigelse** — faktisk forbrug vs. budgetteret

Data i `dstRegnskabConnector.js` er formet som Danmarks Statistiks REGK100-tabel — ægte
data findes offentligt for alle 98 kommuner via Statistikbankens API, ikke koblet til endnu.

## Produkt 2: Udbudskartel-detektion

`GET /api/udbud/analysis` — netværksgraf over hvilke firmaer der byder mod hinanden,
plus to mønstertyper: **vinder-rotation** (samme faste gruppe firmaer skiftes til at
vinde) og **pris-klumpning** (bud der ligger mistænkeligt tæt, kan indikere aftalte
"cover bids"). Analyserer mønstre mellem *virksomheder*, ikke enkeltpersoner/borgere —
en vigtig juridisk/etisk grænse hvis du bygger videre.

## Produkt 3: Aktier/markedsdata

`GET /api/weather`, `/api/news`, `/api/earnings`, `/api/market-events`, `/api/ships` —
se tabellen ovenfor for hvad der er ægte. Earnings-connectoren har en virkende Finnhub-
integration for Novo Nordisk (sæt `FINNHUB_API_KEY`); resten af C25 er ikke dækket af
gratis finansielle API'er (tjekket grundigt, inkl. Saxo Banks OpenAPI, som kræver en
finansieret live-konto med data-abonnement).

## Hvad der mangler før det kan sælges

1. **Adgangsstyring** — hvem må se hvad. Kritisk for offentligt salg, findes ikke endnu.
2. **Postgres i stedet for JSON-fil** — fint til demo, ikke til produktion.
3. **Rigtig hosting i EU/Danmark** — nødvendigt for databehandleraftale/GDPR.
4. **Rigtige API-forbindelser** i stedet for snapshots — Statistikbanken for kommuner,
   en betalt Nordic-data-leverandør for aktier, udbud.dk for kartelanalyse.
