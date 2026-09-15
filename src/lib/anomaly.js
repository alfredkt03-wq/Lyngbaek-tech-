const { DATA } = require('../connectors/dstRegnskabConnector');

function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

// 1. Peer benchmarking: how does this kommune's per-capita spend on a category
//    compare to similar-sized kommuner?
function peerComparison(kommuneName, year = 2025) {
  const target = DATA[kommuneName];
  if (!target) throw new Error(`Unknown kommune: ${kommuneName}`);

  const peers = Object.entries(DATA).filter(
    ([name, d]) => name !== kommuneName && d.size_group === target.size_group
  );

  const findings = [];
  const categories = Object.keys(target.years[year]);

  for (const category of categories) {
    const targetPerCapita = target.years[year][category] / target.population;
    const peerPerCapita = mean(peers.map(([, d]) => d.years[year][category] / d.population));
    const pctDiff = ((targetPerCapita - peerPerCapita) / peerPerCapita) * 100;

    if (Math.abs(pctDiff) > 15) {
      findings.push({
        type: 'peer_afvigelse',
        category,
        kommune_per_indbygger: Math.round(targetPerCapita),
        peer_gennemsnit_per_indbygger: Math.round(peerPerCapita),
        afvigelse_pct: Math.round(pctDiff * 10) / 10,
        severity: Math.abs(pctDiff) > 30 ? 'høj' : 'medium',
      });
    }
  }
  return findings;
}

// 2. Trend deviation: did this year jump much more than the kommune's own recent trend?
function trendDeviation(kommuneName) {
  const target = DATA[kommuneName];
  if (!target) throw new Error(`Unknown kommune: ${kommuneName}`);

  const years = Object.keys(target.years).map(Number).sort();
  const latestYear = years[years.length - 1];
  const prevYear = years[years.length - 2];
  const categories = Object.keys(target.years[latestYear]);

  const findings = [];
  for (const category of categories) {
    // average YoY growth over all years before the latest
    const growthRates = [];
    for (let i = 1; i < years.length - 1; i++) {
      const y0 = target.years[years[i - 1]][category];
      const y1 = target.years[years[i]][category];
      growthRates.push((y1 - y0) / y0);
    }
    const historicalAvgGrowth = growthRates.length ? mean(growthRates) : 0;

    const latestGrowth = (target.years[latestYear][category] - target.years[prevYear][category]) / target.years[prevYear][category];

    const excessGrowthPct = (latestGrowth - historicalAvgGrowth) * 100;
    if (Math.abs(excessGrowthPct) > 10) {
      findings.push({
        type: 'trend_afvigelse',
        category,
        aar: latestYear,
        vaekst_i_aar_pct: Math.round(latestGrowth * 1000) / 10,
        historisk_gns_vaekst_pct: Math.round(historicalAvgGrowth * 1000) / 10,
        uventet_ekstra_vaekst_pct: Math.round(excessGrowthPct * 10) / 10,
        severity: Math.abs(excessGrowthPct) > 25 ? 'høj' : 'medium',
      });
    }
  }
  return findings;
}

// 3. Budget vs actual: how far off was spending from what was budgeted?
function budgetDeviation(kommuneName, year = 2025) {
  const target = DATA[kommuneName];
  if (!target || !target.budget_2025) throw new Error(`No budget data for ${kommuneName}/${year}`);

  const findings = [];
  for (const category of Object.keys(target.budget_2025)) {
    const budget = target.budget_2025[category];
    const actual = target.years[year][category];
    const pctDiff = ((actual - budget) / budget) * 100;

    if (Math.abs(pctDiff) > 5) {
      findings.push({
        type: 'budget_afvigelse',
        category,
        budget,
        faktisk: actual,
        afvigelse_pct: Math.round(pctDiff * 10) / 10,
        severity: Math.abs(pctDiff) > 15 ? 'høj' : 'medium',
      });
    }
  }
  return findings;
}

// Runs all three and returns a single prioritized list, highest severity first —
// this is the "short list of 5 things worth investigating" output, not a data dump.
function fullReport(kommuneName) {
  const all = [
    ...peerComparison(kommuneName),
    ...trendDeviation(kommuneName),
    ...budgetDeviation(kommuneName),
  ];
  const severityRank = { 'høj': 0, medium: 1 };
  all.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  return all;
}

module.exports = { peerComparison, trendDeviation, budgetDeviation, fullReport };
