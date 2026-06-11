/**
 * Discover Sofascore national team IDs for all 48 teams.
 *   node scripts/discover-sofascore-ids.mjs
 *   node scripts/discover-sofascore-ids.mjs --group=B
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(root, 'scripts', 'lib', 'sofascore-registry.json');

function parseArgs(argv) {
  const opts = { group: null, refresh: false, missingOnly: true };
  for (const arg of argv) {
    if (arg === '--refresh') opts.refresh = true;
    if (arg === '--all') opts.missingOnly = false;
    if (arg.startsWith('--group=')) opts.group = arg.slice('--group='.length).toUpperCase();
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const entries = Object.entries(registry.teams).filter(([, cfg]) =>
    opts.group ? cfg.group === opts.group : true
  );

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto('https://www.sofascore.com/', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await new Promise((r) => setTimeout(r, 3000));

    for (const [name, cfg] of entries) {
      if (cfg.sofascoreId && opts.missingOnly && !opts.refresh) {
        console.log(`✓ ${name}: ${cfg.sofascoreId} (cached)`);
        continue;
      }
      const search = cfg.search ?? name;
      const hit = await page.evaluate(async (q) => {
        const resp = await fetch(
          `https://api.sofascore.com/api/v1/search/all?q=${encodeURIComponent(q)}&page=0`
        );
        const data = await resp.json();
        const teams = (data.results ?? [])
          .map((r) => r.entity ?? r.team ?? r)
          .filter((t) => t?.national && String(t.sport?.slug ?? 'football') === 'football');
        return teams.slice(0, 8).map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          national: t.national
        }));
      }, search);

      const pick =
        hit.find((t) => t.national && (cfg.aliases ?? [name]).some((a) => t.name?.includes(a) || a.includes(t.name))) ??
        hit.find((t) => t.national) ??
        hit.find((t) => (cfg.aliases ?? [name]).some((a) => t.name?.toLowerCase() === a.toLowerCase())) ??
        hit[0];

      if (pick?.id) {
        cfg.sofascoreId = pick.id;
        cfg.slug = pick.slug ?? cfg.slug;
        console.log(`✓ ${name}: ${pick.id} (${pick.name})`);
      } else {
        console.warn(`✗ ${name}: no match for "${search}"`);
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
    console.log(`\nWrote ${registryPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
