import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, '..');
dotenv.config({ path: path.join(appRoot, '.env.local') });
dotenv.config({ path: path.join(appRoot, '.env') });
dotenv.config({ path: path.join(appRoot, '..', 'UCL-Prediction-App', '.env.local') });

export const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io';

/** International fixture league name keywords — club leagues excluded when filtering. */
export const INTERNATIONAL_LEAGUE_KEYWORDS = [
  'world cup',
  'qualif',
  'nations league',
  'friendly',
  'international',
  'euro',
  'copa america',
  'africa cup',
  'asian cup',
  'gold cup',
  'confederations'
];

export function getApiFootballKey() {
  return (
    process.env.API_FOOTBALL_KEY ||
    process.env.API_FOOTBALL_API_KEY ||
    process.env.APISPORTS_KEY ||
    ''
  );
}

export class ApiFootballError extends Error {
  constructor(message, { status, errors } = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let requestCount = 0;

export function getRequestCount() {
  return requestCount;
}

export function resetRequestCount() {
  requestCount = 0;
}

/**
 * @param {string} endpoint e.g. "/fixtures"
 * @param {Record<string, string|number>} params
 */
export async function apiFootballGet(endpoint, params = {}, opts = {}) {
  const key = getApiFootballKey();
  if (!key) {
    throw new ApiFootballError('API_FOOTBALL_KEY is not set in .env.local');
  }

  const delayMs = opts.delayMs ?? 350;
  const retries = opts.retries ?? 2;
  const url = new URL(`${API_FOOTBALL_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`);

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(delayMs * (attempt + 1));
    else await sleep(delayMs);

    const res = await fetch(url, {
      headers: {
        'x-apisports-key': key,
        Accept: 'application/json'
      }
    });

    requestCount++;

    const text = await res.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiFootballError(`Invalid JSON (${res.status}): ${text.slice(0, 200)}`, { status: res.status });
    }

    if (!res.ok) {
      lastErr = new ApiFootballError(payload?.message || `HTTP ${res.status}`, {
        status: res.status,
        errors: payload?.errors
      });
      if (res.status === 429 && attempt < retries) continue;
      throw lastErr;
    }

    if (payload?.errors && Object.keys(payload.errors).length) {
      const msg = Object.values(payload.errors).filter(Boolean).join('; ');
      if (/rate/i.test(msg) && attempt < retries) {
        lastErr = new ApiFootballError(msg, { status: 429, errors: payload.errors });
        continue;
      }
      throw new ApiFootballError(msg || 'API-Football error', { errors: payload.errors });
    }

    return payload;
  }

  throw lastErr ?? new ApiFootballError('API-Football request failed');
}

export function isInternationalFixture(fixture) {
  const leagueName = String(fixture?.league?.name ?? '').toLowerCase();
  const leagueType = String(fixture?.league?.type ?? '').toLowerCase();
  if (leagueType === 'cup' && leagueName.includes('world cup')) return true;
  return INTERNATIONAL_LEAGUE_KEYWORDS.some((kw) => leagueName.includes(kw));
}

export function cachePath(root, ...parts) {
  return path.join(root, 'src', 'data', 'api-cache', ...parts);
}

export function readCache(filePath, maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (raw?.fetchedAt && maxAgeMs > 0) {
      const age = Date.now() - Date.parse(raw.fetchedAt);
      if (age > maxAgeMs) return null;
    }
    return raw;
  } catch {
    return null;
  }
}

export function writeCache(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    JSON.stringify({ ...data, fetchedAt: new Date().toISOString() }, null, 2)
  );
}

export async function cachedGet(cacheFile, fetchFn, { force = false, maxAgeMs } = {}) {
  if (!force) {
    const hit = readCache(cacheFile, maxAgeMs);
    if (hit?.response !== undefined) return hit;
  }
  const response = await fetchFn();
  writeCache(cacheFile, { response });
  return { response, fetchedAt: new Date().toISOString() };
}
