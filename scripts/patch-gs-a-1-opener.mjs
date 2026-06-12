/**
 * Patch Mexico 2–0 South Africa (GS-A-1, 2026-06-11) with accurate minutes from match reports.
 * Sources: FOX Sports boxscore, ESPN commentary (subs/cards/goals).
 *
 * Run: node scripts/patch-gs-a-1-opener.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { finalizeSofascoreRaw } from './lib/finalize-sofascore.mjs';
import { teamDataPaths } from './lib/team-data-paths.mjs';

const MATCH_DATE = '2026-06-11';
const COMPETITION = 'FIFA World Cup, Group A';

const MEXICO_MATCH = {
  date: MATCH_DATE,
  opponent: 'South Africa',
  competition: COMPETITION,
  result: 'W',
  goalsFor: 2,
  goalsAgainst: 0,
  venue: 'home'
};

const SA_MATCH = {
  date: MATCH_DATE,
  opponent: 'Mexico',
  competition: COMPETITION,
  result: 'L',
  goalsFor: 0,
  goalsAgainst: 2,
  venue: 'away'
};

/** Minutes and known event stats for every player who appeared. */
const APPEARANCES = {
  Mexico: {
    'Raúl Rangel': { minutes: 90 },
    'Jesús Gallardo': { minutes: 90 },
    'Johan Vásquez': { minutes: 90 },
    'César Montes': { minutes: 92, cards: 1 },
    'Israel Reyes': { minutes: 90 },
    'Erik Lira': { minutes: 76, assists: 1 },
    'Julián Quiñones': { minutes: 79, goals: 1, shots: 3, shotsOnTarget: 2, passes: 30 },
    'Álvaro Fidalgo': { minutes: 66 },
    'Brian Gutiérrez': { minutes: 66, cards: 1 },
    'Roberto Alvarado': { minutes: 90, assists: 1 },
    'Raúl Jiménez': { minutes: 76, goals: 1, shots: 4, shotsOnTarget: 3, passes: 16 },
    'Luis Chávez': { minutes: 24 },
    'Gilberto Mora': { minutes: 24 },
    'Edson Álvarez': { minutes: 14 },
    'Armando González': { minutes: 14 },
    'Alexis Vega': { minutes: 11 }
  },
  'South Africa': {
    'Ronwen Williams': { minutes: 90 },
    'Ime Okon': { minutes: 90 },
    'Mbekezeli Mbokazi': { minutes: 90, shots: 1, shotsOnTarget: 1, passes: 25 },
    'Nkosinathi Sibisi': { minutes: 90, cards: 1 },
    'Aubrey Modiba': { minutes: 77, shots: 1, shotsOnTarget: 1, passes: 16 },
    'Khuliso Mudau': { minutes: 90 },
    'Siphephelo Sithole': { minutes: 50, cards: 1 },
    'Jayden Adams': { minutes: 61 },
    'Teboho Mokoena': { minutes: 90, cards: 1 },
    'Lyle Foster': { minutes: 56 },
    'Iqraam Rayners': { minutes: 76 },
    'Thalente Mbatha': { minutes: 34 },
    'Themba Zwane': { minutes: 23, cards: 1 },
    'Evidence Makgopa': { minutes: 14 },
    'Oswin Appollis': { minutes: 13, shots: 1, shotsOnTarget: 1 }
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
    ...(patch.rating != null ? { rating: patch.rating } : {})
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
    `${teamName}: ${patched} players patched (${stats.withLogs}/${stats.playerCount} with logs)`
  );
}

patchTeam('Mexico', MEXICO_MATCH, 'South Africa');
patchTeam('South Africa', SA_MATCH, 'Mexico');
console.log('\nDone. Run: node scripts/sync-team-form.mjs --group=A && npm run import:manual-teams -- --group=A');
