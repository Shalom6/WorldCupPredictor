/** Curated 2025-26 squads — edit src/data/rosters-2025-26.json, then npm run sync:data */
import curatedRosters from './data/rosters-2025-26.json' with { type: 'json' };

function isAttacker(position) {
  const p = String(position ?? '').toLowerCase();
  return p.includes('attack') || p.includes('forward');
}

function isGoalkeeper(position) {
  const p = String(position ?? '').toLowerCase();
  return p.includes('goalkeeper') || p === 'gk' || p === 'g';
}

/** True if roster has enough outfield attackers for scorer/assist models. */
export function isHealthyRoster(roster = []) {
  const attackers = roster.filter((p) => isAttacker(p.position) && !isGoalkeeper(p.position));
  const topShare = Math.max(...roster.map((p) => p.xgShare ?? 0), 0);
  return attackers.length >= 3 && topShare >= 0.12;
}

export function getCuratedRoster(teamName) {
  return curatedRosters[teamName] ?? [];
}

/** Detect SofaScore-imported squads (international logs drive xgShare + prop weights). */
export function getRosterImportSource(teamName) {
  const roster = getCuratedRoster(teamName);
  if (!roster.length) return null;
  const withLogs = roster.filter((p) => p.propProfile || p.minutesFactor > 0.5).length;
  if (withLogs >= 12) return 'sofascore';
  return 'bundled-world-cup-2026';
}

export function resolveRoster(teamName, candidateRoster) {
  const curated = getCuratedRoster(teamName);
  if (!candidateRoster?.length) return curated;
  if (!isHealthyRoster(candidateRoster)) return curated;
  // Prefer curated squad size — full API dumps (30+ players) stay curated-only
  if (candidateRoster.length > curated.length + 8) return curated;
  return candidateRoster;
}
