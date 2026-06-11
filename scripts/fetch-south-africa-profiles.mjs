/**
 * Fetch player profiles from Sofascore for South Africa squad.
 *   node scripts/fetch-south-africa-profiles.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const squadPath = path.join(root, 'data', 'south-africa.json');
const outPath = path.join(root, 'data', 'south-africa-profiles.json');

const squad = JSON.parse(fs.readFileSync(squadPath, 'utf8'));
const ids = squad.players.map((p) => p.sofascoreId);

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto('https://www.sofascore.com/football/team/south-africa/4736', {
      waitUntil: 'domcontentloaded',
      timeout: 90000
    });
    await new Promise((r) => setTimeout(r, 5000));

    const profiles = await page.evaluate(async (playerIds) => {
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
            (d.statistics ?? []).find((s) => s.team?.name?.includes('South Africa')) ??
            (d.statistics ?? [])[0];
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
    }, ids);

    fs.writeFileSync(outPath, JSON.stringify(profiles, null, 2));
    console.log(`Wrote ${profiles.length} profiles to ${outPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
