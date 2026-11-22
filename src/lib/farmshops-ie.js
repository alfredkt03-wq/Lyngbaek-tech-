// Raw milk finder data for the Republic of Ireland.
// Source: data/seed/ireland-getrawmilk.json (facts collected by hand from getrawmilk.com; each entry links back).
// build() geocodes every entry with OpenStreetMap Nominatim (1 request per second, cached) and writes data/farmshops-ie.json.
// Entries that cannot be found by address fall back to their town and are marked approximate.

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const SEED = path.join(__dirname, '..', '..', 'data', 'seed', 'ireland-getrawmilk.json');
const DATA_FILE = process.env.FARMSHOPS_IE_FILE || path.join(__dirname, '..', '..', 'data', 'farmshops-ie.json');
const CACHE_FILE = process.env.FARMSHOPS_IE_CACHE || path.join(__dirname, '..', '..', 'data', 'geocache-ie.json');
const UA = 'FarmShopFinder/1.0 (contact: lyngbaek-tech.onrender.com)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const round = n => Math.round(n * 1e5) / 1e5;

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

async function nominatim(q) {
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ie&q=' + encodeURIComponent(q);
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, timeout: 30000 });
  if (!res.ok) throw new Error('Nominatim ' + res.status);
  const j = await res.json();
  return j[0] ? { lat: round(parseFloat(j[0].lat)), lon: round(parseFloat(j[0].lon)) } : null;
}

async function geocode(e, cache, stats) {
  const tries = [
    { key: 'a|' + [e.name, e.address, e.town, e.region].join('|'), q: [e.address, e.town, 'County ' + e.region, 'Ireland'].filter(Boolean).join(', '), approx: !e.address },
    { key: 't|' + e.town + '|' + e.region, q: [e.town, 'County ' + e.region, 'Ireland'].join(', '), approx: true },
  ];
  if (!e.address) tries.shift(); // nothing more precise than the town to look up
  for (const t of tries) {
    if (t.key in cache) { if (cache[t.key]) return { ...cache[t.key], approx: t.approx }; continue; }
    try {
      const hit = await nominatim(t.q);
      stats.calls++;
      await sleep(1100); // Nominatim usage policy: at most one request per second
      cache[t.key] = hit;
      if (hit) return { ...hit, approx: t.approx };
    } catch (err) { stats.errors++; console.warn('[farmshops-ie] geocode', t.q, '-', err.message); await sleep(2000); }
  }
  return null;
}

async function build() {
  const seed = readJson(SEED, null);
  if (!seed || !Array.isArray(seed.entries)) throw new Error('Irish seed file missing');
  const cache = readJson(CACHE_FILE, {});
  const prev = readJson(DATA_FILE, null);
  const prevById = new Map((prev ? prev.shops : []).map(s => [s.id, s]));
  const stats = { calls: 0, errors: 0 };
  const shops = [];
  for (const e of seed.entries) {
    const g = await geocode(e, cache, stats);
    const old = prevById.get(e.id);
    const pos = g || (old && typeof old.lat === 'number' ? { lat: old.lat, lon: old.lon, approx: true } : null);
    if (!pos) continue; // cannot be placed on the map
    shops.push({
      id: e.id, kind: e.kind, name: e.name, address: e.address, town: e.town, postcode: '', region: e.region, area: e.region,
      lat: pos.lat, lon: pos.lon, approx: pos.approx, phone: '', website: '', hours: '', organic: false,
      species: e.species, fluid: e.fluid, description: e.products, sourceUrl: e.source, sources: ['getrawmilk'],
    });
  }
  try { fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true }); fs.writeFileSync(CACHE_FILE, JSON.stringify(cache)); } catch { /* cache is optional */ }
  if (!shops.length) throw new Error('No Irish entries could be placed on the map');
  const count = { total: shops.length };
  shops.forEach(s => { count[s.kind] = (count[s.kind] || 0) + 1; });
  const out = {
    generatedAt: new Date().toISOString(), count,
    warnings: shops.length < seed.entries.length ? [`${seed.entries.length - shops.length} entries could not be geocoded and were left out`] : [],
    sources: { getrawmilk: { name: 'getrawmilk.com (community directory)', url: 'https://getrawmilk.com/browse/Ireland', collected: seed.collected } },
    shops,
  };
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(out));
  fs.renameSync(tmp, DATA_FILE);
  return out;
}

let cached = null;
function load() {
  try {
    const st = fs.statSync(DATA_FILE);
    if (cached && cached.mtime === st.mtimeMs) return cached.data;
    cached = { mtime: st.mtimeMs, data: JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
    return cached.data;
  } catch { return null; }
}
const isStale = days => { try { return Date.now() - fs.statSync(DATA_FILE).mtimeMs > days * 864e5; } catch { return true; } };

module.exports = { build, load, isStale, DATA_FILE, SEED };
