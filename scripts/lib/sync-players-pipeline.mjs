/**
 * Shared pipeline: ESPN summary to raw/squad player logs and catalog refresh.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { fetchMatchSummary, fetchScoreboard, isEventFinished, matchEventsToFixtures } from './espn-world-cup.mjs';
import { patchTeamRawFromEspn } from './espn-player-stats.mjs';
import { finalizeSofascoreRaw } from './finalize-sofascore.mjs';
import { teamDataPaths } from './team-data-paths.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

export async function syncFixturePlayers(fixture, espnEventId, opts = {}) {
  const summary = await fetchMatchSummary(espnEventId);
  const comp = summary.header?.competitions?.[0];
  if (!comp?.status?.type?.completed) {
    console.log(`  ⏳ ${fixture.id} not finished — skip players`);
    return { changed: false, groups: new Set(), changedFiles: [] };
  }

  const changedFiles = [];
  const groups = new Set([fixture.group]);
  let anyPatched = false;

  for (const [teamName, isHome] of [
    [fixture.homeTeam, true],
    [fixture.awayTeam, false]
  ]) {
    const paths = teamDataPaths(teamName);
    if (!fs.existsSync(paths.raw)) {
      console.warn(`  ✗ ${teamName}: no raw file`);
      continue;
    }

    const raw = readJson(paths.raw, null);
    const { patched, updated, unmatched, teamMatch } = patchTeamRawFromEspn(raw, {
      fixture,
      summary,
      teamName,
      isHome
    });

    console.log(
      `  ${teamName}: ${teamMatch.goalsFor}-${teamMatch.goalsAgainst} vs ${teamMatch.opponent} — ${patched} players${updated ? ` (${updated} updated)` : ''}`
    );
    if (unmatched.length) {
      console.log(`    unmatched: ${unmatched.join(', ')}`);
    }

    if (updated === 0) continue;
    anyPatched = true;

    if (!opts.dryRun) {
      writeJson(paths.raw, raw);
      changedFiles.push(paths.raw);
      finalizeSofascoreRaw(raw, paths.squad);
      changedFiles.push(paths.squad);
    }
  }

  return { changed: anyPatched, groups, changedFiles };
}

export function runPostImport(groups) {
  for (const g of [...groups].sort()) {
    console.log(`\nRefreshing team form + catalog (group ${g})…`);
    execSync(`node scripts/sync-team-form.mjs --group=${g}`, { cwd: root, stdio: 'inherit' });
    execSync(`npm run import:manual-teams -- --group=${g}`, { cwd: root, stdio: 'inherit' });
  }
}

/**
 * @param {{ fixture, espnEventId }[]} pairs
 * @returns {Promise<string[]>} changed file paths
 */
export async function syncPlayersForFixtures(pairs, opts = {}) {
  const allChanged = new Set();
  const allGroups = new Set();

  for (const { fixture, espnEventId } of pairs) {
    console.log(`\nPlayer sync: ${fixture.id} ${fixture.homeTeam} vs ${fixture.awayTeam}`);
    const result = await syncFixturePlayers(fixture, espnEventId, opts);
    if (result.changed) {
      for (const f of result.changedFiles) allChanged.add(f);
      for (const g of result.groups) allGroups.add(g);
    }
  }

  if (allChanged.size && !opts.dryRun) {
    runPostImport(allGroups);
    allChanged.add(path.join(root, 'src', 'data', 'world-cup-players.json'));
    allChanged.add(path.join(root, 'src', 'data', 'rosters-2025-26.json'));
    allChanged.add(path.join(root, 'src', 'data', 'national-teams.json'));
  }

  return [...allChanged];
}

/**
 * Build fixture/ESPN pairs from live scoreboard plus saved map for finished games.
 */
export function buildPlayerSyncPairs(fixtures, events, mapDoc, resultsDoc) {
  const fromBoard = matchEventsToFixtures(events, fixtures)
    .filter(({ espnEvent }) => isEventFinished(espnEvent))
    .map(({ fixture, espnEventId }) => ({
      fixture,
      espnEventId: mapDoc.mappings?.[fixture.id]?.espnEventId ?? espnEventId
    }));

  const seen = new Set(fromBoard.map((p) => p.fixture.id));
  const fromMap = [];

  for (const fixture of fixtures) {
    if (seen.has(fixture.id)) continue;
    const mappedId = mapDoc.mappings?.[fixture.id]?.espnEventId;
    const finished = resultsDoc?.results?.[fixture.id]?.status === 'finished';
    if (mappedId && finished) {
      fromMap.push({ fixture, espnEventId: mappedId });
      seen.add(fixture.id);
    }
  }

  return [...fromBoard, ...fromMap];
}
