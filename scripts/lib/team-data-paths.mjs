import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import historicalIndex from '../../src/data/historical-index.json' with { type: 'json' };

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const dataRoot = path.join(root, 'data');

const TEAM_TO_GROUP = {};
for (const [group, teams] of Object.entries(historicalIndex.groups ?? {})) {
  for (const team of teams) TEAM_TO_GROUP[team] = group;
}

export function teamFileSlug(teamName) {
  return String(teamName)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function groupFolder(group) {
  return `group-${String(group).toLowerCase()}`;
}

export function getGroupForTeam(teamName) {
  return TEAM_TO_GROUP[teamName] ?? null;
}

export function getTeamDataDir(teamName) {
  const group = getGroupForTeam(teamName);
  if (!group) throw new Error(`Unknown team (no group): ${teamName}`);
  return path.join(dataRoot, groupFolder(group));
}

export function teamDataPaths(teamName) {
  const dir = getTeamDataDir(teamName);
  const slug = teamFileSlug(teamName);
  return {
    dir,
    slug,
    group: getGroupForTeam(teamName),
    raw: path.join(dir, `${slug}-raw.json`),
    squad: path.join(dir, `${slug}.json`),
    profiles: path.join(dir, `${slug}-profiles.json`)
  };
}

export function ensureTeamDataDir(teamName) {
  const dir = getTeamDataDir(teamName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** All group dirs under data/ (group-a … group-l). */
export function listGroupDirs() {
  if (!fs.existsSync(dataRoot)) return [];
  return fs
    .readdirSync(dataRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^group-[a-l]$/i.test(d.name))
    .map((d) => path.join(dataRoot, d.name));
}

/** Discover finalized squad JSON files in group folders. */
export function discoverSquadFiles(teamsFilter = null) {
  const files = [];
  for (const groupDir of listGroupDirs()) {
    for (const f of fs.readdirSync(groupDir)) {
      if (!f.endsWith('.json') || f.endsWith('-raw.json') || f.endsWith('-profiles.json')) continue;
      const filePath = path.join(groupDir, f);
      const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!payload?.players?.length) continue;
      const team = payload.team ?? f.replace('.json', '');
      if (teamsFilter && !teamsFilter.includes(team)) continue;
      files.push({ filePath, team, payload, groupDir });
    }
  }
  return files.sort((a, b) => a.team.localeCompare(b.team));
}

/** Discover raw imports for form sync. */
export function discoverRawFiles(teamsFilter = null) {
  const files = [];
  for (const groupDir of listGroupDirs()) {
    for (const f of fs.readdirSync(groupDir)) {
      if (!f.endsWith('-raw.json')) continue;
      const filePath = path.join(groupDir, f);
      const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const team = payload.team;
      if (!team) continue;
      if (teamsFilter && !teamsFilter.includes(team)) continue;
      files.push({ filePath, team, payload });
    }
  }
  return files;
}
