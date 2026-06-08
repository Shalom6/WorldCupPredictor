import { buildBettingCategories } from './bettingStats.js';
import { buildPlayerProps } from './playerProps.js';
import { getFixtureContext, getTeamProfiles } from './sampleData.js';
import { buildStatsBundle } from './statsEngine.js';

function round(n, dp = 1) {
  const p = 10 ** dp;
  return Math.round(n * p) / p;
}

function formatStatsPayload(fixture, home, away, bundle) {
  const { predictedStats, lambdas, goalscorers, assisters, polymarket, marketImplied, statsBlend, metrics } =
    bundle;

  const bettingCategories = buildBettingCategories({
    fixture,
    predictedStats,
    lambdas
  });

  const playerProps = buildPlayerProps({
    home,
    away,
    predictedStats,
    lambdas
  });

  const matchFromCats = {
    goals: round(lambdas.home + lambdas.away, 2),
    shots: round(predictedStats.home.shots + predictedStats.away.shots, 1),
    shotsOnTarget: round(predictedStats.home.shotsOnTarget + predictedStats.away.shotsOnTarget, 1),
    corners: round(predictedStats.home.corners + predictedStats.away.corners, 1),
    fouls: round(predictedStats.home.fouls + predictedStats.away.fouls, 1),
    offsides: round(predictedStats.home.offsides + predictedStats.away.offsides, 1),
    yellowCards: round(predictedStats.home.yellowCards + predictedStats.away.yellowCards, 1),
    bookingPoints: predictedStats.home.bookingPoints + predictedStats.away.bookingPoints
  };

  const marketWeight = Math.round((statsBlend?.marketWeight ?? 0) * 100);
  const modelWeight = Math.round((statsBlend?.modelWeight ?? 1) * 100);

  return {
    fixture,
    predictedStats: { ...predictedStats, match: matchFromCats },
    bettingCategories,
    playerProps,
    goalscorers,
    assisters,
    marketProbabilities: marketImplied,
    marketLambda: metrics.marketLambda,
    modelLambda: metrics.modelLambda,
    blendedLambda: metrics.blendedLambda,
    statsBlend,
    polymarket: polymarket?.found ? polymarket : null,
    rosterSeason: '2025-26',
    dataSources: {
      home: home.dataProvenance,
      away: away.dataProvenance
    },
    blendNote: marketImplied
      ? `Projections: ${marketWeight}% Polymarket-implied rates · ${modelWeight}% season model`
      : 'Projections: season model only (Polymarket unavailable)'
  };
}

export async function buildStatsResponse(query) {
  const fixture = getFixtureContext({
    homeTeam: query?.homeTeam,
    awayTeam: query?.awayTeam,
    venueCity: query?.venueCity,
    date: query?.date,
    neutralVenue:
      query?.neutralVenue === undefined ? undefined : String(query.neutralVenue) !== '0'
  });

  const { home, away } = getTeamProfiles(fixture.homeTeam, fixture.awayTeam);
  const bundle = await buildStatsBundle({ fixture, home, away });
  return formatStatsPayload(fixture, home, away, bundle);
}
