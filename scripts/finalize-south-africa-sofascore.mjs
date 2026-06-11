/**
 * Post-process raw Sofascore fetch → clean south-africa.json with hit rates.
 *   node scripts/finalize-south-africa-sofascore.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawPath = path.join(root, 'data', 'south-africa-raw.json');
const dataPath = path.join(root, 'data', 'south-africa.json');

/** Current South Africa squad on Sofascore (team/4736/players). */
const OFFICIAL_SQUAD = [
  { sofascoreId: 901907, name: 'Lyle Foster', position: 'Forward' },
  { sofascoreId: 1022170, name: 'Evidence Makgopa', position: 'Forward' },
  { sofascoreId: 991024, name: 'Iqraam Rayners', position: 'Forward' },
  { sofascoreId: 1564998, name: 'Relebohile Mofokeng', position: 'Midfielder' },
  { sofascoreId: 984505, name: 'Oswin Appollis', position: 'Midfielder' },
  { sofascoreId: 559504, name: 'Themba Zwane', position: 'Midfielder' },
  { sofascoreId: 881117, name: 'Teboho Mokoena', position: 'Midfielder' },
  { sofascoreId: 1101745, name: 'Tshepang Moremi', position: 'Midfielder' },
  { sofascoreId: 1014410, name: 'Thalente Mbatha', position: 'Midfielder' },
  { sofascoreId: 1210653, name: 'Kamogelo Sebelebele', position: 'Midfielder' },
  { sofascoreId: 822684, name: 'Siphephelo Sithole', position: 'Midfielder' },
  { sofascoreId: 1049669, name: 'Jayden Adams', position: 'Midfielder' },
  { sofascoreId: 1179164, name: 'Thapelo Maseko', position: 'Midfielder' },
  { sofascoreId: 2058228, name: 'Mbekezeli Mbokazi', position: 'Defender' },
  { sofascoreId: 936047, name: 'Khuliso Mudau', position: 'Defender' },
  { sofascoreId: 837099, name: 'Aubrey Modiba', position: 'Defender' },
  { sofascoreId: 902117, name: 'Nkosinathi Sibisi', position: 'Defender' },
  { sofascoreId: 1518180, name: 'Samukelo Kabini', position: 'Defender' },
  { sofascoreId: 1910804, name: 'Khulumani Ndamane', position: 'Defender' },
  { sofascoreId: 1507710, name: 'Ime Okon', position: 'Defender' },
  { sofascoreId: 1085536, name: 'Bradley Cross', position: 'Defender' },
  { sofascoreId: 1415019, name: 'Olwethu Makhanya', position: 'Defender' },
  { sofascoreId: 1470073, name: 'Tholo Thabang Matuludi', position: 'Defender' },
  { sofascoreId: 539792, name: 'Ronwen Williams', position: 'Goalkeeper' },
  { sofascoreId: 903610, name: 'Sipho Chaine', position: 'Goalkeeper' },
  { sofascoreId: 966059, name: 'Ricardo Goss', position: 'Goalkeeper' }
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
    id: slugify('South Africa', s.name),
    name: s.name,
    team: 'South Africa',
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
  team: 'South Africa',
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
