import { getAnalystAnswer } from '../../../src/analyst.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const body = await req.json();
    const question = body?.question;
    if (!question || !String(question).trim()) {
      return Response.json({ error: 'question is required' }, { status: 400 });
    }

    const result = await getAnalystAnswer({
      question: String(question).trim(),
      prediction: body?.prediction ?? null,
      polymarket: body?.polymarket ?? body?.prediction?.polymarket ?? null,
      history: body?.history ?? [],
      context: body?.context ?? null
    });

    return Response.json(result);
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: 'Analyst failed', detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
