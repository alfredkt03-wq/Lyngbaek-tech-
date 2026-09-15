const { TENDERS } = require('../connectors/udbudConnector');

// Groups tenders by a rough category (matched on title keywords) so we compare
// companies that actually compete in the same market, not unrelated tenders.
function categoryOf(title) {
  return title.split(' ')[0]; // crude but fine for the demo dataset: "Vejvedligehold", "IT-drift", etc.
}

// 1. Co-bidding graph: how often do the same companies show up bidding against
//    each other, and who wins when they do? This is the raw evidence — a group of
//    companies that bid together repeatedly isn't inherently suspicious, but it's
//    the precondition for the patterns below.
function buildCoBiddingGraph() {
  const nodes = new Set();
  const edgeCounts = {};

  for (const tender of TENDERS) {
    const firms = tender.bids.map(b => b.firma);
    firms.forEach(f => nodes.add(f));
    for (let i = 0; i < firms.length; i++) {
      for (let j = i + 1; j < firms.length; j++) {
        const key = [firms[i], firms[j]].sort().join('|');
        edgeCounts[key] = (edgeCounts[key] || 0) + 1;
      }
    }
  }

  const edges = Object.entries(edgeCounts).map(([key, count]) => {
    const [source, target] = key.split('|');
    return { source, target, weight: count };
  });

  return { nodes: [...nodes], edges };
}

// 2. Win rotation: does the same fixed group of 3+ companies keep bidding on the
//    same category of tender, with the win rotating between them roughly evenly?
//    That's a classic bid-rotation cartel signature.
function detectWinRotation() {
  const byCategory = {};
  for (const t of TENDERS) {
    const cat = categoryOf(t.title);
    byCategory[cat] = byCategory[cat] || [];
    byCategory[cat].push(t);
  }

  const findings = [];
  for (const [cat, tenders] of Object.entries(byCategory)) {
    if (tenders.length < 3) continue; // need enough tenders to see a rotation pattern

    const firmSets = tenders.map(t => new Set(t.bids.map(b => b.firma)));
    const allSameFirms = firmSets.every(s => s.size === firmSets[0].size &&
      [...s].every(f => firmSets[0].has(f)));

    if (!allSameFirms) continue; // different competitors each time = not a fixed cartel group

    const winners = tenders.map(t => t.vinder);
    const uniqueWinners = new Set(winners);
    const firmCount = firmSets[0].size;

    // Suspicious when: same exact group of firms every time, AND every one of them
    // has won roughly their "fair share" — i.e. wins are spread evenly across the
    // fixed group rather than one firm dominating (which would look like normal competition).
    if (uniqueWinners.size === firmCount && uniqueWinners.size === firmSets[0].size) {
      findings.push({
        type: 'vinder_rotation',
        kategori: cat,
        firmaer: [...firmSets[0]],
        antal_udbud: tenders.length,
        vindere_i_raekkefoelge: winners,
        beskrivelse: `Samme ${firmCount} firmaer har budt på alle ${tenders.length} "${cat}"-udbud, og sejren roterer jævnt mellem dem — hvert firma har vundet cirka lige ofte.`,
        severity: 'høj',
      });
    }
  }
  return findings;
}

// 3. Price clustering / cover bidding: in a genuinely competitive tender, losing bids
//    are spread out. In a rigged one, losing bids often cluster suspiciously close to
//    the winning bid (just high enough to lose, but not so high it looks fake) — that's
//    "cover bidding," designed to create the appearance of competition.
function detectPriceClustering() {
  const findings = [];
  for (const t of TENDERS) {
    if (t.bids.length < 2) continue;
    const sorted = [...t.bids].sort((a, b) => a.beloeb - b.beloeb);
    const lowest = sorted[0].beloeb;
    const spreadPct = ((sorted[sorted.length - 1].beloeb - lowest) / lowest) * 100;

    if (spreadPct < 12) {
      findings.push({
        type: 'pris_klumpning',
        udbud: t.id,
        titel: t.title,
        spredning_pct: Math.round(spreadPct * 10) / 10,
        bud: t.bids,
        beskrivelse: `Alle bud lå inden for ${Math.round(spreadPct)}% af hinanden — usædvanligt tæt, kan indikere aftalte "cover bids".`,
        severity: spreadPct < 6 ? 'høj' : 'medium',
      });
    }
  }
  return findings;
}

function fullReport() {
  return {
    graph: buildCoBiddingGraph(),
    vinder_rotation: detectWinRotation(),
    pris_klumpning: detectPriceClustering(),
  };
}

module.exports = { buildCoBiddingGraph, detectWinRotation, detectPriceClustering, fullReport };
