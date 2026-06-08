import { buildStatsResponse } from './stats.js';

/**
 * Full context bundle for the AI analyst (any question type).
 */
const DEFAULT_FIXTURE = {
  homeTeam: 'Brazil',
  awayTeam: 'Morocco',
  competition: 'UEFA Champions League',
  stage: 'Final',
  venueCity: 'Budapest',
  date: 'May 30, 2026',
  neutralVenue: true
};

export function buildAnalystBundle({ prediction = null, polymarket = null, stats = null }) {
  if (!prediction && !polymarket) return null;

  const pm = polymarket ?? prediction?.polymarket ?? null;
  const fixture = prediction?.fixture ?? {
    ...DEFAULT_FIXTURE,
    homeTeam: pm?.homeTeam ?? DEFAULT_FIXTURE.homeTeam,
    awayTeam: pm?.awayTeam ?? DEFAULT_FIXTURE.awayTeam
  };

  return {
    fixture,
    probabilities: prediction?.probabilities ?? null,
    modelProbabilities: prediction?.modelProbabilities ?? null,
    marketProbabilities: prediction?.marketProbabilities ?? pm?.implied ?? null,
    knockout: prediction?.knockout ?? null,
    scorelines: prediction?.scorelines ?? [],
    verdict: prediction?.verdict ?? null,
    model: prediction?.model ?? null,
    blend: prediction?.blend ?? null,
    statsBlend: prediction?.statsBlend ?? null,
    polymarket: pm,
    stats: stats
      ? {
          predictedStats: stats.predictedStats,
          goalscorers: stats.goalscorers,
          assisters: stats.assisters,
          playerProps: stats.playerProps,
          blendNote: stats.blendNote,
          statsBlend: stats.statsBlend,
          rosterSeason: stats.rosterSeason
        }
      : null,
    dataSources: prediction?.dataSources ?? null,
    updatedAt: prediction?.updatedAt ?? null
  };
}

export async function enrichAnalystBundle(bundle) {
  if (!bundle?.fixture) return bundle;
  const { homeTeam, awayTeam, neutralVenue } = bundle.fixture;
  if (bundle.stats?.predictedStats) return bundle;

  try {
    const stats = await buildStatsResponse({
      homeTeam,
      awayTeam,
      neutralVenue: neutralVenue !== false
    });
    return {
      ...bundle,
      stats: {
        predictedStats: stats.predictedStats,
        goalscorers: stats.goalscorers,
        assisters: stats.assisters,
        playerProps: stats.playerProps,
        blendNote: stats.blendNote,
        statsBlend: stats.statsBlend,
        rosterSeason: stats.rosterSeason
      }
    };
  } catch {
    return bundle;
  }
}

function topPlayerPropLines(player, maxLines = 2) {
  return (player.lines ?? []).slice(0, maxLines).map((l) => [l.line, l.overPct]);
}

function questionNeeds(q, patterns) {
  return patterns.some((p) => q.includes(p));
}

/** Minimal LLM payload — short keys, question-aware sections, no duplicate fields. */
export function buildLlmContext(bundle, question = '') {
  if (!bundle) return null;

  const q = String(question || '').toLowerCase();
  const home = bundle.fixture?.homeTeam ?? 'Brazil';
  const away = bundle.fixture?.awayTeam ?? 'Morocco';
  const stats = bundle.stats;

  const ctx = {
    fix: `${home} vs ${away} · ${bundle.fixture?.venueCity ?? 'Budapest'} · ${bundle.fixture?.date ?? 'May 30'}`
  };

  if (bundle.blend) {
    ctx.blend1x2 = `${Math.round((bundle.blend.marketWeight ?? 0) * 100)}% PM / ${Math.round((bundle.blend.modelWeight ?? 0) * 100)}% model`;
  }
  if (bundle.statsBlend) {
    ctx.blendStats = `${Math.round((bundle.statsBlend.marketWeight ?? 0) * 100)}% PM / ${Math.round((bundle.statsBlend.modelWeight ?? 0) * 100)}% model`;
  }

  if (bundle.probabilities) {
    ctx.win = {
      blend: [bundle.probabilities.homeWin, bundle.probabilities.draw, bundle.probabilities.awayWin]
    };
  }
  if (bundle.modelProbabilities) {
    ctx.win = ctx.win ?? {};
    ctx.win.model = [
      bundle.modelProbabilities.homeWin,
      bundle.modelProbabilities.draw,
      bundle.modelProbabilities.awayWin
    ];
  }
  if (bundle.marketProbabilities) {
    ctx.win = ctx.win ?? {};
    ctx.win.pm = [
      bundle.marketProbabilities.homeWin,
      bundle.marketProbabilities.draw,
      bundle.marketProbabilities.awayWin
    ];
  }

  if (bundle.verdict?.summary) ctx.verdict = bundle.verdict.summary;

  const wantScorelines =
    !q ||
    questionNeeds(q, ['score', 'scoreline', 'result', 'predict', 'likely', 'summar', 'plain', 'everything']);
  if (wantScorelines && bundle.scorelines?.length) {
    ctx.lines = bundle.scorelines.slice(0, 5).map((s) => [s.score, s.probability]);
  }

  const wantKnockout = questionNeeds(q, ['knockout', 'extra', 'penalt', 'trophy', 'final', 'summar', 'everything', 'win']);
  if (wantKnockout && bundle.knockout) {
    ctx.ko = {
      et: bundle.knockout.extraTimePct,
      pens: bundle.knockout.penaltiesPct,
      trophy: [bundle.knockout.toLiftTrophy?.homeWin, bundle.knockout.toLiftTrophy?.awayWin]
    };
  }

  if (bundle.model?.lambda || bundle.model?.modelLambda) {
    ctx.xg = [
      bundle.model.lambda?.home ?? bundle.model.modelLambda?.home,
      bundle.model.lambda?.away ?? bundle.model.modelLambda?.away
    ];
  }

  const wantStats =
    !q ||
    questionNeeds(q, ['stat', 'shot', 'corner', 'possession', 'foul', 'card', 'xg', 'total', 'summar', 'everything', 'bet', 'prop']);
  if (wantStats && stats?.predictedStats) {
    const m = stats.predictedStats.match;
    const h = stats.predictedStats.home;
    const a = stats.predictedStats.away;
    ctx.stats = {
      match: m
        ? [m.goals, m.shots, m.shotsOnTarget, m.corners, m.yellowCards]
        : undefined,
      home: h ? [h.goals, h.shots, h.shotsOnTarget, h.possession] : undefined,
      away: a ? [a.goals, a.shots, a.shotsOnTarget, a.possession] : undefined,
      note: stats.blendNote
    };
  }

  const wantPlayers =
    !q ||
    questionNeeds(q, [
      'player',
      'scorer',
      'goal',
      'assist',
      'prop',
      'saka',
      'dembele',
      'dembélé',
      'gyokeres',
      'barcola',
      'shot',
      'card',
      'summar',
      'everything'
    ]);
  if (wantPlayers && stats) {
    if (stats.goalscorers?.length) {
      ctx.scorers = stats.goalscorers.slice(0, 6).map((p) => [p.name, p.team, p.probability]);
    }
    if (questionNeeds(q, ['assist', 'summar', 'everything', 'player', 'prop']) && stats.assisters?.length) {
      ctx.assists = stats.assisters.slice(0, 5).map((p) => [p.name, p.team, p.probability]);
    }
    if (questionNeeds(q, ['prop', 'shot', 'card', 'foul', 'summar', 'everything']) && stats.playerProps?.categories?.length) {
      ctx.props = stats.playerProps.categories.slice(0, 4).map((cat) => ({
        id: cat.id,
        top: (cat.players ?? []).slice(0, 4).map((p) => [p.name, p.team, p.expected, p.anytimePct, topPlayerPropLines(p)])
      }));
    }
  }

  if (bundle.polymarket?.found) {
    ctx.pm = bundle.polymarket.marketQuestion ?? bundle.polymarket.eventTitle;
  }

  return ctx;
}

/** @deprecated Use buildLlmContext — kept for debugging */
export function compactAnalystBundle(bundle) {
  return buildLlmContext(bundle, 'everything summarize stats players props scorelines');
}
