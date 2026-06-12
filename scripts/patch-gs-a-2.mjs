/**
 * Patch South Korea 2–1 Czechia (GS-A-2, 2026-06-11).
 * Run: node scripts/patch-gs-a-2.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { finalizeSofascoreRaw } from './lib/finalize-sofascore.mjs';
import { teamDataPaths } from './lib/team-data-paths.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MATCH_DATE = '2026-06-11';
const COMPETITION = 'FIFA World Cup, Group A';

const SK_MATCH = {
  date: MATCH_DATE,
  opponent: 'Czechia',
  competition: COMPETITION,
  result: 'W',
  goalsFor: 2,
  goalsAgainst: 1,
  venue: 'home'
};

const CZE_MATCH = {
  date: MATCH_DATE,
  opponent: 'South Korea',
  competition: COMPETITION,
  result: 'L',
  goalsFor: 1,
  goalsAgainst: 2,
  venue: 'away'
};

const APPEARANCES = {
  'South Korea': {
    'Kim Seung-gyu': { minutes: 90 },
    'Kim Min-jae': { minutes: 90 },
    'Gi-Hyuk Lee': { minutes: 90 },
    'Han-Beom Lee': { minutes: 90 },
    'Seung Ho Paik': { minutes: 84 },
    'Hwang In-beom': { minutes: 84, goals: 1, assists: 1 },
    'Lee Tae-seok': { minutes: 69 },
    'Young-woo Seol': { minutes: 90 },
    'Son Heung-min': { minutes: 69, shots: 5, shotsOnTarget: 2 },
    'Jae-sung Lee': { minutes: 90 },
    'Kang-in Lee': { minutes: 90, assists: 1 },
    'Hyeon-gyu Oh': { minutes: 21, goals: 1, shots: 2, shotsOnTarget: 1 },
    'Ji-sung Eom': { minutes: 21 },
    'Jin-gyu Kim': { minutes: 6 },
    'Jin-seob Park': { minutes: 6 }
  },
  Czechia: {
    'Matěj Kovář': { minutes: 90, saves: 4 },
    'Robin Hranáč': { minutes: 90 },
    'Ladislav Krejčí': { minutes: 90, goals: 1, shots: 2, shotsOnTarget: 1 },
    'Štěpán Chaloupek': { minutes: 90 },
    'Alexandr Sojka': { minutes: 84 },
    'Tomáš Souček': { minutes: 90 },
    'Jaroslav Zelený': { minutes: 90 },
    'Vladimír Coufal': { minutes: 90, assists: 1 },
    'Patrik Schick': { minutes: 90, shots: 2, shotsOnTarget: 1 },
    'Pavel Šulc': { minutes: 64 },
    'Lukáš Provod': { minutes: 64 },
    'Adam Hložek': { minutes: 26 },
    'Michal Sadílek': { minutes: 26 },
    'Mojmír Chytil': { minutes: 6 }
  }
};

function baseEntry(teamMatch, opponent, patch) {
  return {
    date: MATCH_DATE,
    opponent,
    competition: COMPETITION,
    result: teamMatch.result,
    venue: teamMatch.venue,
    minutes: patch.minutes,
    goals: patch.goals ?? 0,
    assists: patch.assists ?? 0,
    shots: patch.shots ?? 0,
    shotsOnTarget: patch.shotsOnTarget ?? 0,
    passes: patch.passes ?? 0,
    cards: patch.cards ?? 0,
    fouls: patch.fouls ?? 0,
    ...(patch.saves != null ? { saves: patch.saves } : {})
  };
}

function prependUnique(results, entry) {
  const filtered = (results ?? []).filter((r) => r.date !== entry.date || r.opponent !== entry.opponent);
  return [entry, ...filtered].slice(0, 22);
}

function stripOpenerFromLog(log) {
  return (log ?? []).filter((g) => g.date !== MATCH_DATE);
}

function patchTeam(teamName, teamMatch, opponent) {
  const paths = teamDataPaths(teamName);
  const raw = JSON.parse(fs.readFileSync(paths.raw, 'utf8'));
  const appearances = APPEARANCES[teamName] ?? {};

  raw.importedAt = new Date().toISOString();
  raw.teamMatchResults = prependUnique(raw.teamMatchResults, teamMatch);
  raw.eventsProcessed = raw.teamMatchResults.length;
  raw.eventDates = raw.teamMatchResults.map((m) => m.date);

  let patched = 0;
  for (const player of raw.players ?? []) {
    player.gameLog = stripOpenerFromLog(player.gameLog);
    const patch = appearances[player.name];
    if (!patch) continue;
    player.gameLog = [baseEntry(teamMatch, opponent, patch), ...player.gameLog];
    patched++;
  }

  fs.writeFileSync(paths.raw, JSON.stringify(raw, null, 2));
  const stats = finalizeSofascoreRaw(raw, paths.squad);
  console.log(
    `${teamName}: ${teamMatch.goalsFor}-${teamMatch.goalsAgainst} vs ${opponent} (${patched} players, ${stats.withLogs}/${stats.playerCount} with logs)`
  );
}

patchTeam('South Korea', SK_MATCH, 'Czechia');
patchTeam('Czechia', CZE_MATCH, 'South Korea');

const resultsPath = path.join(root, 'src', 'data', 'match-results.json');
const resultsDoc = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
resultsDoc.results['GS-A-2'] = {
  status: 'finished',
  homeScore: 2,
  awayScore: 1,
  scorers: {
    home: [
      { name: 'Hwang In-beom', minute: 67, assist: 'Kang-in Lee' },
      { name: 'Hyeon-gyu Oh', minute: 80, assist: 'Hwang In-beom' }
    ],
    away: [{ name: 'Ladislav Krejčí', minute: 59, assist: 'Vladimír Coufal' }]
  },
  teamStats: {
    possession: { home: 62, away: 38 },
    shots: { home: 13, away: 8 },
    shotsOnTarget: { home: 6, away: 4 },
    corners: { home: 4, away: 5 },
    fouls: { home: 8, away: 16 },
    yellowCards: { home: 1, away: 0 },
    redCards: { home: 0, away: 0 },
    saves: { home: 3, away: 4 }
  },
  notes: 'Estadio Akron, Guadalajara. Czechia led 1–0 until Korea rallied with two late goals.'
};
fs.writeFileSync(resultsPath, JSON.stringify(resultsDoc, null, 2));
console.log('Updated match-results.json → GS-A-2');
console.log('\nDone. Run: node scripts/sync-team-form.mjs --group=A && npm run import:manual-teams -- --group=A');
