import { fetchLiveScores } from '../../../src/liveScores.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const fixtureId = searchParams.get('fixtureId');

  try {
    const payload = await fetchLiveScores(fixtureId);
    return Response.json(payload, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });
  } catch (err) {
    return Response.json(
      { error: err?.message ?? 'Live scores unavailable', fixtures: {}, polledAt: null },
      { status: 502 }
    );
  }
}
