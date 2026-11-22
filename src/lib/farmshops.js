// Farm-shop dataset for England.
//   Farm shops + milk vending machines: OpenStreetMap (Overpass API)
//   Raw drinking milk producers:        Food Standards Agency register (data.gov.uk, OGL v3)
//   Regions / geocoding:                postcodes.io (free, no key)
// build() fetches everything, merges it and writes data/farmshops.json.
// Each source fails on its own: if one is down, the previous data for it is kept.

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const DATA_FILE = process.env.FARMSHOPS_FILE || path.join(__dirname, '..', '..', 'data', 'farmshops.json');
const UA = 'FarmShopFinder/1.0 (contact: lyngbaek-tech.onrender.com)';

// Public Overpass servers are often at capacity, so we try several, twice.
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
// OSM marks England with ISO3166-2=GB-ENG; the name-based selector is a fallback if that ever returns nothing.
const AREA_SELECTORS = ['["ISO3166-2"="GB-ENG"]', '["name"="England"]["boundary"="administrative"]["admin_level"="4"]'];
const osmQuery = sel => `[out:json][timeout:180];
area${sel}->.a;
(
  nwr["shop"="farm"](area.a);
  nwr["vending"="milk"](area.a);
);
out center tags;`;
const ROUNDS = Number(process.env.FARMSHOPS_ROUNDS || 2);
const OSM_TIMEOUT = Number(process.env.FARMSHOPS_OSM_TIMEOUT || 200000);
const MIN_OSM_ELEMENTS = 100; // England has far more than this; fewer means a wrong or failed query
const CKAN_PACKAGE = 'https://ckan.publishing.service.gov.uk/api/3/action/package_show?id=raw-drinking-milk-premises-in-england-wales-and-northern-ireland';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const clean = s => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim());
const round = n => Math.round(n * 1e5) / 1e5;

async function request(url, opts = {}, tries = 3) {
  const { timeout = 60000, headers = {}, ...rest } = opts;
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...rest, timeout, headers: { 'User-Agent': UA, ...headers } });
      if (res.ok) return res;
      last = new Error(`${res.status} ${res.statusText} (${url})`);
      if (res.status !== 429 && res.status < 500) break; // 4xx other than 429: retrying will not help
    } catch (e) { last = e; }
    if (i < tries - 1) await sleep(1500 * 2 ** i);
  }
  throw last;
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

function safeUrl(u) {
  u = clean(u);
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; }
}

// ---------- OpenStreetMap ----------

async function fetchOsm() {
  let last;
  for (const sel of AREA_SELECTORS) {
    let gotFew = false;
    for (let round_ = 0; round_ < ROUNDS && !gotFew; round_++) {
      for (const base of OVERPASS) {
        try {
          const res = await request(base, {
            method: 'POST',
            body: 'data=' + encodeURIComponent(osmQuery(sel)),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: OSM_TIMEOUT,
          }, 1);
          const json = await res.json();
          const n = json && Array.isArray(json.elements) ? json.elements.length : 0;
          if (n >= MIN_OSM_ELEMENTS) return json.elements;
          last = new Error(`Overpass returned ${n} elements for ${sel}` + (json && json.remark ? ': ' + json.remark : ''));
          if (!(json && json.remark)) { gotFew = true; break; } // a clean empty answer: try the next selector
        } catch (e) { last = e; console.warn('[farmshops] overpass', base, '-', e.message); }
      }
      if (!gotFew && round_ < ROUNDS - 1) await sleep(20000);
    }
  }
  throw last;
}

function normaliseOsm(elements) {
  const out = [];
  for (const el of elements) {
    const t = el.tags || {};
    const lat = el.lat != null ? el.lat : el.center && el.center.lat;
    const lon = el.lon != null ? el.lon : el.center && el.center.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    const vending = t.vending === 'milk';
    const name = clean(t.name || t.brand || t.operator) || (vending ? 'Milk vending machine' : '');
    if (!name) continue; // an unnamed farm shop is not useful to a visitor
    const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
    out.push({
      id: `osm-${el.type}-${el.id}`,
      kind: vending ? 'milk_vending' : 'farm_shop',
      name,
      address: clean([street || t['addr:place'], t['addr:suburb']].filter(Boolean).join(', ')),
      town: clean(t['addr:city'] || t['addr:town'] || t['addr:village']),
      postcode: clean(t['addr:postcode']).toUpperCase(),
      lat: round(lat), lon: round(lon),
      phone: clean(t.phone || t['contact:phone']),
      website: safeUrl(t.website || t['contact:website'] || t.url),
      hours: clean(t.opening_hours),
      organic: t.organic === 'yes' || t.organic === 'only',
      description: clean(t.description),
      approx: false,
      sources: ['osm'],
    });
  }
  return out;
}

// The same shop is often mapped twice (a point and a building outline). Keep the first.
function dedupe(list) {
  const seen = new Set();
  return list.filter(s => {
    const key = s.kind + '|' + s.name.toLowerCase() + '|' + s.lat.toFixed(3) + '|' + s.lon.toFixed(3);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------- FSA raw drinking milk register ----------

async function latestRdmResource() {
  const j = await (await request(CKAN_PACKAGE)).json();
  const date = r => String(r.datafile_date || r['datafile-date'] || r.created || '');
  const files = (j.result.resources || []).filter(r => /csv/i.test(r.format || '') || /\.csv/i.test(r.url || ''));
  files.sort((a, b) => date(b).localeCompare(date(a)));
  if (!files.length) throw new Error('No CSV resource in the FSA dataset');
  return { url: files[0].url, name: files[0].name, date: date(files[0]).slice(0, 10) };
}

function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], cur = '', quoted = false;
  const endRow = () => { row.push(cur); cur = ''; if (row.some(x => x !== '')) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else quoted = false; } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; endRow(); }
    else cur += c;
  }
  endRow();
  if (!rows.length) return [];
  const head = rows.shift().map(h => h.trim());
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] == null ? '' : r[i]).trim()])));
}

const pick = (r, re) => { const k = Object.keys(r).find(x => re.test(x)); return k ? clean(r[k]) : ''; };
const FULL_PC = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/;
const OUTCODE = /^[A-Z]{1,2}\d[A-Z\d]?$/;
const outwardOf = pc => pc.replace(/\s+/g, '').replace(/\d[A-Z]{2}$/, '');

function normaliseRdm(rows) {
  const out = [];
  for (const r of rows) {
    const name = pick(r, /^trading.?name$/i);
    if (!name) continue;
    const parts = Object.keys(r).filter(k => /^premise.?address/i.test(k)).sort()
      .map(k => clean(r[k])).filter(v => v && v.toLowerCase() !== 'not set');
    const postcode = pick(r, /post.?code/i).toUpperCase();
    out.push({
      id: 'fsa-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + postcode.replace(/\s+/g, ''),
      kind: 'raw_milk',
      name,
      address: parts.join(', '),
      town: parts[0] || '',
      postcode,
      species: pick(r, /species|animal/i),
      lat: null, lon: null,
      phone: '', website: '', hours: '', organic: false, description: '',
      approx: true,
      sources: ['fsa'],
    });
  }
  return out;
}

// Gives the FSA premises coordinates (from their postcode) and drops anything outside England.
async function geocodeRdm(list) {
  const fullOnes = list.filter(s => FULL_PC.test(s.postcode));
  const outcodes = [...new Set(list.filter(s => !FULL_PC.test(s.postcode)).map(s => s.postcode.replace(/\s+/g, '')).filter(p => OUTCODE.test(p)))];
  const byOut = {};
  await pool(outcodes, 4, async oc => {
    try {
      const j = await (await request('https://api.postcodes.io/outcodes/' + encodeURIComponent(oc), {}, 2)).json();
      if (j.result) byOut[oc] = j.result;
    } catch (e) { console.warn('[farmshops] outcode', oc, e.message); }
  });
  const byFull = {};
  for (let i = 0; i < fullOnes.length; i += 100) {
    const batch = fullOnes.slice(i, i + 100);
    try {
      const j = await (await request('https://api.postcodes.io/postcodes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postcodes: batch.map(s => s.postcode) }),
      }, 2)).json();
      (j.result || []).forEach(x => { if (x.result) byFull[x.query.toUpperCase().replace(/\s+/g, '')] = x.result; });
    } catch (e) { console.warn('[farmshops] postcode batch', e.message); }
  }
  const out = [];
  for (const s of list) {
    const full = FULL_PC.test(s.postcode);
    const res = full ? byFull[s.postcode.replace(/\s+/g, '')] : byOut[s.postcode.replace(/\s+/g, '')];
    if (!res || typeof res.latitude !== 'number') continue;
    const countries = [].concat(res.country || []);
    if (!countries.includes('England')) continue; // Wales and Northern Ireland are in the FSA list too
    out.push({ ...s, lat: round(res.latitude), lon: round(res.longitude), approx: !full });
  }
  return out;
}

// ---------- Regions ----------

async function enrichRegions(list) {
  const todo = list.filter(s => !s.region && typeof s.lat === 'number');
  const batches = [];
  for (let i = 0; i < todo.length; i += 100) batches.push(todo.slice(i, i + 100));
  await pool(batches, 3, async batch => {
    try {
      const j = await (await request('https://api.postcodes.io/postcodes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geolocations: batch.map(b => ({ longitude: b.lon, latitude: b.lat, radius: 2000, limit: 1 })) }),
      }, 2)).json();
      (j.result || []).forEach((x, idx) => {
        const hit = x && x.result && x.result[0];
        if (hit && hit.country === 'England') { batch[idx].region = hit.region || ''; batch[idx].area = hit.admin_district || ''; }
      });
    } catch (e) { console.warn('[farmshops] region batch', e.message); }
  });
  list.forEach(s => { if (s.region == null) s.region = ''; });
  return list;
}

// ---------- Build / load ----------

let cache = null;
function load() {
  try {
    const st = fs.statSync(DATA_FILE);
    if (cache && cache.mtime === st.mtimeMs) return cache.data;
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    cache = { mtime: st.mtimeMs, data };
    return data;
  } catch { return null; }
}

function isStale(days = 7) {
  const d = load();
  return !d || !d.generatedAt || Date.now() - Date.parse(d.generatedAt) > days * 864e5;
}

async function build() {
  const warnings = [];
  const prev = load();
  const prevOf = src => (prev ? prev.shops.filter(s => s.sources.includes(src)) : []);
  let osm, rdm, fsa = prev && prev.sources ? prev.sources.fsa : null;

  try {
    osm = dedupe(normaliseOsm(await fetchOsm()));
    console.log('[farmshops] OpenStreetMap:', osm.length);
  } catch (e) { warnings.push('OpenStreetMap unavailable, kept previous data: ' + e.message); osm = prevOf('osm'); }

  try {
    const res = await latestRdmResource();
    const text = await (await request(res.url, { timeout: 90000 })).text();
    rdm = await geocodeRdm(normaliseRdm(parseCsv(text)));
    fsa = { name: res.name, date: res.date, url: res.url };
    console.log('[farmshops] FSA raw milk producers in England:', rdm.length);
  } catch (e) { warnings.push('FSA raw milk register unavailable, kept previous data: ' + e.message); rdm = prevOf('fsa'); }

  if (!osm.length && !rdm.length) throw new Error('No data fetched. ' + warnings.join(' | '));

  const prevById = new Map((prev ? prev.shops : []).map(s => [s.id, s]));
  const shops = [...osm, ...rdm].map(s => { const p = prevById.get(s.id); return p && p.region ? { ...s, region: p.region, area: p.area } : s; });
  await enrichRegions(shops);

  const count = {};
  shops.forEach(s => { count[s.kind] = (count[s.kind] || 0) + 1; });
  const data = {
    generatedAt: new Date().toISOString(),
    count: { total: shops.length, ...count },
    sources: {
      osm: { name: 'OpenStreetMap contributors', licence: 'ODbL', url: 'https://www.openstreetmap.org/copyright' },
      fsa: fsa ? { ...fsa, licence: 'Open Government Licence v3.0' } : null,
    },
    warnings,
    shops,
  };
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, DATA_FILE);
  cache = null;
  return data;
}

module.exports = { build, load, isStale, DATA_FILE, _t: { fetchOsm, normaliseOsm, normaliseRdm, parseCsv, dedupe, safeUrl, outwardOf } };
