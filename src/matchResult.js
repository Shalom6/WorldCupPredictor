/** Final scores for completed fixtures — keyed by fixture id (see fixtures.json). */

export function formatMatchMinute(minute) {
  if (minute == null || minute === '') return '';
  const s = String(minute).trim();
  if (/['′]$/.test(s)) return s.replace(/'$/, '′');
  return `${s}′`;
}

/** Stat rows for completed matches (match-results.json → teamStats). */
export const MATCH_TEAM_STAT_ROWS = [
  { key: 'possession', label: 'Possession', suffix: '%' },
  { key: 'shots', label: 'Shots' },
  { key: 'shotsOnTarget', label: 'Shots on target' },
  { key: 'corners', label: 'Corners' },
  { key: 'fouls', label: 'Fouls' },
  { key: 'yellowCards', label: 'Yellow cards' },
  { key: 'redCards', label: 'Red cards' },
  { key: 'saves', label: 'Saves' }
];

export function isFixtureFinished(fixture) {
  if (!fixture) return false;
  if (fixture.status === 'finished') return true;
  return Number.isFinite(fixture.homeScore) && Number.isFinite(fixture.awayScore);
}

export function getFixtureOutcome(fixture) {
  if (!isFixtureFinished(fixture)) return null;

  const homeScore = fixture.homeScore;
  const awayScore = fixture.awayScore;
  const homeTeam = fixture.homeTeam;
  const awayTeam = fixture.awayTeam;
  const scoreLine = `${homeScore}–${awayScore}`;

  if (homeScore > awayScore) {
    return {
      type: 'home',
      winner: homeTeam,
      homeScore,
      awayScore,
      scoreLine,
      summary: `${homeTeam} won ${scoreLine}`,
      probabilities: { homeWin: 100, draw: 0, awayWin: 0 }
    };
  }

  if (awayScore > homeScore) {
    return {
      type: 'away',
      winner: awayTeam,
      homeScore,
      awayScore,
      scoreLine,
      summary: `${awayTeam} won ${scoreLine}`,
      probabilities: { homeWin: 0, draw: 0, awayWin: 100 }
    };
  }

  return {
    type: 'draw',
    winner: null,
    homeScore,
    awayScore,
    scoreLine,
    summary: `Draw ${scoreLine}`,
    probabilities: { homeWin: 0, draw: 100, awayWin: 0 }
  };
}

/** Full post-match report when scores + optional detail exist on the fixture. */
export function getMatchReport(fixture) {
  const outcome = getFixtureOutcome(fixture);
  if (!outcome) return null;

  return {
    ...outcome,
    scorers: fixture.scorers ?? { home: [], away: [] },
    teamStats: fixture.teamStats ?? null,
    notes: fixture.notes ?? null
  };
}
