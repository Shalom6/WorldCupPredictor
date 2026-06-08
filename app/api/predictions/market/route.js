import { applyLivePolymarketUpdate } from '../../../../src/predictionsEngine.js';
import { fetchPolymarketOdds } from '../../../../src/polymarket.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lightweight Polymarket refresh — re-blends without recomputing the Poisson model. */
export async function POST(req) {
  try {
    const body = await req.json();
    const homeTeam = body?.homeTeam ?? body?.fixture?.homeTeam ?? 'Brazil';
    const awayTeam = body?.awayTeam ?? body?.fixture?.awayTeam ?? 'Morocco';

    if (homeTeam === awayTeam) {
      return Response.json({ error: 'homeTeam and awayTeam must be different' }, { status: 400 });
    }
    if (!body?.modelProbabilities || !body?.model?.lambda) {
      return Response.json({ error: 'Run Predict first — modelProbabilities and model.lambda required' }, { status: 400 });
    }

    const polymarket = await fetchPolymarketOdds(homeTeam, awayTeam, { gammaOnly: true });
    const updated = applyLivePolymarketUpdate(body, polymarket);

    if (updated.marketRefreshSkipped) {
      return Response.json(updated, { status: 200 });
    }

    return Response.json(updated, { status: 200 });
  } catch (err) {
    return Response.json({ error: err?.message ?? 'Market refresh failed' }, { status: 500 });
  }
}
