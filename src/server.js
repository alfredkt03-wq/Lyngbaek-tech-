require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const { listEntities, getEntity, getAuditLog } = require('./lib/db');
const { syncOne, syncMany } = require('./lib/sync');

// -- Robusthed: hvis noget uventet går galt et sted (fx en connector der fejler på en
// måde vi ikke havde forudset), logger vi det og fortsætter i stedet for at serveren
// crasher og lukker helt ned. Bedre at én ting fejler end at alt stopper.
process.on('uncaughtException', err => {
  console.error('[uventet fejl, serveren fortsætter]', err.message);
});
process.on('unhandledRejection', err => {
  console.error('[uventet promise-fejl, serveren fortsætter]', err instanceof Error ? err.message : err);
});

const connectors = {
  dst_regnskab: require('./connectors/dstRegnskabConnector'), // kommunal regnskabsdata (mocked, shaped like DST's REGK100)
  market_events: require('./connectors/marketEventsConnector'), // eksempeldata, tydeligt mærket
  ships: require('./connectors/shipsConnector'), // eksempel-AIS-data, tydeligt mærket
  news: require('./connectors/newsConnector'), // ÆGTE nyheder, statisk snapshot
  earnings: require('./connectors/earningsConnector'), // ÆGTE data hvor verificeret, kvalitativt hvor ikke
  recession_indicator: require('./connectors/economicIndicatorsConnector'), // recession-warning score 1-100

  // Add new source systems here as you build them, e.g.:
  // okonomisystem: require('./connectors/okonomisystemConnector'),
};

const anomaly = require('./lib/anomaly');
const cartel = require('./lib/cartelDetection');

const app = express();
app.use(express.json());
// Som standard holdes siden UDE af Google. Sæt SOEGEMASKINER=ja i Render
// (Environment) den dag den skal kunne findes i søgning.
const TILLAD_SOEGEMASKINER = String(process.env.SOEGEMASKINER || '').toLowerCase() === 'ja';
app.use((req, res, next) => {
  if (!TILLAD_SOEGEMASKINER) res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});

app.use(express.static(require('path').join(__dirname, '..', 'public')));

// -- SEO: robots.txt og sitemap.xml genereres med den rigtige adresse,
// uanset om siden kører lokalt, på Render eller på et eget domæne. --
function siteUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  return proto + '://' + req.get('host');
}

// Som standard holdes siden UDE af Google. Sæt SOEGEMASKINER=ja i Render
// (Environment) den dag den skal kunne findes i søgning.

app.get('/robots.txt', (req, res) => {
  if (!TILLAD_SOEGEMASKINER) {
    return res.type('text/plain').send('User-agent: *\nDisallow: /\n');
  }
  res.type('text/plain').send(
    'User-agent: *\nAllow: /\nSitemap: ' + siteUrl(req) + '/sitemap.xml\n'
  );
});

app.get('/sitemap.xml', (req, res) => {
  const base = siteUrl(req);
  const sider = [
    ['/', '1.0'], ['/aktier.html', '0.8'], ['/kort.html', '0.8'],
    ['/udbud.html', '0.8'], ['/earnings.html', '0.7'], ['/nyheder.html', '0.7'],
  ];
  const i = new Date().toISOString().slice(0, 10);
  res.type('application/xml').send(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    sider.map(([u, p]) =>
      '  <url><loc>' + base + u + '</loc><lastmod>' + i + '</lastmod><priority>' + p + '</priority></url>'
    ).join('\n') +
    '\n</urlset>\n'
  );
});

// -- Datastatus: hvad er live, hvad er snapshot, hvornår blev det hentet.
// Gør det muligt at se på siden om tallene er friske i stedet for at gætte. --
app.get('/api/status', (req, res) => {
  const nyhedStatus = connectors.news.status ? connectors.news.status() : null;
  const rec = connectors.recession_indicator.status ? connectors.recession_indicator.status() : null;
  res.json({
    tid: new Date().toISOString(),
    naeste_automatiske: 'hver time',
    kilder: [
      { navn: 'Recessionsindikatorer', type: rec ? rec.kilde : 'snapshot',
        hentet: rec ? rec.hentet : '2026-08-24',
        note: rec && rec.kilde === 'live'
          ? rec.felter + ' af 5 indikatorer hentet live fra FRED.'
          : (process.env.FRED_API_KEY
              ? 'FRED-nøgle sat — henter i baggrunden, viser snapshot indtil da.'
              : 'Faste tal. Sæt FRED_API_KEY (gratis) for live BNP, ledighed, spænd, VIX og boligbyggeri.') },
      { navn: 'Nyheder', type: nyhedStatus ? nyhedStatus.kilde : 'snapshot',
        hentet: nyhedStatus ? nyhedStatus.hentet : null,
        note: nyhedStatus && nyhedStatus.kilde === 'live'
          ? 'Hentet fra ' + nyhedStatus.feeds.join(', ') + '.'
          : 'Live-feeds kunne ikke nås — viser researchet snapshot.' },
      { navn: 'Kommuneregnskaber', type: 'live-forsøg', hentet: null,
        note: 'Kalder Danmarks Statistiks API direkte, falder tilbage til demodata.' },
      { navn: 'Earnings', type: process.env.FINNHUB_API_KEY ? 'delvist live' : 'snapshot',
        hentet: '2026-08-24',
        note: process.env.FINNHUB_API_KEY
          ? 'Novo Nordisk hentes live via Finnhub.'
          : 'Sæt FINNHUB_API_KEY for live kurser på Novo Nordisk.' },
      { navn: 'Virksomhedsevents', type: 'eksempel', hentet: null, note: 'Opdigtede data, tydeligt mærket.' },
      { navn: 'Skibstrafik', type: 'eksempel', hentet: null, note: 'Opdigtede AIS-lignende data.' },
    ],
  });
});

// -- Manual sync: pull one or more records from a given connector right now --
app.post('/api/sync/:connector', async (req, res) => {
  const connector = connectors[req.params.connector];
  if (!connector) return res.status(404).json({ error: `Unknown connector: ${req.params.connector}` });

  const { sourceRefs } = req.body;
  if (!Array.isArray(sourceRefs) || sourceRefs.length === 0) {
    return res.status(400).json({ error: 'Body must include sourceRefs: string[]' });
  }

  const results = await syncMany(connector, sourceRefs);
  res.json({ connector: connector.name, results });
});

// -- Browse the normalized data, regardless of which connector it came from --
app.get('/api/entities', (req, res) => {
  const { entityType, source, limit } = req.query;
  const rows = listEntities({ entityType, source, limit: limit ? Number(limit) : undefined });
  res.json(rows);
});

app.get('/api/entities/:id', (req, res) => {
  const entity = getEntity(req.params.id);
  if (!entity) return res.status(404).json({ error: 'Not found' });
  res.json(entity);
});

// -- Full audit trail for one entity: every sync, every change, when it happened --
app.get('/api/entities/:id/audit', (req, res) => {
  res.json(getAuditLog(req.params.id));
});

// -- The actual product: a short, prioritized list of things worth investigating --
// GET /api/analysis/:kommune -> peer benchmarking + trend deviation + budget vs actual,
// combined and sorted by severity. This is what a kommune's økonomichef would look at,
// not raw regnskabstal.
app.get('/api/analysis/:kommune', (req, res) => {
  try {
    const report = anomaly.fullReport(req.params.kommune);
    res.json({ kommune: req.params.kommune, findings_count: report.length, findings: report });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// -- Udbudskartel-detektion: co-bidding graf + mistænkelige mønstre --
// GET /api/udbud/analysis -> netværksgraf over hvilke firmaer der byder mod hinanden,
// plus flaggede mønstre (vinder-rotation, pris-klumpning) der bør undersøges nærmere.
app.get('/api/udbud/analysis', (req, res) => {
  res.json(cartel.fullReport());
});

// -- Danmarkskort: tre separate lag, hvert bag sit eget API-endpoint --
app.get('/api/market-events', async (req, res) => {
  try {
    res.json(await connectors.market_events.fetchAll());
  } catch (err) {
    res.status(500).json({ error: 'Kunne ikke hente market-events data', detaljer: err.message });
  }
});

app.get('/api/recession-check', async (req, res) => {
  try {
    res.json(await connectors.recession_indicator.fetchAll());
  } catch (err) {
    res.status(500).json({ error: 'Kunne ikke beregne recession-score', detaljer: err.message });
  }
});

app.get('/api/ships', async (req, res) => {
  try {
    res.json(await connectors.ships.fetchAll());
  } catch (err) {
    res.status(500).json({ error: 'Kunne ikke hente skibsdata', detaljer: err.message });
  }
});

app.get('/api/news', async (req, res) => {
  try {
    res.json({ fetchedAt: connectors.news.fetchedAt, data: await connectors.news.fetchAll() });
  } catch (err) {
    res.status(500).json({ error: 'Kunne ikke hente nyheder', detaljer: err.message });
  }
});

// -- Earnings-kalender: automatisk opdateret via cron-scheduleren nedenfor, ikke manuelt --
app.get('/api/earnings', async (req, res) => {
  try {
    res.json({ fetchedAt: connectors.earnings.fetchedAt, data: await connectors.earnings.fetchAll() });
  } catch (err) {
    res.status(500).json({ error: 'Kunne ikke hente earnings-data', detaljer: err.message });
  }
});

// -- Automatisk live aktie-data til aktier.html — nøglen ligger i .env på serveren,
// aldrig i browseren. Siden kalder dette ved indlæsning, ingen manuel indtastning. --
app.get('/api/stock-live', async (req, res) => {
  try {
    const hasKey = !!process.env.FINNHUB_API_KEY;
    const [price, news] = await Promise.all([
      connectors.earnings.fetchNovoNordiskLive(),
      connectors.earnings.fetchNovoNordiskNews(),
    ]);
    res.json({ hasKey, price, news });
  } catch (err) {
    res.status(500).json({ error: 'Kunne ikke hente live aktiedata', detaljer: err.message });
  }
});

app.get('/api/connectors', (req, res) => {
  res.json(Object.values(connectors).map(c => ({ name: c.name, entityType: c.entityType })));
});

app.get('/api', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Data platform proof-of-concept',
    endpoints: [
      'POST /api/sync/:connector  { sourceRefs: ["12345678"] }',
      'GET  /api/entities?entityType=&source=&limit=',
      'GET  /api/entities/:id',
      'GET  /api/entities/:id/audit',
      'GET  /api/connectors',
    ],
  });
});

// -- Global fejl-opsamling: fanger alt der ikke allerede er håndteret ovenfor,
// og giver en pæn JSON-fejl i stedet for et teknisk stacktrace i browseren.
// Skal stå EFTER alle app.get/app.post ovenfor, ellers fanger den intet. --
app.use((err, req, res, next) => {
  console.error('[server-fejl]', err.message);
  res.status(500).json({ error: 'Der opstod en uventet fejl på serveren', detaljer: err.message });
});

// -- "Hele tiden": automatisk baggrunds-opdatering, ingen manuel handling nødvendig --
// Dette er den ENESTE automatik-mekanisme nu (den gamle CVR-baserede sync er fjernet,
// den var kun demo-kode uden reel relevans for produktet). Kalder fetchAll() på hver
// connector nedenfor — når en connector er koblet til en rigtig API, henter dette job
// nye tal af sig selv, uden nogen skal spørge om det.
const AUTO_REFRESH_CONNECTORS = ['earnings', 'news', 'market_events', 'ships'];

function runAutoRefresh() {
  for (const name of AUTO_REFRESH_CONNECTORS) {
    const connector = connectors[name];
    if (!connector || !connector.fetchAll) continue;
    connector.fetchAll()
      .then(data => console.log(`[auto-refresh] ${new Date().toISOString()} — ${name}: ${data.length} poster hentet`))
      .catch(err => console.error(`[auto-refresh] fejl for ${name}:`, err.message));
  }
}

// PRODUKTIONS-SKEMA: kører hver dag kl. 06:00. Det er dette der gør data "automatisk
// dagligt" — ingen skal starte det manuelt, det kører af sig selv så længe serveren kører.
// Til udvikling/test, hvor du vil se det ske hurtigere, skift til fx '*/5 * * * *' (hvert 5. min).
cron.schedule('0 * * * *', runAutoRefresh);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Data platform running on http://localhost:${PORT}`);
  console.log('Automatisk opdatering hver time — se AUTO_REFRESH_CONNECTORS i server.js');
  runAutoRefresh(); // kør også én gang med det samme ved opstart, så data ikke er tomt
});
