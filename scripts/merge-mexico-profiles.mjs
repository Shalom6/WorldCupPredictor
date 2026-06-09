import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const profiles = JSON.parse(
  fs.readFileSync(path.join(root, 'data', 'mexico-profiles.json'), 'utf8')
);
const mexicoPath = path.join(root, 'data', 'mexico.json');
const data = JSON.parse(fs.readFileSync(mexicoPath, 'utf8'));
const byId = new Map(profiles.map((p) => [p.sofascoreId, p]));

for (const player of data.players) {
  const prof = byId.get(player.sofascoreId);
  if (!prof) continue;
  const { sofascoreId, ...profile } = prof;
  player.profile = { ...profile, source: 'sofascore' };
}

fs.writeFileSync(mexicoPath, JSON.stringify(data, null, 2));
console.log(`Merged ${data.players.filter((p) => p.profile).length} profiles into mexico.json`);
