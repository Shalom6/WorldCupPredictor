import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAllFixtures, getFixtureById } from './fixturesCatalog.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const mapPath = path.join(root, 'src', 'data', 'espn-fixture-map.json');

const summaryCache = new Map();
const CACHE_MS = 55_000;

function readMap() {
  if (!fs.existsSync(mapPath)) return { mappings: {} };
  return JSON.parse(fs.readFileSync(mapPath, 'utf8'));
}

function eventStatus(espnEvent) {
  const type = espnEvent?.competitions?.[0]?.status?.type;
  if (type?.completed) return 'finished';
  if (type?.state === 'in') return 'in_progress';
  return 'scheduled';
}

async function loadEspn() {
  return import('../scripts/lib/espn-world-cup.mjs');
}

async function cachedSummary(espnEventId, fetchMatchSummary) {
  const hit = summaryCache.get(espnEventId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const data = await fetchMatchSummary(espnEventId);
  summaryCache.set(espnEventId, { at: Date.now(), data });
  return data;
}

/**
 * @param {string | null} fixtureIdFilter
 * @returns {Promise<{ fixtures: Record<string, object>, polledAt: string }>}
 */
export async function fetchLiveScores(fixtureIdFilter = null) {
  const espn = await loadEspn();
  const { fetchScoreboard, fetchMatchSummary, matchEventsToFixtures, parseFinishedMatch } = espn;

  const catalog = getAllFixtures();
  let fixtures = [...(catalog.groupStage ?? []), ...(catalog.knockout ?? [])];
  if (fixtureIdFilter) {
    const one = getFixtureById(fixtureIdFilter);
    fixtures = one ? [one] : [];
  }

  const mapDoc = readMap();
  const events = await fetchScoreboard();
  const pairs = matchEventsToFixtures(events, fixtures);
  const out = {};
  const seen = new Set();

  for (const { fixture, espnEventId, espnEvent } of pairs) {
    seen.add(fixture.id);
    const comp = espnEvent.competitions?.[0];
    const homeComp = comp?.competitors?.find((c) => c.homeAway === 'home');
    const awayComp = comp?.competitors?.find((c) => c.homeAway === 'away');
    const status = eventStatus(espnEvent);

    const row = {
      status,
      statusDetail: comp?.status?.type?.description ?? null,
      homeScore: Number.isFinite(Number(homeComp?.score)) ? Number(homeComp.score) : null,
      awayScore: Number.isFinite(Number(awayComp?.score)) ? Number(awayComp.score) : null,
      live: status === 'in_progress',
      source: 'espn'
    };

    if (status === 'finished') {
      try {
        const summary = await cachedSummary(espnEventId, fetchMatchSummary);
        const parsed = parseFinishedMatch(summary, fixture);
        if (parsed) Object.assign(row, parsed);
      } catch {
        // keep scoreboard-only row
      }
    }

    out[fixture.id] = row;
    mapDoc.mappings = mapDoc.mappings ?? {};
    mapDoc.mappings[fixture.id] = {
      ...(mapDoc.mappings[fixture.id] ?? {}),
      espnEventId: String(espnEventId),
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      lastSeen: new Date().toISOString()
    };
  }

  for (const fixture of fixtures) {
    if (seen.has(fixture.id)) continue;
    if (fixture.status === 'finished' && fixture.homeScore != null) {
      out[fixture.id] = {
        status: 'finished',
        homeScore: fixture.homeScore,
        awayScore: fixture.awayScore,
        scorers: fixture.scorers,
        teamStats: fixture.teamStats,
        source: 'catalog'
      };
    }
  }

  return { fixtures: out, polledAt: new Date().toISOString() };
}
