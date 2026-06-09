/**
 * Adds goalkeeper fields (saves, goalsConceded, keeperSweeper) to game logs
 * that are missing them. Uses deterministic estimates from result/minutes.
 *
 * Usage: node scripts/enrich-gk-game-logs.mjs [data/mexico.json ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function isGoalkeeper(position) {
  return String(position ?? '').toLowerCase().includes('goal');
}

function seededRand(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return () => {
    h = (Math.imul(1103515245, h) + 12345) | 0;
    return (h >>> 0) / 0xffffffff;
  };
}

function enrichGkGame(game, playerId) {
  if (game.saves != null && game.goalsConceded != null) return game;

  const rnd = seededRand(`${playerId}|${game.date}|${game.opponent}`);
  const factor = Math.min(1, (game.minutes ?? 0) / 90);

  let goalsConceded = game.goalsConceded;
  if (goalsConceded == null) {
    if (factor < 0.35) goalsConceded = rnd() < 0.7 ? 0 : 1;
    else if (game.result === 'W') goalsConceded = rnd() < 0.52 ? 0 : rnd() < 0.88 ? 1 : 2;
    else if (game.result === 'D') goalsConceded = 1;
    else goalsConceded = rnd() < 0.42 ? 1 : rnd() < 0.82 ? 2 : 3;
  }

  const saves =
    game.saves ??
    Math.max(0, Math.round(1 + goalsConceded * (1.4 + rnd()) + factor * (2 + rnd() * 4)));

  const keeperSweeper =
    game.keeperSweeper ?? (rnd() < 0.22 ? Math.ceil(rnd() * 2) : 0);

  return { ...game, goalsConceded, saves, keeperSweeper };
}

function enrichTeamFile(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let patched = 0;

  for (const player of raw.players ?? []) {
    if (!isGoalkeeper(player.position)) continue;
    player.gameLog = (player.gameLog ?? []).map((g) => {
      const next = enrichGkGame(g, player.id);
      if (next !== g) patched++;
      return next;
    });
  }

  fs.writeFileSync(filePath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  console.log(`${path.basename(filePath)}: enriched ${patched} GK game entries`);
}

const files = process.argv.slice(2);
const targets =
  files.length > 0
    ? files.map((f) => path.resolve(f))
    : [path.join(root, 'data', 'mexico.json')];

for (const file of targets) {
  if (!fs.existsSync(file)) {
    console.warn(`Skip missing file: ${file}`);
    continue;
  }
  enrichTeamFile(file);
}
