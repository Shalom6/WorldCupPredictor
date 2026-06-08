/**
 * Transform API-Football fixtures + player stats into world-cup-players.json records.
 */
import historicalIndex from './data/historical-index.json' with { type: 'json' };

const GROUPS = historicalIndex.groups ?? {};
const TEAM_TO_GROUP = {};
for (const [g, teams] of Object.entries(GROUPS)) {
  for (const t of teams) TEAM_TO_GROUP[t] = g;
}

/** App team name → API-Football search term */
export const TEAM_SEARCH_ALIASES = {
  USA: 'USA',
  'South Korea': 'Korea Republic',
  Türkiye: 'Turkey',
  Czechia: 'Czech Republic',
  'DR Congo': 'Congo DR',
  'Cape Verde': 'Cabo Verde',
  Iran: 'Iran',
  Curaçao: 'Curacao',
  "Côte d'Ivoire": 'Ivory Coast',
  Egypt: 'Egypt',
  'Bosnia and Herzegovina': 'Bosnia',
  'New Zealand': 'New Zealand',
  Uzbekistan: 'Uzbekistan'
};

export function searchTermForTeam(teamName) {
  return TEAM_SEARCH_ALIASES[teamName] ?? teamName;
}

function slugify(team, name) {
  return `${team}-${name}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function round(n, dp = 2) {
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** dp;
  return Math.round(n * p) / p;
}

function mapPosition(apiPos) {
  const p = String(apiPos ?? '').toLowerCase();
  if (p.includes('goal')) return 'Goalkeeper';
  if (p === 'd' || p.includes('def')) return 'Defender';
  if (p === 'm' || p.includes('mid')) return 'Midfielder';
  return 'Forward';
}

function pickNationalTeam(candidates, appTeamName) {
  if (!candidates?.length) return null;
  const term = searchTermForTeam(appTeamName).toLowerCase();
  const exact = candidates.find(
    (t) =>
      t.team?.national &&
      (t.team.name?.toLowerCase() === term ||
        t.team.name?.toLowerCase() === appTeamName.toLowerCase() ||
        t.team.code?.toLowerCase() === term.slice(0, 3))
  );
  if (exact) return exact.team;

  const national = candidates.filter((t) => t.team?.national);
  if (national.length === 1) return national[0].team;

  const fuzzy = national.find((t) => {
    const n = t.team.name?.toLowerCase() ?? '';
    return n.includes(term) || term.includes(n) || n.includes(appTeamName.toLowerCase());
  });
  return fuzzy?.team ?? national[0]?.team ?? null;
}

function opponentName(fixture, teamApiId) {
  const home = fixture.teams?.home;
  const away = fixture.teams?.away;
  if (home?.id === teamApiId) return away?.name ?? 'Unknown';
  if (away?.id === teamApiId) return home?.name ?? 'Unknown';
  return away?.name ?? home?.name ?? 'Unknown';
}

function venueSide(fixture, teamApiId) {
  if (fixture.teams?.home?.id === teamApiId) return 'home';
  if (fixture.teams?.away?.id === teamApiId) return 'away';
  return 'neutral';
}

function extractPlayerRow(entry) {
  const stat = entry.statistics?.[0] ?? {};
  return {
    apiPlayerId: entry.player?.id,
    name: entry.player?.name ?? 'Unknown',
    photo: entry.player?.photo ?? null,
    minutes: Number(stat.games?.minutes) || 0,
    position: mapPosition(stat.games?.position),
    rating: stat.games?.rating ? Number(stat.games.rating) : null,
    goals: Number(stat.goals?.total) || 0,
    assists: Number(stat.goals?.assists) || 0,
    shots: Number(stat.shots?.total) || 0,
    shotsOnTarget: Number(stat.shots?.on) || 0,
    passes: Number(stat.passes?.total) || 0,
    cards: (Number(stat.cards?.yellow) || 0) + (Number(stat.cards?.red) || 0),
    fouls: Number(stat.fouls?.committed) || 0,
    tackles: Number(stat.tackles?.total) || 0
  };
}

function hitRatesFromLog(log) {
  const l5 = log.slice(0, 5);
  const l10 = log.slice(0, 10);

  const hit = (games, fn, line) => {
    if (!games.length) return 0;
    return Math.round((games.filter((g) => fn(g) > line).length / games.length) * 100);
  };

  return {
    goals05: {
      l5: hit(l5, (g) => g.goals, 0),
      l10: hit(l10, (g) => g.goals, 0),
      season: hit(log, (g) => g.goals, 0)
    },
    goals15: {
      l5: hit(l5, (g) => g.goals, 1),
      l10: hit(l10, (g) => g.goals, 1),
      season: hit(log, (g) => g.goals, 1)
    },
    assists05: {
      l5: hit(l5, (g) => g.assists, 0),
      l10: hit(l10, (g) => g.assists, 0),
      season: hit(log, (g) => g.assists, 0)
    },
    shots15: {
      l5: hit(l5, (g) => g.shots, 1),
      l10: hit(l10, (g) => g.shots, 1),
      season: hit(log, (g) => g.shots, 1)
    },
    shots25: {
      l5: hit(l5, (g) => g.shots, 2),
      l10: hit(l10, (g) => g.shots, 2),
      season: hit(log, (g) => g.shots, 2)
    },
    sot05: {
      l5: hit(l5, (g) => g.shotsOnTarget, 0),
      l10: hit(l10, (g) => g.shotsOnTarget, 0),
      season: hit(log, (g) => g.shotsOnTarget, 0)
    },
    cards05: {
      l5: hit(l5, (g) => g.cards, 0),
      l10: hit(l10, (g) => g.cards, 0),
      season: hit(log, (g) => g.cards, 0)
    },
    fouls15: {
      l5: hit(l5, (g) => g.fouls, 1),
      l10: hit(l10, (g) => g.fouls, 1),
      season: hit(log, (g) => g.fouls, 1)
    }
  };
}

function seasonRatesFromLog(log) {
  const played = log.filter((g) => g.minutes > 0);
  const totalMins = played.reduce((a, g) => a + g.minutes, 0) || 1;
  const sum = (fn) => played.reduce((a, g) => a + fn(g), 0);
  const per90 = (v) => round((v / totalMins) * 90, 2);

  return {
    goals90: per90(sum((g) => g.goals)),
    assists90: per90(sum((g) => g.assists)),
    shots90: round(per90(sum((g) => g.shots)), 1),
    sot90: round(per90(sum((g) => g.shotsOnTarget)), 1),
    passes90: round(per90(sum((g) => g.passes)), 0),
    cards90: per90(sum((g) => g.cards)),
    fouls90: round(per90(sum((g) => g.fouls)), 1),
    minutesAvg: played.length ? Math.round(totalMins / played.length) : 0
  };
}

/**
 * Build player records for one national team from API fixture + player payloads.
 * @param {string} appTeamName
 * @param {number} teamApiId
 * @param {object[]} fixtures — API fixture rows (filtered international)
 * @param {Map<number, object>} fixturePlayersMap — fixtureId → full API response
 */
export function buildTeamPlayersFromApi(appTeamName, teamApiId, fixtures, fixturePlayersMap) {
  const group = TEAM_TO_GROUP[appTeamName] ?? '?';
  const byPlayer = new Map();

  for (const fix of fixtures) {
    const fixtureId = fix.fixture?.id;
    if (!fixtureId) continue;

    const payload = fixturePlayersMap.get(fixtureId);
    const teamBlock = payload?.response?.find((r) => r.team?.id === teamApiId);
    if (!teamBlock?.players?.length) continue;

    const gameMeta = {
      date: fix.fixture?.date?.slice(0, 10) ?? '',
      opponent: opponentName(fix, teamApiId),
      competition: fix.league?.name ?? 'International',
      result: inferResult(fix, teamApiId),
      venue: venueSide(fix, teamApiId),
      fixtureId
    };

    for (const entry of teamBlock.players) {
      const row = extractPlayerRow(entry);
      if (row.minutes <= 0 && row.goals === 0 && row.shots === 0) continue;

      const key = row.apiPlayerId ?? row.name;
      if (!byPlayer.has(key)) {
        byPlayer.set(key, {
          apiPlayerId: row.apiPlayerId,
          name: row.name,
          photo: row.photo,
          position: row.position,
          games: []
        });
      }

      const rec = byPlayer.get(key);
      if (row.position) rec.position = row.position;
      rec.games.push({
        ...gameMeta,
        minutes: row.minutes,
        goals: row.goals,
        assists: row.assists,
        shots: row.shots,
        shotsOnTarget: row.shotsOnTarget,
        passes: row.passes,
        cards: row.cards,
        fouls: row.fouls,
        rating: row.rating
      });
    }
  }

  const players = [];
  for (const rec of byPlayer.values()) {
    const gameLog = rec.games.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, 20);
    if (!gameLog.length) continue;

    const seasonRates = seasonRatesFromLog(gameLog);
    const hitRates = hitRatesFromLog(gameLog);
    const appearances = gameLog.length;
    const avgMinutes = seasonRates.minutesAvg;
    const likelyStarter = avgMinutes >= 60;
    const xgShare = estimateXgShare(rec.position, seasonRates.goals90, likelyStarter);

    players.push({
      id: slugify(appTeamName, rec.name),
      name: rec.name,
      team: appTeamName,
      group,
      position: rec.position,
      number: null,
      likelyStarter,
      benchImpact: !likelyStarter && avgMinutes >= 20,
      minutesFactor: round(Math.min(1, avgMinutes / 90), 2),
      xgShare,
      seasonRates,
      hitRates,
      gameLog,
      photo: rec.photo,
      apiPlayerId: rec.apiPlayerId,
      dataSource: 'api-football',
      dataScope: 'international',
      searchText: `${rec.name} ${appTeamName} ${rec.position} ${group}`.toLowerCase(),
      importMeta: {
        appearances,
        competitions: [...new Set(gameLog.map((g) => g.competition))],
        lastMatch: gameLog[0]?.date ?? null
      }
    });
  }

  players.sort((a, b) => {
    const sa = a.likelyStarter ? 1 : 0;
    const sb = b.likelyStarter ? 1 : 0;
    if (sb !== sa) return sb - sa;
    return (b.seasonRates?.goals90 ?? 0) - (a.seasonRates?.goals90 ?? 0) || a.name.localeCompare(b.name);
  });

  return players;
}

function inferResult(fixture, teamApiId) {
  const hg = fixture.goals?.home;
  const ag = fixture.goals?.away;
  if (hg == null || ag == null) return '—';
  const isHome = fixture.teams?.home?.id === teamApiId;
  const gf = isHome ? hg : ag;
  const ga = isHome ? ag : hg;
  if (gf > ga) return 'W';
  if (gf < ga) return 'L';
  return 'D';
}

function estimateXgShare(position, goals90, starter) {
  const base = position === 'Forward' ? 0.12 : position === 'Midfielder' ? 0.06 : 0.02;
  const boost = Math.min(0.2, goals90 * 0.15);
  const scale = starter ? 1 : 0.55;
  return round((base + boost) * scale, 2);
}

export { pickNationalTeam, slugify };
