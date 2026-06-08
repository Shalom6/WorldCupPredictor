import playersData from './data/world-cup-players.json' with { type: 'json' };
import { ouLines } from './bettingStats.js';

const PLAYERS = playersData.players ?? [];

export function getPlayerCatalogMeta() {
  return {
    playerCount: playersData.playerCount ?? PLAYERS.length,
    teamCount: playersData.teamCount ?? 48,
    generatedAt: playersData.generatedAt,
    dataSource: playersData.dataSource ?? 'bundled',
    importNotes: playersData.importNotes ?? null
  };
}

export function listTeams() {
  const teams = new Map();
  for (const p of PLAYERS) {
    if (!teams.has(p.team)) {
      teams.set(p.team, { team: p.team, group: p.group, count: 0 });
    }
    teams.get(p.team).count++;
  }
  return [...teams.values()].sort((a, b) => a.team.localeCompare(b.team));
}

export function shortName(fullName) {
  const parts = String(fullName ?? '').trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  const initial = parts[0][0]?.toUpperCase() ?? '';
  const last = parts[parts.length - 1];
  return `${initial}. ${last}`;
}

function scoreSearchMatch(p, query) {
  const q = query.toLowerCase().trim();
  if (!q) return 1;

  const name = p.name.toLowerCase();
  const team = p.team.toLowerCase();
  const parts = name.split(/\s+/);
  const last = parts[parts.length - 1] ?? '';
  const first = parts[0] ?? '';
  const initials = parts.map((w) => w[0]).join('');

  if (p.id === q) return 1000;
  if (name === q) return 900;
  if (last === q) return 850;
  if (name.startsWith(q)) return 800;
  if (last.startsWith(q)) return 780;
  if (`${first} ${last}`.startsWith(q)) return 760;
  if (initials.startsWith(q.replace(/\./g, '').replace(/\s/g, ''))) return 720;
  if (name.includes(q)) return 500;
  if (team.includes(q) || team.startsWith(q)) return 400;
  if (p.searchText?.includes(q)) return 350;
  if (q.length >= 3 && last.includes(q)) return 300;
  return 0;
}

export function searchPlayers({ q = '', team = '', group = '', position = '', limit = 50, offset = 0 } = {}) {
  const query = String(q).trim().toLowerCase();
  const posFilter = String(position).trim().toLowerCase();

  let results = PLAYERS;

  if (team) results = results.filter((p) => p.team === team);
  if (group) results = results.filter((p) => p.group === group);
  if (posFilter) {
    results = results.filter((p) => {
      const kind = p.position.toLowerCase();
      if (posFilter === 'gk') return kind.includes('goal');
      if (posFilter === 'def') return kind.includes('def');
      if (posFilter === 'mid') return kind.includes('mid');
      if (posFilter === 'fwd') return kind.includes('forward') || kind.includes('attack');
      return kind.includes(posFilter);
    });
  }

  if (query) {
    results = results
      .map((p) => ({ p, score: scoreSearchMatch(p, query) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name))
      .map(({ p }) => p);
  } else {
    results = results
      .slice()
      .sort((a, b) => {
        const sa = a.likelyStarter ? 1 : 0;
        const sb = b.likelyStarter ? 1 : 0;
        if (sb !== sa) return sb - sa;
        return (b.xgShare ?? 0) - (a.xgShare ?? 0) || a.name.localeCompare(b.name);
      });
  }

  const total = results.length;
  const effectiveLimit = query ? Math.max(limit, 120) : limit;
  const slice = results.slice(offset, offset + effectiveLimit);

  return {
    total,
    offset,
    limit: effectiveLimit,
    players: slice.map(summarizePlayer)
  };
}

export function getPlayerById(id) {
  return PLAYERS.find((p) => p.id === id) ?? null;
}

export function summarizePlayer(p) {
  return {
    id: p.id,
    name: p.name,
    shortName: shortName(p.name),
    team: p.team,
    group: p.group,
    position: p.position,
    number: p.number,
    likelyStarter: p.likelyStarter,
    goals90: p.seasonRates?.goals90 ?? 0,
    assists90: p.seasonRates?.assists90 ?? 0,
    shots90: p.seasonRates?.shots90 ?? 0,
    hitGoalsL10: p.hitRates?.goals05?.l10 ?? null
  };
}

export function buildPlayerDetail(id) {
  const player = getPlayerById(id);
  if (!player) return null;

  const r = player.seasonRates ?? {};
  const props = {
    goals: {
      label: 'Goals',
      expected: r.goals90,
      hitRates: player.hitRates?.goals05,
      lines: ouLines(r.goals90, [0.5, 1.5, 2.5])
    },
    assists: {
      label: 'Assists',
      expected: r.assists90,
      hitRates: player.hitRates?.assists05,
      lines: ouLines(r.assists90, [0.5, 1.5])
    },
    shots: {
      label: 'Shots',
      expected: r.shots90,
      hitRates: player.hitRates?.shots15,
      lines: ouLines(r.shots90, [0.5, 1.5, 2.5, 3.5, 4.5])
    },
    shotsOnTarget: {
      label: 'Shots on target',
      expected: r.sot90,
      hitRates: player.hitRates?.sot05,
      lines: ouLines(r.sot90, [0.5, 1.5, 2.5])
    },
    cards: {
      label: 'Cards',
      expected: r.cards90,
      hitRates: player.hitRates?.cards05,
      lines: ouLines(r.cards90, [0.5])
    },
    fouls: {
      label: 'Fouls',
      expected: r.fouls90,
      hitRates: player.hitRates?.fouls15,
      lines: ouLines(r.fouls90, [0.5, 1.5, 2.5])
    }
  };

  const averages = {
    minutes: r.minutesAvg,
    goals: r.goals90,
    assists: r.assists90,
    shots: r.shots90,
    shotsOnTarget: r.sot90,
    passes: r.passes90,
    cards: r.cards90,
    fouls: r.fouls90
  };

  return {
    ...summarizePlayer(player),
    xgShare: player.xgShare,
    minutesFactor: player.minutesFactor,
    benchImpact: player.benchImpact,
    dataSource: player.dataSource ?? 'bundled-estimate',
    dataScope: player.dataScope ?? null,
    importMeta: player.importMeta ?? null,
    photo: player.photo ?? null,
    seasonRates: player.seasonRates,
    hitRates: player.hitRates,
    gameLog: player.gameLog,
    props,
    averages
  };
}
