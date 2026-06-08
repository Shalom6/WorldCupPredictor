/**
 * Polymarket vs model blend weights — market leads, model fills gaps.
 */

function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

function round(n, dp = 2) {
  const p = 10 ** dp;
  return Math.round(n * p) / p;
}

function readWeight(envKey, fallback) {
  const n = Number(process.env[envKey]);
  return Number.isFinite(n) ? clamp(n, 0, 1) : fallback;
}

export const DEFAULT_PREDICTION_BLEND = {
  marketWeight: readWeight('POLYMARKET_PREDICTION_WEIGHT', 0.65),
  modelWeight: 1 - readWeight('POLYMARKET_PREDICTION_WEIGHT', 0.65)
};

export const DEFAULT_STATS_BLEND = {
  marketWeight: readWeight('POLYMARKET_STATS_WEIGHT', 0.6),
  modelWeight: 1 - readWeight('POLYMARKET_STATS_WEIGHT', 0.6)
};

export function resolvePredictionBlend(override) {
  if (override?.marketWeight != null || override?.modelWeight != null) {
    const wM = clamp(Number(override.marketWeight ?? 0.65), 0, 1);
    const wK = clamp(Number(override.modelWeight ?? 1 - wM), 0, 1);
    return { marketWeight: wM, modelWeight: wK };
  }
  return { ...DEFAULT_PREDICTION_BLEND };
}

export function resolveStatsBlend(override) {
  if (override?.marketWeight != null || override?.modelWeight != null) {
    const wM = clamp(Number(override.marketWeight ?? 0.6), 0, 1);
    const wK = clamp(Number(override.modelWeight ?? 1 - wM), 0, 1);
    return { marketWeight: wM, modelWeight: wK };
  }
  return { ...DEFAULT_STATS_BLEND };
}

export function blendLambdas(modelLambda, marketLambda, blend) {
  if (!marketLambda) return { ...modelLambda };
  const wM = blend?.marketWeight ?? 0.6;
  const wK = blend?.modelWeight ?? 0.4;
  const sum = wM + wK || 1;
  return {
    home: round((modelLambda.home * wK + marketLambda.home * wM) / sum, 2),
    away: round((modelLambda.away * wK + marketLambda.away * wM) / sum, 2)
  };
}

export function blendPossession(modelHome, modelAway, impliedPct, blend) {
  if (!impliedPct) return { home: modelHome, away: modelAway };
  const edge = ((impliedPct.homeWin ?? 33) - (impliedPct.awayWin ?? 33)) * 0.1;
  const marketHome = clamp(50 + edge, 38, 62);
  const marketAway = 100 - marketHome;
  const wM = blend?.marketWeight ?? 0.6;
  const wK = blend?.modelWeight ?? 0.4;
  const sum = wM + wK || 1;
  return {
    home: round((modelHome * wK + marketHome * wM) / sum, 0),
    away: round((modelAway * wK + marketAway * wM) / sum, 0)
  };
}
