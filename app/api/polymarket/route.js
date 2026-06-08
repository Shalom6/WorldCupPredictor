import { fetchPolymarketOdds } from '../../../src/polymarket.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const homeTeam = searchParams.get('homeTeam') || searchParams.get('home') || 'Brazil';
  const awayTeam = searchParams.get('awayTeam') || searchParams.get('away') || 'Morocco';
  const result = await fetchPolymarketOdds(homeTeam, awayTeam);
  return Response.json(result, { status: result.found ? 200 : result.error ? 500 : 404 });
}
