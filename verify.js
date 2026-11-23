#!/usr/bin/env node
// Kør denne fil for at tjekke om platformen er sund: "node verify.js"
// Den fanger den slags fejl der tidligere sneg sig ind (ødelagte tegn i en fil,
// syntaksfejl) FØR du prøver at starte serveren og møder fejlen i browseren.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let failures = 0;
function ok(msg) { console.log('✓', msg); }
function fail(msg) { console.log('✗ FEJL:', msg); failures++; }

console.log('=== Tjekker alle server-side JS-filer ===');
// public/ can contain sub-folders (public/farmshops/), so list files recursively.
function walk(dir) {
  return fs.readdirSync(path.join(__dirname, dir), { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
}
const jsFiles = [
  'src/server.js',
  ...(fs.existsSync(path.join(__dirname, 'scripts')) ? walk('scripts').filter(f => f.endsWith('.js')) : []),
  ...walk('public').filter(f => f.endsWith('.js')),
  ...fs.readdirSync(path.join(__dirname, 'src/connectors')).map(f => `src/connectors/${f}`),
  ...fs.readdirSync(path.join(__dirname, 'src/lib')).map(f => `src/lib/${f}`),
];
for (const file of jsFiles) {
  try {
    execSync(`node --check "${file}"`, { cwd: __dirname, stdio: 'pipe' });
    ok(file);
  } catch (err) {
    fail(`${file} — ${err.stderr.toString().split('\n')[0]}`);
  }
}

console.log('');
console.log('=== Tjekker for beskadigede tegn (den type fejl der ramte udbud.html) ===');
const allFiles = [
  ...walk('public'),
  ...jsFiles,
].filter((f, i, a) => a.indexOf(f) === i);
for (const file of allFiles) {
  const content = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const badBacktick = (content.match(/\\`/g) || []).length;
  const badDollar = (content.match(/\\\$\{/g) || []).length;
  if (badBacktick > 0 || badDollar > 0) {
    fail(`${file} — fundet ${badBacktick + badDollar} beskadigede tegn (\\\` eller \\\${)`);
  } else {
    ok(file);
  }
}

console.log('');
console.log('=== Tjekker JavaScript inde i hver HTML-side ===');
for (const file of walk('public').filter(f => f.endsWith('.html')).map(f => f.slice('public/'.length))) {
  const content = fs.readFileSync(path.join(__dirname, 'public', file), 'utf8');
  const match = content.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) { ok(`${file} (ingen <script>-blok)`); continue; }
  fs.writeFileSync('/tmp/_verify_extracted.js', match[1]);
  try {
    execSync('node --check /tmp/_verify_extracted.js', { stdio: 'pipe' });
    ok(`${file} (indlejret JavaScript)`);
  } catch (err) {
    fail(`${file} (indlejret JavaScript) — ${err.stderr.toString().split('\n')[0]}`);
  }
}

console.log('');
if (failures === 0) {
  console.log(`✓ Alt tjekket, ingen fejl fundet (${jsFiles.length + allFiles.length} filer).`);
  process.exit(0);
} else {
  console.log(`✗ ${failures} fejl fundet — ret dem før du starter serveren.`);
  process.exit(1);
}
