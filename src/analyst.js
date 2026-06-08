import { buildAnalystBundle, enrichAnalystBundle } from './analystContext.js';
import { GROQ_MODEL, askGroq, getGroqApiKey } from './llmAnalyst.js';

function pct(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
}

function format1x2(label, p, home, away) {
  if (!p) return `${label}: no data.`;
  return `${label}: ${home} ${pct(p.homeWin)}, Draw ${pct(p.draw)}, ${away} ${pct(p.awayWin)}.`;
}

/** Richer fallback when Groq is unavailable — handles more question types via keyword scan. */
export function buildRuleBasedAnswer({ question, bundle }) {
  const q = String(question || '').toLowerCase();
  const home = bundle?.fixture?.homeTeam ?? 'Brazil';
  const away = bundle?.fixture?.awayTeam ?? 'Morocco';
  const model = bundle?.modelProbabilities;
  const market = bundle?.marketProbabilities ?? bundle?.polymarket?.implied ?? null;
  const blended = bundle?.probabilities;
  const scorelines = bundle?.scorelines ?? [];
  const pm = bundle?.polymarket;
  const stats = bundle?.stats?.predictedStats;
  const scorers = bundle?.stats?.goalscorers ?? [];

  const blocks = [];

  if (!bundle?.probabilities && !pm?.found) {
    blocks.push(
      'Tip: run Predict on the Predictions tab for full numbers. Set GROQ_API_KEY in .env.local for open-ended AI answers.'
    );
  }

  if (q.includes('tactic') || q.includes('matchup') || q.includes('key') || q.includes('weakness')) {
    const ps = bundle?.stats?.predictedStats;
    const hg = ps?.home?.goals ?? ps?.home?.xG ?? bundle?.model?.lambda?.home;
    const ag = ps?.away?.goals ?? ps?.away?.xG ?? bundle?.model?.lambda?.away;
    blocks.push(
      `${home} vs ${away}: high-stakes final — tempo and transitions matter.`,
      hg != null && ag != null ? `Expected goals: ${home} ${hg}, ${away} ${ag}.` : '',
      'See the Stats tab for shots, xG, and possession.'
    );
  }

  if (q.includes('bet') || q.includes('value') || q.includes('punt')) {
    blocks.push(
      market
        ? `Market view: ${format1x2('Polymarket', market, home, away)}. Model: ${model ? format1x2('model', model, home, away) : 'n/a'}. Compare gaps before betting — not financial advice.`
        : 'No Polymarket blend loaded. Run Predict with API keys configured.'
    );
  }

  if (q.includes('score') || q.includes('scoreline')) {
    if (scorelines.length) {
      blocks.push(
        'Top scorelines:\n' +
          scorelines.slice(0, 6).map((s, i) => `${i + 1}. ${s.score} — ${pct(s.probability)}`).join('\n')
      );
    }
  }

  if (q.includes('scorer') || q.includes('goal') || q.includes('dembele') || q.includes('saka') || q.includes('score')) {
    const playerGoals = bundle?.stats?.playerProps?.categories?.find((c) => c.id === 'playerGoals')?.players ?? [];
    const playerMatch =
      playerGoals.find((p) => q.includes(String(p.name).split(' ').pop()?.toLowerCase() ?? '')) ??
      playerGoals.find((p) => q.includes(String(p.name).toLowerCase().slice(0, 4)));

    if (playerMatch) {
      const o05 = playerMatch.lines?.find((l) => l.line === 0.5);
      const o15 = playerMatch.lines?.find((l) => l.line === 1.5);
      blocks.push(
        `${playerMatch.name} (${playerMatch.team}) — expected goals ${playerMatch.expected ?? '—'}.`,
        o05 ? `Anytime scorer (O0.5): ${pct(o05.overPct)}.` : '',
        o15 ? `2+ goals (O1.5): ${pct(o15.overPct)} · Under ${pct(o15.underPct)}.` : ''
      );
    }

    if (scorers.length) {
      blocks.push(
        'Anytime scorer (model):\n' +
          scorers.slice(0, 8).map((s, i) => `${i + 1}. ${s.name} (${s.team}) — ${pct(s.probability)}`).join('\n')
      );
    }
  }

  if (q.includes('assist')) {
    const assisters = bundle?.stats?.assisters ?? [];
    if (assisters.length) {
      blocks.push(
        'Most likely assists (model):\n' +
          assisters.slice(0, 8).map((s, i) => `${i + 1}. ${s.name} (${s.team}) — ${pct(s.probability)}`).join('\n')
      );
    }
  }

  if (q.includes('stat') || q.includes('shot') || q.includes('xg') || q.includes('corner') || q.includes('possession')) {
    if (stats) {
      blocks.push(
        `Expected stats — ${home}: ${stats.home?.goals ?? stats.home?.xG} goals, ${stats.home?.shots} shots, ${stats.home?.shotsOnTarget} SOT, ${stats.home?.possession}% poss.`,
        `${away}: ${stats.away?.goals ?? stats.away?.xG} goals, ${stats.away?.shots} shots, ${stats.away?.shotsOnTarget} SOT, ${stats.away?.possession}% poss.`
      );
    }
  }

  if (q.includes('polymarket') || q.includes('odds') || q.includes('market')) {
    blocks.push(
      pm?.found
        ? `Polymarket (${pm.source}): ${format1x2('odds', market, home, away)}. ${pm.marketQuestion || ''}`
        : pm?.message || 'No Polymarket market matched.'
    );
  }

  if (q.includes('summarize') || q.includes('plain') || q.includes('explain')) {
    blocks.push(bundle?.verdict?.summary ?? 'Run Predict for a verdict summary.');
    if (blended) blocks.push(format1x2('Blended win chances', blended, home, away));
  }

  if (q.includes('disagree') || q.includes('differ') || q.includes('why')) {
    if (model && market) {
      blocks.push(format1x2('Model', model, home, away), format1x2('Polymarket', market, home, away));
    }
  }

  if (!blocks.length) {
    blocks.push(
      `${home} vs ${away} — World Cup 2026.`,
      blended ? format1x2('Blended', blended, home, away) : '',
      model ? format1x2('Model', model, home, away) : '',
      market ? format1x2('Polymarket', market, home, away) : '',
      bundle?.verdict?.summary ?? '',
      'Add GROQ_API_KEY for full conversational AI. Ask about tactics, odds, scorelines, stats, or specific players.'
    );
  }

  return blocks.filter(Boolean).join('\n\n');
}

export async function getAnalystAnswer({ question, prediction, polymarket, history, context }) {
  const q = String(question || '').trim();
  if (!q) throw new Error('question is required');

  let bundle = buildAnalystBundle({
    prediction:
      prediction ??
      (context
        ? {
            fixture: context.fixture,
            probabilities: context.blendedProbabilitiesPct,
            modelProbabilities: context.modelProbabilitiesPct,
            marketProbabilities: context.polymarketProbabilitiesPct,
            scorelines: context.topScorelines
          }
        : null),
    polymarket
  });

  if (!bundle) {
    bundle = buildAnalystBundle({
      prediction: {
        fixture: {
          homeTeam: 'Brazil',
          awayTeam: 'Morocco',
          competition: 'UEFA Champions League',
          stage: 'Final',
          venueCity: 'Budapest',
          date: 'May 30, 2026',
          neutralVenue: true
        }
      },
      polymarket: null
    });
  }

  bundle = await enrichAnalystBundle(bundle);

  if (getGroqApiKey()) {
    try {
      const answer = await askGroq({ question: q, bundle, history });
      if (answer) {
        return { answer, provider: 'groq', model: GROQ_MODEL, hasContext: Boolean(bundle?.probabilities) };
      }
    } catch (err) {
      console.error('[analyst] Groq failed:', err.message);
      const fallback = buildRuleBasedAnswer({ question: q, bundle });
      return {
        answer: `${fallback}\n\n(AI unavailable: ${err.message}. Check GROQ_API_KEY / rate limits.)`,
        provider: 'rules-fallback',
        model: null,
        hasContext: Boolean(bundle?.probabilities)
      };
    }
  }

  return {
    answer: buildRuleBasedAnswer({ question: q, bundle }),
    provider: 'rules',
    model: null,
    hasContext: Boolean(bundle?.probabilities)
  };
}
