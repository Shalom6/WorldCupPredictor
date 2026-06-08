import { buildPredictionsResponse } from '../../../src/predictionsEngine.js';

export async function POST(req) {
  try {
    const body = await req.json();
    const payload = await buildPredictionsResponse(body);
    return Response.json(payload);
  } catch (err) {
    console.error(err);
    const message = String(err?.message ?? err);
    const status = message.includes('different') ? 400 : 500;
    return Response.json({ error: 'Predictions failed', detail: message }, { status });
  }
}
