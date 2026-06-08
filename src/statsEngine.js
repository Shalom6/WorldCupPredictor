import {
  blendLambdas,
  blendPossession,
  resolveStatsBlend
} from './marketBlend.js';
import {
  buildExpectedStats,
  buildPrediction,
  fitLambdasFrom1x2Pct,
  isGoalkeeperPlayer
} from './predictor.js';
import { fetchPolymarketOdds } from './polymarket.js';

function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

function round(n, dp = 1) {
  const p = 10 ** dp;
  return Math.round(n * p) / p;
}

export function buildBlendedMatchMetrics({
  home,
  away,
  fixture,
  modelLambda,
  marketImplied,
  statsBlend
}) {
  const marketLambda = marketImplied ? fitLambdasFrom1x2Pct(marketImplied) : null;
  const blendedLambda = blendLambdas(modelLambda, marketLambda, statsBlend);

  const modelStats = buildExpectedStats({
    home,
    away,
    lambdaHome: modelLambda.home,
    lambdaAway: modelLambda.away,
    context: { finalTempo: fixture.finalTempo ?? 0.95, finalScale: fixture.finalScale ?? 0.92 }
  });

  const blendedStats = buildExpectedStats({
    home,
    away,
    lambdaHome: blendedLambda.home,
    lambdaAway: blendedLambda.away,
    context: { finalTempo: fixture.finalTempo ?? 0.95, finalScale: fixture.finalScale ?? 0.92 }
  });

  const poss = blendPossession(
    blendedStats.home.possession,
    blendedStats.away.possession,
    marketImplied,
    statsBlend
  );
  blendedStats.home.possession = poss.home;
  blendedStats.away.possession = poss.away;

  return {
    modelLambda,
    marketLambda,
    blendedLambda,
    modelStats,
    blendedStats,
    marketImplied
  };
}

function estimateFouls({ home, away, fixture }) {
  const finalTempo = fixture?.finalTempo ?? 0.95;
  const homeControl = home?.control ?? 0.5;
  const awayControl = away?.control ?? 0.5;
  const shareHome = clamp(homeControl / (homeControl + awayControl || 1), 0.35, 0.65);
  const baseTotal = 24 * finalTempo;
  const homeShare = clamp(0.5 - (shareHome - 0.5) * 0.6, 0.42, 0.58);
  return {
    home: round(clamp(baseTotal * homeShare, 8, 20), 1),
    away: round(clamp(baseTotal * (1 - homeShare), 8, 20), 1)
  };
}

function estimateOffsides(homeShots, awayShots) {
  return {
    home: round(clamp(homeShots * 0.11 + 1.1, 0.8, 5.5), 1),
    away: round(clamp(awayShots * 0.11 + 1.1, 0.8, 5.5), 1)
  };
}

function estimateCards({ home, away, fixture }) {
  const tempo = fixture?.finalTempo ?? 0.95;
  const baseTotal = 4.4 * tempo * 1.08;
  const homeShare = clamp(1 - (home.control ?? 0.5) + 0.08, 0.42, 0.58);
  const homeYellow = clamp(baseTotal * homeShare, 1.4, 3.8);
  const awayYellow = clamp(baseTotal * (1 - homeShare), 1.4, 3.8);
  return {
    home: {
      yellowCards: round(homeYellow, 1),
      bookingPoints: round(homeYellow * 10, 0)
    },
    away: {
      yellowCards: round(awayYellow, 1),
      bookingPoints: round(awayYellow * 10, 0)
    }
  };
}

function assistWeight(player) {
  const pos = String(player?.position ?? '').toLowerCase();
  const xg = player?.xgShare ?? 0.05;
  if (pos.includes('midfield')) return xg * 1.5 + 0.06;
  if (pos.includes('defender')) return xg * 0.5 + 0.03;
  if (pos.includes('attack') || pos.includes('forward')) return xg * 0.85 + 0.02;
  return xg;
}

export function assistProbabilities(team, expectedGoals) {
  const players =
    team.players?.filter((p) => (p.likelyStarter || p.benchImpact) && !isGoalkeeperPlayer(p)) ?? [];
  const weights = players.map((p) => assistWeight(p));
  const total = weights.reduce((a, w) => a + w, 0) || 1;
  const teamAssistLambda = expectedGoals * 0.82;

  const out = players.map((p, i) => {
    const share = weights[i] / total;
    const playerLambda = teamAssistLambda * share * (p.minutesFactor ?? 0.8);
    return {
      name: p.name,
      team: team.name,
      probability: round((1 - Math.exp(-playerLambda)) * 100, 1)
    };
  });

  return out.sort((a, b) => b.probability - a.probability);
}

function buildExtendedStats({ blendedStats, home, away, fixture, blendedLambda }) {
  const fouls = estimateFouls({ home, away, fixture });
  const offsides = estimateOffsides(blendedStats.home.shots, blendedStats.away.shots);
  const cards = estimateCards({ home, away, fixture });

  return {
    home: {
      goals: round(blendedLambda.home, 2),
      shots: blendedStats.home.shots,
      shotsOnTarget: blendedStats.home.shotsOnTarget,
      corners: blendedStats.home.corners,
      fouls: fouls.home,
      offsides: offsides.home,
      yellowCards: cards.home.yellowCards,
      bookingPoints: cards.home.bookingPoints,
      possession: blendedStats.home.possession
    },
    away: {
      goals: round(blendedLambda.away, 2),
      shots: blendedStats.away.shots,
      shotsOnTarget: blendedStats.away.shotsOnTarget,
      corners: blendedStats.away.corners,
      fouls: fouls.away,
      offsides: offsides.away,
      yellowCards: cards.away.yellowCards,
      bookingPoints: cards.away.bookingPoints,
      possession: blendedStats.away.possession
    }
  };
}

function scorerProbabilitiesFromLambda(team, expectedGoals) {
  const players =
    team.players?.filter((p) => (p.likelyStarter || p.benchImpact) && !isGoalkeeperPlayer(p)) ?? [];
  const totalShare = players.reduce((acc, p) => acc + (p.xgShare ?? 0), 0) || 1;

  return players
    .map((p) => {
      const share = (p.xgShare ?? 0) / totalShare;
      const playerLambda = expectedGoals * share * (p.minutesFactor ?? 1);
      return {
        name: p.name,
        team: team.name,
        probability: round((1 - Math.exp(-playerLambda)) * 100, 1)
      };
    })
    .sort((a, b) => b.probability - a.probability);
}

export async function buildStatsBundle({ fixture, home, away, polymarket = null, statsBlend = resolveStatsBlend() }) {
  const pm =
    polymarket ??
    (await fetchPolymarketOdds(fixture.homeTeam, fixture.awayTeam).catch(() => null));
  const marketImplied = pm?.found && pm?.implied ? pm.implied : null;

  const prediction = buildPrediction({
    fixture,
    home,
    away,
    market: null,
    blend: { marketWeight: 0, modelWeight: 1 }
  });

  const modelLambda = prediction.model.lambda;
  const metrics = buildBlendedMatchMetrics({
    home,
    away,
    fixture,
    modelLambda,
    marketImplied,
    statsBlend
  });

  const predictedStats = buildExtendedStats({
    blendedStats: metrics.blendedStats,
    home,
    away,
    fixture,
    blendedLambda: metrics.blendedLambda
  });

  const lh = metrics.blendedLambda.home;
  const la = metrics.blendedLambda.away;

  const scorerHome = scorerProbabilitiesFromLambda(home, lh);
  const scorerAway = scorerProbabilitiesFromLambda(away, la);
  const allScorers = [...scorerHome.slice(0, 5), ...scorerAway.slice(0, 5)]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 10);

  const assistHome = assistProbabilities(home, lh);
  const assistAway = assistProbabilities(away, la);
  const topAssists = [...assistHome.slice(0, 5), ...assistAway.slice(0, 5)]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 10);

  return {
    prediction,
    metrics,
    predictedStats,
    lambdas: metrics.blendedLambda,
    goalscorers: allScorers,
    assisters: topAssists,
    polymarket: pm,
    marketImplied,
    statsBlend
  };
}
