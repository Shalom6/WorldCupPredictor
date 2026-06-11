/**
 * One-time migration: data/*.json → data/group-{letter}/
 *   node scripts/migrate-data-to-groups.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureTeamDataDir, getGroupForTeam, teamFileSlug } from './lib/team-data-paths.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = path.join(root, 'data');

const TEAM_FROM_PREFIX = {
  mexico: 'Mexico',
  'south-africa': 'South Africa',
  'south-korea': 'South Korea',
  czechia: 'Czechia'
};

function inferTeam(filename) {
  const base = filename.replace(/-raw\.json$/, '').replace(/-profiles\.json$/, '').replace(/\.json$/, '');
  if (TEAM_FROM_PREFIX[base]) return TEAM_FROM_PREFIX[base];
  return null;
}

function main() {
  if (!fs.existsSync(dataRoot)) return;
  const topFiles = fs.readdirSync(dataRoot).filter((f) => f.endsWith('.json'));
  let moved = 0;

  for (const f of topFiles) {
    const team = inferTeam(f);
    if (!team || !getGroupForTeam(team)) continue;
    const dir = ensureTeamDataDir(team);
    const src = path.join(dataRoot, f);
    const dest = path.join(dir, f);
    if (fs.existsSync(dest)) {
      fs.unlinkSync(src);
      console.log(`removed duplicate ${f}`);
    } else {
      fs.renameSync(src, dest);
      console.log(`moved ${f} → ${path.relative(root, dest)}`);
    }
    moved++;
  }

  console.log(moved ? `\nMigrated ${moved} file(s).` : 'Nothing to migrate.');
}

main();
