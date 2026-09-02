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

// Automatisk og synkron i praksis — ingen netværkskald, ingen fejlbesked,
// ingen ventetid. Returnerer bare den kuraterede liste hver gang.
async function fetchAll() {
  return NEWS;
}

module.exports = { name: 'news', entityType: 'nyhed', fetchAll, NEWS, fetchedAt: FETCHED_AT };
