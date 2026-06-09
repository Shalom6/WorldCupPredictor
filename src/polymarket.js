import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, '..');
dotenv.config({ path: path.join(appRoot, '.env.local') });
dotenv.config({ path: path.join(appRoot, '.env') });
dotenv.config({ path: path.join(appRoot, '..', '.env.local') });

const DATA_API_BASE = 'https://api.polymarketdata.co/v1';
const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

const GAMMA_CACHE_MS = 90_000;
const EVENT_CACHE_MS = 60_000;
const DATA_API_BACKOFF_MS = 15 * 60_000;

const oddsCache = new Map();
const gammaEventIdCache = new Map();
let dataApiBlockedUntil = 0;

function readCache(key) {
  const entry = oddsCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return { ...entry.data, fromCache: true };
}

function writeCache(key, data, ttlMs) {
  oddsCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

function fixturePairKey(homeTeam, awayTeam) {
  return `${homeTeam}|${awayTeam}`;
}

function shouldUseDataApi() {
  return process.env.POLYMARKET_USE_DATA_API === '1' && Boolean(getPolymarketApiKey());
}

export function getPolymarketApiKey() {
  return (
    process.env.POLYMARKET_DATA_API_KEY ||
    process.env.UCL_prediction_api ||
    process.env.UCL_PREDICTION_API ||
    process.env.POLYMARKET_API_KEY ||
    ''
  );
}

function extractMarketsList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.markets)) return payload.markets;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function marketText(m) {
  return [
    m?.question,
    m?.title,
    m?.name,
    m?.description,
    m?.slug,
    m?.eventTitle,
    m?.event?.title,
    m?.groupItemTitle
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function matchTeam(text, team) {
  const t = String(team || '').toLowerCase();
  const n = String(text || '').toLowerCase();
  if (!t || !n) return false;
  if (n.includes(t)) return true;
  const aliases = {
    usa: ['usa', 'united states', 'usmnt'],
    'south korea': ['korea', 'korea republic', 'republic of korea'],
    'dr congo': ['congo dr', 'democratic republic', 'drc', 'congo dr'],
    'cape verde': ['cabo verde'],
    curaçao: ['curacao'],
    türkiye: ['turkey', 'turkiye'],
    "côte d'ivoire": ['ivory coast', 'cote d', "côte d'ivoire"],
    iran: ['ir iran', 'islamic republic of iran'],
    czechia: ['czechia', 'czech republic'],
    'bosnia and herzegovina': ['bosnia', 'bosnia-herzegovina', 'bosnia herzegovina']
  };
  const key = t.toLowerCase();
  return (aliases[key] || [t]).some((a) => n.includes(a));
}

/** Names Polymarket uses in event titles — often differ from our fixture labels. */
function polymarketSearchNames(team) {
  const byTeam = {
    'South Korea': ['Korea Republic', 'South Korea'],
    USA: ['United States', 'USA'],
    "Côte d'Ivoire": ['Ivory Coast', "Côte d'Ivoire"],
    'DR Congo': ['Congo DR', 'DR Congo'],
    Türkiye: ['Turkey', 'Türkiye'],
    Curaçao: ['Curaçao', 'Curacao'],
    'Bosnia and Herzegovina': ['Bosnia-Herzegovina', 'Bosnia and Herzegovina']
  };
  const names = byTeam[team] ?? [team];
  return [...new Set([team, ...names])];
}

function buildGammaSearchQueries(homeTeam, awayTeam) {
  const homes = polymarketSearchNames(homeTeam);
  const aways = polymarketSearchNames(awayTeam);
  const queries = new Set();

  for (const h of homes) {
    for (const a of aways) {
      queries.add(`${h} ${a} World Cup 2026`);
      queries.add(`${h} vs ${a} FIFA World Cup`);
      queries.add(`${h} vs. ${a} FIFA World Cup`);
      queries.add(`World Cup 2026 ${h} ${a}`);
      queries.add(`${h} vs. ${a}`);
    }
  }

  return [...queries];
}

function toPct(price) {
  const n = Number(price);
  if (!Number.isFinite(n)) return null;
  return Math.round((n <= 1 ? n * 100 : n) * 10) / 10;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function marketOutcomes(market) {
  if (Array.isArray(market?.outcomes) && market.outcomes.every((o) => typeof o === 'object')) {
    return market.outcomes.map((o) => ({
      name: o.name || o.title || o.outcome || 'Outcome',
      probabilityPct: toPct(o.price ?? o.probability ?? o.prob ?? o.lastPrice)
    }));
  }

  const names = parseJsonArray(market?.outcomes);
  const prices = parseJsonArray(market?.outcomePrices ?? market?.prices);
  if (names.length) {
    return names.map((name, i) => ({
      name: String(name),
      probabilityPct: toPct(prices[i])
    }));
  }

  if (Array.isArray(market?.tokens)) {
    return market.tokens.map((t) => ({
      name: t.outcome || t.name || t.side || 'Outcome',
      probabilityPct: toPct(t.price ?? t.lastPrice ?? t.probability)
    }));
  }

  const yes = toPct(market?.yesPrice ?? market?.yes_price ?? market?.bestAsk);
  const no = toPct(market?.noPrice ?? market?.no_price ?? market?.bestBid);
  if (yes != null) {
    return [
      { name: 'Yes', probabilityPct: yes },
      { name: 'No', probabilityPct: no ?? Math.max(0, 100 - yes) }
    ];
  }

  return [];
}

function normalizeImplied(outcomes) {
  const cleaned = outcomes.filter((o) => Number.isFinite(o.probabilityPct) && o.probabilityPct > 0);
  const sum = cleaned.reduce((s, o) => s + o.probabilityPct, 0);
  if (sum <= 0) return cleaned;
  return cleaned.map((o) => ({
    name: o.name,
    probabilityPct: Math.round((o.probabilityPct / sum) * 1000) / 10
  }));
}

function yesPriceFromMarket(market) {
  const outcomes = parseGammaMarket(market);
  const yes = outcomes.find((o) => String(o.name).toLowerCase() === 'yes');
  return yes?.probabilityPct ?? null;
}

/**
 * Polymarket often lists finals as three Yes/No markets (home win, draw, away win).
 */
function parseSplitMatchMarkets(event, homeTeam, awayTeam) {
  const markets = (event?.markets || []).filter((m) => !m?.closed);
  let homeWin = null;
  let awayWin = null;
  let draw = null;
  let homeQuestion = null;
  let awayQuestion = null;
  let drawQuestion = null;

  for (const market of markets) {
    const q = market.question || '';
    const ql = q.toLowerCase();
    const yesPct = yesPriceFromMarket(market);
    if (yesPct == null || !isLiveGammaPrices(parseGammaMarket(market))) continue;

    if (ql.includes('draw') || ql.includes('end in a')) {
      draw = yesPct;
      drawQuestion = q;
      continue;
    }
    if (matchTeam(q, homeTeam) && (ql.includes(' win') || ql.includes(' beat'))) {
      homeWin = yesPct;
      homeQuestion = q;
      continue;
    }
    if (matchTeam(q, awayTeam) && (ql.includes(' win') || ql.includes(' beat'))) {
      awayWin = yesPct;
      awayQuestion = q;
    }
  }

  if (homeWin == null || awayWin == null || draw == null) return null;

  const outcomes = normalizeImplied([
    { name: homeTeam, probabilityPct: homeWin },
    { name: 'Draw', probabilityPct: draw },
    { name: awayTeam, probabilityPct: awayWin }
  ]);

  const implied = map1x2(outcomes, homeTeam, awayTeam);
  if (!implied) return null;

  return {
    found: true,
    implied,
    source: 'polymarket.com (Gamma)',
    marketType: 'match_split',
    fetchedAt: new Date().toISOString(),
    homeTeam,
    awayTeam,
    eventTitle: event.title,
    marketQuestion: event.title || `${homeQuestion} · ${drawQuestion} · ${awayQuestion}`,
    outcomes,
    volume: event.volume ?? null
  };
}

function map1x2(outcomes, homeTeam, awayTeam) {
  let homeWin = null;
  let draw = null;
  let awayWin = null;

  for (const o of outcomes) {
    const name = String(o.name || '').toLowerCase();
    if (name.includes('draw') || name === 'tie') {
      draw = o.probabilityPct;
      continue;
    }
    if (matchTeam(name, homeTeam)) homeWin = o.probabilityPct;
    if (matchTeam(name, awayTeam)) awayWin = o.probabilityPct;
  }

  if (homeWin == null || awayWin == null) return null;
  return {
    homeWin,
    draw: draw ?? Math.max(0, Math.round((100 - homeWin - awayWin) * 10) / 10),
    awayWin
  };
}

function isMatchMarket(text, homeTeam, awayTeam) {
  const hasTeams = matchTeam(text, homeTeam) && matchTeam(text, awayTeam);
  const isWinner =
    text.includes('win') ||
    text.includes('winner') ||
    text.includes('advance') ||
    text.includes('champion') ||
    text.includes('final');
  const isWc =
    text.includes('world cup') || text.includes('fifa') || text.includes('wc 2026');
  return hasTeams && (isWinner || isWc);
}

async function fetchDataApiMarkets(apiKey, limit = 500) {
  const url = `${DATA_API_BASE}/markets?limit=${limit}`;
  const res = await fetch(url, {
    headers: { 'x-api-key': apiKey, Accept: 'application/json' },
    cache: 'no-store'
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Polymarket Data API error (${res.status}): ${text.slice(0, 400)}`);
  }

  return res.json();
}

function parseGammaMarket(m) {
  const outcomes = parseJsonArray(m?.outcomes).map(String);
  const prices = parseJsonArray(m?.outcomePrices).map((p) => toPct(p));
  if (!outcomes.length || prices.length !== outcomes.length) return [];
  return outcomes.map((name, i) => ({ name, probabilityPct: prices[i] }));
}

function isLiveGammaPrices(outcomes) {
  const vals = outcomes.map((o) => o.probabilityPct).filter(Number.isFinite);
  if (vals.length < 2) return false;
  const sum = vals.reduce((s, v) => s + v, 0);
  if (sum < 5 || sum > 105) return false;
  return vals.some((v) => v > 1 && v < 99);
}

function scoreGammaEvent(event, homeTeam, awayTeam) {
  const title = (event?.title || '').toLowerCase();
  if (event?.closed) return -1;

  const hasBoth = matchTeam(title, homeTeam) && matchTeam(title, awayTeam);
  if (!hasBoth) return -1;

  let score = Number(event?.volume ?? 0);

  if (title.includes('advance') || title.includes('semifinal') || title.includes('quarter')) {
    score *= 0.001;
  }
  if (title.includes('winner') && !title.includes(' vs')) {
    score *= 0.001;
  }
  if (title.includes('pool ') && !title.includes('fifwc') && !title.includes('world cup')) {
    score *= 0.001;
  }

  if (title.includes(' vs') || title.includes(' vs.')) score += 100_000;
  if (parseSplitMatchMarkets(event, homeTeam, awayTeam)) score += 500_000;

  return score;
}

async function gammaSearch(query) {
  const url = `${GAMMA_API_BASE}/public-search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  const payload = await res.json();
  return Array.isArray(payload?.events) ? payload.events : [];
}

async function fetchGammaEventById(eventId) {
  const cacheKey = `gamma-event:${eventId}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${GAMMA_API_BASE}/events/${eventId}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const event = await res.json();
  writeCache(cacheKey, event, EVENT_CACHE_MS);
  return event;
}

function rememberGammaEvent(homeTeam, awayTeam, eventId) {
  if (eventId) gammaEventIdCache.set(fixturePairKey(homeTeam, awayTeam), eventId);
}

function splitFromGammaEvent(event, homeTeam, awayTeam) {
  if (!event || event.closed) return null;
  const split = parseSplitMatchMarkets(event, homeTeam, awayTeam);
  if (split) {
    rememberGammaEvent(homeTeam, awayTeam, event.id);
    return split;
  }
  return null;
}

async function fetchGammaMatchOdds(homeTeam, awayTeam) {
  const pairKey = fixturePairKey(homeTeam, awayTeam);
  const knownEventId = gammaEventIdCache.get(pairKey);

  if (knownEventId) {
    const event = await fetchGammaEventById(knownEventId);
    const split = splitFromGammaEvent(event, homeTeam, awayTeam);
    if (split) return split;
  }

  const queries = buildGammaSearchQueries(homeTeam, awayTeam);

  const events = [];
  for (const q of queries) {
    const batch = await gammaSearch(q);
    for (const e of batch) {
      if (!events.some((x) => x.id === e.id)) events.push(e);
    }
  }

  events.sort((a, b) => scoreGammaEvent(b, homeTeam, awayTeam) - scoreGammaEvent(a, homeTeam, awayTeam));

  let closedMatchEvent = null;

  for (const event of events) {
    const title = (event?.title || '').toLowerCase();
    const hasBoth = matchTeam(title, homeTeam) && matchTeam(title, awayTeam);
    const isHeadToHead = title.includes(' vs') || title.includes(' vs.');
    if (hasBoth && isHeadToHead && event?.closed && !closedMatchEvent) {
      closedMatchEvent = event;
    }

    if (scoreGammaEvent(event, homeTeam, awayTeam) < 0) continue;

    const split = splitFromGammaEvent(event, homeTeam, awayTeam);
    if (split) return split;

    for (const market of event.markets || []) {
      if (market?.closed) continue;
      const outcomes = normalizeImplied(parseGammaMarket(market));
      if (!isLiveGammaPrices(outcomes)) continue;

      const implied = map1x2(outcomes, homeTeam, awayTeam);
      if (!implied) continue;

      rememberGammaEvent(homeTeam, awayTeam, event.id);

      return {
        found: true,
        implied,
        source: 'polymarket.com (Gamma)',
        marketType: 'match',
        fetchedAt: new Date().toISOString(),
        homeTeam,
        awayTeam,
        eventTitle: event.title,
        marketQuestion: market.question || market.groupItemTitle || event.title,
        outcomes,
        volume: market.volume ?? event.volume ?? null
      };
    }
  }

  if (closedMatchEvent) {
    return {
      found: false,
      implied: null,
      marketClosed: true,
      source: 'polymarket.com (Gamma)',
      eventTitle: closedMatchEvent.title,
      message: `Polymarket market closed for ${homeTeam} vs ${awayTeam}`
    };
  }

  return fetchGammaTournamentWinnerOdds(homeTeam, awayTeam);
}

async function fetchGammaTournamentWinnerOdds(homeTeam, awayTeam) {
  const events = await gammaSearch('FIFA World Cup 2026 Winner');
  const event = events.find((e) => /world cup.*winner|fifa.*winner/i.test(e.title || ''));
  if (!event?.markets?.length) return null;

  let homePct = null;
  let awayPct = null;
  let homeQuestion = null;
  let awayQuestion = null;

  for (const market of event.markets) {
    if (market?.closed) continue;
    const q = market.question || '';
    const outcomes = parseGammaMarket(market);
    if (outcomes.length !== 2) continue;
    const yes = outcomes.find((o) => o.name.toLowerCase() === 'yes');
    if (!yes?.probabilityPct || !isLiveGammaPrices(outcomes)) continue;

    if (matchTeam(q, homeTeam)) {
      homePct = yes.probabilityPct;
      homeQuestion = q;
    }
    if (matchTeam(q, awayTeam)) {
      awayPct = yes.probabilityPct;
      awayQuestion = q;
    }
  }

  if (homePct == null || awayPct == null) return null;

  const sum = homePct + awayPct;
  const homeWin = Math.round((homePct / sum) * 1000) / 10;
  const awayWin = Math.round((awayPct / sum) * 1000) / 10;
  const draw = Math.max(0, Math.round((100 - homeWin - awayWin) * 10) / 10);

  return {
    found: true,
    implied: { homeWin, draw, awayWin },
    source: 'polymarket.com (Gamma)',
    marketType: 'tournament_winner',
    fetchedAt: new Date().toISOString(),
    homeTeam,
    awayTeam,
    eventTitle: event.title,
    marketQuestion: `Relative strength from: ${homeQuestion} vs ${awayQuestion}`,
    outcomes: [
      { name: homeTeam, probabilityPct: homeWin },
      { name: 'Draw', probabilityPct: draw },
      { name: awayTeam, probabilityPct: awayWin }
    ],
    volume: event.volume ?? null,
    note: 'No live match 1X2 market found; using normalized World Cup winner odds as fallback'
  };
}

/**
 * Fetch live 1X2 implied probabilities for a fixture from Polymarket.
 */
async function fetchDataApiOdds(apiKey, homeTeam, awayTeam) {
  const payload = await fetchDataApiMarkets(apiKey);
  const markets = extractMarketsList(payload);
  const matchCandidates = markets.filter((m) => isMatchMarket(marketText(m), homeTeam, awayTeam));
  matchCandidates.sort(
    (a, b) => Number(b?.volume ?? b?.volumeNum ?? 0) - Number(a?.volume ?? a?.volumeNum ?? 0)
  );

  const matchMarket = matchCandidates[0] || null;
  const matchOutcomes = matchMarket ? normalizeImplied(marketOutcomes(matchMarket)) : [];
  const implied = matchOutcomes.length ? map1x2(matchOutcomes, homeTeam, awayTeam) : null;

  if (!matchMarket || !implied) {
    return {
      found: false,
      implied: null,
      source: 'polymarketdata.co',
      message: `No match market in Data API for ${homeTeam} vs ${awayTeam} (${markets.length} scanned)`
    };
  }

  return {
    found: true,
    implied,
    source: 'polymarketdata.co',
    marketType: 'match',
    fetchedAt: new Date().toISOString(),
    homeTeam,
    awayTeam,
    eventTitle: matchMarket?.eventTitle || matchMarket?.event?.title || `${homeTeam} vs ${awayTeam}`,
    marketQuestion: matchMarket?.question || matchMarket?.title || matchMarket?.name || null,
    outcomes: matchOutcomes,
    volume: matchMarket?.volume ?? matchMarket?.volumeNum ?? null
  };
}

/**
 * Fetch live Polymarket odds.
 * @param {string} homeTeam
 * @param {string} awayTeam
 * @param {{ gammaOnly?: boolean, skipCache?: boolean }} [options]
 *   gammaOnly — default true; uses public Gamma API (final 1X2). Set false + POLYMARKET_USE_DATA_API=1 for Data API.
 */
export async function fetchPolymarketOdds(homeTeam, awayTeam, options = {}) {
  const gammaOnly = options.gammaOnly !== false;
  const cacheKey = `${fixturePairKey(homeTeam, awayTeam)}|${gammaOnly ? 'gamma' : 'auto'}`;

  if (!options.skipCache) {
    const cached = readCache(cacheKey);
    if (cached) return cached;
  }

  if (!gammaOnly && shouldUseDataApi() && Date.now() > dataApiBlockedUntil) {
    try {
      const dataResult = await fetchDataApiOdds(getPolymarketApiKey(), homeTeam, awayTeam);
      if (dataResult.found) {
        writeCache(cacheKey, dataResult, 5 * 60_000);
        return dataResult;
      }
    } catch (err) {
      const msg = String(err?.message ?? err);
      if (msg.includes('429') || msg.includes('Rate limit')) {
        dataApiBlockedUntil = Date.now() + DATA_API_BACKOFF_MS;
      }
    }
  }

  try {
    const gamma = await fetchGammaMatchOdds(homeTeam, awayTeam);
    if (gamma?.found) {
      writeCache(cacheKey, gamma, GAMMA_CACHE_MS);
      return gamma;
    }
  } catch (err) {
    return {
      found: false,
      implied: null,
      source: 'polymarket.com (Gamma)',
      error: String(err?.message ?? err)
    };
  }

  return {
    found: false,
    implied: null,
    source: 'polymarket.com (Gamma)',
    message: `No live Polymarket odds for ${homeTeam} vs ${awayTeam}`
  };
}
