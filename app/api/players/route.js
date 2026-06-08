import {
  buildPlayerDetail,
  getPlayerCatalogMeta,
  listTeams,
  searchPlayers
} from '../../../src/playerCatalog.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    const detail = buildPlayerDetail(id);
    if (!detail) {
      return Response.json({ error: 'Player not found' }, { status: 404 });
    }
    return Response.json(detail);
  }

  const q = searchParams.get('q') ?? '';
  const team = searchParams.get('team') ?? '';
  const group = searchParams.get('group') ?? '';
  const position = searchParams.get('position') ?? '';
  const limit = Math.min(Number(searchParams.get('limit') || 60), 200);
  const offset = Number(searchParams.get('offset') || 0);

  return Response.json({
    meta: getPlayerCatalogMeta(),
    teams: listTeams(),
    ...searchPlayers({ q, team, group, position, limit, offset })
  });
}
