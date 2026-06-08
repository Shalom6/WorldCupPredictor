import { buildStatsResponse } from '../../../src/stats.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const query = Object.fromEntries(searchParams.entries());
    const payload = await buildStatsResponse(query);
    return Response.json(payload);
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: 'Stats failed', detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
