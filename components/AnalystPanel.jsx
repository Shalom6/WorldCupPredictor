'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const QUICK_WITH_PREDICTION = [
  'Summarize everything in plain English.',
  'Who wins and why?',
  'Why might the model and Polymarket disagree?',
  'Best betting angle on this match?',
  'Key tactical matchups?',
  'Most likely scoreline?',
  'What do the expected stats suggest?',
  'Is the draw undervalued?'
];

const QUICK_NO_PREDICTION = [
  'What does this app predict?',
  'How does the model blend Polymarket?',
  'What is useful to ask after I press Predict?',
  'How does group stage differ from knockouts?'
];

function MessageBubble({ role, content }) {
  return <div className={`bubble ${role}`}>{content}</div>;
}

export default function AnalystPanel({ prediction = null }) {
  const chatEndRef = useRef(null);
  const hasPrediction = Boolean(prediction?.probabilities);

  const fixtureLabel = useMemo(() => {
    if (!prediction?.fixture) return 'World Cup 2026 · run Predict for live data';
    const f = prediction.fixture;
    return `${f.homeTeam} vs ${f.awayTeam} · ${f.venueCity ?? 'Budapest'}`;
  }, [prediction]);

  const intro = useMemo(() => {
    if (hasPrediction) {
      return `I'm loaded with full prediction, stats, and Polymarket context for ${prediction.fixture.homeTeam} vs ${prediction.fixture.awayTeam}. Ask anything — tactics, odds, players, scorelines, or hypotheticals.`;
    }
    return `Ask me anything about this World Cup match or the app. For exact probabilities and stats, run Predict on the Predictions tab first. Set GROQ_API_KEY in .env.local for free AI chat.`;
  }, [hasPrediction, prediction]);

  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [provider, setProvider] = useState('');

  useEffect(() => {
    setMessages([{ role: 'assistant', content: intro }]);
  }, [intro]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const quickQuestions = hasPrediction ? QUICK_WITH_PREDICTION : QUICK_NO_PREDICTION;
  const canSend = question.trim().length > 0 && !isLoading;

  function clearChat() {
    setMessages([{ role: 'assistant', content: intro }]);
    setError('');
  }

  async function send(customText) {
    const text = (customText ?? question).trim();
    if (!text || isLoading) return;

    setError('');
    setQuestion('');
    setIsLoading(true);

    const conversationHistory = messages
      .slice(1)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, { role: 'user', content: text }]);

    try {
      const res = await fetch('/api/analyst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          history: conversationHistory,
          prediction,
          polymarket: prediction?.polymarket ?? null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || data?.detail || 'Failed to get answer');
      setProvider(
        data.provider === 'groq'
          ? `Groq AI · ${data.model || 'Llama'}${data.hasContext ? ' · data loaded' : ''}`
          : `Rule-based${data.hasContext ? ' · data loaded' : ' · run Predict for numbers'}`
      );
      setMessages((prev) => [...prev, { role: 'assistant', content: data.answer || 'No response returned.' }]);
    } catch (err) {
      setError(err?.message || 'Request failed');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="analystEngine">
      <header className="nav glass">
        <div className="navLeft">
          <div className="appIcon" aria-hidden="true">
            <div className="appIconInner">🤖</div>
          </div>
          <div className="navTitleWrap">
            <div className="navTitle">AI Match Analyst</div>
            <div className="navSubtitle">{fixtureLabel}</div>
          </div>
        </div>
        <div className="navRight">
          <button type="button" className="btnGhost" onClick={clearChat} disabled={isLoading}>
            Clear chat
          </button>
        </div>
      </header>

      <section className="glass card analystPanel">
        <div className="analystHead">
          <div>
            <div className="analystTitle">Ask anything</div>
            <div className="analystSub">
              {provider || 'Tactics · odds · stats · players · value · hypotheticals — powered by Groq (free) or rules'}
            </div>
          </div>
          <span className={`badge ${hasPrediction ? 'badgeOk' : 'badgeWarn'}`}>
            {hasPrediction ? 'Prediction loaded' : 'No prediction yet'}
          </span>
        </div>

        <div className="quickRow">
          {quickQuestions.map((q) => (
            <button key={q} type="button" disabled={isLoading} className="chip" onClick={() => send(q)}>
              {q}
            </button>
          ))}
        </div>

        <div className="analystChat" role="log" aria-live="polite">
          {messages.map((m, idx) => (
            <MessageBubble key={`${m.role}-${idx}`} role={m.role} content={m.content} />
          ))}
          {isLoading ? <p className="muted small">Thinking…</p> : null}
          <div ref={chatEndRef} />
        </div>

        <div className="analystInputRow">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask anything about the final, model, Polymarket, tactics, players, betting angles…"
            className="analystInput"
            rows={3}
            maxLength={2000}
          />
          <div className="analystActions">
            <span className="muted small">{question.length}/2000</span>
            <button type="button" className="btnPrimary" onClick={() => send()} disabled={!canSend}>
              Send
            </button>
          </div>
        </div>

        {error ? <p className="analystError">{error}</p> : null}
      </section>
    </section>
  );
}
