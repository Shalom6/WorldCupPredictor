/**
 * Parse ESPN match summary rosters + key events into per-player game log entries.
 */
import { normTeam, teamMatches } from './espn-world-cup.mjs';

const MATCH_LENGTH = 90;

export function normPlayerName(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function nameTokens(name) {
  return normPlayerName(name).split(/\s+/).filter(Boolean);
}

function tokenSortKey(name) {
  return nameTokens(name).sort().join(' ');
}

function tokenSimilarity(a, b) {
  const ta = tokenSortKey(a);
  const tb = tokenSortKey(b);
  if (ta === tb) return 1;
  const strip = (s) => s.replace(/-/g, '');
  if (strip(ta) === strip(tb)) return 0.95;

  const setA = new Set(nameTokens(a));
  const setB = new Set(nameTokens(b));
  const inter = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  const jaccard = union ? inter / union : 0;

  if (inter >= 2 && jaccard >= 0.5) return jaccard;
  if (inter >= 1 && setA.size <= 2 && setB.size <= 2) return 0.6;

  // Same last token, first token edit distance ≤ 2 (Siphephelo / Sphephelo)
  const lastA = nameTokens(a).at(-1);
  const lastB = nameTokens(b).at(-1);
  if (lastA && lastA === lastB) {
    const firstA = nameTokens(a)[0];
    const firstB = nameTokens(b)[0];
    if (firstA && firstB && levenshtein(firstA, firstB) <= 2) return 0.85;
  }
  return 0;
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Match ESPN display name to a squad player record. */
export function findSquadPlayer(players, espnName) {
  const exact = (players ?? []).find((p) => normPlayerName(p.name) === normPlayerName(espnName));
  if (exact) return exact;

  let best = null;
  let bestScore = 0;
  for (const p of players ?? []) {
    const score = tokenSimilarity(p.name, espnName);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

/** Parse "67'", "90'+2'" → integer minutes. */
export function parseClockMinutes(displayValue) {
  const s = String(displayValue ?? '').trim();
  if (!s) return null;
  const base = Number.parseInt(s, 10);
  if (!Number.isFinite(base)) return null;
  const extra = s.match(/\+(\d+)/);
  return base + (extra ? Number.parseInt(extra[1], 10) : 0);
}

function statValue(stats, name) {
  const row = (stats ?? []).find((s) => s.name === name);
  if (!row) return 0;
  const n = Number(row.value);
  return Number.isFinite(n) ? n : 0;
}

function buildEventMaps(keyEvents) {
  const subIn = new Map();
  const subOut = new Map();
  const redCard = new Map();

  for (const ev of keyEvents ?? []) {
    const type = ev.type?.type ?? ev.type?.text ?? '';
    const minute = parseClockMinutes(ev.clock?.displayValue);
    if (minute == null) continue;

    if (type === 'substitution') {
      const on = ev.participants?.[0]?.athlete?.displayName;
      const off = ev.participants?.[1]?.athlete?.displayName;
      if (on) subIn.set(normPlayerName(on), minute);
      if (off) subOut.set(normPlayerName(off), minute);
    }
    if (type === 'red-card') {
      const player = ev.participants?.[0]?.athlete?.displayName;
      if (player) redCard.set(normPlayerName(player), minute);
    }
  }

  return { subIn, subOut, redCard };
}

export function computeMinutes({ starter, subbedIn, subbedOut, displayName }, maps) {
  const key = normPlayerName(displayName);
  const red = maps.redCard.get(key);
  if (red != null) return red;

  const out = maps.subOut.get(key);
  if (out != null) return out;

  const inn = maps.subIn.get(key);
  if (inn != null || subbedIn) {
    const start = inn ?? 0;
    return Math.max(0, MATCH_LENGTH - start);
  }

  if (starter && !subbedOut) return MATCH_LENGTH;
  return MATCH_LENGTH;
}

function parseRosterRow(entry, maps) {
  const appearances = statValue(entry.stats, 'appearances');
  if (appearances < 1) return null;

  const goals = statValue(entry.stats, 'totalGoals');
  const assists = statValue(entry.stats, 'goalAssists');
  const shots = statValue(entry.stats, 'totalShots');
  const shotsOnTarget = statValue(entry.stats, 'shotsOnTarget');
  const fouls = statValue(entry.stats, 'foulsCommitted');
  const yellow = statValue(entry.stats, 'yellowCards');
  const red = statValue(entry.stats, 'redCards');
  const saves = statValue(entry.stats, 'saves');

  const minutes = computeMinutes(
    {
      starter: entry.starter,
      subbedIn: entry.subbedIn,
      subbedOut: entry.subbedOut,
      displayName: entry.athlete?.displayName
    },
    maps
  );

  return {
    espnName: entry.athlete?.displayName,
    minutes,
    goals,
    assists,
    shots,
    shotsOnTarget,
    fouls,
    cards: yellow + red,
    ...(saves > 0 ? { saves } : {})
  };
}

function fixtureDateIso(fixture, summary) {
  const wall = summary?.keyEvents?.[0]?.wallclock;
  if (wall) return wall.slice(0, 10);
  const raw = fixture?.date ?? '';
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function teamMatchMeta(fixture, summary, teamName, isHome) {
  const comp = summary.header?.competitions?.[0];
  const homeComp = comp?.competitors?.find((c) => c.homeAway === 'home');
  const awayComp = comp?.competitors?.find((c) => c.homeAway === 'away');
  const homeScore = Number(homeComp?.score);
  const awayScore = Number(awayComp?.score);
  const gf = isHome ? homeScore : awayScore;
  const ga = isHome ? awayScore : homeScore;
  const opponent = isHome ? fixture.awayTeam : fixture.homeTeam;
  const date = fixtureDateIso(fixture, summary);

  let result = 'D';
  if (gf > ga) result = 'W';
  else if (gf < ga) result = 'L';

  return {
    date,
    opponent,
    competition: `FIFA World Cup, Group ${fixture.group}`,
    result,
    goalsFor: gf,
    goalsAgainst: ga,
    venue: isHome ? 'home' : 'away'
  };
}

function baseGameEntry(teamMatch, patch) {
  return {
    date: teamMatch.date,
    opponent: teamMatch.opponent,
    competition: teamMatch.competition,
    result: teamMatch.result,
    venue: teamMatch.venue,
    minutes: patch.minutes,
    goals: patch.goals ?? 0,
    assists: patch.assists ?? 0,
    shots: patch.shots ?? 0,
    shotsOnTarget: patch.shotsOnTarget ?? 0,
    passes: patch.passes ?? 0,
    cards: patch.cards ?? 0,
    fouls: patch.fouls ?? 0,
    ...(patch.saves != null ? { saves: patch.saves } : {})
  };
}

function stripMatchFromLog(log, date, opponent) {
  return (log ?? []).filter((g) => g.date !== date || g.opponent !== opponent);
}

function prependUnique(results, entry) {
  const filtered = (results ?? []).filter(
    (r) => r.date !== entry.date || r.opponent !== entry.opponent
  );
  return [entry, ...filtered].slice(0, 22);
}

function entriesEqual(a, b) {
  if (!a || !b) return false;
  const keys = ['minutes', 'goals', 'assists', 'shots', 'shotsOnTarget', 'fouls', 'cards', 'saves'];
  return keys.every((k) => (a[k] ?? 0) === (b[k] ?? 0));
}

/**
 * Patch a team's raw import with ESPN player stats for one finished match.
 * @returns {{ patched: number, updated: number, unmatched: string[], teamMatch }}
 */
export function patchTeamRawFromEspn(raw, { fixture, summary, teamName, isHome }) {
  const rosterSide = (summary.rosters ?? []).find((r) =>
    isHome ? r.homeAway === 'home' : r.homeAway === 'away'
  );
  if (!rosterSide) {
    throw new Error(`No ESPN roster for ${teamName}`);
  }

  const maps = buildEventMaps(summary.keyEvents);
  const teamMatch = teamMatchMeta(fixture, summary, teamName, isHome);
  const unmatched = [];
  let patched = 0;
  let updated = 0;

  for (const entry of rosterSide.roster ?? []) {
    const row = parseRosterRow(entry, maps);
    if (!row) continue;

    const player = findSquadPlayer(raw.players, row.espnName);
    if (!player) {
      unmatched.push(row.espnName);
      continue;
    }

    const existing = (player.gameLog ?? []).find(
      (g) => g.date === teamMatch.date && g.opponent === teamMatch.opponent
    );
    const nextEntry = baseGameEntry(teamMatch, row);

    if (existing && entriesEqual(existing, nextEntry)) {
      patched++;
      continue;
    }

    player.gameLog = stripMatchFromLog(player.gameLog, teamMatch.date, teamMatch.opponent);
    player.gameLog = [nextEntry, ...player.gameLog];
    patched++;
    updated++;
  }

  if (updated > 0) {
    raw.importedAt = new Date().toISOString();
    raw.teamMatchResults = prependUnique(raw.teamMatchResults, teamMatch);
    raw.eventsProcessed = raw.teamMatchResults.length;
    raw.eventDates = raw.teamMatchResults.map((m) => m.date);
  }

  return { patched, updated, unmatched, teamMatch };
}

export function rosterSideForTeam(summary, fixture, teamName) {
  return (summary.rosters ?? []).find((r) => teamMatches(teamName, r.team?.displayName));
}
