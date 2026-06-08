/**
 * Post-process raw Sofascore fetch → clean mexico.json with hit rates.
 *   node scripts/finalize-mexico-sofascore.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(root, 'data', 'mexico.json');

/** Current Mexico squad on Sofascore (team/4781/players). */
const OFFICIAL_SQUAD = [
  { sofascoreId: 892141, name: 'Santiago Giménez', position: 'Forward' },
  { sofascoreId: 192442, name: 'Raúl Jiménez', position: 'Forward' },
  { sofascoreId: 843114, name: 'Julián Quiñones', position: 'Forward' },
  { sofascoreId: 1595162, name: 'Armando González', position: 'Forward' },
  { sofascoreId: 865500, name: 'Roberto Alvarado', position: 'Forward' },
  { sofascoreId: 795282, name: 'Guillermo Martínez', position: 'Forward' },
  { sofascoreId: 1914576, name: 'Gilberto Mora', position: 'Midfielder' },
  { sofascoreId: 847151, name: 'Edson Álvarez', position: 'Midfielder' },
  { sofascoreId: 1119345, name: 'Obed Vargas', position: 'Midfielder' },
  { sofascoreId: 838629, name: 'Álvaro Fidalgo', position: 'Midfielder' },
  { sofascoreId: 905257, name: 'César Huerta', position: 'Midfielder' },
  { sofascoreId: 815637, name: 'Alexis Vega', position: 'Midfielder' },
  { sofascoreId: 850404, name: 'Orbelín Pineda', position: 'Midfielder' },
  { sofascoreId: 1023088, name: 'Brian Gutiérrez', position: 'Midfielder' },
  { sofascoreId: 757770, name: 'Luis Chávez', position: 'Midfielder' },
  { sofascoreId: 889785, name: 'Johan Vásquez', position: 'Defender' },
  { sofascoreId: 1638685, name: 'Mateo Chávez', position: 'Defender' },
  { sofascoreId: 818406, name: 'César Montes', position: 'Defender' },
  { sofascoreId: 832868, name: 'Jorge Sánchez', position: 'Defender' },
  { sofascoreId: 989236, name: 'Israel Reyes', position: 'Defender' },
  { sofascoreId: 944068, name: 'Erik Lira', position: 'Defender' },
  { sofascoreId: 770253, name: 'Jesús Gallardo', position: 'Defender' },
  { sofascoreId: 1172773, name: 'Luis Romo', position: 'Defender' },
  { sofascoreId: 15497, name: 'Guillermo Ochoa', position: 'Goalkeeper' },
  { sofascoreId: 990408, name: 'Raúl Rangel', position: 'Goalkeeper' },
  { sofascoreId: 840519, name: 'Carlos Acevedo', position: 'Goalkeeper' }
];

function slugify(team, name) {
  return `${team}-${name}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function round(n, dp = 2) {
  const p = 10 ** dp;
  return Math.round(n * p) / p;
}

function hitRatesFromLog(log) {
  const l5 = log.slice(0, 5);
  const l10 = log.slice(0, 10);
  const hit = (games, fn, line) => {
    if (!games.length) return 0;
    return Math.round((games.filter((g) => fn(g) > line).length / games.length) * 100);
  };
  return {
    goals05: { l5: hit(l5, (g) => g.goals, 0), l10: hit(l10, (g) => g.goals, 0), season: hit(log, (g) => g.goals, 0) },
    goals15: { l5: hit(l5, (g) => g.goals, 1), l10: hit(l10, (g) => g.goals, 1), season: hit(log, (g) => g.goals, 1) },
    assists05: { l5: hit(l5, (g) => g.assists, 0), l10: hit(l10, (g) => g.assists, 0), season: hit(log, (g) => g.assists, 0) },
    shots15: { l5: hit(l5, (g) => g.shots, 1), l10: hit(l10, (g) => g.shots, 1), season: hit(log, (g) => g.shots, 1) },
    shots25: { l5: hit(l5, (g) => g.shots, 2), l10: hit(l10, (g) => g.shots, 2), season: hit(log, (g) => g.shots, 2) },
    sot05: { l5: hit(l5, (g) => g.shotsOnTarget, 0), l10: hit(l10, (g) => g.shotsOnTarget, 0), season: hit(log, (g) => g.shotsOnTarget, 0) },
    cards05: { l5: hit(l5, (g) => g.cards, 0), l10: hit(l10, (g) => g.cards, 0), season: hit(log, (g) => g.cards, 0) },
    fouls15: { l5: hit(l5, (g) => g.fouls, 1), l10: hit(l10, (g) => g.fouls, 1), season: hit(log, (g) => g.fouls, 1) }
  };
}

function seasonRatesFromLog(log) {
  const played = log.filter((g) => g.minutes > 0);
  const totalMins = played.reduce((a, g) => a + g.minutes, 0) || 1;
  const sum = (fn) => played.reduce((a, g) => a + fn(g), 0);
  const per90 = (v) => round((v / totalMins) * 90, 2);
  return {
    goals90: per90(sum((g) => g.goals)),
    assists90: per90(sum((g) => g.assists)),
    shots90: round(per90(sum((g) => g.shots)), 1),
    sot90: round(per90(sum((g) => g.shotsOnTarget)), 1),
    passes90: round(per90(sum((g) => g.passes)), 0),
    cards90: per90(sum((g) => g.cards)),
    fouls90: round(per90(sum((g) => g.fouls)), 1),
    minutesAvg: played.length ? Math.round(totalMins / played.length) : 0
  };
}

const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const byId = new Map((raw.players ?? []).map((p) => [p.sofascoreId, p]));

const posOrder = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];
const players = OFFICIAL_SQUAD.map((s) => {
  const fetched = byId.get(s.sofascoreId);
  const gameLog = (fetched?.gameLog ?? []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const starts = gameLog.filter((g) => g.minutes >= 60).length;
  const likelyStarter = starts >= Math.max(2, Math.ceil(gameLog.length * 0.4));
  const seasonRates = gameLog.length ? seasonRatesFromLog(gameLog) : null;
  const hitRates = gameLog.length ? hitRatesFromLog(gameLog) : null;

  return {
    id: slugify('Mexico', s.name),
    name: s.name,
    team: 'Mexico',
    group: 'A',
    position: s.position,
    number: fetched?.number ?? null,
    likelyStarter: gameLog.length ? likelyStarter : false,
    sofascoreId: s.sofascoreId,
    dataSource: 'sofascore',
    dataScope: 'international',
    gameLog,
    seasonRates,
    hitRates,
    importMeta: {
      appearances: gameLog.length,
      competitions: [...new Set(gameLog.map((g) => g.competition))],
      lastMatch: gameLog[0]?.date ?? null
    }
  };
}).sort((a, b) => {
  const pd = posOrder.indexOf(a.position) - posOrder.indexOf(b.position);
  if (pd !== 0) return pd;
  return a.name.localeCompare(b.name);
});

const fringe = (raw.players ?? []).filter(
  (p) => !OFFICIAL_SQUAD.some((s) => s.sofascoreId === p.sofascoreId) && p.gameLog?.length
);

const output = {
  _note: 'International match logs imported from Sofascore. Club friendlies excluded. Last 22 national-team matches as of import date.',
  team: 'Mexico',
  group: 'A',
  dataSource: 'sofascore',
  importedAt: raw.importedAt ?? new Date().toISOString(),
  eventsProcessed: raw.eventsProcessed ?? null,
  players,
  fringeCallups: fringe.map((p) => ({ name: p.name, appearances: p.gameLog.length }))
};

fs.writeFileSync(dataPath, JSON.stringify(output, null, 2));

console.log(`Wrote ${players.length} squad players to ${dataPath}`);
console.log(`With game logs: ${players.filter((p) => p.gameLog.length).length}`);
console.log(`Fringe call-ups (not in squad file): ${fringe.length}`);
