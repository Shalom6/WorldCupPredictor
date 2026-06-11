/**
 * Update national-teams.json formLast10 + wcQualifying rates from SofaScore raw imports.
 *   node scripts/sync-team-form.mjs
 *   node scripts/sync-team-form.mjs --group=A
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { discoverRawFiles } from './lib/team-data-paths.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const nationalPath = path.join(root, 'src', 'data', 'national-teams.json');

function parseArgs(argv) {
  const opts = { group: null };
  for (const arg of argv) {
    if (arg.startsWith('--group=')) {
      const g = arg.slice('--group='.length).toUpperCase();
      opts.teams = null; // filled below
      opts.group = g;
    }
  }
  return opts;
}

function aggregateFromResults(results) {
  const last10 = (results ?? []).slice(0, 10);
  if (!last10.length) return null;

  let gf = 0;
  let ga = 0;
  let w = 0;
  let d = 0;
  let l = 0;
  for (const m of last10) {
    gf += m.goalsFor ?? 0;
    ga += m.goalsAgainst ?? 0;
    if (m.result === 'W') w++;
    else if (m.result === 'D') d++;
    else l++;
  }
  const n = last10.length;

  return {
    formLast10: last10.map((m) => ({
      result: m.result,
      goalsFor: m.goalsFor,
      goalsAgainst: m.goalsAgainst,
      competition: m.competition ?? 'International',
      date: m.date,
      opponent: m.opponent
    })),
    wcQualifyingPatch: {
      played: n,
      wins: w,
      draws: d,
      losses: l,
      goalsFor: gf,
      goalsAgainst: ga,
      xgFor: Math.round(gf * 1.05),
      xgAgainst: Math.round(ga * 1.05),
      importSource: 'sofascore-recent-form',
      formSyncedAt: new Date().toISOString()
    }
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const national = JSON.parse(fs.readFileSync(nationalPath, 'utf8'));
  const raws = discoverRawFiles();

  let updated = 0;
  for (const { team, payload } of raws) {
    const bundle = national.teams?.[team];
    if (!bundle) continue;
    if (opts.group && payload.group !== opts.group) continue;

    const results = payload.teamMatchResults;
    const agg = aggregateFromResults(results);
    if (!agg) continue;

    bundle.season2026 = bundle.season2026 ?? { label: '2026' };
    bundle.season2026.formLast10 = agg.formLast10;
    bundle.season2026.importSource = 'sofascore';
    bundle.season2026.formSyncedAt = new Date().toISOString();

    const wc = bundle.season2026.wcQualifying ?? {};
    bundle.season2026.wcQualifying = {
      ...wc,
      ...agg.wcQualifyingPatch,
      shotsPerMatch: wc.shotsPerMatch ?? 14,
      shotsOnTargetPerMatch: wc.shotsOnTargetPerMatch ?? 5,
      cornersPerMatch: wc.cornersPerMatch ?? 5.5
    };

    updated++;
    console.log(`→ ${team}: synced ${agg.formLast10.length} recent matches`);
  }

  if (!updated) {
    console.log('No raw imports with teamMatchResults found.');
    return;
  }

  fs.writeFileSync(nationalPath, JSON.stringify(national, null, 2));
  console.log(`\nUpdated ${updated} team(s) in ${nationalPath}`);
}

main();
