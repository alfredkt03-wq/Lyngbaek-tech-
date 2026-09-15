# Sådan lægger du siden op — kun browser, ingen kommandoer

Du skal bruge to gratis konti: GitHub og Render. Ingen betalingskort.

---

## 1. Lav et sted at lægge filerne

Gå til **github.com** → grøn **New**-knap øverst til venstre.

- Repository name: `lyngbaek-tech`
- Vælg **Private**
- Sæt **ikke** flueben i "Add a README file"
- Klik **Create repository**

---

## 2. Træk filerne ind

På siden der kommer, står der en linje med **"uploading an existing file"** — klik den.

Marker nu **alle filer og mapper her i denne mappe** (Ctrl+A på Windows, Cmd+A på Mac)
og træk dem ind i browservinduet.

Vent til alt er uploadet. Skriv "første version" i feltet nederst, og klik
**Commit changes**.

Du skal se `package.json`, `render.yaml`, `src` og `public` i listen bagefter.
Gør du ikke det, er der kommet en ekstra mappe med — start forfra og træk
indholdet, ikke mappen.

---

## 3. Forbind Render

Gå til **render.com** → **Get Started** → log ind med GitHub.

Giv Render adgang til `lyngbaek-tech`-repoet når den spørger.

---

## 4. Start den

I Render: **New** → **Blueprint** → vælg `lyngbaek-tech` → **Apply**.

Vent 2-3 minutter. Du får en adresse i stilen
`https://data-platform-xxxx.onrender.com`.

Åbn den. Du skulle se forsiden med 01 til 09.

---

## Det var det

Siden er **privat over for Google** — den kommer ikke i søgeresultater. Kun folk
du giver adressen til kan se den.

Vil du senere på Google: i Render under **Environment**, tilføj
`SOEGEMASKINER` med værdien `ja`. Ikke før.

---

## Hvis noget driller

**Render siger "no render.yaml found"** → filerne ligger i en undermappe.
Slet repoet, lav det igen, og træk indholdet ind i stedet for mappen.

**Siden er langsom første gang** → normalt. Gratis-planen sover efter 15
minutter uden besøg og bruger 30-60 sekunder på at vågne.

**"Application failed to respond"** → åbn **Logs** i Render og send mig det der står.

---

## Hvad du får

| Nummer | Side | Adresse |
|---|---|---|
| 01 | Recession Check | `/aktier.html` |
| 02 | Danmarkskort | `/kort.html` |
| 03 | Udbudskartel-analyse | `/udbud.html` |
| 04 | Earnings-kalender | `/earnings.html` |
| 05 | Nyheder | `/nyheder.html` |

06 til 09 står som links eller "ikke deployet endnu".
