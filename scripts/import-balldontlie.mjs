/**
 * Merge BallDontLie (free tier) into bundled team JSON — does NOT replace curated data.
 *
 *   BALLDONTLIE_API_KEY=... npm run import:balldontlie
 *
 * From API (free): UCL standings (W/D/L, goals) + roster name/position cross-check.
 * From bundled: xG, shots, corners, league form, starter weights, historical.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  BDL_KNOWN_TEAMS,
  BDL_UCL_SEASON,
  findStanding,
  findTeam,
  getBalldontlieApiKey,
  getRoster,
  getStandings,
  getTeams,
  teamsFromStandings
} from '../src/balldontlie.js';
import { mergeSeasonBundle } from '../src/dataMerge.js';
import { getCuratedRoster } from '../src/rosterData.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'src', 'data');

const TEAM_CONFIG = [
  { file: 'psg.json', name: 'PSG', aliases: ['Paris Saint-Germain', 'PSG', 'Paris'] },
  { file: 'arsenal.json', name: 'Arsenal', aliases: ['Arsenal', 'Gunners'] }
];

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function bundledSeasonWithCuratedRoster(bundle) {
  const curated = getCuratedRoster(bundle.name);
  return {
    ...bundle.season2025_26,
    roster: curated.length ? curated : bundle.season2025_26?.roster ?? []
  };
}

async function mergeTeam({ config, teams, standings }) {
  const targetPath = path.join(dataDir, config.file);
  const bundle = loadJson(targetPath);
  const team = findTeam(teams, config.aliases, config.name);
  if (!team?.id) throw new Error(`Team not found in BallDontLie: ${config.name}`);

  const standing = findStanding(standings, team.id);
  let bdlRoster = [];
  try {
    bdlRoster = await getRoster(team.id);
  } catch (err) {
    console.warn(`    ⚠ roster API skipped for ${config.name}: ${err.message}`);
  }

  const bundledSeason = bundledSeasonWithCuratedRoster(bundle);
  const mergedSeason = mergeSeasonBundle({
    bundledSeason,
    standingRow: standing,
    bdlRosterEntries: bdlRoster
  });

  mergedSeason.importApiSeason = BDL_UCL_SEASON;
  mergedSeason.importApiSeasonLabel = '2025-26';

  const updated = {
    ...bundle,
    season2025_26: mergedSeason
  };

  fs.writeFileSync(targetPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');

  const u = mergedSeason.ucl ?? {};
  return {
    team: team.name,
    teamId: team.id,
    ucl: `${u.goalsFor ?? '?'}-${u.goalsAgainst ?? '?'} (${u.played ?? '?'}gp)`,
    roster: mergedSeason.roster?.length ?? 0,
    apiRoster: bdlRoster.length,
    fromApi: standing ? 'standings' : 'none'
  };
}

async function main() {
  if (!getBalldontlieApiKey()) {
    console.error('Set BALLDONTLIE_API_KEY in .env.local (from app.balldontlie.io)');
    process.exit(1);
  }

  console.log('Merge bundled data + BallDontLie (free tier)\n');
  console.log('  Bundled keeps: xG, shots, corners, form, league, player weights');
  console.log('  API updates:   UCL W/D/L & goals, roster positions (names matched)\n');

  let standings = [];
  let teams = [];

  try {
    standings = await getStandings();
    teams = teamsFromStandings(standings);
    console.log(`  ✓ standings: ${standings.length} teams`);
  } catch (err) {
    console.error(`  ✗ standings: ${err.message}`);
  }

  if (!teams.length) {
    teams = await getTeams();
  }
  if (!teams.length) {
    teams = Object.values(BDL_KNOWN_TEAMS);
    console.log('  → using known team IDs');
  }

  let ok = 0;
  for (const config of TEAM_CONFIG) {
    try {
      const r = await mergeTeam({ config, teams, standings });
      console.log(
        `  ✓ ${r.team}: UCL ${r.ucl} · roster ${r.roster} (curated + ${r.apiRoster} API names) · ${r.fromApi}`
      );
      ok++;
    } catch (err) {
      console.error(`  ✗ ${config.file}: ${err.message}`);
    }
  }

  if (!ok) {
    console.error('\nMerge failed. Bundled files unchanged except failed teams.');
    process.exit(1);
  }

  console.log('\nDone. Restart: npm run dev');
}

main().catch((err) => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
