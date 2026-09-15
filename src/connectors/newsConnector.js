// Kuraterede erhvervs-/kommunerelevante nyheder — researchet 24. august 2026,
// gengivet med egne ord (ikke citater, af hensyn til ophavsret).
//
// Det tidligere forsøg på at hente DR's RSS-feeds live er fjernet: DR blokerede
// konsekvent forespørgslerne (403), så hvert kald endte i samme fejlbesked og
// samme fallback alligevel. Nu vises snapshot-listen direkte og automatisk,
// uden fejlmeddelelse eller ventetid på et kald der alligevel ikke lykkes.
//
// Kun erhverv/energi/infrastruktur — ikke sport eller generel landspolitik,
// som ikke er relevant for en kommune/erhvervs-orienteret platform.

const FETCHED_AT = '2026-08-24';

const NEWS = [
  {
    id: 'n4',
    titel: 'Stigende gaspriser kan ramme danske virksomheder',
    resume: 'Dansk Erhverv advarer om, at lave gaslagre og faldende LNG-import kan presse strømpriserne op hen mod vinteren, hvilket rammer danske virksomheders omkostninger. Organisationen opfordrer virksomheder til at gennemgå deres energiaftaler nu.',
    kategori: 'Energi',
    kilde: 'Dansk Erhverv',
    dato: '2026-08-19',
    lat: 56.2639, lng: 9.5018, lokation: 'National (energimarked)',
  },
  {
    id: 'n5',
    titel: 'To jyske motorveje har fået nye navne',
    resume: 'Rute 18 hedder nu Holstebromotorvejen på hele strækningen, efter at det tidligere navn er frigivet til den kommende Midtjyske Motorvej mellem Haderslev og Hobro via Billund og Viborg, som nu begynder at tage form.',
    kategori: 'Infrastruktur',
    kilde: 'FDM',
    dato: '2026-08-07',
    lat: 56.3606, lng: 8.6198, lokation: 'Holstebro / Midtjylland',
  },
  {
    id: 'n6',
    titel: 'Nyt initiativ skal gøre sydjyske startups klar til kapital',
    resume: 'IBA Erhvervsakademi Kolding og Erhvervshus Sydjylland lancerer tre nye fag, der skal ruste iværksættere til at rejse ekstern kapital. Ifølge DI\'s Iværksætterbarometer 2026 fik kun 1,6 procent af nye virksomheder i 2025 en ekstern investering på mindst én million kroner.',
    kategori: 'Erhverv',
    kilde: 'IBA Erhvervsakademi / 24Victoria',
    dato: '2026-08-19',
    lat: 55.4904, lng: 9.4721, lokation: 'Kolding',
  },
  {
    id: 'n7',
    titel: 'Milliardinvestering i datacenter ved Esbjerg',
    resume: 'Prime Data Centers planlægger et stort datacenter ved Stovstrup nær Esbjerg med en første investering på omkring 15 mia. kr. og potentiale for flere hundrede varige arbejdspladser. Projektet skal først igennem en miljøvurdering (VVM).',
    kategori: 'Erhverv',
    kilde: 'Dagens Byggeri',
    dato: '2026-03-26',
    lat: 55.4765, lng: 8.4594, lokation: 'Esbjerg',
  },
  {
    id: 'n8',
    titel: 'Thornico topper liste over fynske virksomhedsoverskud',
    resume: 'Efter 13 års forsøg er det lykkedes Christian og Thor Stadils virksomhed Thornico at opnå det største overskud blandt fynske virksomheder, med et overskud på over en milliard kroner.',
    kategori: 'Erhverv',
    kilde: 'Fyens Stiftstidende',
    dato: '2026-08-16',
    lat: 55.4038, lng: 10.4024, lokation: 'Odense',
  },
];


// ---------------------------------------------------------------------------
// LIVE-HENTNING (tilføjet): forsøger rigtige RSS-feeds først, falder tilbage til
// snapshot-listen ovenfor hvis de ikke svarer. DR blokerede tidligere kald, så
// her bruges kilder der tillader det. Fejler alt, vises snapshot uden fejlbesked.
// ---------------------------------------------------------------------------
const Parser = require('rss-parser');
const parser = new Parser({ timeout: 5000, headers: { 'User-Agent': 'LyngbaekTech/1.0' } });

const FEEDS = [
  { url: 'https://www.altinget.dk/rss',            kilde: 'Altinget',      kategori: 'Politik' },
  { url: 'https://nyheder.tv2.dk/rss',             kilde: 'TV 2',          kategori: 'Erhverv' },
  { url: 'https://www.version2.dk/rss/nyheder',    kilde: 'Version2',      kategori: 'Teknologi' },
];

// Grov geokodning: nævnes en dansk by, sættes punktet der. Ellers midt i landet.
const BYER = [
  ['københavn', 55.6761, 12.5683], ['aarhus', 56.1629, 10.2039], ['århus', 56.1629, 10.2039],
  ['odense', 55.4038, 10.4024], ['aalborg', 57.0488, 9.9217], ['esbjerg', 55.4765, 8.4594],
  ['kolding', 55.4904, 9.4721], ['vejle', 55.7090, 9.5357], ['randers', 56.4607, 10.0369],
  ['horsens', 55.8607, 9.8503], ['roskilde', 55.6415, 12.0803], ['helsingør', 56.0361, 12.6136],
];
function stedFor(tekst) {
  const t = String(tekst).toLowerCase();
  for (const [navn, lat, lng] of BYER) if (t.includes(navn)) return { lat, lng, lokation: navn[0].toUpperCase() + navn.slice(1) };
  return { lat: 56.2639, lng: 9.5018, lokation: 'National' };
}

let CACHE = null;
let CACHE_TID = 0;
const CACHE_MS = 30 * 60 * 1000; // 30 min

async function hentLive() {
  const ud = [];
  const resultater = await Promise.allSettled(FEEDS.map(f => parser.parseURL(f.url)));

  resultater.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !r.value || !Array.isArray(r.value.items)) return;
    const f = FEEDS[i];
    r.value.items.slice(0, 6).forEach((item, n) => {
      const titel = (item.title || '').trim();
      if (!titel) return;
      const sted = stedFor(titel + ' ' + (item.contentSnippet || ''));
      ud.push({
        id: 'live-' + i + '-' + n,
        titel,
        resume: (item.contentSnippet || '').trim().slice(0, 260),
        kategori: f.kategori,
        kilde: f.kilde,
        dato: item.isoDate ? item.isoDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
        link: item.link || null,
        live: true,
        ...sted,
      });
    });
  });

  ud.sort((a, b) => String(b.dato).localeCompare(String(a.dato)));
  return ud;
}

// Snapshot-udgaven (fallback)
// Automatisk og synkron i praksis — ingen netværkskald, ingen fejlbesked,
// ingen ventetid. Returnerer bare den kuraterede liste hver gang.
let HENTER = false;

// Opdaterer cachen i baggrunden. Ingen venter på den.
function opdaterIBaggrunden() {
  if (HENTER) return;
  HENTER = true;
  hentLive()
    .then(live => {
      if (live.length >= 3) { CACHE = live; CACHE_TID = Date.now(); }
    })
    .catch(() => {})
    .finally(() => { HENTER = false; });
}

// Svarer ØJEBLIKKELIGT: frisk cache hvis den findes, ellers snapshot.
// Er cachen gammel eller tom, sættes en baggrundshentning i gang til næste kald.
async function fetchAll() {
  const frisk = CACHE && Date.now() - CACHE_TID < CACHE_MS;
  if (!frisk) opdaterIBaggrunden();
  return CACHE || NEWS;
}

// Fortæller resten af systemet om det sidste svar var live eller snapshot
function status() {
  const frisk = CACHE && Date.now() - CACHE_TID < CACHE_MS;
  return {
    kilde: frisk ? 'live' : 'snapshot',
    antal: frisk ? CACHE.length : NEWS.length,
    hentet: frisk ? new Date(CACHE_TID).toISOString() : FETCHED_AT,
    feeds: FEEDS.map(f => f.kilde),
  };
}

module.exports = { name: 'news', entityType: 'nyhed', fetchAll, status, NEWS, fetchedAt: FETCHED_AT };
