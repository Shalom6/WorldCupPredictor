function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

function round(n, dp = 2) {
  const p = 10 ** dp;
  return Math.round(n * p) / p;
}

function poissonPmf(k, lambda) {
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return (Math.exp(-lambda) * lambda ** k) / fact;
}

function scoreMatrix(lambdaHome, lambdaAway, maxGoals = 6) {
  const matrix = [];
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      matrix.push({
        h,
        a,
        p: poissonPmf(h, lambdaHome) * poissonPmf(a, lambdaAway)
      });
    }
  }
  const sum = matrix.reduce((acc, x) => acc + x.p, 0);
  for (const cell of matrix) cell.p /= sum;
  return matrix;
}

function outcomeFromMatrix(matrix) {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  for (const c of matrix) {
    if (c.h > c.a) homeWin += c.p;
    else if (c.h === c.a) draw += c.p;
    else awayWin += c.p;
  }
  const sum = homeWin + draw + awayWin;
  return { homeWin: homeWin / sum, draw: draw / sum, awayWin: awayWin / sum };
}

/**
 * Knockout final: 90 min → ET → pens. Returns paths + outright trophy %.
 * @param {number} lambdaHome
 * @param {number} lambdaAway
 * @param {{ homeWin: number, draw: number, awayWin: number }} regulationPct — 0–100
 */
export function computeKnockoutResolution(lambdaHome, lambdaAway, regulationPct) {
  const r90 = {
    homeWin: (regulationPct.homeWin ?? 0) / 100,
    draw: (regulationPct.draw ?? 0) / 100,
    awayWin: (regulationPct.awayWin ?? 0) / 100
  };

  const etScale = 0.38;
  const etOutcome = outcomeFromMatrix(
    scoreMatrix(lambdaHome * etScale, lambdaAway * etScale, 5)
  );

  const pExtraTime = r90.draw;
  const pPenalties = pExtraTime * etOutcome.draw;
  const pHomeExtraTime = pExtraTime * etOutcome.homeWin;
  const pAwayExtraTime = pExtraTime * etOutcome.awayWin;

  const penEdge = clamp((lambdaHome - lambdaAway) * 0.1, -0.14, 0.14);
  const pHomePenalties = pPenalties * (0.5 + penEdge);
  const pAwayPenalties = pPenalties * (0.5 - penEdge);

  const homeTrophy = r90.homeWin + pHomeExtraTime + pHomePenalties;
  const awayTrophy = r90.awayWin + pAwayExtraTime + pAwayPenalties;
  const trophySum = homeTrophy + awayTrophy || 1;

  return {
    extraTimePct: round(pExtraTime * 100, 1),
    penaltiesPct: round(pPenalties * 100, 1),
    toLiftTrophy: {
      homeWin: round((homeTrophy / trophySum) * 100, 1),
      awayWin: round((awayTrophy / trophySum) * 100, 1)
    },
    paths: {
      homeWin90Pct: round(r90.homeWin * 100, 1),
      homeWinExtraTimePct: round(pHomeExtraTime * 100, 1),
      homeWinPenaltiesPct: round(pHomePenalties * 100, 1),
      awayWin90Pct: round(r90.awayWin * 100, 1),
      awayWinExtraTimePct: round(pAwayExtraTime * 100, 1),
      awayWinPenaltiesPct: round(pAwayPenalties * 100, 1)
    }
  };
}

function normalizeOutcome(o) {
  if (!o) return null;
  const homeWin = Number(o.homeWin);
  const draw = Number(o.draw);
  const awayWin = Number(o.awayWin);
  if (![homeWin, draw, awayWin].every(Number.isFinite)) return null;
  const sum = homeWin + draw + awayWin;
  if (sum <= 0) return null;
  return { homeWin: homeWin / sum, draw: draw / sum, awayWin: awayWin / sum };
}

function blendOutcomes(a, b, wa, wb) {
  const sum = wa + wb;
  const A = normalizeOutcome(a);
  const B = normalizeOutcome(b);
  if (!A && !B) return null;
  if (!A) return B;
  if (!B) return A;
  return normalizeOutcome({
    homeWin: (A.homeWin * wa + B.homeWin * wb) / sum,
    draw: (A.draw * wa + B.draw * wb) / sum,
    awayWin: (A.awayWin * wa + B.awayWin * wb) / sum
  });
}

export function buildExpectedStats({ home, away, lambdaHome, lambdaAway, context }) {
  const finalTempo = context.finalTempo ?? 0.95;
  const homeXg = lambdaHome * (home.xgPerGoal ?? 1.05);
  const awayXg = lambdaAway * (away.xgPerGoal ?? 1.05);

  const homeShots = clamp((homeXg / (home.xgPerShot ?? 0.1)) * finalTempo, 6, 28);
  const awayShots = clamp((awayXg / (away.xgPerShot ?? 0.1)) * finalTempo, 6, 28);

  const homeSot = clamp(homeShots * (home.sotRate ?? 0.34), 2, 12);
  const awaySot = clamp(awayShots * (away.sotRate ?? 0.34), 2, 12);

  const homeCorners = clamp(homeShots * (home.cornersPerShot ?? 0.22), 2, 12);
  const awayCorners = clamp(awayShots * (away.cornersPerShot ?? 0.22), 2, 12);

  const controlHome = clamp((home.control ?? 0.5) / ((home.control ?? 0.5) + (away.control ?? 0.5)), 0.35, 0.65);
  const homePoss = clamp(50 + (controlHome - 0.5) * 20, 38, 62);
  const awayPoss = 100 - homePoss;

  return {
    home: {
      xG: round(homeXg, 2),
      shots: round(homeShots, 1),
      shotsOnTarget: round(homeSot, 1),
      corners: round(homeCorners, 1),
      possession: round(homePoss, 0)
    },
    away: {
      xG: round(awayXg, 2),
      shots: round(awayShots, 1),
      shotsOnTarget: round(awaySot, 1),
      corners: round(awayCorners, 1),
      possession: round(awayPoss, 0)
    }
  };
}

function topScorelines(matrix, homeName, awayName, topN = 7) {
  return matrix
    .slice()
    .sort((a, b) => b.p - a.p)
    .slice(0, topN)
    .map((c) => ({
      score: `${homeName} ${c.h}-${c.a} ${awayName}`,
      homeGoals: c.h,
      awayGoals: c.a,
      probability: round(c.p * 100, 1)
    }));
}

/** Infer Poisson lambdas that best match Polymarket 1X2 (%). */
export function fitLambdasFrom1x2Pct(impliedPct) {
  if (!impliedPct) return null;
  const target = {
    homeWin: (impliedPct.homeWin ?? 0) / 100,
    draw: (impliedPct.draw ?? 0) / 100,
    awayWin: (impliedPct.awayWin ?? 0) / 100
  };
  const total = target.homeWin + target.draw + target.awayWin;
  if (total <= 0) return null;

  let best = { home: 1.4, away: 1.2, err: Infinity };
  for (let lh = 0.4; lh <= 3.2; lh += 0.04) {
    for (let la = 0.4; la <= 3.2; la += 0.04) {
      const o = outcomeFromMatrix(scoreMatrix(lh, la, 6));
      const err =
        Math.abs(o.homeWin - target.homeWin) +
        Math.abs(o.draw - target.draw) * 1.25 +
        Math.abs(o.awayWin - target.awayWin);
      if (err < best.err) best = { home: lh, away: la, err };
    }
  }

  return { home: round(best.home, 2), away: round(best.away, 2) };
}

export function scorelinesFromLambdas(homeName, awayName, lambdaHome, lambdaAway, topN = 7) {
  return topScorelines(scoreMatrix(lambdaHome, lambdaAway, 6), homeName, awayName, topN);
}

export function isGoalkeeperPlayer(player) {
  const pos = String(player?.position ?? '').toLowerCase();
  return pos.includes('goalkeeper') || pos === 'gk' || pos === 'g';
}

function scorerProbabilities(team, expectedGoals) {
  const players =
    team.players?.filter((p) => (p.likelyStarter || p.benchImpact) && !isGoalkeeperPlayer(p)) ?? [];
  const totalShare = players.reduce((acc, p) => acc + (p.xgShare ?? 0), 0) || 1;

  const out = players.map((p) => {
    const share = (p.xgShare ?? 0) / totalShare;
    const playerLambda = expectedGoals * share * (p.minutesFactor ?? 1);
    const anytime = 1 - Math.exp(-playerLambda);
    return {
      name: p.name,
      team: team.name,
      probability: round(anytime * 100, 1)
    };
  });

  return out.sort((a, b) => b.probability - a.probability);
}

export function buildPrediction({ fixture, home, away, market, blend }) {
  const neutralVenue = fixture.neutralVenue ?? true;
  const homeAttack = home.goalsForPerMatch;
  const homeDefense = home.goalsAgainstPerMatch;
  const awayAttack = away.goalsForPerMatch;
  const awayDefense = away.goalsAgainstPerMatch;

  const homeEdge = neutralVenue ? 0.0 : 0.1;
  const finalScale = clamp(fixture.finalScale ?? 1, 0.82, 1.0);

  let lambdaHome = (homeAttack + awayDefense) / 2 + homeEdge;
  let lambdaAway = (awayAttack + homeDefense) / 2;
  lambdaHome = clamp(lambdaHome * finalScale, 0.2, 3.2);
  lambdaAway = clamp(lambdaAway * finalScale, 0.2, 3.2);

  const matrix = scoreMatrix(lambdaHome, lambdaAway, 6);
  const modelOutcome = outcomeFromMatrix(matrix);

  const wMarket = clamp(Number(blend?.marketWeight ?? 0.0), 0, 1);
  const wModel = clamp(Number(blend?.modelWeight ?? 1.0), 0, 1);
  const blended = blendOutcomes(market, modelOutcome, wMarket, wModel);

  const expectedStats = buildExpectedStats({
    home,
    away,
    lambdaHome,
    lambdaAway,
    context: { finalTempo: fixture.finalTempo ?? 0.95, finalScale }
  });

  const scorerHome = scorerProbabilities(home, lambdaHome);
  const scorerAway = scorerProbabilities(away, lambdaAway);
  const topScorers = [...scorerHome.slice(0, 5), ...scorerAway.slice(0, 5)].sort((a, b) => b.probability - a.probability);

  return {
    fixture: {
      id: fixture.id ?? null,
      competition: fixture.competition ?? 'FIFA World Cup 2026',
      stage: fixture.stage ?? 'Group Stage',
      group: fixture.group ?? null,
      matchday: fixture.matchday ?? null,
      venueCity: fixture.venueCity ?? 'USA / Mexico / Canada',
      date: fixture.date ?? 'June 2026',
      homeTeam: home.name,
      awayTeam: away.name,
      neutralVenue,
      isKnockout: fixture.isKnockout ?? false
    },
    model: {
      lambda: { home: round(lambdaHome, 2), away: round(lambdaAway, 2) },
      outcome: {
        homeWin: round(modelOutcome.homeWin * 100, 1),
        draw: round(modelOutcome.draw * 100, 1),
        awayWin: round(modelOutcome.awayWin * 100, 1)
      }
    },
    market: normalizeOutcome(market)
      ? {
          homeWin: round(normalizeOutcome(market).homeWin * 100, 1),
          draw: round(normalizeOutcome(market).draw * 100, 1),
          awayWin: round(normalizeOutcome(market).awayWin * 100, 1)
        }
      : null,
    blended: blended
      ? {
          homeWin: round(blended.homeWin * 100, 1),
          draw: round(blended.draw * 100, 1),
          awayWin: round(blended.awayWin * 100, 1)
        }
      : null,
    expectedStats,
    topScorelines: topScorelines(matrix, home.name, away.name, 7),
    topScorers: topScorers.slice(0, 10)
  };
}

