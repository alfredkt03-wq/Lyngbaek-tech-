#!/usr/bin/env node
// Builds data/farmshops-ie.json from data/seed/ireland-getrawmilk.json (geocoding via Nominatim, about 2 minutes the first time).
const { build, DATA_FILE } = require('../src/lib/farmshops-ie');
build().then(d => { console.log('Wrote ' + DATA_FILE, JSON.stringify(d.count)); d.warnings.forEach(w => console.warn('WARNING:', w)); })
  .catch(e => { console.error('Irish data build failed:', e.message); process.exit(process.env.STRICT === '1' ? 1 : 0); });
