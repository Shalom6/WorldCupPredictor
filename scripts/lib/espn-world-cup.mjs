/**
 * ESPN FIFA World Cup 2026 — scoreboard + match summary parsing.
 */

const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const SUMMARY_URL = 'https://site.web.api.espn.com/apis/site/v2/sports/soccer/mex.1/summary';

const TEAM_ALIASES = {
  mexico: ['mexico', 'mex'],
  'south africa': ['south africa', 'rsa', 'bafana bafana'],
  'south korea': ['south korea', 'korea republic', 'korea rep', 'kor', 'republic of korea'],
  czechia: ['czechia', 'czech republic', 'cze', 'czech rep'],
  canada: ['canada', 'can'],
  usa: ['usa', 'united states', 'usmnt'],
  'bosnia and herzegovina': ['bosnia and herzegovina', 'bosnia', 'bih'],
  qatar: ['qatar', 'qat'],
  switzerland: ['switzerland', 'sui'],
  brazil: ['brazil', 'bra'],
  morocco: ['morocco', 'mar'],
  haiti: ['haiti', 'hai'],
  scotland: ['scotland', 'sco'],
  paraguay: ['paraguay', 'par'],
  australia: ['australia', 'aus'],
  türkiye: ['türkiye', 'turkey', 'tur'],
  germany: ['germany', 'ger'],
  curaçao: ['curaçao', 'curacao', 'cuw'],
  "côte d'ivoire": ["côte d'ivoire", 'ivory coast', 'civ'],
  ecuador: ['ecuador', 'ecu'],
  netherlands: ['netherlands', 'ned', 'holland'],
  japan: ['japan', 'jpn'],
  sweden: ['sweden', 'swe'],
  tunisia: ['tunisia', 'tun'],
  belgium: ['belgium', 'bel'],
  egypt: ['egypt', 'egy'],
  iran: ['iran', 'irn', 'ir iran'],
  'new zealand': ['new zealand', 'nzl'],
  spain: ['spain', 'esp'],
  'cape verde': ['cape verde', 'cabo verde', 'cpv'],
  'saudi arabia': ['saudi arabia', 'ksa'],
  uruguay: ['uruguay', 'uru'],
  france: ['france', 'fra'],
  senegal: ['senegal', 'sen'],
  iraq: ['iraq', 'irq'],
  norway: ['norway', 'nor'],
  argentina: ['argentina', 'arg'],
  algeria: ['algeria', 'alg'],
  austria: ['austria', 'aut'],
  jordan: ['jordan', 'jor'],
  portugal: ['portugal', 'por'],
  colombia: ['colombia', 'col'],
  uzbekistan: ['uzbekistan', 'uzb'],
  'dr congo': ['dr congo', 'congo dr', 'cod'],
  england: ['england', 'eng'],
  croatia: ['croatia', 'cro'],
  ghana: ['ghana', 'gha'],
  panama: ['panama', 'pan']
};

function normTeam(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function teamMatches(fixtureName, espnName) {
  const a = normTeam(fixtureName);
  const b = normTeam(espnName);
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const aliases = TEAM_ALIASES[a] ?? [];
  return aliases.some((alias) => normTeam(alias) === b || b.includes(normTeam(alias)));
}

export async function fetchScoreboard() {
  const res = await fetch(SCOREBOARD_URL, {
    headers: { 'User-Agent': 'WorldCupPredictor/1.0' }
  });
  if (!res.ok) throw new Error(`ESPN scoreboard HTTP ${res.status}`);
  const data = await res.json();
  return data.events ?? [];
}

export async function fetchMatchSummary(espnEventId) {
  const url = `${SUMMARY_URL}?event=${espnEventId}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'WorldCupPredictor/1.0' } });
  if (!res.ok) throw new Error(`ESPN summary ${espnEventId} HTTP ${res.status}`);
  return res.json();
}

function statNum(teamStats, name) {
  const row = (teamStats ?? []).find((s) => s.name === name);
  if (!row) return null;
  const n = Number.parseFloat(row.displayValue);
  return Number.isFinite(n) ? n : null;
}

function parseTeamStats(homeStats, awayStats) {
  const possessionHome = statNum(homeStats, 'possessionPct');
  const possessionAway = statNum(awayStats, 'possessionPct');
  const passHome = statNum(homeStats, 'passPct');
  const passAway = statNum(awayStats, 'passPct');

  const out = {};
  if (possessionHome != null && possessionAway != null) {
    out.possession = {
      home: Math.round(possessionHome * 10) / 10,
      away: Math.round(possessionAway * 10) / 10
    };
  }
  const map = [
    ['shots', 'totalShots'],
    ['shotsOnTarget', 'shotsOnTarget'],
    ['corners', 'wonCorners'],
    ['fouls', 'foulsCommitted'],
    ['yellowCards', 'yellowCards'],
    ['redCards', 'redCards'],
    ['saves', 'saves']
  ];
  for (const [key, espnKey] of map) {
    const h = statNum(homeStats, espnKey);
    const a = statNum(awayStats, espnKey);
    if (h != null && a != null) out[key] = { home: h, away: a };
  }
  if (passHome != null && passAway != null) {
    out.passAccuracy = {
      home: Math.round(passHome * 1000) / 10,
      away: Math.round(passAway * 1000) / 10
    };
  }
  return out;
}

function parseScorers(details, fixtureHomeTeam) {
  const home = [];
  const away = [];
  for (const d of details ?? []) {
    if (!d.scoringPlay || d.ownGoal) continue;
    const side = teamMatches(fixtureHomeTeam, d.team?.displayName) ? home : away;
    const scorer = d.participants?.[0]?.athlete?.displayName;
    if (!scorer) continue;
    const entry = { name: scorer, minute: d.clock?.displayValue ?? '' };
    const assist = d.participants?.[1]?.athlete?.displayName;
    if (assist) entry.assist = assist;
    side.push(entry);
  }
  return { home, away };
}

/**
 * Match ESPN scoreboard events to app fixtures.
 * @returns {Array<{ fixture, espnEventId, espnEvent }>}
 */
export function matchEventsToFixtures(events, fixtures) {
  const pairs = [];
  for (const fixture of fixtures) {
    const event = events.find((ev) => {
      const comp = ev.competitions?.[0];
      if (!comp) return false;
      const home = comp.competitors?.find((c) => c.homeAway === 'home')?.team?.displayName;
      const away = comp.competitors?.find((c) => c.homeAway === 'away')?.team?.displayName;
      return teamMatches(fixture.homeTeam, home) && teamMatches(fixture.awayTeam, away);
    });
    if (event) pairs.push({ fixture, espnEventId: String(event.id), espnEvent: event });
  }
  return pairs;
}

export function isEventFinished(espnEvent) {
  const status = espnEvent?.competitions?.[0]?.status?.type;
  return Boolean(status?.completed || status?.name === 'STATUS_FULL_TIME');
}

export function parseFinishedMatch(summary, fixture) {
  const comp = summary.header?.competitions?.[0];
  if (!comp?.status?.type?.completed) return null;

  const homeComp = comp.competitors?.find((c) => c.homeAway === 'home');
  const awayComp = comp.competitors?.find((c) => c.homeAway === 'away');
  const homeScore = Number(homeComp?.score);
  const awayScore = Number(awayComp?.score);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;

  const boxTeams = summary.boxscore?.teams ?? [];
  const homeBox = boxTeams.find((t) => teamMatches(fixture.homeTeam, t.team?.displayName));
  const awayBox = boxTeams.find((t) => teamMatches(fixture.awayTeam, t.team?.displayName));

  const scorers = parseScorers(comp.details, fixture.homeTeam);
  const teamStats = parseTeamStats(homeBox?.statistics, awayBox?.statistics);

  return {
    status: 'finished',
    homeScore,
    awayScore,
    scorers,
    teamStats,
    syncedAt: new Date().toISOString(),
    source: 'espn'
  };
}

export { normTeam, teamMatches };
