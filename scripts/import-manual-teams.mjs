/**

 * Merge manual team files from data/group-* folders into world-cup-players.json.

 *

 *   npm run import:manual-teams

 *   npm run import:manual-teams -- --teams=Mexico,Brazil

 *   npm run import:manual-teams -- --group=A

 */

import fs from 'fs';

import path from 'path';

import { fileURLToPath } from 'url';

import { enrichManualPlayer } from '../src/playerStats.js';

import historicalIndex from '../src/data/historical-index.json' with { type: 'json' };

import { discoverSquadFiles } from './lib/team-data-paths.mjs';



const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = path.join(__dirname, '..');

const catalogPath = path.join(root, 'src', 'data', 'world-cup-players.json');

const rosterPath = path.join(root, 'src', 'data', 'rosters-2025-26.json');



function parseArgs(argv) {

  const opts = { teams: null, group: null };

  for (const arg of argv) {

    if (arg.startsWith('--teams=')) {

      opts.teams = arg

        .slice('--teams='.length)

        .split(',')

        .map((s) => s.trim())

        .filter(Boolean);

    }

    if (arg.startsWith('--group=')) {

      opts.group = arg.slice('--group='.length).toUpperCase();

    }

  }

  return opts;

}



function loadJson(p, fallback = null) {

  if (!fs.existsSync(p)) return fallback;

  return JSON.parse(fs.readFileSync(p, 'utf8'));

}



function teamsForGroup(group) {

  return historicalIndex.groups?.[group] ?? [];

}



function mergeIntoCatalog(importedByTeam, existingCatalog) {

  const importedTeams = new Set(Object.keys(importedByTeam));



  let players = (existingCatalog?.players ?? []).filter((p) => !importedTeams.has(p.team));

  for (const teamPlayers of Object.values(importedByTeam)) {

    players.push(...teamPlayers);

  }



  players.sort((a, b) => a.name.localeCompare(b.name));



  const rosters = loadJson(rosterPath, {}) ?? {};

  for (const [team, teamPlayers] of Object.entries(importedByTeam)) {

    rosters[team] = teamPlayers.map((p) => ({

      name: p.name,

      position: p.position,

      likelyStarter: p.likelyStarter,

      benchImpact: p.benchImpact,

      minutesFactor: p.minutesFactor,

      xgShare: p.xgShare,

      ...(p.propProfile ? { propProfile: p.propProfile } : {})

    }));

  }



  const manualNotes = Object.fromEntries(

    Object.entries(importedByTeam).map(([team, teamPlayers]) => [

      team,

      {

        playerCount: teamPlayers.length,

        dataSource: teamPlayers[0]?.dataSource ?? 'manual',

        importedAt: new Date().toISOString()

      }

    ])

  );



  return {

    catalog: {

      generatedAt: existingCatalog?.generatedAt ?? new Date().toISOString(),

      playerCount: players.length,

      teamCount: historicalIndex.teams?.length ?? 48,

      dataSource: 'mixed',

      importNotes: {

        ...(existingCatalog?.importNotes ?? {}),

        manualTeams: manualNotes

      },

      players

    },

    rosters

  };

}



function main() {

  const opts = parseArgs(process.argv.slice(2));

  let teamsFilter = opts.teams;

  if (opts.group) {

    teamsFilter = teamsForGroup(opts.group);

  }



  const teamFiles = discoverSquadFiles(teamsFilter);



  if (!teamFiles.length) {

    console.error('\nNo squad files found under data/group-*/');

    console.error('Run: node scripts/sofascore-import.mjs --group=A\n');

    process.exit(1);

  }



  console.log('Manual team import');

  console.log(`Files: ${teamFiles.map((t) => path.relative(root, t.filePath)).join(', ')}\n`);



  const importedByTeam = {};

  for (const { team, payload } of teamFiles) {

    const players = payload.players.map((p) => enrichManualPlayer(p, payload));

    importedByTeam[team] = players;

    const withLogs = players.filter((p) => p.gameLog?.length).length;

    console.log(`→ ${team}: ${players.length} players (${withLogs} with match logs)`);

  }



  const existing = loadJson(catalogPath, { players: [] });

  const { catalog, rosters } = mergeIntoCatalog(importedByTeam, existing);



  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));

  fs.writeFileSync(rosterPath, JSON.stringify(rosters, null, 2));



  const importedCount = Object.values(importedByTeam).reduce((n, arr) => n + arr.length, 0);



  console.log('\n── Summary ──');

  console.log(`Imported players: ${importedCount}`);

  console.log(`Total catalog: ${catalog.playerCount} players`);

  console.log(`Wrote ${catalogPath}`);

}



main();

