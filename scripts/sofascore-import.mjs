/**
 * SofaScore import pipeline (fetch → finalize → profiles → merge).
 *
 *   node scripts/sofascore-import.mjs --group=A
 *   node scripts/sofascore-import.mjs --team=Mexico
 *   node scripts/sofascore-import.mjs --all
 *   node scripts/sofascore-import.mjs --all --skip-fetch   # finalize only
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { finalizeSofascoreRaw } from './lib/finalize-sofascore.mjs';
import {
  ensureTeamDataDir,
  getGroupForTeam,
  teamDataPaths
} from './lib/team-data-paths.mjs';

puppeteer.use(StealthPlugin());

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(root, 'scripts', 'lib', 'sofascore-registry.json');
const fetchCorePath = path.join(root, 'scripts', 'lib', 'sofascore-fetch-core.js');

function parseArgs(argv) {
  const opts = { all: false, group: null, team: null, skipFetch: false, skipProfiles: false };
  for (const arg of argv) {
    if (arg === '--all') opts.all = true;
    if (arg === '--skip-fetch') opts.skipFetch = true;
    if (arg === '--skip-profiles') opts.skipProfiles = true;
    if (arg.startsWith('--group=')) opts.group = arg.slice('--group='.length).toUpperCase();
    if (arg.startsWith('--team=')) opts.team = arg.slice('--team='.length);
  }
  return opts;
}

function loadRegistry() {
  return JSON.parse(fs.readFileSync(registryPath, 'utf8')).teams;
}

function teamsToProcess(opts, registry) {
  if (opts.team) {
    const cfg = registry[opts.team];
    if (!cfg) throw new Error(`Unknown team: ${opts.team}`);
    return [[opts.team, cfg]];
  }
  return Object.entries(registry).filter(([, cfg]) => {
    if (opts.group && cfg.group !== opts.group) return false;
    if (opts.all || opts.group) return true;
    return false;
  });
}

async function fetchTeam(page, teamName, cfg) {
  if (!cfg.sofascoreId) throw new Error(`${teamName}: missing sofascoreId — run discover-sofascore-ids.mjs`);

  const paths = teamDataPaths(teamName);
  ensureTeamDataDir(teamName);

  const slug = cfg.slug ?? teamName.toLowerCase().replace(/\s+/g, '-');
  const url = `https://www.sofascore.com/football/team/${slug}/${cfg.sofascoreId}`;

  const fnBody = fs
    .readFileSync(fetchCorePath, 'utf8')
    .replace(/^\/\*\*[\s\S]*?\*\/\s*/, '')
    .replace(/^export async function fetchTeamFromSofascore/, 'async function fetchTeamFromSofascore');

  const config = { name: teamName, group: cfg.group ?? getGroupForTeam(teamName), ...cfg };
  const browserScript = `${fnBody}
return fetchTeamFromSofascore(${JSON.stringify(config)}, { maxEvents: 22, delayMs: 280 });
`;

  if (!page.url().includes('sofascore.com')) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await new Promise((r) => setTimeout(r, 5000));
  } else {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await new Promise((r) => setTimeout(r, 3000));
  }

  const data = await page.evaluate(async (script) => {
    // eslint-disable-next-line no-new-func
    return new Function(`return (async () => { ${script} })()`)();
  }, browserScript);

  if (!data?.eventsProcessed) {
    console.warn(`  ⚠ fetch returned 0 events — keeping existing raw data`);
    if (fs.existsSync(paths.raw)) return JSON.parse(fs.readFileSync(paths.raw, 'utf8'));
    throw new Error('SofaScore fetch returned no events and no existing raw file');
  }

  fs.writeFileSync(paths.raw, JSON.stringify(data, null, 2));
  console.log(`  raw → ${path.relative(root, paths.raw)} (${data.eventsProcessed} events, ${data.players.length} players)`);
  return data;
}

function finalizeTeam(teamName) {
  const paths = teamDataPaths(teamName);
  if (!fs.existsSync(paths.raw)) throw new Error(`Missing raw: ${paths.raw}`);
  const raw = JSON.parse(fs.readFileSync(paths.raw, 'utf8'));
  const stats = finalizeSofascoreRaw(raw, paths.squad);
  console.log(`  squad → ${path.relative(root, paths.squad)} (${stats.withLogs}/${stats.playerCount} with logs)`);
  return paths;
}

async function fetchProfiles(page, teamName, cfg) {
  const paths = teamDataPaths(teamName);
  const squad = JSON.parse(fs.readFileSync(paths.squad, 'utf8'));
  const ids = squad.players.map((p) => p.sofascoreId);
  const slug = cfg.slug ?? 'team';
  const url = `https://www.sofascore.com/football/team/${slug}/${cfg.sofascoreId}`;

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 3000));

  const aliasHint = (cfg.aliases ?? [teamName])[0];
  const profiles = await page.evaluate(async (playerIds, hint) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const fmtMv = (raw) => {
      if (!raw?.value) return null;
      const v = raw.value;
      if (v >= 1e6) return `€${(v / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
      if (v >= 1e3) return `€${Math.round(v / 1e3)}K`;
      return `€${v}`;
    };
    const out = [];
    for (const id of playerIds) {
      await sleep(200);
      try {
        const d = await fetch(`https://api.sofascore.com/api/v1/player/${id}`).then((r) => r.json());
        const p = d.player ?? {};
        const dob = p.dateOfBirthTimestamp
          ? new Date(p.dateOfBirthTimestamp * 1000).toISOString().slice(0, 10)
          : null;
        const age = p.dateOfBirthTimestamp
          ? Math.floor((Date.now() - p.dateOfBirthTimestamp * 1000) / (365.25 * 86400000))
          : null;
        const nt =
          (d.statistics ?? []).find((s) => s.team?.name?.includes(hint)) ?? (d.statistics ?? [])[0];
        out.push({
          sofascoreId: id,
          club: p.team?.name ?? null,
          marketValueEur: p.proposedMarketValueRaw?.value ?? null,
          marketValueDisplay: fmtMv(p.proposedMarketValueRaw),
          dateOfBirth: dob,
          age,
          internationalCaps: nt?.appearances ?? null,
          internationalGoals: nt?.goals ?? null
        });
      } catch {
        out.push({ sofascoreId: id });
      }
    }
    return out;
  }, ids, aliasHint);

  fs.writeFileSync(paths.profiles, JSON.stringify(profiles, null, 2));
  console.log(`  profiles → ${path.relative(root, paths.profiles)}`);
}

function mergeProfiles(teamName) {
  const paths = teamDataPaths(teamName);
  const data = JSON.parse(fs.readFileSync(paths.squad, 'utf8'));
  const profiles = JSON.parse(fs.readFileSync(paths.profiles, 'utf8'));
  const byId = new Map(profiles.map((p) => [p.sofascoreId, p]));
  for (const player of data.players) {
    const prof = byId.get(player.sofascoreId);
    if (!prof) continue;
    const { sofascoreId, ...profile } = prof;
    player.profile = { ...profile, source: 'sofascore' };
  }
  fs.writeFileSync(paths.squad, JSON.stringify(data, null, 2));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.all && !opts.group && !opts.team) {
    console.error('Usage: --group=A | --team=Mexico | --all');
    process.exit(1);
  }

  const registry = loadRegistry();
  const queue = teamsToProcess(opts, registry);
  console.log(`SofaScore import: ${queue.length} team(s)\n`);

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    for (const [teamName, cfg] of queue) {
      console.log(`\n▸ ${teamName} (Group ${cfg.group})`);
      try {
        if (!opts.skipFetch) await fetchTeam(page, teamName, cfg);
        finalizeTeam(teamName);
        if (!opts.skipProfiles) {
          await fetchProfiles(page, teamName, cfg);
          mergeProfiles(teamName);
        }
      } catch (err) {
        console.error(`  ✗ ${teamName}: ${err.message}`);
      }
    }
  } finally {
    await browser.close();
  }

  console.log('\nDone. Run: node scripts/sync-team-form.mjs && npm run import:manual-teams');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
