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

const hav = (a, b, c, d) => { const r = x => x * Math.PI / 180, t = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(t)); };
const BUILDING = new Set(['building', 'house', 'farm', 'farmyard', 'shop', 'amenity', 'craft', 'office', 'industrial', 'commercial', 'retail', 'yes', 'barn', 'dairy']);

async function nominatim(q) {
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&countrycodes=ie&q=' + encodeURIComponent(q);
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, timeout: 30000 });
  if (!res.ok) throw new Error('Nominatim ' + res.status);
  return (await res.json()).map(r => ({
    lat: round(parseFloat(r.lat)), lon: round(parseFloat(r.lon)), cls: r.category || r.class, type: r.type,
    county: String((r.address && (r.address.county || r.address.state)) || ''), box: r.boundingbox ? r.boundingbox.map(Number) : null,
  }));
}

const precisionOf = h => (h.cls === 'place' || h.cls === 'boundary') ? 'town'
  : (h.cls === 'highway' ? 'street' : (BUILDING.has(h.cls) || BUILDING.has(h.type) ? 'exact' : 'street'));

// Several lookups, most precise first: the business itself, then its street address, then the town. Every hit is sanity-checked
// against the town centre (and county) so a same-named place elsewhere in Ireland can never win.
async function geocode(e, cache, stats) {
  const county = 'County ' + e.region;
  const lookup = async (key, q) => {
    if (key in cache) return cache[key];
    try { const hits = await nominatim(q); stats.calls++; await sleep(1100); cache[key] = hits; return hits; }
    catch (err) { stats.errors++; console.warn('[farmshops-ie] geocode', q, '-', err.message); await sleep(2000); return null; }
  };
  const town = (await lookup('t2|' + e.town + '|' + e.region, [e.town, county, 'Ireland'].join(', ')) || [])[0] || null;
  const near = h => !town || hav(h.lat, h.lon, town.lat, town.lon) <= (e.address ? 8 : 4); // km
  const countyOk = h => !h.county || !e.region || h.county.toLowerCase().includes(String(e.region).toLowerCase());
  const tries = [
    ['n2|' + [e.name, e.town, e.region].join('|'), [e.name, e.town, county, 'Ireland'].join(', ')],
    e.address ? ['a2|' + [e.address, e.town, e.region].join('|'), [e.address, e.town, county, 'Ireland'].join(', ')] : null,
  ].filter(Boolean);
  for (const [key, q] of tries) {
    const hits = await lookup(key, q);
    const hit = (hits || []).find(h => near(h) && countyOk(h) && precisionOf(h) !== 'town');
    if (hit) return { lat: hit.lat, lon: hit.lon, approx: false, precision: precisionOf(hit) };
  }
  return town ? { lat: town.lat, lon: town.lon, approx: true, precision: 'town' } : null;
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
    const pos = g || (old && typeof old.lat === 'number' ? { lat: old.lat, lon: old.lon, approx: true, precision: 'town' } : null);
    if (!pos) continue; // cannot be placed on the map
    shops.push({
      id: e.id, kind: e.kind, name: e.name, address: e.address, town: e.town, postcode: '', region: e.region, area: e.region,
      lat: pos.lat, lon: pos.lon, approx: pos.approx, precision: pos.precision || 'town', phone: '', website: '', hours: '', organic: false,
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
