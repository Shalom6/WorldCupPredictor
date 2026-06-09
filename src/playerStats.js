/** Shared player stat helpers for manual + API imports. */

function round(n, dp = 2) {
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** dp;
  return Math.round(n * p) / p;
}

export function hitRatesFromLog(log) {
  const l5 = log.slice(0, 5);
  const l10 = log.slice(0, 10);

  const hit = (games, fn, line) => {
    if (!games.length) return 0;
    return Math.round((games.filter((g) => fn(g) > line).length / games.length) * 100);
  };

  return {
    goals05: {
      l5: hit(l5, (g) => g.goals, 0),
      l10: hit(l10, (g) => g.goals, 0),
      season: hit(log, (g) => g.goals, 0)
    },
    goals15: {
      l5: hit(l5, (g) => g.goals, 1),
      l10: hit(l10, (g) => g.goals, 1),
      season: hit(log, (g) => g.goals, 1)
    },
    assists05: {
      l5: hit(l5, (g) => g.assists, 0),
      l10: hit(l10, (g) => g.assists, 0),
      season: hit(log, (g) => g.assists, 0)
    },
    shots15: {
      l5: hit(l5, (g) => g.shots, 1),
      l10: hit(l10, (g) => g.shots, 1),
      season: hit(log, (g) => g.shots, 1)
    },
    shots25: {
      l5: hit(l5, (g) => g.shots, 2),
      l10: hit(l10, (g) => g.shots, 2),
      season: hit(log, (g) => g.shots, 2)
    },
    sot05: {
      l5: hit(l5, (g) => g.shotsOnTarget, 0),
      l10: hit(l10, (g) => g.shotsOnTarget, 0),
      season: hit(log, (g) => g.shotsOnTarget, 0)
    },
    cards05: {
      l5: hit(l5, (g) => g.cards, 0),
      l10: hit(l10, (g) => g.cards, 0),
      season: hit(log, (g) => g.cards, 0)
    },
    fouls15: {
      l5: hit(l5, (g) => g.fouls, 1),
      l10: hit(l10, (g) => g.fouls, 1),
      season: hit(log, (g) => g.fouls, 1)
    }
  };
}

export function seasonRatesFromLog(log) {
  const played = log.filter((g) => g.minutes > 0);
  const totalMins = played.reduce((a, g) => a + g.minutes, 0) || 1;
  const sum = (fn) => played.reduce((a, g) => a + fn(g), 0);
  const per90 = (v) => round((v / totalMins) * 90, 2);

  return {
    goals90: per90(sum((g) => g.goals)),
    assists90: per90(sum((g) => g.assists)),
    shots90: round(per90(sum((g) => g.shots)), 1),
    sot90: round(per90(sum((g) => g.shotsOnTarget)), 1),
    passes90: round(per90(sum((g) => g.passes)), 0),
    cards90: per90(sum((g) => g.cards)),
    fouls90: round(per90(sum((g) => g.fouls)), 1),
    minutesAvg: played.length ? Math.round(totalMins / played.length) : 0
  };
}

export function estimateXgShare(position, goals90, starter) {
  const base = position === 'Forward' ? 0.12 : position === 'Midfielder' ? 0.06 : 0.02;
  const boost = Math.min(0.2, goals90 * 0.15);
  const scale = starter ? 1 : 0.55;
  return round((base + boost) * scale, 2);
}

function isGoalkeeper(position) {
  return String(position ?? '').toLowerCase().includes('goal');
}

function seededRand(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return () => {
    h = (Math.imul(1103515245, h) + 12345) | 0;
    return (h >>> 0) / 0xffffffff;
  };
}

/** Fill missing GK fields so charts work for estimated squads too. */
export function enrichGkGame(game, playerId) {
  if (game.saves != null && game.goalsConceded != null) return game;

  const rnd = seededRand(`${playerId}|${game.date}|${game.opponent}`);
  const factor = Math.min(1, (game.minutes ?? 0) / 90);

  let goalsConceded = game.goalsConceded;
  if (goalsConceded == null) {
    if (factor < 0.35) goalsConceded = rnd() < 0.7 ? 0 : 1;
    else if (game.result === 'W') goalsConceded = rnd() < 0.52 ? 0 : rnd() < 0.88 ? 1 : 2;
    else if (game.result === 'D') goalsConceded = 1;
    else goalsConceded = rnd() < 0.42 ? 1 : rnd() < 0.82 ? 2 : 3;
  }

  const saves =
    game.saves ??
    Math.max(0, Math.round(1 + goalsConceded * (1.4 + rnd()) + factor * (2 + rnd() * 4)));

  const keeperSweeper =
    game.keeperSweeper ?? (rnd() < 0.22 ? Math.ceil(rnd() * 2) : 0);

  return { ...game, goalsConceded, saves, keeperSweeper };
}

export function enrichGoalkeeperGameLog(gameLog, playerId) {
  if (!gameLog?.length) return gameLog ?? [];
  return gameLog.map((g) => enrichGkGame(g, playerId));
}

const EMPTY_RATES = {
  goals90: 0,
  assists90: 0,
  shots90: 0,
  sot90: 0,
  passes90: 0,
  cards90: 0,
  fouls90: 0,
  minutesAvg: 0
};

/** Normalize a player record from data/{team}.json into catalog shape. */
export function enrichManualPlayer(p, teamFile) {
  const team = p.team ?? teamFile.team;
  const group = p.group ?? teamFile.group ?? '?';
  const gameLog = (p.gameLog ?? []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const seasonRates =
    p.seasonRates ?? (gameLog.length ? seasonRatesFromLog(gameLog) : { ...EMPTY_RATES });
  const hitRates = p.hitRates ?? (gameLog.length ? hitRatesFromLog(gameLog) : hitRatesFromLog([]));
  const avgMinutes = seasonRates.minutesAvg ?? 0;
  const likelyStarter = p.likelyStarter ?? avgMinutes >= 60;
  const goals90 = seasonRates.goals90 ?? 0;
  const xgShare = p.xgShare ?? estimateXgShare(p.position, goals90, likelyStarter);
  const minutesFactor = p.minutesFactor ?? round(Math.min(1, avgMinutes / 90 || 0.35), 2);
  const benchImpact = p.benchImpact ?? (!likelyStarter && avgMinutes >= 20);

  return {
    id: p.id,
    name: p.name,
    team,
    group,
    position: p.position,
    number: p.number ?? null,
    likelyStarter,
    benchImpact,
    minutesFactor,
    xgShare,
    seasonRates,
    hitRates,
    gameLog,
    dataSource: p.dataSource ?? teamFile.dataSource ?? 'manual',
    dataScope: p.dataScope ?? 'international',
    searchText: `${p.name} ${team} ${p.position} ${group}`.toLowerCase(),
    importMeta: p.importMeta ?? {
      appearances: gameLog.length,
      competitions: [...new Set(gameLog.map((g) => g.competition))],
      lastMatch: gameLog[0]?.date ?? null
    },
    ...(p.profile ? { profile: p.profile } : {}),
    ...(p.sofascoreId ? { sofascoreId: p.sofascoreId } : {})
  };
}
