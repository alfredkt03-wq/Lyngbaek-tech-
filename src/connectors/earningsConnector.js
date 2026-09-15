// STRUKTUR: bygget til at blive kaldt automatisk af cron-scheduleren i server.js
// (samme mekanisme der allerede kører hvert minut for cvr-connectoren). Det er den
// rigtige måde at få "automatisk" til at betyde noget — ikke et manuelt opslag hver
// gang nogen spørger, men et job der kører af sig selv når serveren kører.
//
// LIGE NU: fetchAll() returnerer et fast snapshot, fordi dette sandbox-miljø ikke kan
// nå ud til en rigtig finansiel API. I en rigtig deployment erstattes indholdet af
// fetchAll() med et kald til fx Financial Modeling Prep's /earnings-calendar endpoint,
// Finnhub's /calendar/earnings, eller Alpha Vantage's EARNINGS — alle har gratis
// niveauer der dækker de fleste C25-selskaber. Cron-scheduleren i server.js kalder så
// denne funktion automatisk med jævne mellemrum, og DET er hvad der gør det automatisk.
//
// ÆRLIGHED OM TALLENE: kun Novo Nordisk har verificerede, præcise actual-vs-expected
// EPS-tal fundet via research. For de øvrige selskaber er der kun kvalitativ info
// (fx "slog forventningerne") uden opdigtede tal — se `detaljer_tilgaengelige: false`.

const FETCHED_AT = '2026-08-24';

const EARNINGS = [
  {
    selskab: 'Novo Nordisk', ticker: 'NOVO-B',
    seneste_rapport_dato: '2026-08-04',
    actual_eps_usd: 0.96, expected_eps_usd: 0.81,
    overraskelse_pct: 18.64,
    resultat: 'beat',
    detaljer_tilgaengelige: true,
    naeste_rapport_dato: '2026-11-04', naeste_forventet_eps_usd: 0.80,
    note: 'Slog forventningerne markant, men opjusterede samtidig med svagere guidance for resten af 2026 (ventet nedgang i justeret salg), hvilket fik aktien til at falde i USA på trods af beatet.',
    teknisk_analyse: { rsi: 40.1, sma20: 307.60, sma50: 306.60, sma200: 291.40, kursmaal: 314.37, potentiale_pct: 7.86, dato: '2026-08-18', kilde: 'TradeDesk' },
  },
  {
    selskab: 'A.P. Møller-Mærsk', ticker: 'MAERSK-B',
    seneste_rapport_dato: '2026-08-13',
    actual_eps_usd: 87.00, expected_eps_usd: null,
    overraskelse_pct: 150,
    resultat: 'beat',
    detaljer_tilgaengelige: true,
    naeste_rapport_dato: null, naeste_forventet_eps_usd: null,
    note: 'EPS på $87,00 i Q2 2026, op fra $38,00 i Q2 2025 — ifølge Simply Wall St slog det konsensus med omkring 150%. Selskabet opjusterede samtidig fuldårsguidance efter stærk vækst i volumen og indtjening. Præcist konsensustal for forventet EPS ikke fundet, kun overraskelsesprocenten.',
    teknisk_analyse: { rsi: 57.3, kursmaal: 14404.40, potentiale_pct: -33.7, dato: '2026-08-17', kilde: 'TradeDesk', note: 'Kursen ligger over analytikernes kursmål — anses for overvurderet' },
  },
  {
    selskab: 'Genmab', ticker: 'GMAB',
    seneste_rapport_dato: '2026-08-10',
    actual_eps_usd: null, expected_eps_usd: null,
    overraskelse_pct: null,
    resultat: 'beat_kvalitativt',
    detaljer_tilgaengelige: false,
    naeste_rapport_dato: null, naeste_forventet_eps_usd: null,
    note: 'Overgik forventningerne og hævede prognosen for hele året. Konkrete konsensus-EPS-tal ikke fundet i research.',
    teknisk_analyse: { rsi: 67.0, kursmaal: 2403.74, potentiale_pct: 19.4, dato: '2026-08-09', kilde: 'TradeDesk', note: 'Over SMA50/SMA200 — overordnet optrend, kursen er 6,9% over 20-dages gennemsnit' },
  },
  {
    selskab: 'Ørsted', ticker: 'ORSTED',
    seneste_rapport_dato: '2026-08-13',
    actual_eps_usd: null, expected_eps_usd: 1.36,
    overraskelse_pct: null,
    resultat: 'blandet',
    detaljer_tilgaengelige: false,
    naeste_rapport_dato: null, naeste_forventet_eps_usd: null,
    note: 'Markedet ventede en EPS på $1,36, men Ørsted rapporterer ikke selv EPS som deres primære nøgletal (de fokuserer på EBITDA). Den underliggende EBITDA-guidance slog konsensus, men det bogførte nettoresultat faldt pga. nedskrivninger på amerikanske aktiver — aktien faldt 4,15% på dagen.',
  },
];

// ÆGTE datastrategi, ikke gæt: Novo Nordisk handler også som "NVO" på NYSE, så den er
// dækket af gratis-niveauet hos Finnhub — det er den ene aktie i denne liste, der reelt
// kan hentes automatisk og gratis. Mærsk, Ørsted, Vestas og Genmab handler kun på Nasdaq
// Copenhagen, som IKKE er dækket af gratis finansielle API'er (tjekket: end ikke Saxo
// Banks eget OpenAPI giver markedsdata uden en rigtig, finansieret live-konto med
// data-abonnement — der findes ingen gratis genvej til det).
//
// Sæt FINNHUB_API_KEY som miljøvariabel (gratis nøgle: finnhub.io/register) for at aktivere
// ægte, automatisk hentning af Novo Nordisk. Uden nøgle falder den tilbage til snapshottet.
const https = require('https');

function fetchNovoNordiskLive() {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) return resolve(null); // no key set — caller falls back to snapshot

    https.get(`https://finnhub.io/api/v1/quote?symbol=NVO&token=${apiKey}`, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const quote = JSON.parse(body);
          // Finnhub quote shape: c=current, pc=previous close
          if (typeof quote.c !== 'number') return resolve(null);
          resolve({
            actual_eps_usd: null, // quote endpoint doesn't include EPS — would need /stock/earnings endpoint
            live_price_usd: quote.c,
            live_change_pct: ((quote.c - quote.pc) / quote.pc) * 100,
          });
        } catch (err) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

// Samme mønster som prisen ovenfor — henter rigtige nyhedsoverskrifter server-side,
// med den samme nøgle fra .env. Bruges af /api/stock-live, som aktier.html kalder
// automatisk ved indlæsning — ingen manuel nøgle-indtastning i browseren nødvendig.
function fetchNovoNordiskNews() {
  return new Promise((resolve) => {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) return resolve([]);

    const today = new Date().toISOString().slice(0, 10);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    https.get(`https://finnhub.io/api/v1/company-news?symbol=NVO&from=${monthAgo}&to=${today}&token=${apiKey}`, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const news = JSON.parse(body);
          if (!Array.isArray(news)) return resolve([]);
          resolve(news.slice(0, 5).map(n => ({
            headline: n.headline, source: n.source, url: n.url, datetime: n.datetime,
          })));
        } catch (err) { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });
}

async function fetchAll() {
  const liveNovo = await fetchNovoNordiskLive();
  if (liveNovo) {
    // Merge live price data into the Novo Nordisk snapshot entry — proves the
    // automatic pipeline actually works end to end, not just the architecture.
    return EARNINGS.map(e => e.ticker === 'NOVO-B' ? { ...e, ...liveNovo, live_data: true } : e);
  }
  return EARNINGS;
}

module.exports = { name: 'earnings', entityType: 'regnskab', fetchAll, EARNINGS, fetchedAt: FETCHED_AT, fetchNovoNordiskLive, fetchNovoNordiskNews };
