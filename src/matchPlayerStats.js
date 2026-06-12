import playersData from './data/world-cup-players.json' with { type: 'json' };

const PLAYERS = playersData.players ?? [];

function isWorldCupEntry(entry) {
  const c = String(entry?.competition ?? '');
  return c.includes('World Cup') || c.includes('FIFA World Cup');
}

/** Players who logged minutes in a completed fixture (from imported game logs). */
export function getMatchPlayerRows(fixture) {
  if (!fixture?.homeTeam || !fixture?.awayTeam) return [];

  const teams = new Set([fixture.homeTeam, fixture.awayTeam]);
  const rows = [];

  for (const p of PLAYERS) {
    if (!teams.has(p.team)) continue;
    const opponent = p.team === fixture.homeTeam ? fixture.awayTeam : fixture.homeTeam;
    const entry = (p.gameLog ?? []).find(
      (g) => g.opponent === opponent && isWorldCupEntry(g) && (g.minutes ?? 0) > 0
    );
    if (!entry) continue;

    rows.push({
      id: p.id,
      name: p.name,
      team: p.team,
      position: p.position,
      number: p.number ?? null,
      minutes: entry.minutes ?? 0,
      goals: entry.goals ?? 0,
      assists: entry.assists ?? 0,
      shots: entry.shots ?? 0,
      shotsOnTarget: entry.shotsOnTarget ?? 0,
      cards: entry.cards ?? 0,
      fouls: entry.fouls ?? 0,
      passes: entry.passes ?? 0,
      rating: entry.rating ?? null
    });
  }

  return rows.sort((a, b) => {
    const impact = b.goals - a.goals || b.assists - a.assists || b.minutes - a.minutes;
    if (impact !== 0) return impact;
    return a.team.localeCompare(b.team) || a.name.localeCompare(b.name);
  });
}
