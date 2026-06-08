import { ouLines } from './bettingStats.js';
import { isGoalkeeperPlayer } from './predictor.js';
import { resolvePropProfile } from './propProfiles.js';

function round(n, dp = 1) {
  const p = 10 ** dp;
  return Math.round(n * p) / p;
}

function activePlayers(team) {
  return team.players?.filter((p) => (p.likelyStarter || p.benchImpact) && !isGoalkeeperPlayer(p)) ?? [];
}

function weightSum(players, pickWeight) {
  return players.reduce((acc, p) => acc + pickWeight(p), 0) || 1;
}

function allocateLambda(teamTotal, player, pickWeight, totalWeight) {
  const weight = pickWeight(player);
  const share = weight / totalWeight;
  return teamTotal * share * (player.minutesFactor ?? 0.8);
}

function assistWeight(player) {
  const pos = String(player?.position ?? '').toLowerCase();
  const xg = player?.xgShare ?? 0.05;
  if (pos.includes('midfield')) return xg * 1.5 + 0.06;
  if (pos.includes('defender')) return xg * 0.5 + 0.03;
  if (pos.includes('attack') || pos.includes('forward')) return xg * 0.85 + 0.02;
  return xg;
}

function buildTeamPlayerProps(team, teamStats, expectedGoals) {
  const players = activePlayers(team);
  const shotsTotal = teamStats.shots ?? 12;
  const sotTotal = teamStats.shotsOnTarget ?? 4;
  const cardsTotal = teamStats.yellowCards ?? 2;
  const foulsTotal = teamStats.fouls ?? 11;

  const shotsWeights = weightSum(players, (p) => resolvePropProfile(p).shotsShare);
  const sotWeights = weightSum(players, (p) => resolvePropProfile(p).sotShare);
  const cardWeights = weightSum(players, (p) => resolvePropProfile(p).cardWeight);
  const foulWeights = weightSum(players, (p) => resolvePropProfile(p).foulWeight);
  const xgWeights = players.reduce((acc, p) => acc + (p.xgShare ?? 0), 0) || 1;
  const assistWeights = weightSum(players, assistWeight);

  return players.map((p) => {
    const propProfile = resolvePropProfile(p);
    const goalLambda = expectedGoals * ((p.xgShare ?? 0) / xgWeights) * (p.minutesFactor ?? 0.8);
    const assistLambda =
      expectedGoals * 0.82 * (assistWeight(p) / assistWeights) * (p.minutesFactor ?? 0.8);
    const shotsLambda = allocateLambda(
      shotsTotal,
      p,
      (pl) => resolvePropProfile(pl).shotsShare,
      shotsWeights
    );
    const sotLambda = allocateLambda(sotTotal, p, (pl) => resolvePropProfile(pl).sotShare, sotWeights);
    const cardLambda = allocateLambda(
      cardsTotal,
      p,
      (pl) => resolvePropProfile(pl).cardWeight,
      cardWeights
    );
    const foulLambda = allocateLambda(
      foulsTotal,
      p,
      (pl) => resolvePropProfile(pl).foulWeight,
      foulWeights
    );

    return {
      name: p.name,
      team: team.name,
      position: p.position,
      propProfile,
      goals: {
        expected: round(goalLambda, 2),
        anytimePct: round((1 - Math.exp(-goalLambda)) * 100, 1),
        lines: ouLines(goalLambda, [0.5, 1.5])
      },
      assists: {
        expected: round(assistLambda, 2),
        anytimePct: round((1 - Math.exp(-assistLambda)) * 100, 1),
        lines: ouLines(assistLambda, [0.5])
      },
      shots: {
        expected: round(shotsLambda, 2),
        lines: ouLines(shotsLambda, [0.5, 1.5, 2.5, 3.5])
      },
      shotsOnTarget: {
        expected: round(sotLambda, 2),
        lines: ouLines(sotLambda, [0.5, 1.5, 2.5])
      },
      cards: {
        expected: round(cardLambda, 2),
        anytimePct: round((1 - Math.exp(-cardLambda)) * 100, 1),
        lines: ouLines(cardLambda, [0.5])
      },
      fouls: {
        expected: round(foulLambda, 2),
        lines: ouLines(foulLambda, [0.5, 1.5, 2.5])
      }
    };
  });
}

function topBy(players, key, n = 10) {
  return players
    .slice()
    .sort((a, b) => (b[key]?.expected ?? b[key]?.anytimePct ?? 0) - (a[key]?.expected ?? a[key]?.anytimePct ?? 0))
    .slice(0, n);
}

function mapCategory(id, label, marketTags, players, propKey, { useAnytime = false, topN = 10 } = {}) {
  const ranked = topBy(players, propKey, topN);
  return {
    id,
    label,
    marketTags,
    players: ranked.map((p) => {
      const prop = p[propKey];
      return {
        name: p.name,
        team: p.team,
        position: p.position,
        expected: prop.expected,
        anytimePct: useAnytime ? prop.anytimePct : undefined,
        lines: prop.lines
      };
    })
  };
}

export function buildPlayerProps({ home, away, predictedStats, lambdas }) {
  const homePlayers = buildTeamPlayerProps(home, predictedStats.home, lambdas.home);
  const awayPlayers = buildTeamPlayerProps(away, predictedStats.away, lambdas.away);
  const all = [...homePlayers, ...awayPlayers];

  const categories = [
    mapCategory('playerGoals', 'Anytime goalscorer', 'Player to score · 2+ goals', all, 'goals', {
      useAnytime: true,
      topN: 12
    }),
    mapCategory('playerAssists', 'Anytime assist', 'Player to assist', all, 'assists', {
      useAnytime: true,
      topN: 10
    }),
    mapCategory('playerShots', 'Player shots', 'Total shots · O/U lines', all, 'shots', { topN: 10 }),
    mapCategory('playerSot', 'Shots on target', 'Player SOT · O/U lines', all, 'shotsOnTarget', { topN: 10 }),
    mapCategory('playerCards', 'To be carded', 'Yellow card · booking', all, 'cards', {
      useAnytime: true,
      topN: 10
    }),
    mapCategory('playerFouls', 'Fouls committed', 'Player fouls · O/U lines', all, 'fouls', { topN: 10 })
  ];

  return {
    categories,
    roster: all.sort((a, b) => b.goals.expected - a.goals.expected)
  };
}
