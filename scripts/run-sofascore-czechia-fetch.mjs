/**
 * Fetch Czechia stats from Sofascore via headless browser.
 *   node scripts/run-sofascore-czechia-fetch.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'data', 'czechia-raw.json');
const fetchModulePath = path.join(__dirname, 'sofascore-czechia-fetch.js');

const fnBody = fs
  .readFileSync(fetchModulePath, 'utf8')
  .replace(/^\/\*\*[\s\S]*?\*\/\s*/, '')
  .replace(/^export async function fetchCzechiaFromSofascore/, 'async function fetchCzechiaFromSofascore');

const browserScript = `${fnBody}
return fetchCzechiaFromSofascore({ maxEvents: 22, delayMs: 280 });
`;

async function main() {
  console.log('Launching browser for Sofascore fetch…');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.goto('https://www.sofascore.com/football/team/czech-republic/4714', {
      waitUntil: 'domcontentloaded',
      timeout: 90000
    });
    await new Promise((r) => setTimeout(r, 5000));

    console.log('Running fetch (22 events, ~2 min)…');
    const data = await page.evaluate(async (script) => {
      // eslint-disable-next-line no-new-func
      return new Function(`return (async () => { ${script} })()`)();
    }, browserScript);

    fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
    console.log(`Wrote ${outPath}`);
    console.log(`Events: ${data.eventsProcessed}, Players: ${data.players.length}`);
    console.log(`With logs: ${data.players.filter((p) => p.gameLog?.length).length}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
