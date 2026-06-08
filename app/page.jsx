'use client';

import { useState } from 'react';
import AnalystPanel from '../components/AnalystPanel';
import PlayersPanel from '../components/PlayersPanel';
import PredictionsPanel from '../components/PredictionsPanel';
import StatsPanel from '../components/StatsPanel';

export default function Page() {
  const [tab, setTab] = useState('predictions');
  const [prediction, setPrediction] = useState(null);

  return (
    <div className={`app${tab === 'players' ? ' appPlayers' : ''}`}>
      <header className="uclHero wcHero">
        <p className="uclHeroEyebrow">FIFA World Cup 2026</p>
        <h1 className="uclHeroTag">Match Predictor</h1>
        <p className="uclMeta">USA · Mexico · Canada · 48 teams · 12 groups</p>
      </header>

      <nav className="tabBar" aria-label="Main sections">
        <button
          type="button"
          className={`tab${tab === 'predictions' ? ' active' : ''}`}
          aria-selected={tab === 'predictions'}
          onClick={() => setTab('predictions')}
        >
          Predictions
        </button>
        <button
          type="button"
          className={`tab${tab === 'stats' ? ' active' : ''}`}
          aria-selected={tab === 'stats'}
          onClick={() => setTab('stats')}
        >
          Stats
        </button>
        <button
          type="button"
          className={`tab${tab === 'players' ? ' active' : ''}`}
          aria-selected={tab === 'players'}
          onClick={() => setTab('players')}
        >
          Players
        </button>
        <button
          type="button"
          className={`tab${tab === 'analyst' ? ' active' : ''}`}
          aria-selected={tab === 'analyst'}
          onClick={() => setTab('analyst')}
        >
          Market Analyst
        </button>
      </nav>

      {tab === 'predictions' ? (
        <PredictionsPanel onPredictionUpdate={setPrediction} />
      ) : tab === 'stats' ? (
        <StatsPanel fixture={prediction?.fixture ?? null} />
      ) : tab === 'players' ? (
        <PlayersPanel />
      ) : (
        <AnalystPanel prediction={prediction} />
      )}
    </div>
  );
}
