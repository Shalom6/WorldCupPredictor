import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(root, 'data', 'south-korea.json');
const profilesPath = path.join(root, 'data', 'south-korea-profiles.json');

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
const byId = new Map(profiles.map((p) => [p.sofascoreId, p]));

for (const player of data.players) {
  const prof = byId.get(player.sofascoreId);
  if (!prof) continue;
  const { sofascoreId, ...profile } = prof;
  player.profile = { ...profile, source: 'sofascore' };
}

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
console.log(`Merged profiles into ${dataPath}`);
