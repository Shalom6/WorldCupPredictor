/**
 * Merge curated bundled JSON with BallDontLie API slices (free tier safe).
 */

export function normPlayerName(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function mapBdlPosition(pos) {
  const p = String(pos ?? '').toLowerCase();
  if (p.includes('goal')) return 'Goalkeeper';
  if (p.includes('forward') || p === 'f') return 'Attacker';
  if (p.includes('def')) return 'Defender';
  if (p.includes('mid')) return 'Midfielder';
  return 'Midfielder';
}

/** UCL record from API standings; keep bundled xG/shots/corners. */
export function mergeUclStats(bundledUcl, standingRow) {
  if (!standingRow) return { ...bundledUcl };

  const played = Number(standingRow.games_played) || bundledUcl?.played;
  const goalsFor = Number(standingRow.goals_for);
  const goalsAgainst = Number(standingRow.goals_against);

  return {
    ...bundledUcl,
    played,
    wins: Number(standingRow.wins) ?? bundledUcl?.wins,
    draws: Number(standingRow.draws) ?? bundledUcl?.draws,
    losses: Number(standingRow.losses) ?? bundledUcl?.losses,
    goalsFor: Number.isFinite(goalsFor) ? goalsFor : bundledUcl?.goalsFor,
    goalsAgainst: Number.isFinite(goalsAgainst) ? goalsAgainst : bundledUcl?.goalsAgainst
    // xgFor, xgAgainst, shotsPerMatch, etc. stay from bundled
  };
}

function bdlEntryToPlayer(entry) {
  const player = entry.player ?? {};
  const display = player.display_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim();
  return {
    key: normPlayerName(player.short_name || display),
    name: player.short_name || display,
    position: mapBdlPosition(entry.position),
    bdlId: player.id
  };
}

function namesMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a))) return true;
  const al = a.slice(-6);
  const bl = b.slice(-6);
  return al.length >= 4 && al === bl;
}

/**
 * Curated roster stays authoritative for starters, xgShare, minutes.
 * API updates positions where names match; adds at most a few new bench names.
 */
export function mergeRoster(curatedRoster, bdlRosterEntries, { maxExtraBench = 3 } = {}) {
  const base = (curatedRoster ?? []).map((p) => ({ ...p }));
  if (!bdlRosterEntries?.length) return base;

  const apiPlayers = bdlRosterEntries
    .filter((e) => e.is_active !== false)
    .map(bdlEntryToPlayer)
    .filter((p) => p.name && p.position !== 'Goalkeeper');

  let positionUpdates = 0;
  for (const player of base) {
    if (player.position === 'Goalkeeper') continue;
    const key = normPlayerName(player.name);
    const hit = apiPlayers.find((a) => namesMatch(key, a.key));
    if (hit && hit.position !== player.position) {
      player.position = hit.position;
      positionUpdates++;
    }
  }

  const baseKeys = new Set(base.map((p) => normPlayerName(p.name)));
  const extras = apiPlayers
    .filter((a) => !baseKeys.has(a.key) && ![...baseKeys].some((k) => namesMatch(k, a.key)))
    .filter((a) => a.position === 'Attacker' || a.position === 'Midfielder')
    .slice(0, maxExtraBench)
    .map((a) => ({
      name: a.name,
      position: a.position,
      likelyStarter: false,
      benchImpact: true,
      minutesFactor: 0.35,
      xgShare: 0.03
    }));

  const merged = [...base, ...extras];
  const sum = merged.filter((p) => (p.xgShare ?? 0) > 0).reduce((a, p) => a + p.xgShare, 0) || 1;
  return merged.map((p) =>
    (p.xgShare ?? 0) > 0 ? { ...p, xgShare: Math.round((p.xgShare / sum) * 1000) / 1000 } : p
  );
}

/** Full season2025_26 merge: bundled base + API overlays. */
export function mergeSeasonBundle({ bundledSeason, standingRow, bdlRosterEntries }) {
  const curated = bundledSeason?.roster ?? [];

  return {
    ...bundledSeason,
    label: bundledSeason?.label ?? '2025-26',
    ucl: mergeUclStats(bundledSeason?.ucl ?? {}, standingRow),
    league: bundledSeason?.league,
    formLast10: bundledSeason?.formLast10 ?? [],
    roster: mergeRoster(curated, bdlRosterEntries),
    importSource: 'bundled+balldontlie',
    lastImportedAt: new Date().toISOString(),
    lastMergedAt: new Date().toISOString(),
    mergeNotes: {
      uclFromApi: Boolean(standingRow),
      rosterBase: 'curated',
      formFromApi: false,
      statsFromApi: false
    }
  };
}
