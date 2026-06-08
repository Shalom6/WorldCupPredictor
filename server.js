import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env.local') });
dotenv.config({ path: path.join(__dirname, '.env') });
import cors from 'cors';

import { getAnalystAnswer } from './src/analyst.js';
import { buildPrediction } from './src/predictor.js';
import { buildPredictionsResponse, applyLivePolymarketUpdate } from './src/predictionsEngine.js';
import { fetchPolymarketOdds } from './src/polymarket.js';
import { buildStatsResponse } from './src/stats.js';
import { getAllFixtures, getGroups } from './src/fixturesCatalog.js';
import { buildPlayerDetail, getPlayerCatalogMeta, listTeams, searchPlayers } from './src/playerCatalog.js';
import { getFixtureContext, getTeamProfiles } from './src/sampleData.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.post('/api/predict', (req, res) => {
  try {
    const fixture = getFixtureContext(req.body);
    const { home, away } = getTeamProfiles(fixture.homeTeam, fixture.awayTeam);

    const prediction = buildPrediction({
      fixture,
      home,
      away,
      market: req.body?.market,
      blend: req.body?.blend
    });

    res.json(prediction);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Prediction failed', detail: String(err?.message ?? err) });
  }
});

app.get('/api/fixtures', (_req, res) => {
  const catalog = getAllFixtures();
  res.json({ ...catalog, groups: getGroups() });
});

app.get('/api/players', (req, res) => {
  try {
    const id = req.query.id;
    if (id) {
      const detail = buildPlayerDetail(String(id));
      if (!detail) return res.status(404).json({ error: 'Player not found' });
      return res.json(detail);
    }

    const q = req.query.q ?? '';
    const team = req.query.team ?? '';
    const group = req.query.group ?? '';
    const position = req.query.position ?? '';
    const limit = Math.min(Number(req.query.limit || 60), 200);
    const offset = Number(req.query.offset || 0);

    res.json({
      meta: getPlayerCatalogMeta(),
      teams: listTeams(),
      ...searchPlayers({ q, team, group, position, limit, offset })
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Players failed', detail: String(err?.message ?? err) });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    res.json(await buildStatsResponse(req.query));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Stats failed', detail: String(err?.message ?? err) });
  }
});

app.post('/api/predictions', async (req, res) => {
  try {
    const payload = await buildPredictionsResponse(req.body);
    res.json(payload);
  } catch (err) {
    console.error(err);
    const status = String(err?.message ?? '').includes('different') ? 400 : 500;
    res.status(status).json({ error: 'Predictions failed', detail: String(err?.message ?? err) });
  }
});

app.post('/api/predictions/market', async (req, res) => {
  try {
    const homeTeam = req.body?.homeTeam ?? req.body?.fixture?.homeTeam ?? 'Brazil';
    const awayTeam = req.body?.awayTeam ?? req.body?.fixture?.awayTeam ?? 'Morocco';
    if (homeTeam === awayTeam) {
      return res.status(400).json({ error: 'homeTeam and awayTeam must be different' });
    }
    if (!req.body?.modelProbabilities || !req.body?.model?.lambda) {
      return res.status(400).json({ error: 'Run Predict first — modelProbabilities and model.lambda required' });
    }
    const polymarket = await fetchPolymarketOdds(homeTeam, awayTeam, { gammaOnly: true });
    const updated = applyLivePolymarketUpdate(req.body, polymarket);
    if (updated.marketRefreshSkipped) {
      return res.json(updated);
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Market refresh failed', detail: String(err?.message ?? err) });
  }
});

app.post('/api/analyst', async (req, res) => {
  try {
    const question = req.body?.question;
    if (!question || !String(question).trim()) {
      return res.status(400).json({ error: 'question is required' });
    }
    const result = await getAnalystAnswer({
      question: String(question).trim(),
      prediction: req.body?.prediction ?? null,
      polymarket: req.body?.polymarket ?? req.body?.prediction?.polymarket ?? null,
      history: req.body?.history ?? [],
      context: req.body?.context ?? null
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Analyst failed', detail: String(err?.message ?? err) });
  }
});

const port = Number(process.env.PORT || 4002);
app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});

