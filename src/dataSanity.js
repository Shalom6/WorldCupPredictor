/** @returns {boolean} */
export function isGoalkeeper(player) {
  const pos = String(player?.position ?? '').toLowerCase();
  return pos.includes('goalkeeper') || pos === 'gk' || pos === 'g';
}

/** Keep outfield players for scoring models; prefer attackers/mids with higher xG share. */
export function sanitizeRoster(roster = []) {
  const outfield = roster.filter((p) => !isGoalkeeper(p));
  const list = outfield.length ? outfield : roster;
  const totalShare = list.reduce((s, p) => s + (p.xgShare ?? 0), 0);
  if (totalShare > 0) return list;
  return list.map((p, i) => ({
    ...p,
    xgShare: i === 0 ? 0.2 : i === 1 ? 0.16 : i === 2 ? 0.14 : 0.05
  }));
}

export function sanitizeUclSeason(ucl = {}, league = {}) {
  const played = Math.max(Number(ucl.played) || 0, 1);
  let goalsFor = Number(ucl.goalsFor);
  let goalsAgainst = Number(ucl.goalsAgainst);
  const xgFor = Number(ucl.xgFor);
  const xgAgainst = Number(ucl.xgAgainst);

  const leaguePlayed = Math.max(Number(league.played) || 0, 1);
  const leagueGfPer = (Number(league.goalsFor) || 0) / leaguePlayed;
  const leagueGaPer = (Number(league.goalsAgainst) || 0) / leaguePlayed;

  if (!Number.isFinite(goalsFor) || goalsFor < 1) {
    if (Number.isFinite(xgFor) && xgFor > 1) goalsFor = Math.round(xgFor * 1.05);
    else if (leagueGfPer > 0) goalsFor = Math.round(leagueGfPer * played * 0.82);
  }
  if (!Number.isFinite(goalsAgainst) || goalsAgainst < 0) {
    if (Number.isFinite(xgAgainst) && xgAgainst > 0) goalsAgainst = Math.round(xgAgainst * 1.05);
    else if (leagueGaPer > 0) goalsAgainst = Math.round(leagueGaPer * played * 0.88);
  }

  return {
    ...ucl,
    played,
    goalsFor: Math.max(goalsFor, 0),
    goalsAgainst: Math.max(goalsAgainst, 0),
    xgFor: Number.isFinite(xgFor) && xgFor > 0 ? xgFor : goalsFor * 0.95,
    xgAgainst: Number.isFinite(xgAgainst) && xgAgainst > 0 ? xgAgainst : goalsAgainst * 0.95
  };
}
