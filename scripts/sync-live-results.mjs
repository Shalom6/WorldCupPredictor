/**
 * Sync finished World Cup matches from ESPN → match-results.json (+ fixture map).
 *
 *   node scripts/sync-live-results.mjs
 *   node scripts/sync-live-results.mjs --dry-run
 *   node scripts/sync-live-results.mjs --commit   # git add, commit, push (for local / Cursor agent)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import {
  fetchScoreboard,
  fetchMatchSummary,
  isEventFinished,
  matchEventsToFixtures,
  parseFinishedMatch
} from './lib/espn-world-cup.mjs';
import { syncPlayersForFixtures, buildPlayerSyncPairs } from './lib/sync-players-pipeline.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesPath = path.join(root, 'src', 'data', 'fixtures.json');
const resultsPath = path.join(root, 'src', 'data', 'match-results.json');
const mapPath = path.join(root, 'src', 'data', 'espn-fixture-map.json');

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    commit: argv.includes('--commit'),
    force: argv.includes('--force'),
    players: argv.includes('--players') || !argv.includes('--no-players')
  };
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function resultsEqual(a, b) {
  if (!a || !b) return false;
  return (
    a.homeScore === b.homeScore &&
    a.awayScore === b.awayScore &&
    JSON.stringify(a.scorers) === JSON.stringify(b.scorers) &&
    JSON.stringify(a.teamStats) === JSON.stringify(b.teamStats)
  );
}

function runGitCommit(changedFiles) {
  if (!changedFiles.length) {
    console.log('No file changes — skip git commit.');
    return;
  }
  const rel = changedFiles.map((f) => path.relative(root, f).replace(/\\/g, '/'));
  execSync('git add -- ' + rel.map((f) => `"${f}"`).join(' '), { cwd: root, stdio: 'inherit' });
  try {
    execSync('git diff --staged --quiet', { cwd: root });
    console.log('Nothing staged after add — skip commit.');
    return;
  } catch {
    // staged changes exist
  }
  const msg = `chore: sync World Cup results (${rel.join(', ')})`;
  execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd: root, stdio: 'inherit' });
  execSync('git push origin HEAD', { cwd: root, stdio: 'inherit' });
  console.log('Pushed to origin.');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const fixturesDoc = readJson(fixturesPath, { groupStage: [] });
  const fixtures = fixturesDoc.groupStage ?? [];
  const resultsDoc = readJson(resultsPath, { results: {} });
  const mapDoc = readJson(mapPath, { mappings: {}, updatedAt: null });

  console.log('Fetching ESPN FIFA World Cup scoreboard…');
  const events = await fetchScoreboard();
  console.log(`  ${events.length} event(s) on scoreboard`);

  const pairs = matchEventsToFixtures(events, fixtures);
  let updated = 0;
  let skipped = 0;
  const changedFiles = new Set();

  for (const { fixture, espnEventId, espnEvent } of pairs) {
    mapDoc.mappings[fixture.id] = {
      espnEventId,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      lastSeen: new Date().toISOString()
    };

    const existing = resultsDoc.results[fixture.id];
    if (existing?.status === 'finished' && !opts.force && isEventFinished(espnEvent)) {
      // still refresh if ESPN has richer data
    }

    if (!isEventFinished(espnEvent)) {
      const status = espnEvent.competitions?.[0]?.status?.type?.description ?? 'in progress';
      console.log(`  ⏳ ${fixture.id} ${fixture.homeTeam} vs ${fixture.awayTeam} — ${status}`);
      continue;
    }

    console.log(`  ↓ ${fixture.id} summary (ESPN ${espnEventId})…`);
    const summary = await fetchMatchSummary(espnEventId);
    const parsed = parseFinishedMatch(summary, fixture);
    if (!parsed) {
      console.warn(`  ✗ ${fixture.id}: could not parse finished match`);
      continue;
    }

    if (resultsEqual(existing, parsed)) {
      console.log(`  ✓ ${fixture.id} ${parsed.homeScore}-${parsed.awayScore} (unchanged)`);
      skipped++;
      continue;
    }

    resultsDoc.results[fixture.id] = parsed;
    updated++;
    console.log(
      `  ★ ${fixture.id} ${fixture.homeTeam} ${parsed.homeScore}-${parsed.awayScore} ${fixture.awayTeam}`
    );
  }

  mapDoc.updatedAt = new Date().toISOString();

  if (opts.dryRun) {
    console.log(`\nDry run — would update ${updated} result(s), ${skipped} unchanged.`);
    return;
  }

  if (updated > 0 || JSON.stringify(mapDoc.mappings) !== JSON.stringify(readJson(mapPath, {}).mappings ?? {})) {
    writeJson(resultsPath, resultsDoc);
    writeJson(mapPath, mapDoc);
    changedFiles.add(resultsPath);
    changedFiles.add(mapPath);
  }

  console.log(`\nDone: ${updated} updated, ${skipped} unchanged, ${pairs.length} mapped fixtures.`);

  if (opts.players && !opts.dryRun) {
    const playerPairs = buildPlayerSyncPairs(fixtures, events, mapDoc, resultsDoc);
    if (playerPairs.length) {
      const playerFiles = await syncPlayersForFixtures(playerPairs, { dryRun: false });
      for (const f of playerFiles) changedFiles.add(f);
    }
  }

  if (opts.commit && changedFiles.size) {
    runGitCommit([...changedFiles]);
  } else if (opts.commit) {
    console.log('No changes to commit.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
