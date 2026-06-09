/** Final scores for completed fixtures — keyed by fixture id (see fixtures.json). */

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
