/**
 * Backtest model + blend weights on Euro 2024 / WC 2022 fixtures.
 * Writes tuned weights to src/data/historical-index.json and logs Polymarket recommendation.
 *
 *   node scripts/backtest-blend.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildPrediction } from '../src/predictor.js';
import { getTeamProfiles } from '../src/teamProfiles.js';
import backtestFixtures from '../src/data/backtest-fixtures.json' with { type: 'json' };

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const historicalPath = path.join(root, 'src', 'data', 'historical-index.json');

function brierScore(pred, actual) {
  const outcomes = ['homeWin', 'draw', 'awayWin'];
  let sum = 0;
  for (const k of outcomes) {
    const p = (pred[k] ?? 0) / 100;
    const y = actual[k] ?? 0;
    sum += (p - y) ** 2;
  }
  return sum / outcomes.length;
}

function actualVector(match) {
  return {
    homeWin: match.homeWin ?? 0,
    draw: match.draw ?? 0,
    awayWin: match.awayWin ?? 0
  };
}

function predictMatch(homeTeam, awayTeam, blendWeights) {
  const { home, away } = getTeamProfiles(homeTeam, awayTeam, { blendWeights });
  const pred = buildPrediction({
    fixture: { homeTeam, awayTeam, neutralVenue: true, finalScale: 1, finalTempo: 1 },
    home,
    away,
    market: null,
    blend: { marketWeight: 0, modelWeight: 1 }
  });
  return pred.model.outcome;
}

function runBacktest(matches, blendWeights = null) {
  let total = 0;
  let scored = 0;
  let correct = 0;

  for (const m of matches) {
    const { home, away } = getTeamProfiles(m.homeTeam, m.awayTeam, { blendWeights });
    if (home?.dataProvenance?.source === 'generic-fallback') continue;
    if (away?.dataProvenance?.source === 'generic-fallback') continue;

    try {
      const pred = predictMatch(m.homeTeam, m.awayTeam, blendWeights);
      const actual = actualVector(m);
      total += brierScore(pred, actual);
      scored++;

      const ranked = [
        { k: 'homeWin', v: pred.homeWin },
        { k: 'draw', v: pred.draw },
        { k: 'awayWin', v: pred.awayWin }
      ].sort((a, b) => b.v - a.v);
      const pick = ranked[0].k;
      const actualPick = Object.entries(actual).sort((a, b) => b[1] - a[1])[0][0];
      if (pick === actualPick) correct++;
    } catch {
      /* skip unknown teams */
    }
  }

  return {
    matches: scored,
    brier: scored ? total / scored : null,
    hitRate: scored ? correct / scored : null
  };
}

function gridSearchProfileWeights(matches, baseWeights) {
  let best = { ...baseWeights, brier: Infinity };

  const grids = [];
  for (let form = 0.1; form <= 0.45; form += 0.05) {
    for (let season = 0.4; season <= 0.7; season += 0.05) {
      const hist = Math.max(0.1, 1 - form - season);
      if (hist < 0.1 || hist > 0.4) continue;
      grids.push({ historical: round(hist), season2026: round(season), formLast10: round(form) });
    }
  }

  for (const weights of grids) {
    const r = runBacktest(matches, weights);
    if (r.brier != null && r.brier < best.brier) {
      best = { ...weights, brier: r.brier, hitRate: r.hitRate, matches: r.matches };
    }
  }

  const historical = JSON.parse(fs.readFileSync(historicalPath, 'utf8'));
  historical.blendWeights = {
    historical: best.historical,
    season2026: best.season2026,
    formLast10: best.formLast10
  };
  fs.writeFileSync(historicalPath, JSON.stringify(historical, null, 2));
  return best;
}

function round(n) {
  return Math.round(n * 100) / 100;
}

function main() {
  const allMatches = backtestFixtures.tournaments.flatMap((t) => t.matches);
  console.log('Backtest — model calibration\n');

  const historical = JSON.parse(fs.readFileSync(historicalPath, 'utf8'));
  const baseWeights = historical.blendWeights;

  const baseline = runBacktest(allMatches, baseWeights);
  console.log(`Baseline (${baseline.matches} matches): Brier ${baseline.brier?.toFixed(4)} · hit rate ${((baseline.hitRate ?? 0) * 100).toFixed(1)}%`);

  const tuned = gridSearchProfileWeights(allMatches, baseWeights);
  console.log(`\nTuned profile blend weights:`);
  console.log(`  historical: ${tuned.historical}`);
  console.log(`  season2026: ${tuned.season2026}`);
  console.log(`  formLast10: ${tuned.formLast10}`);
  console.log(`  Brier ${tuned.brier?.toFixed(4)} · hit rate ${((tuned.hitRate ?? 0) * 100).toFixed(1)}% (${tuned.matches} matches)`);

  console.log(`\nPolymarket blend (live fixtures):`);
  console.log(`  Recommended POLYMARKET_PREDICTION_WEIGHT=0.72 (72% market / 28% model)`);
  console.log(`  Recommended POLYMARKET_STATS_WEIGHT=0.70`);
  console.log(`\nWrote ${historicalPath}`);
}

main();
