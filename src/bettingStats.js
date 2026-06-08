/**
 * Match prop categories: team bars + modelled over/under lines.
 */

function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

function round(n, dp = 1) {
  const p = 10 ** dp;
  return Math.round(n * p) / p;
}

function poissonPmf(k, lambda) {
  if (k < 0 || lambda <= 0) return k === 0 && lambda <= 0 ? 1 : 0;
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return (Math.exp(-lambda) * lambda ** k) / fact;
}

export function probOverLine(lambda, line) {
  const kMin = Math.floor(line) + 1;
  let p = 0;
  const cap = Math.max(25, kMin + 15);
  for (let k = kMin; k <= cap; k++) p += poissonPmf(k, lambda);
  return clamp(p, 0, 1);
}

export function ouLines(lambda, lines) {
  return lines.map((line) => {
    const over = probOverLine(lambda, line);
    return { line, overPct: round(over * 100, 1), underPct: round((1 - over) * 100, 1) };
  });
}

export function buildBettingCategories({ fixture, predictedStats, lambdas }) {
  const h = predictedStats.home;
  const a = predictedStats.away;
  const totalGoals = h.goals + a.goals;
  const match = {
    goals: round(totalGoals, 2),
    shots: round(h.shots + a.shots, 1),
    shotsOnTarget: round(h.shotsOnTarget + a.shotsOnTarget, 1),
    corners: round(h.corners + a.corners, 1),
    fouls: round(h.fouls + a.fouls, 1),
    offsides: round(h.offsides + a.offsides, 1),
    yellowCards: round(h.yellowCards + a.yellowCards, 1),
    bookingPoints: h.bookingPoints + a.bookingPoints
  };

  const lh = lambdas.home;
  const la = lambdas.away;
  const bttsYes = (1 - Math.exp(-lh)) * (1 - Math.exp(-la));
  const firstHalf = 0.45;

  return [
    {
      id: 'goals',
      label: 'Goals',
      marketTags: 'Match goals · Team totals · BTTS',
      team: [{ key: 'goals', label: 'Goals (exp.)', home: h.goals, away: a.goals }],
      match: { expected: match.goals, unit: 'goals' },
      lines: ouLines(totalGoals, [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]),
      extras: [
        { label: 'Both teams to score — Yes', valuePct: round(bttsYes * 100, 1) },
        { label: 'Both teams to score — No', valuePct: round((1 - bttsYes) * 100, 1) },
        { label: `${fixture.homeTeam} O 0.5 goals`, valuePct: round((1 - Math.exp(-lh)) * 100, 1) },
        { label: `${fixture.awayTeam} O 0.5 goals`, valuePct: round((1 - Math.exp(-la)) * 100, 1) },
        { label: '1st half — O 0.5 goals', valuePct: round(probOverLine(totalGoals * firstHalf, 0.5) * 100, 1) },
        { label: '1st half — O 1.5 goals', valuePct: round(probOverLine(totalGoals * firstHalf, 1.5) * 100, 1) }
      ]
    },
    {
      id: 'corners',
      label: 'Corners',
      marketTags: 'Match corners · Team corners',
      team: [{ key: 'corners', label: 'Corners', home: h.corners, away: a.corners }],
      match: { expected: match.corners, unit: 'corners' },
      lines: ouLines(match.corners, [7.5, 8.5, 9.5, 10.5, 11.5, 12.5]),
      extras: [
        { label: `${fixture.homeTeam} corners O 4.5`, valuePct: round(probOverLine(h.corners, 4.5) * 100, 1) },
        { label: `${fixture.awayTeam} corners O 4.5`, valuePct: round(probOverLine(a.corners, 4.5) * 100, 1) }
      ]
    },
    {
      id: 'shots',
      label: 'Shots',
      marketTags: 'Match shots · Team shots',
      team: [{ key: 'shots', label: 'Shots', home: h.shots, away: a.shots }],
      match: { expected: match.shots, unit: 'shots' },
      lines: ouLines(match.shots, [17.5, 19.5, 21.5, 23.5, 25.5]),
      extras: []
    },
    {
      id: 'shotsOnTarget',
      label: 'Shots on target',
      marketTags: 'Match SOT · Team SOT',
      team: [{ key: 'sot', label: 'Shots on target', home: h.shotsOnTarget, away: a.shotsOnTarget }],
      match: { expected: match.shotsOnTarget, unit: 'SOT' },
      lines: ouLines(match.shotsOnTarget, [6.5, 7.5, 8.5, 9.5, 10.5]),
      extras: []
    },
    {
      id: 'cards',
      label: 'Cards & bookings',
      marketTags: 'Yellow cards · Booking points',
      team: [
        { key: 'yellow', label: 'Yellow cards', home: h.yellowCards, away: a.yellowCards },
        { key: 'booking', label: 'Booking pts', home: h.bookingPoints, away: a.bookingPoints }
      ],
      match: { expected: match.yellowCards, unit: 'yellow cards' },
      lines: ouLines(match.yellowCards, [2.5, 3.5, 4.5, 5.5, 6.5]),
      extras: [
        { label: 'Match booking points O 34.5', valuePct: round(probOverLine(match.yellowCards, 3.45) * 100, 1) }
      ]
    },
    {
      id: 'fouls',
      label: 'Fouls',
      marketTags: 'Match fouls · Team fouls',
      team: [{ key: 'fouls', label: 'Fouls', home: h.fouls, away: a.fouls }],
      match: { expected: match.fouls, unit: 'fouls' },
      lines: ouLines(match.fouls, [18.5, 20.5, 22.5, 24.5, 26.5]),
      extras: []
    },
    {
      id: 'offsides',
      label: 'Offsides',
      marketTags: 'Match offsides · Team offsides',
      team: [{ key: 'offsides', label: 'Offsides', home: h.offsides, away: a.offsides }],
      match: { expected: match.offsides, unit: 'offsides' },
      lines: ouLines(match.offsides, [2.5, 3.5, 4.5, 5.5, 6.5]),
      extras: []
    },
    {
      id: 'possession',
      label: 'Possession',
      marketTags: 'Team possession %',
      team: [{ key: 'poss', label: 'Possession %', home: h.possession, away: a.possession }],
      match: null,
      lines: [],
      extras: [
        {
          label: `${fixture.homeTeam} possession O 50.5%`,
          valuePct: round(clamp(50 + (h.possession - 50.5) * 4, 12, 88), 1)
        },
        {
          label: `${fixture.awayTeam} possession O 50.5%`,
          valuePct: round(clamp(50 + (a.possession - 50.5) * 4, 12, 88), 1)
        }
      ]
    }
  ];
}
