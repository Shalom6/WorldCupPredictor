import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'data', 'south-korea.json');

const browserFetchSource = fs.readFileSync(
  path.join(__dirname, 'sofascore-south-korea-fetch.js'),
  'utf8'
);
const fnBody = browserFetchSource
  .replace(/^\/\*\*[\s\S]*?\*\/\s*/, '')
  .replace(/^export async function fetchSouthKoreaFromSofascore/, 'async function fetchSouthKoreaFromSofascore');

console.log(`
To import South Korea stats from Sofascore, run this in a browser console on https://www.sofascore.com :

(async () => {
${fnBody}
  const data = await fetchSouthKoreaFromSofascore({ maxEvents: 22 });
  console.log(JSON.stringify(data));
  copy(data);
  return data;
})();

Then paste the JSON into data/south-korea-raw.json and run:
  node scripts/finalize-south-korea-sofascore.mjs
  node scripts/fetch-south-korea-profiles.mjs
  node scripts/merge-south-korea-profiles.mjs
  npm run import:manual-teams -- --teams=South Korea

Or run: node scripts/run-sofascore-south-korea-fetch.mjs
`);

console.log(`Target file: ${outPath}\n`);
