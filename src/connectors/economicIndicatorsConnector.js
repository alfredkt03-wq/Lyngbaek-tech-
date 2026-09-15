// ============================================================
// RECESSION INDICATOR — automiseret API-drevet sammenligning
// Historiske recession-mønstre (1987, 2000, 2008, 2020) vs 2026
// Score: 1-100 hvor 100 = "recession starter nu"
// ============================================================


// Historiske mønstre fra hver recession
const RECESSION_HISTORY = {
  '1987-crash': {
    år: 1987,
    navn: 'Black Monday',
    buffett_cash: 45,
    hedge_shorts: 70,
    yield_curve_inverted: true,
    vix_equivalent: 80,
    credit_spread_bp: 200,
    score_pre_crash: 78,
  },
  '2000-dotcom': {
    år: 2000,
    navn: 'Dot-com Bubble',
    buffett_cash: 40,
    hedge_shorts: 55,
    yield_curve_inverted: true,
    vix_equivalent: 45,
    credit_spread_bp: 150,
    score_pre_crash: 72,
  },
  '2008-financial': {
    år: 2008,
    navn: 'Financial Crisis',
    buffett_cash: 50,
    hedge_shorts: 85,
    yield_curve_inverted: true,
    vix_equivalent: 89,
    credit_spread_bp: 600,
    score_pre_crash: 92,
  },
  '2020-covid': {
    år: 2020,
    navn: 'COVID-19',
    buffett_cash: 35,
    hedge_shorts: 65,
    yield_curve_inverted: false,
    vix_equivalent: 82,
    credit_spread_bp: 350,
    score_pre_crash: 85,
  },
};

// Nuværende 2026-data (mix af API-forsøg + snapshot)
const CURRENT_2026 = {
  buffett_cash_pct: 28,
  hedge_fund_shorts_pct: 42,
  yield_curve_inverted: false,
  yield_curve_steepness_bp: 35,
  vix_level: 18,
  move_index: 73,
  credit_spreads_bp: 275,
  gdp_growth_pct: 0.3,
  unemployment_pct: 3.0,
  housing_starts_yoy_pct: -12.0,
  consumer_confidence: -13.1,
  debt_to_gdp_usa: 123.5,
  debt_to_gdp_dk: 30.2,
};


// ---------------------------------------------------------------------------
// LIVE-HENTNING via FRED (Federal Reserve Bank of St. Louis).
// Gratis nøgle på fred.stlouisfed.org/docs/api/api_key.html — sæt FRED_API_KEY.
// Uden nøgle bruges snapshottet ovenfor. Hver serie falder tilbage for sig, så
// én død serie ikke ødelægger de øvrige.
// ---------------------------------------------------------------------------
const https = require('https');

const SERIER = {
  gdp_growth_pct:        { id: 'A191RL1Q225SBEA', navn: 'BNP-vækst (realt, kvartal)' },
  unemployment_pct:      { id: 'UNRATE',          navn: 'Ledighed' },
  credit_spreads_bp:     { id: 'BAMLH0A0HYM2',    navn: 'High yield-spænd', gang: 100 },
  vix_level:             { id: 'VIXCLS',          navn: 'VIX' },
  housing_starts_yoy_pct:{ id: 'HOUST',           navn: 'Boligbyggeri', yoy: true },
};

function fredSerie(id, antal) {
  return new Promise(resolve => {
    const n = new URLSearchParams({
      series_id: id, api_key: process.env.FRED_API_KEY || '', file_type: 'json',
      sort_order: 'desc', limit: String(antal || 1),
    });
    const req = https.get('https://api.stlouisfed.org/fred/series/observations?' + n, r => {
      let buf = '';
      r.on('data', c => (buf += c));
      r.on('end', () => {
        try {
          const j = JSON.parse(buf);
          const obs = (j.observations || []).filter(o => o.value && o.value !== '.');
          resolve(obs.length ? obs : null);
        } catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(6000, () => { req.destroy(); resolve(null); });
  });
}

let LIVE = null, LIVE_TID = 0, HENTER = false;
const LIVE_MS = 6 * 60 * 60 * 1000; // 6 timer

async function hentLive() {
  if (!process.env.FRED_API_KEY) return null;
  const ud = {}, kilder = {};

  await Promise.all(Object.keys(SERIER).map(async felt => {
    const cfg = SERIER[felt];
    const obs = await fredSerie(cfg.id, cfg.yoy ? 13 : 1);
    if (!obs) return;
    const nyeste = parseFloat(obs[0].value);
    if (isNaN(nyeste)) return;

    if (cfg.yoy) {
      const aar = obs.find(o => o.date <= new Date(new Date(obs[0].date).setFullYear(
        new Date(obs[0].date).getFullYear() - 1)).toISOString().slice(0, 10));
      if (!aar) return;
      const gl = parseFloat(aar.value);
      if (!gl) return;
      ud[felt] = ((nyeste - gl) / gl) * 100;
    } else {
      ud[felt] = cfg.gang ? nyeste * cfg.gang : nyeste;
    }
    kilder[felt] = { serie: cfg.id, dato: obs[0].date };
  }));

  if (!Object.keys(ud).length) return null;
  return { vaerdier: ud, kilder, hentet: new Date().toISOString() };
}

function opdaterIBaggrunden() {
  if (HENTER || !process.env.FRED_API_KEY) return;
  HENTER = true;
  hentLive().then(r => { if (r) { LIVE = r; LIVE_TID = Date.now(); } })
            .catch(() => {}).finally(() => { HENTER = false; });
}

function status() {
  const frisk = LIVE && Date.now() - LIVE_TID < LIVE_MS;
  return {
    kilde: frisk ? 'live' : (process.env.FRED_API_KEY ? 'henter' : 'snapshot'),
    hentet: frisk ? LIVE.hentet : '2026-08-24',
    felter: frisk ? Object.keys(LIVE.vaerdier).length : 0,
    detaljer: frisk ? LIVE.kilder : null,
  };
}

// Beregn risk-score 1-100 baseret på indikatorer
function calculateRiskScore(indicators) {
  let score = 0;
  let weights = {};

  // Buffett cash (20% vægt) — høj cash = varsel
  const buffett_score = Math.min(indicators.buffett_cash_pct / 50 * 100, 100);
  score += buffett_score * 0.20;
  weights.buffett = buffett_score;

  // Hedge fund shorts (15% vægt) — mange shorts = varsel
  const shorts_score = Math.min(indicators.hedge_fund_shorts_pct / 85 * 100, 100);
  score += shorts_score * 0.15;
  weights.shorts = shorts_score;

  // Credit spreads (20% vægt) — høje spænd = varsel
  const spread_score = Math.min(indicators.credit_spreads_bp / 600 * 100, 100);
  score += spread_score * 0.20;
  weights.spreads = spread_score;

  // GDP growth (15% vægt) — lav vækst = varsel
  const gdp_score = Math.max(0, (2.5 - indicators.gdp_growth_pct) / 3 * 100);
  score += Math.min(gdp_score, 100) * 0.15;
  weights.gdp = gdp_score;

  // Unemployment (10% vægt) — stigende = varsel
  const unemployment_score = Math.min(indicators.unemployment_pct / 6 * 100, 100);
  score += unemployment_score * 0.10;
  weights.unemployment = unemployment_score;

  // Housing (10% vægt) — faldende = varsel
  const housing_score = Math.max(0, -indicators.housing_starts_yoy_pct * 2);
  score += Math.min(housing_score, 100) * 0.10;
  weights.housing = housing_score;

  // Volatility/VIX (10% vægt)
  const vix_score = Math.min(indicators.vix_level / 80 * 100, 100);
  score += vix_score * 0.10;
  weights.volatility = vix_score;

  return {
    total_score: Math.round(score),
    component_scores: weights,
    interpretation: score < 30 ? 'Lavt' : score < 50 ? 'Moderat' : score < 70 ? 'Forhøjet' : 'Kritisk',
  };
}

async function fetchAll() {
  const frisk = LIVE && Date.now() - LIVE_TID < LIVE_MS;
  if (!frisk) opdaterIBaggrunden();          // svarer straks, henter i baggrunden

  const indikatorer = frisk
    ? Object.assign({}, CURRENT_2026, LIVE.vaerdier)
    : CURRENT_2026;

  const risk = calculateRiskScore(indikatorer);

  return {
    current: {
      score_2026: risk.total_score,
      interpretation: risk.interpretation,
      components: risk.component_scores,
      data: indikatorer,
      datakilde: status(),
    },
    history: RECESSION_HISTORY,
    comparison: {
      avg_pre_crash_score: Object.values(RECESSION_HISTORY).reduce((sum, r) => sum + r.score_pre_crash, 0) / Object.keys(RECESSION_HISTORY).length,
      current_vs_avg: risk.total_score,
      warning_level: risk.total_score > 70 ? 'HØGT' : risk.total_score > 50 ? 'MODERAT' : 'LAVT',
    },
  };
}

module.exports = { name: 'recession_indicator', fetchAll, status };

