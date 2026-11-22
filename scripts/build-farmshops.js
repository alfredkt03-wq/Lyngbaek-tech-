#!/usr/bin/env node
// Builds data/farmshops.json (farm shops, milk vending machines and raw milk producers in England).
// Run locally: node scripts/build-farmshops.js
// Runs during the Render build too. It never fails the deploy unless STRICT=1.
const { build, DATA_FILE } = require('../src/lib/farmshops');

build()
  .then(d => {
    console.log(`Wrote ${DATA_FILE}`);
    console.log(JSON.stringify(d.count));
    d.warnings.forEach(w => console.warn('WARNING:', w));
  })
  .catch(err => {
    console.error('Farm-shop data build failed:', err.message);
    process.exit(process.env.STRICT === '1' ? 1 : 0);
  });
