import { getFixtureById } from '../../../src/fixturesCatalog.js';
import { getMatchReport } from '../../../src/matchResult.js';
import { getMatchPlayerRows } from '../../../src/matchPlayerStats.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const fixtureId = searchParams.get('fixtureId');
  const homeTeam = searchParams.get('homeTeam');
  const awayTeam = searchParams.get('awayTeam');

  let fixture = fixtureId ? getFixtureById(fixtureId) : null;
  if (!fixture && homeTeam && awayTeam) {
    fixture = { id: null, homeTeam, awayTeam };
  }

  if (!fixture) {
    return Response.json({ error: 'fixtureId or homeTeam+awayTeam required' }, { status: 400 });
  }

  const report = getMatchReport(fixture);
  if (!report) {
    return Response.json({ played: false, players: [] });
  }

  return Response.json({
    played: true,
    fixtureId: fixture.id ?? null,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    report,
    players: getMatchPlayerRows(fixture)
  });
}
