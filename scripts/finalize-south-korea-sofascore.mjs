/**
 * Post-process raw Sofascore fetch → clean south-korea.json with hit rates.
 *   node scripts/finalize-south-korea-sofascore.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawPath = path.join(root, 'data', 'south-korea-raw.json');
const dataPath = path.join(root, 'data', 'south-korea.json');

/** Current South Korea squad on Sofascore (team/4735/players). */
const OFFICIAL_SQUAD = [
  { sofascoreId: 111505, name: 'Son Heung-min', position: 'Forward' },
  { sofascoreId: 1010634, name: 'Hyeon-gyu Oh', position: 'Forward' },
  { sofascoreId: 786186, name: 'Hwang Hee-chan', position: 'Forward' },
  { sofascoreId: 1014281, name: 'Gue-sung Cho', position: 'Forward' },
  { sofascoreId: 1103531, name: 'Yang Hyun-Jun', position: 'Forward' },
  { sofascoreId: 917087, name: 'Kang-in Lee', position: 'Midfielder' },
  { sofascoreId: 889689, name: 'Hwang In-beom', position: 'Midfielder' },
  { sofascoreId: 537552, name: 'Jae-sung Lee', position: 'Midfielder' },
  { sofascoreId: 1185869, name: 'Jun-Ho Bae', position: 'Midfielder' },
  { sofascoreId: 881307, name: 'Seung Ho Paik', position: 'Midfielder' },
  { sofascoreId: 1019312, name: 'Jens Castrop', position: 'Midfielder' },
  { sofascoreId: 1002508, name: 'Ji-sung Eom', position: 'Midfielder' },
  { sofascoreId: 932316, name: 'Dong-gyeong Lee', position: 'Midfielder' },
  { sofascoreId: 1002355, name: 'Lee Tae-seok', position: 'Midfielder' },
  { sofascoreId: 1009476, name: 'Jin-gyu Kim', position: 'Midfielder' },
  { sofascoreId: 1026069, name: 'Jin-seob Park', position: 'Midfielder' },
  { sofascoreId: 896569, name: 'Kim Min-jae', position: 'Defender' },
  { sofascoreId: 1019333, name: 'Young-woo Seol', position: 'Defender' },
  { sofascoreId: 1002448, name: 'Han-Beom Lee', position: 'Defender' },
  { sofascoreId: 921263, name: 'Kim Moon-hwan', position: 'Defender' },
  { sofascoreId: 976203, name: 'Kim Tae-hyeon', position: 'Defender' },
  { sofascoreId: 1103520, name: 'Gi-Hyuk Lee', position: 'Defender' },
  { sofascoreId: 1154613, name: 'Wi-je Cho', position: 'Defender' },
  { sofascoreId: 825502, name: 'Jo Hyeonwoo', position: 'Goalkeeper' },
  { sofascoreId: 235686, name: 'Kim Seung-gyu', position: 'Goalkeeper' },
  { sofascoreId: 940057, name: 'Song Bum-keun', position: 'Goalkeeper' }
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

const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
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
    id: slugify('South Korea', s.name),
    name: s.name,
    team: 'South Korea',
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
  team: 'South Korea',
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
