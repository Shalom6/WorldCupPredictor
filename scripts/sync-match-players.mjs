/**
 * Sync per-player match logs from ESPN into group squad raw + JSON files.
 *
 *   node scripts/sync-match-players.mjs
 *   node scripts/sync-match-players.mjs --fixture=GS-A-1
 *   node scripts/sync-match-players.mjs --dry-run
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import {
  fetchScoreboard,
  isEventFinished,
  matchEventsToFixtures
} from './lib/espn-world-cup.mjs';
import { syncPlayersForFixtures, buildPlayerSyncPairs } from './lib/sync-players-pipeline.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesPath = path.join(root, 'src', 'data', 'fixtures.json');
const mapPath = path.join(root, 'src', 'data', 'espn-fixture-map.json');
const resultsPath = path.join(root, 'src', 'data', 'match-results.json');

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    commit: argv.includes('--commit'),
    fixture: argv.find((a) => a.startsWith('--fixture='))?.slice('--fixture='.length) ?? null
  };
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runGitCommit(changedFiles) {
  if (!changedFiles.length) return;
  const rel = changedFiles.map((f) => path.relative(root, f).replace(/\\/g, '/'));
  execSync('git add -- ' + rel.map((f) => `"${f}"`).join(' '), { cwd: root, stdio: 'inherit' });
  try {
    execSync('git diff --staged --quiet', { cwd: root });
    console.log('Nothing staged — skip commit.');
    return;
  } catch {
    // staged changes
  }
  const msg = `chore: sync World Cup player stats (${rel.join(', ')})`;
  execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd: root, stdio: 'inherit' });
  execSync('git push origin HEAD', { cwd: root, stdio: 'inherit' });
  console.log('Pushed to origin.');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const fixturesDoc = readJson(fixturesPath, { groupStage: [] });
  let fixtures = fixturesDoc.groupStage ?? [];
  if (opts.fixture) {
    fixtures = fixtures.filter((f) => f.id === opts.fixture);
    if (!fixtures.length) {
      console.error(`Fixture not found: ${opts.fixture}`);
      process.exit(1);
    }
  }

  const mapDoc = readJson(mapPath, { mappings: {} });
  const resultsDoc = readJson(resultsPath, { results: {} });
  console.log('Fetching ESPN scoreboard for player sync…');
  const events = await fetchScoreboard();

  let syncPairs;
  if (opts.fixture) {
    const fixture = fixtures[0];
    let pairs = matchEventsToFixtures(events, fixtures).filter(({ espnEvent }) =>
      isEventFinished(espnEvent)
    );
    if (!pairs.length) {
      const mappedId = mapDoc.mappings[fixture.id]?.espnEventId;
      if (mappedId) {
        pairs = [{ fixture, espnEventId: mappedId }];
        console.log(`  Using saved ESPN map for ${fixture.id} → ${mappedId}`);
      }
    }
    syncPairs = pairs.map(({ fixture, espnEventId }) => ({
      fixture,
      espnEventId: mapDoc.mappings[fixture.id]?.espnEventId ?? espnEventId
    }));
  } else {
    syncPairs = buildPlayerSyncPairs(fixtures, events, mapDoc, resultsDoc);
  }

  const changedFiles = await syncPlayersForFixtures(syncPairs, { dryRun: opts.dryRun });

  if (opts.dryRun) {
    console.log('\nDry run — no files written.');
    return;
  }

  if (opts.commit && changedFiles.length) {
    runGitCommit(changedFiles);
  } else if (!changedFiles.length) {
    console.log('\nNo player stat changes.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
