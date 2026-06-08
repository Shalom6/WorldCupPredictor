import { buildLlmContext } from './analystContext.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, '..');
dotenv.config({ path: path.join(appRoot, '.env.local') });
dotenv.config({ path: path.join(appRoot, '.env') });

export const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_OUTPUT_TOKENS = Number(process.env.GROQ_MAX_TOKENS) || 900;
const MAX_HISTORY_TURNS = Number(process.env.GROQ_HISTORY_TURNS) || 4;
const MAX_HISTORY_CHARS = Number(process.env.GROQ_HISTORY_CHARS) || 700;

export function getGroqApiKey() {
  return process.env.GROQ_API_KEY || process.env.GROQ_KEY || '';
}

function buildSystemPrompt(bundle, question) {
  const hasPrediction = Boolean(bundle?.probabilities || bundle?.modelProbabilities);
  const ctx = buildLlmContext(bundle, question);

  const fixture = bundle?.fixture;
  const matchLabel = fixture
    ? `${fixture.homeTeam} vs ${fixture.awayTeam} (${fixture.stage}${fixture.group ? ` · Group ${fixture.group}` : ''})`
    : 'World Cup 2026';

  return `FIFA World Cup 2026 analyst (${matchLabel}). Answer from CONTEXT only for numbers; brief tactics OK from general knowledge.
Rules: cite CONTEXT stats; not financial advice; short bullets if long.
Win arrays are [home%, draw%, away%]. Stats arrays: match [goals,shots,SOT,corners,cards], team [goals,shots,SOT,poss%].
Group stage: draws count for 1 point. Knockouts: extra time and penalties may apply.
${hasPrediction ? 'CONTEXT loaded.' : 'No prediction — suggest running Predict first.'}

CONTEXT:${JSON.stringify(ctx ?? {})}`;
}

function trimHistory(history, maxTurns = MAX_HISTORY_TURNS) {
  return (history ?? [])
    .filter((m) => m?.role === 'user' || m?.role === 'assistant')
    .slice(-maxTurns * 2)
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content ?? '').slice(0, MAX_HISTORY_CHARS)
    }));
}

export async function askGroq({ question, bundle, history }) {
  const apiKey = getGroqApiKey();
  if (!apiKey) return null;

  const q = String(question ?? '').trim();
  const prior = trimHistory(history);
  const messages = [
    { role: 'system', content: buildSystemPrompt(bundle, q) },
    ...prior,
    { role: 'user', content: q.slice(0, 1200) }
  ];

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.6,
      messages
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq API error (${res.status}): ${errText.slice(0, 400)}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text?.trim()) throw new Error('Empty response from Groq');
  return text.trim();
}
