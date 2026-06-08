import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'data', 'mexico.json');

// Inlined for browser Runtime.evaluate (Sofascore blocks server-side fetch).
const browserFetchSource = fs.readFileSync(
  path.join(__dirname, 'sofascore-mexico-fetch.js'),
  'utf8'
);
const fnBody = browserFetchSource
  .replace(/^\/\*\*[\s\S]*?\*\/\s*/, '')
  .replace(/^export async function fetchMexicoFromSofascore/, 'async function fetchMexicoFromSofascore');

console.log(`
To import Mexico stats from Sofascore, run this in a browser console on https://www.sofascore.com :

(async () => {
${fnBody}
  const data = await fetchMexicoFromSofascore({ maxEvents: 22 });
  console.log(JSON.stringify(data));
  copy(data);
  return data;
})();

Then paste the JSON into: ${outPath}
`);

console.log('Alternatively, use the Cursor browser agent to run the fetch automatically.\n');
