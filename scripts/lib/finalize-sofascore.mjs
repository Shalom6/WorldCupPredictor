import fs from 'fs';
import {
  hitRatesFromLog,
  seasonRatesFromLog
} from '../../src/playerStats.js';

function slugify(team, name) {
  return `${team}-${name}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function finalizeSofascoreRaw(raw, outPath) {
  const officialSquad = raw.officialSquad?.length
    ? raw.officialSquad
    : (raw.players ?? [])
        .filter((p) => p.sofascoreId)
        .map((p) => ({
          sofascoreId: p.sofascoreId,
          name: p.name,
          position: p.position,
          number: p.number ?? null
        }));
  const byId = new Map((raw.players ?? []).map((p) => [p.sofascoreId, p]));
  const posOrder = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];

  const players = officialSquad.map((s) => {
    const fetched = byId.get(s.sofascoreId);
    const gameLog = (fetched?.gameLog ?? []).slice().sort((a, b) => b.date.localeCompare(a.date));
    const starts = gameLog.filter((g) => g.minutes >= 60).length;
    const likelyStarter = starts >= Math.max(2, Math.ceil(gameLog.length * 0.4));
    const seasonRates = gameLog.length ? seasonRatesFromLog(gameLog) : null;
    const hitRates = gameLog.length ? hitRatesFromLog(gameLog) : null;

    return {
      id: slugify(raw.team, s.name),
      name: s.name,
      team: raw.team,
      group: raw.group,
      position: s.position,
      number: fetched?.number ?? s.number ?? null,
      likelyStarter: gameLog.length ? likelyStarter : false,
      sofascoreId: s.sofascoreId,
      dataSource: 'sofascore',
      dataScope: 'international',
      gameLog,
      seasonRates,
      hitRates,
      importMeta: {
        appearances: gameLog.length,
        competitions: [...new Set(gameLog.map((g) => g.competition))],
        lastMatch: gameLog[0]?.date ?? null
      }
    };
  }).sort((a, b) => {
    const pd = posOrder.indexOf(a.position) - posOrder.indexOf(b.position);
    if (pd !== 0) return pd;
    return a.name.localeCompare(b.name);
  });

  const fringe = (raw.players ?? []).filter(
    (p) => !officialSquad.some((s) => s.sofascoreId === p.sofascoreId) && p.gameLog?.length
  );

  const output = {
    _note:
      'International match logs imported from Sofascore. Club friendlies excluded. Last 22 national-team matches as of import date.',
    team: raw.team,
    group: raw.group,
    dataSource: 'sofascore',
    importedAt: raw.importedAt ?? new Date().toISOString(),
    eventsProcessed: raw.eventsProcessed ?? null,
    teamMatchResults: raw.teamMatchResults ?? [],
    players,
    fringeCallups: fringe.map((p) => ({ name: p.name, appearances: p.gameLog.length }))
  };

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  return {
    playerCount: players.length,
    withLogs: players.filter((p) => p.gameLog.length).length,
    fringe: fringe.length
  };
}
