import { blendLambdas, resolvePredictionBlend, resolveStatsBlend } from './marketBlend.js';
import {
  buildPrediction,
  computeKnockoutResolution,
  fitLambdasFrom1x2Pct,
  scorelinesFromLambdas
} from './predictor.js';
import { getDataCatalog, getFixtureContext, getTeamProfiles } from './sampleData.js';
import { fetchPolymarketOdds } from './polymarket.js';
function round(n, dp = 1) {
  const p = 10 ** dp;
  return Math.round(n * p) / p;
}

function blendProbabilitiesPct(modelProbabilities, marketProbabilities, blend) {
  if (!marketProbabilities) return modelProbabilities;
  const wMarket = blend?.marketWeight ?? 0.5;
  const wModel = blend?.modelWeight ?? 0.5;
  const sum = wMarket + wModel || 1;

  const toFrac = (p) => ({
    homeWin: (p.homeWin ?? 0) / 100,
    draw: (p.draw ?? 0) / 100,
    awayWin: (p.awayWin ?? 0) / 100
  });

  const model = toFrac(modelProbabilities);
  const market = toFrac(marketProbabilities);
  const blended = {
    homeWin: (model.homeWin * wModel + market.homeWin * wMarket) / sum,
    draw: (model.draw * wModel + market.draw * wMarket) / sum,
    awayWin: (model.awayWin * wModel + market.awayWin * wMarket) / sum
  };
  const total = blended.homeWin + blended.draw + blended.awayWin || 1;

  return {
    homeWin: round((blended.homeWin / total) * 100, 1),
    draw: round((blended.draw / total) * 100, 1),
    awayWin: round((blended.awayWin / total) * 100, 1)
  };
}

function buildVerdict({ fixture, probabilities, market, blend, knockout }) {
  const ranked90 = [
    { key: 'homeWin', label: fixture.homeTeam, value: probabilities.homeWin },
    { key: 'draw', label: 'Draw', value: probabilities.draw },
    { key: 'awayWin', label: fixture.awayTeam, value: probabilities.awayWin }
  ].sort((a, b) => b.value - a.value);

  const TIE_THRESHOLD = 0.5;
  const isKnockout = fixture.isKnockout ?? fixture.stage !== 'Group Stage';

  let summary;
  let favoriteLabel;
  let confidenceGap;
  let isDeadHeat;

  if (isKnockout && knockout) {
    const trophyRanked = [
      { key: 'homeWin', label: fixture.homeTeam, value: knockout.toLiftTrophy.homeWin },
      { key: 'awayWin', label: fixture.awayTeam, value: knockout.toLiftTrophy.awayWin }
    ].sort((a, b) => b.value - a.value);

    const trophyFavorite = trophyRanked[0];
    const trophyRunnerUp = trophyRanked[1];
    const trophyGap = Number((trophyFavorite.value - trophyRunnerUp.value).toFixed(1));
    isDeadHeat = trophyGap < TIE_THRESHOLD;
    favoriteLabel = trophyFavorite.label;

    if (isDeadHeat) {
      favoriteLabel = `${trophyFavorite.label} / ${trophyRunnerUp.label}`;
      summary = `${trophyFavorite.label} and ${trophyRunnerUp.label} are neck and neck to advance`;
    } else {
      summary = `${trophyFavorite.label} most likely to advance (incl. extra time & penalties if needed)`;
    }

    if (knockout.extraTimePct >= 8) {
      summary += ` · ${knockout.extraTimePct}% chance of extra time`;
    }
    if (knockout.penaltiesPct >= 4) {
      summary += ` · ${knockout.penaltiesPct}% chance of penalties`;
    }
    confidenceGap = isDeadHeat ? 0 : trophyGap;
  } else {
    const favorite = ranked90[0];
    const runnerUp = ranked90[1];
    const gap = Number((favorite.value - runnerUp.value).toFixed(1));
    isDeadHeat = gap < TIE_THRESHOLD;
    favoriteLabel = isDeadHeat ? `${ranked90[0].label} / ${ranked90[1].label}` : favorite.label;

    if (isDeadHeat) {
      summary = `Tight group-stage match — ${ranked90[0].label}, draw, or ${ranked90[2].label} all plausible over 90 minutes`;
    } else if (favorite.key === 'draw') {
      summary = `Draw most likely in Group ${fixture.group ?? '?'} — both teams may settle for a point`;
    } else {
      summary = `${favorite.label} favored to win in 90 minutes (Group ${fixture.group ?? 'stage'})`;
    }
    confidenceGap = isDeadHeat ? 0 : gap;
  }

  if (market && blend.marketWeight > 0 && blend.modelWeight > 0) {
    summary += ` (90-min blend: ${Math.round(blend.modelWeight * 100)}% model, ${Math.round(blend.marketWeight * 100)}% Polymarket)`;
  } else if (market) {
    summary += ' (90-min: Polymarket odds only)';
  }

  return {
    knockout: isKnockout ? knockout : null,
    verdict: {
      summary,
      favorite: favoriteLabel,
      confidenceGap,
      isDeadHeat,
      regulationFavorite: ranked90[0].label
    }
  };
}

/**
 * Re-blend model + fresh Polymarket odds without recomputing the Poisson model.
 */
export function applyLivePolymarketUpdate(snapshot, polymarket) {
  if (!polymarket?.found) {
    return {
      marketRefreshSkipped: true,
      marketUpdatedAt: snapshot.marketUpdatedAt ?? null
    };
  }

  const fixture = snapshot.fixture;
  const modelProbabilities = snapshot.modelProbabilities;
  const model = snapshot.model;
  const blend = snapshot.blend ?? resolvePredictionBlend();
  const statsBlend = snapshot.statsBlend ?? resolveStatsBlend();
  const marketProbabilities =
    polymarket?.found && polymarket?.implied ? polymarket.implied : snapshot.marketProbabilities ?? null;
  const market = marketProbabilities;
  const probabilities = blendProbabilitiesPct(modelProbabilities, marketProbabilities, blend);

  const modelLambda = snapshot.model?.modelLambda ?? snapshot.model?.lambda ?? model?.lambda;
  const marketLambda = marketProbabilities ? fitLambdasFrom1x2Pct(marketProbabilities) : null;
  const blendedLambda = blendLambdas(modelLambda, marketLambda, statsBlend);

  const isKnockout = fixture.isKnockout ?? fixture.stage !== 'Group Stage';
  const knockout = isKnockout
    ? computeKnockoutResolution(blendedLambda.home, blendedLambda.away, probabilities)
    : null;

  const scorelines = scorelinesFromLambdas(
    fixture.homeTeam,
    fixture.awayTeam,
    blendedLambda.home,
    blendedLambda.away
  );

  const { verdict } = buildVerdict({
    fixture,
    probabilities,
    market,
    blend,
    knockout
  });

  return {
    polymarket,
    marketProbabilities,
    probabilities,
    regulationProbabilities: probabilities,
    knockout,
    verdict,
    scorelines,
    blend,
    statsBlend,
    blendedLambda,
    marketLambda,
    model: {
      ...(model ?? {}),
      lambda: blendedLambda,
      modelLambda,
      marketLambda
    },
    marketUpdatedAt: polymarket?.fetchedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Predictions Engine: season-stats model + optional Polymarket blend.
 */
export async function buildPredictionsResponse(body) {
  const homeTeam = body?.homeTeam ?? 'Brazil';
  const awayTeam = body?.awayTeam ?? 'Morocco';
  if (homeTeam === awayTeam) {
    throw new Error('homeTeam and awayTeam must be different');
  }

  const fixture = getFixtureContext(body);
  const { home, away } = getTeamProfiles(fixture.homeTeam, fixture.awayTeam);

  const polymarket = body?.skipPolymarket ? null : await fetchPolymarketOdds(homeTeam, awayTeam);
  const marketFromPolymarket = polymarket?.found && polymarket?.implied ? polymarket.implied : null;
  const market = body?.market ?? marketFromPolymarket;

  const blend = body?.blend ?? (market ? resolvePredictionBlend(body?.blend) : { marketWeight: 0, modelWeight: 1 });
  const statsBlend = resolveStatsBlend(body?.statsBlend);

  const prediction = buildPrediction({
    fixture,
    home,
    away,
    market,
    blend
  });

  const modelProbabilities = prediction.model.outcome;
  const marketProbabilities = prediction.market;
  const probabilities = prediction.blended ?? modelProbabilities;

  const modelLambda = prediction.model.lambda;
  const marketLambda = marketFromPolymarket ? fitLambdasFrom1x2Pct(marketFromPolymarket) : null;
  const blendedLambda = blendLambdas(modelLambda, marketLambda, statsBlend);

  const isKnockout = fixture.isKnockout ?? fixture.stage !== 'Group Stage';
  const knockout = isKnockout
    ? computeKnockoutResolution(blendedLambda.home, blendedLambda.away, probabilities)
    : null;

  const scorelines = scorelinesFromLambdas(
    prediction.fixture.homeTeam,
    prediction.fixture.awayTeam,
    blendedLambda.home,
    blendedLambda.away
  );

  const { verdict } = buildVerdict({
    fixture: prediction.fixture,
    probabilities,
    market,
    blend,
    knockout
  });

  return {
    fixture: prediction.fixture,
    probabilities,
    regulationProbabilities: probabilities,
    knockout,
    modelProbabilities,
    marketProbabilities,
    scorelines,
    verdict,
    model: {
      lambda: blendedLambda,
      modelLambda,
      marketLambda,
      note: marketFromPolymarket
        ? `Blended xG rates: ${Math.round(statsBlend.marketWeight * 100)}% Polymarket · ${Math.round(statsBlend.modelWeight * 100)}% season model`
        : 'Poisson model using blended World Cup history + 2026 qualifying form'
    },
    polymarket,
    blend,
    statsBlend,
    blendedLambda,
    marketLambda,
    marketUpdatedAt: polymarket?.fetchedAt ?? null,
    dataSources: {
      teams: {
        home: home.dataProvenance,
        away: away.dataProvenance
      },
      catalog: getDataCatalog()
    },
    updatedAt: new Date().toISOString()
  };
}
