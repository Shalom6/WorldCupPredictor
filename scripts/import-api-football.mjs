/**
 * Import real international player stats from API-Football.
 *
 *   API_FOOTBALL_KEY=... npm run import:api-football
 *   API_FOOTBALL_KEY=... npm run import:api-football -- --teams Morocco,Brazil
 *   API_FOOTBALL_KEY=... npm run import:api-football -- --all
 *   API_FOOTBALL_KEY=... npm run import:api-football -- --max=10
 *   API_FOOTBALL_KEY=... npm run import:api-football -- --seasons=2024,2023
 *
 * Cached under src/data/api-cache/ — re-runs skip fresh cache (7 days).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  apiFootballGet,
  cachePath,
  cachedGet,
  getApiFootballKey,
  getRequestCount,
  isInternationalFixture,
  resetRequestCount
} from '../src/apiFootball.js';
import {
  buildTeamPlayersFromApi,
  pickNationalTeam,
  searchTermForTeam
} from '../src/apiFootballImport.js';
import historicalIndex from '../src/data/historical-index.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'src', 'data');

const DEFAULT_TEAMS = ['Morocco', 'Brazil'];
const ALL_TEAMS = historicalIndex.teams ?? [];
/** Free API-Football tier covers seasons 2022–2024 (not `last` or 2025+). */
const DEFAULT_SEASONS = [2024, 2023, 2022];

function parseArgs(argv) {
  const opts = {
    teams: DEFAULT_TEAMS,
    all: false,
    force: false,
    seasons: [...DEFAULT_SEASONS],
    maxFixtures: 15
  };

  for (const arg of argv) {
    if (arg === '--all') opts.all = true;
    else if (arg === '--force') opts.force = true;
    else if (arg.startsWith('--teams=')) {
      opts.teams = arg
        .slice('--teams='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg.startsWith('--seasons=')) {
      opts.seasons = arg
        .slice('--seasons='.length)
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    } else if (arg.startsWith('--last=') || arg.startsWith('--max=')) {
      const n = Number(arg.slice(arg.indexOf('=') + 1));
      if (Number.isFinite(n) && n > 0) opts.maxFixtures = n;
    }
  }

  if (opts.all) opts.teams = ALL_TEAMS;
  return opts;
}

function loadJson(p, fallback = null) {
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function teamSlug(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function resolveTeam(appTeamName, force) {
  const cacheFile = cachePath(root, 'teams', `${teamSlug(appTeamName)}.json`);
  const search = searchTermForTeam(appTeamName);

  const { response } = await cachedGet(
    cacheFile,
    async () => {
      const payload = await apiFootballGet('/teams', { search });
      const team = pickNationalTeam(payload.response ?? [], appTeamName);
      if (!team) {
        throw new Error(`No national team found for search "${search}" (${appTeamName})`);
      }
      return { team, search };
    },
    { force, maxAgeMs: 30 * 24 * 60 * 60 * 1000 }
  );

  return response.team;
}

async function fetchFixtures(teamApiId, seasons, maxFixtures, force) {
  const all = [];
  const seen = new Set();

  for (const season of seasons) {
    const cacheFile = cachePath(root, 'fixtures', `team-${teamApiId}-season${season}.json`);
    try {
      const { response } = await cachedGet(
        cacheFile,
        async () => {
          const payload = await apiFootballGet('/fixtures', {
            team: teamApiId,
            season,
            status: 'FT'
          });
          return payload.response ?? [];
        },
        { force, maxAgeMs: 24 * 60 * 60 * 1000 }
      );

      for (const fix of response) {
        const id = fix.fixture?.id;
        if (id && !seen.has(id)) {
          seen.add(id);
          all.push(fix);
        }
      }
    } catch (e) {
      if (/Free plans do not have access to this season/i.test(e.message)) {
        console.warn(`  ⚠ Season ${season} not on free plan — skipping`);
        continue;
      }
      throw e;
    }
  }

  const international = all.filter(isInternationalFixture);
  international.sort(
    (a, b) => Date.parse(b.fixture?.date ?? 0) - Date.parse(a.fixture?.date ?? 0)
  );
  return international.slice(0, maxFixtures);
}

async function fetchFixturePlayers(fixtureId, force) {
  const cacheFile = cachePath(root, 'fixture-players', `${fixtureId}.json`);
  const { response: cached } = await cachedGet(
    cacheFile,
    async () => {
      const payload = await apiFootballGet('/fixtures/players', { fixture: fixtureId });
      return payload;
    },
    { force, maxAgeMs: 30 * 24 * 60 * 60 * 1000 }
  );
  return cached;
}

async function importTeam(appTeamName, opts) {
  console.log(`\n→ ${appTeamName}`);

  const team = await resolveTeam(appTeamName, opts.force);
  console.log(`  API team: ${team.name} (id ${team.id})`);

  let fixtures = await fetchFixtures(team.id, opts.seasons, opts.maxFixtures, opts.force);
  console.log(`  International fixtures: ${fixtures.length}`);

  if (!fixtures.length) {
    console.warn(`  ⚠ No international fixtures — skipping`);
    return [];
  }

  const fixturePlayersMap = new Map();
  for (const fix of fixtures) {
    const id = fix.fixture?.id;
    if (!id) continue;
    process.stdout.write(`  · fixture ${id} (${fix.league?.name ?? '?'})… `);
    try {
      const data = await fetchFixturePlayers(id, opts.force);
      fixturePlayersMap.set(id, data);
      console.log('ok');
    } catch (e) {
      console.log(`skip (${e.message})`);
    }
  }

  const players = buildTeamPlayersFromApi(appTeamName, team.id, fixtures, fixturePlayersMap);
  console.log(`  ✓ ${players.length} players with match logs`);
  if (players[0]?.importMeta) {
    console.log(`    Competitions: ${players[0].importMeta.competitions.join(', ')}`);
  }

  return players;
}

function mergeIntoCatalog(importedByTeam, existingCatalog) {
  const importedIds = new Set();
  const importedTeams = new Set(Object.keys(importedByTeam));

  let players = (existingCatalog?.players ?? []).filter((p) => !importedTeams.has(p.team));
  for (const teamPlayers of Object.values(importedByTeam)) {
    for (const p of teamPlayers) {
      importedIds.add(p.id);
      players.push(p);
    }
  }

  players.sort((a, b) => a.name.localeCompare(b.name));

  const rosters = loadJson(path.join(dataDir, 'rosters-2025-26.json'), {}) ?? {};
  for (const [team, teamPlayers] of Object.entries(importedByTeam)) {
    rosters[team] = teamPlayers.map((p) => ({
      name: p.name,
      position: p.position,
      likelyStarter: p.likelyStarter,
      benchImpact: p.benchImpact,
      minutesFactor: p.minutesFactor,
      xgShare: p.xgShare
    }));
  }

  const catalog = {
    generatedAt: new Date().toISOString(),
    playerCount: players.length,
    teamCount: ALL_TEAMS.length,
    dataSource: 'mixed',
    importNotes: {
      apiFootball: {
        importedTeams: [...importedTeams],
        importedAt: new Date().toISOString(),
        requestCount: getRequestCount()
      }
    },
    players
  };

  return { catalog, rosters };
}

async function main() {
  resetRequestCount();

  if (!getApiFootballKey()) {
    console.error('\nMissing API_FOOTBALL_KEY in WorldCupPredictor/.env.local');
    console.error('Register free at https://www.api-football.com/ and add:');
    console.error('  API_FOOTBALL_KEY=your_key_here\n');
    process.exit(1);
  }

  const opts = parseArgs(process.argv.slice(2));
  console.log('API-Football import');
  console.log(`Teams: ${opts.teams.join(', ')}`);
  console.log(`Seasons: ${opts.seasons.join(', ')} (max ${opts.maxFixtures} fixtures/team)`);
  console.log(`Cache: src/data/api-cache/ (${opts.force ? 'force refresh' : 'reuse if fresh'})`);

  const importedByTeam = {};
  const errors = [];

  for (const team of opts.teams) {
    try {
      importedByTeam[team] = await importTeam(team, opts);
    } catch (e) {
      errors.push({ team, message: e.message });
      console.error(`  ✗ ${team}: ${e.message}`);
    }
  }

  const existingPath = path.join(dataDir, 'world-cup-players.json');
  const existing = loadJson(existingPath, { players: [] });
  const { catalog, rosters } = mergeIntoCatalog(importedByTeam, existing);

  fs.writeFileSync(existingPath, JSON.stringify(catalog, null, 2));
  fs.writeFileSync(path.join(dataDir, 'rosters-2025-26.json'), JSON.stringify(rosters, null, 2));

  const importedPlayerCount = Object.values(importedByTeam).reduce((n, arr) => n + arr.length, 0);

  console.log('\n── Summary ──');
  console.log(`API requests this run: ${getRequestCount()}`);
  console.log(`Imported players: ${importedPlayerCount}`);
  console.log(`Total catalog: ${catalog.playerCount} players`);
  console.log(`Wrote ${existingPath}`);

  if (errors.length) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) console.log(`  - ${e.team}: ${e.message}`);
  }

  if (getRequestCount() >= 90) {
    console.log('\n⚠ Near free-tier daily limit (~100 req/day). Remaining teams will need cache or paid plan.');
  }

  console.log('\nDone. Restart npm run dev and open the Players tab.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
