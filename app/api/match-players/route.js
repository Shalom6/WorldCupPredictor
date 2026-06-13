import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getFixtureById } from '../../../src/fixturesCatalog.js';
import { getMatchReport } from '../../../src/matchResult.js';
import { getMatchPlayerRows } from '../../../src/matchPlayerStats.js';
import playersData from '../../../src/data/world-cup-players.json' with { type: 'json' };

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const mapPath = path.join(root, 'src', 'data', 'espn-fixture-map.json');

function readEspnMap() {
  if (!fs.existsSync(mapPath)) return {};
  return JSON.parse(fs.readFileSync(mapPath, 'utf8')).mappings ?? {};
}

function mergePlayerRows(catalogRows, liveRows) {
  const byKey = new Map();
  for (const row of catalogRows) {
    byKey.set(`${row.team}::${row.name}`, row);
  }
  for (const row of liveRows) {
    const key = `${row.team}::${row.name}`;
    const existing = byKey.get(key);
    byKey.set(key, existing ? { ...existing, ...row, name: existing.name } : row);
  }
  return [...byKey.values()].sort((a, b) => {
    const impact = b.goals - a.goals || b.assists - a.assists || b.minutes - a.minutes;
    if (impact !== 0) return impact;
    return a.team.localeCompare(b.team) || a.name.localeCompare(b.name);
  });
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

  let players = getMatchPlayerRows(fixture);
  const espnId = fixture.id ? readEspnMap()[fixture.id]?.espnEventId : null;

  if (espnId) {
    try {
      const { fetchMatchSummary } = await import('../../../scripts/lib/espn-world-cup.mjs');
      const { parseLivePlayerRows } = await import('../../../scripts/lib/espn-player-stats.mjs');
      const summary = await fetchMatchSummary(espnId);
      const liveRows = parseLivePlayerRows(summary, fixture, playersData.players ?? []);
      players = mergePlayerRows(players, liveRows);
    } catch {
      // catalog-only fallback
    }
  }

  return Response.json({
    played: true,
    fixtureId: fixture.id ?? null,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    report,
    players
  });
}
