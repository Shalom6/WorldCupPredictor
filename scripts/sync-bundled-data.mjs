/**
 * Sync curated 2025-26 rosters into src/data/*.json (no external API).
 *
 *   npm run sync:data
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'src', 'data');

const TEAM_FILES = ['psg.json', 'arsenal.json'];

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const rosters = loadJson(path.join(dataDir, 'rosters-2025-26.json'));
  const index = loadJson(path.join(dataDir, 'historical-index.json'));

  console.log('Syncing bundled team data (no API)…\n');
  console.log(`  Era: ${index.era}`);
  console.log(`  Blend: historical ${index.blendWeights.historical * 100}% · season ${index.blendWeights.season2025_26 * 100}% · form ${index.blendWeights.formLast10 * 100}%\n`);

  for (const file of TEAM_FILES) {
    const targetPath = path.join(dataDir, file);
    const bundle = loadJson(targetPath);
    const roster = rosters[bundle.name];

    if (!roster?.length) {
      console.warn(`  ⚠ No curated roster for ${bundle.name} in rosters-2025-26.json`);
      continue;
    }

    const updated = {
      ...bundle,
      season2025_26: {
        ...bundle.season2025_26,
        label: '2025-26',
        roster,
        importSource: 'bundled-curated-2025-26',
        lastSyncedAt: new Date().toISOString()
      }
    };

    delete updated.season2025_26.importApiSeason;
    delete updated.season2025_26.importApiSeasonLabel;

    fs.writeFileSync(targetPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');

    const u = updated.season2025_26.ucl ?? {};
    const attackers = roster.filter((p) => /attack/i.test(p.position ?? '')).length;
    console.log(
      `  ✓ ${bundle.name}: UCL ${u.played ?? '?'}gp ${u.goalsFor ?? '?'}-${u.goalsAgainst ?? '?'}, roster ${roster.length} (${attackers} attackers)`
    );
  }

  console.log('\nDone. Edit src/data/rosters-2025-26.json or team JSON files, then run npm run sync:data again.');
  console.log('Restart dev server: npm run dev');
}

main();
