import nationalTeamsData from './data/national-teams.json' with { type: 'json' };
import historicalIndex from './data/historical-index.json' with { type: 'json' };
import { sanitizeRoster, sanitizeUclSeason } from './dataSanity.js';
import { getRosterImportSource, resolveRoster } from './rosterData.js';

const { teams: TEAM_BUNDLES, aliasIndex } = nationalTeamsData;

function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

function round(n, dp = 2) {
  const p = 10 ** dp;
  return Math.round(n * p) / p;
}

function avgFormRates(formLast10 = []) {
  if (!formLast10.length) return { goalsForPerMatch: null, goalsAgainstPerMatch: null, pointsPerGame: null };
  let gf = 0;
  let ga = 0;
  let pts = 0;
  for (const m of formLast10) {
    gf += Number(m.goalsFor) || 0;
    ga += Number(m.goalsAgainst) || 0;
    if (m.result === 'W') pts += 3;
    else if (m.result === 'D') pts += 1;
  }
  const n = formLast10.length;
  return {
    goalsForPerMatch: gf / n,
    goalsAgainstPerMatch: ga / n,
    pointsPerGame: pts / n
  };
}

function seasonWcRates(season) {
  const u = sanitizeUclSeason(season?.wcQualifying ?? {}, {});
  const played = Number(u.played) || 1;
  return {
    goalsForPerMatch: (Number(u.goalsFor) || 0) / played,
    goalsAgainstPerMatch: (Number(u.goalsAgainst) || 0) / played,
    xgForPerMatch: (Number(u.xgFor) || 0) / played,
    xgAgainstPerMatch: (Number(u.xgAgainst) || 0) / played,
    shotsPerMatch: Number(u.shotsPerMatch) || 14,
    shotsOnTargetPerMatch: Number(u.shotsOnTargetPerMatch) || 5,
    cornersPerMatch: Number(u.cornersPerMatch) || 5.5,
    played,
    dataQuality: 'ok'
  };
}

function blend3(hist, season, form, weights) {
  const pick = (h, s, f, fallback) => {
    const parts = [];
    if (Number.isFinite(h)) parts.push({ v: h, w: weights.historical });
    if (Number.isFinite(s)) parts.push({ v: s, w: weights.season2026 ?? weights.season2025_26 ?? 0.55 });
    if (Number.isFinite(f)) parts.push({ v: f, w: weights.formLast10 });
    if (!parts.length) return fallback;
    const wSum = parts.reduce((a, p) => a + p.w, 0);
    return parts.reduce((a, p) => a + (p.v * p.w) / wSum, 0);
  };
  return { pick, weights };
}

export function buildTeamProfileFromBundle(bundle, blendWeightsOverride = null) {
  const weights = blendWeightsOverride ?? historicalIndex.blendWeights;
  const hist = bundle.historical;
  const season = bundle.season2026 ?? bundle.season2025_26;
  const wc = seasonWcRates(season);
  const form = avgFormRates(season?.formLast10 ?? []);
  const { pick } = blend3(hist, season, form, weights);

  const goalsForPerMatch = pick(
    hist.avgGoalsForWc ?? hist.avgGoalsForUcl,
    wc.goalsForPerMatch,
    form.goalsForPerMatch,
    1.4
  );
  const goalsAgainstPerMatch = pick(
    hist.avgGoalsAgainstWc ?? hist.avgGoalsAgainstUcl,
    wc.goalsAgainstPerMatch,
    form.goalsAgainstPerMatch,
    1.1
  );

  const xgForPerMatch = pick(null, wc.xgForPerMatch, null, goalsForPerMatch * 0.95);
  const xgAgainstPerMatch = pick(null, wc.xgAgainstPerMatch, null, goalsAgainstPerMatch * 0.95);

  const xgPerGoal = clamp(xgForPerMatch / Math.max(goalsForPerMatch, 0.5), 0.85, 1.25);
  const xgPerShot = clamp(xgForPerMatch / Math.max(wc.shotsPerMatch, 6), 0.07, 0.14);
  const sotRate = clamp(wc.shotsOnTargetPerMatch / Math.max(wc.shotsPerMatch, 6), 0.28, 0.42);
  const cornersPerShot = clamp(wc.cornersPerMatch / Math.max(wc.shotsPerMatch, 6), 0.16, 0.32);

  const control = clamp(
    0.45 + (hist.avgPossession - 50) / 100 + (form.pointsPerGame - 1.5) / 10,
    0.38,
    0.62
  );

  const players = sanitizeRoster(resolveRoster(bundle.name, season?.roster ?? [])).map((p) => ({
    name: p.name,
    position: p.position,
    likelyStarter: Boolean(p.likelyStarter),
    benchImpact: Boolean(p.benchImpact),
    minutesFactor: p.minutesFactor ?? 0.8,
    xgShare: p.xgShare ?? 0.05,
    propProfile: p.propProfile ?? null
  }));

  const rosterSource = getRosterImportSource(bundle.name);

  return {
    name: bundle.name,
    goalsForPerMatch: round(goalsForPerMatch, 2),
    goalsAgainstPerMatch: round(goalsAgainstPerMatch, 2),
    xgPerGoal: round(xgPerGoal, 2),
    xgPerShot: round(xgPerShot, 3),
    sotRate: round(sotRate, 2),
    cornersPerShot: round(cornersPerShot, 2),
    control: round(control, 2),
    players,
    dataProvenance: {
      era: hist.era,
      season: season?.label ?? '2026',
      blendWeights: weights,
      formMatches: season?.formLast10?.length ?? 0,
      rosterSize: players.length,
      source: rosterSource ?? season?.importSource ?? 'bundled-world-cup-2026',
      rosterSource: rosterSource ?? 'bundled-world-cup-2026',
      wcDataQuality: wc.dataQuality,
      confederation: bundle.confederation ?? null,
      fifaStrength: bundle.fifaStrength ?? null
    }
  };
}

export function resolveTeamBundle(teamName) {
  const canonical = aliasIndex[teamName] ?? teamName;
  return TEAM_BUNDLES[canonical] ?? null;
}

export function getTeamProfiles(homeTeamName, awayTeamName, opts = {}) {
  const blendWeights = opts.blendWeights ?? null;
  const fallback = (name) => ({
    name,
    goalsForPerMatch: 1.4,
    goalsAgainstPerMatch: 1.1,
    xgPerGoal: 1.05,
    xgPerShot: 0.1,
    sotRate: 0.34,
    cornersPerShot: 0.22,
    control: 0.5,
    players: [],
    dataProvenance: { source: 'generic-fallback' }
  });

  const homeBundle = resolveTeamBundle(homeTeamName);
  const awayBundle = resolveTeamBundle(awayTeamName);

  const home = homeBundle ? buildTeamProfileFromBundle(homeBundle, blendWeights) : fallback(homeTeamName);
  const away = awayBundle ? buildTeamProfileFromBundle(awayBundle, blendWeights) : fallback(awayTeamName);

  return { home, away };
}

export function getDataCatalog() {
  return {
    era: historicalIndex.era,
    blendWeights: historicalIndex.blendWeights,
    groups: historicalIndex.groups,
    teams: Object.values(TEAM_BUNDLES).map((b) => ({
      name: b.name,
      confederation: b.confederation,
      fifaStrength: b.fifaStrength,
      historical: b.historical,
      season: b.season2026?.label,
      formMatches: b.season2026?.formLast10?.length ?? 0
    }))
  };
}
