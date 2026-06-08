import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, '..');
dotenv.config({ path: path.join(appRoot, '.env.local') });
dotenv.config({ path: path.join(appRoot, '.env') });

export const BDL_UCL_BASE = 'https://api.balldontlie.io/ucl/v1';
export const BDL_UCL_SEASON = 2025;

/** Known UCL team IDs (from BallDontLie standings) — fallback when /teams errors. */
export const BDL_KNOWN_TEAMS = {
  PSG: { id: 73, name: 'Paris Saint-Germain', short_name: 'PSG' },
  Arsenal: { id: 2, name: 'Arsenal', short_name: 'Arsenal' }
};

export function getBalldontlieApiKey() {
  return (
    process.env.BALLDONTLIE_API_KEY ||
    process.env.BDL_API_KEY ||
    process.env.BALDLONTLIE_KEY ||
    ''
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export class BalldontlieError extends Error {
  constructor(message, { status, tier } = {}) {
    super(message);
    this.status = status;
    this.tier = tier;
  }
}

export function isTierBlockedError(err) {
  return err?.status === 401 || /account tier|not have access/i.test(String(err?.message));
}

export function isRetryableError(err) {
  const s = err?.status;
  return s === 429 || s === 500 || s === 502 || s === 503 || s === 504;
}

function parseErrorBody(text) {
  try {
    const j = JSON.parse(text);
    return j.message ?? j.error ?? text.slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

/**
 * @param {string} pathSuffix e.g. "/teams"
 * @param {Record<string, string|number|boolean|(string|number)[]>} [params]
 */
export async function bdlGet(pathSuffix, params = {}, opts = {}) {
  const key = getBalldontlieApiKey();
  if (!key) throw new BalldontlieError('BALLDONTLIE_API_KEY is not set in .env.local');

  const delayMs = opts.delayMs ?? 1300;
  const retries = opts.retries ?? 3;
  const url = new URL(`${BDL_UCL_BASE}${pathSuffix}`);

  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(`${k}[]`, String(item));
    } else {
      url.searchParams.set(k, String(v));
    }
  }

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const wait = delayMs * 2 ** attempt;
      console.warn(`    retry ${attempt}/${retries} in ${wait}ms — ${pathSuffix}`);
      await sleep(wait);
    } else {
      await sleep(delayMs);
    }

    try {
      const res = await fetch(url, {
        headers: { Authorization: key, Accept: 'application/json' },
        cache: 'no-store'
      });

      if (!res.ok) {
        const text = await res.text();
        const detail = parseErrorBody(text);
        const err = new BalldontlieError(`BallDontLie ${res.status}: ${detail}`, { status: res.status });
        if (isRetryableError(err) && attempt < retries) {
          lastErr = err;
          continue;
        }
        throw err;
      }

      return res.json();
    } catch (e) {
      if (e instanceof BalldontlieError) {
        lastErr = e;
        if (isRetryableError(e) && attempt < retries) continue;
        throw e;
      }
      lastErr = e;
      if (attempt < retries) continue;
      throw e;
    }
  }

  throw lastErr;
}

/** Paginate cursor-based endpoints (skip if first page fails). */
export async function bdlGetAll(pathSuffix, params = {}, opts = {}) {
  const rows = [];
  let cursor = params.cursor;
  const maxPages = opts.maxPages ?? 20;

  for (let page = 0; page < maxPages; page++) {
    const json = await bdlGet(pathSuffix, { ...params, cursor, per_page: params.per_page ?? 100 }, opts);
    const batch = json?.data ?? [];
    rows.push(...batch);
    const next = json?.meta?.next_cursor;
    if (next == null || next === cursor || !batch.length) break;
    cursor = next;
  }

  return rows;
}

export async function getTeams(season = BDL_UCL_SEASON) {
  try {
    const json = await bdlGet('/teams', { season, per_page: 100 });
    return json?.data ?? [];
  } catch (err) {
    console.warn(`  ⚠ /teams failed (${err.message}) — will use standings / known IDs`);
    return [];
  }
}

export async function getStandings(season = BDL_UCL_SEASON) {
  const json = await bdlGet('/standings', { season });
  return json?.data ?? [];
}

export async function getRoster(teamId, season = BDL_UCL_SEASON) {
  const json = await bdlGet('/rosters', { team_id: teamId, season, per_page: 100 });
  return json?.data ?? [];
}

export async function getMatchesForTeam(teamId, season = BDL_UCL_SEASON) {
  return bdlGetAll('/matches', { team_ids: [teamId], seasons: [season], per_page: 100 });
}

export async function getTeamMatchStats(matchIds) {
  if (!matchIds?.length) return [];
  const out = [];
  for (let i = 0; i < matchIds.length; i += 20) {
    const ids = matchIds.slice(i, i + 20);
    const rows = await bdlGetAll('/team_match_stats', { match_ids: ids, per_page: 100 });
    out.push(...rows);
  }
  return out;
}

export async function getPlayerMatchStats(matchIds) {
  if (!matchIds?.length) return [];
  const out = [];
  for (let i = 0; i < matchIds.length; i += 10) {
    const ids = matchIds.slice(i, i + 10);
    const rows = await bdlGetAll('/player_match_stats', { match_ids: ids, per_page: 100 });
    out.push(...rows);
  }
  return out;
}

export function findTeam(teams, aliases = [], knownName = null) {
  const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const wants = aliases.map(norm);

  const fromList = teams.find((t) => {
    const hay = [t.name, t.short_name, t.abbreviation, t.location].map(norm).join(' ');
    return wants.some((w) => hay.includes(w) || w.includes(hay.slice(0, 6)));
  });
  if (fromList) return fromList;

  if (knownName && BDL_KNOWN_TEAMS[knownName]) {
    return BDL_KNOWN_TEAMS[knownName];
  }

  return null;
}

export function findStanding(standings, teamId) {
  return standings.find((s) => s.team?.id === teamId);
}

export function teamsFromStandings(standings) {
  return standings.map((s) => s.team).filter(Boolean);
}
