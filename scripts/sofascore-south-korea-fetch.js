/**
 * Sofascore fetch logic — run inside browser context (see import-sofascore-south-korea.mjs).
 * Korea Republic team id: 4735
 */
export async function fetchSouthKoreaFromSofascore(opts = {}) {
  const TEAM_ID = 4735;
  const TEAM_NAME = 'South Korea';
  const SOFASCORE_NAMES = ['South Korea', 'Korea Republic'];
  const maxEvents = opts.maxEvents ?? 22;
  const delayMs = opts.delayMs ?? 280;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const mapPosition = (pos) => {
    if (pos === 'G') return 'Goalkeeper';
    if (pos === 'D') return 'Defender';
    if (pos === 'M') return 'Midfielder';
    if (pos === 'F') return 'Forward';
    return 'Midfielder';
  };

  const slugify = (team, name) =>
    `${team}-${name}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  const isOurTeam = (team) =>
    team?.id === TEAM_ID || SOFASCORE_NAMES.includes(team?.name);

  const pages = [0, 1, 2, 3];
  let events = [];
  for (const p of pages) {
    const payload = await fetch(
      `https://api.sofascore.com/api/v1/team/${TEAM_ID}/events/last/${p}`
    ).then((r) => r.json());
    events.push(...(payload.events ?? []));
    await sleep(delayMs);
  }

  events = events.filter(
    (e) =>
      e.status?.code === 100 &&
      !String(e.tournament?.name ?? '').includes('Club Friendly') &&
      (isOurTeam(e.homeTeam) || isOurTeam(e.awayTeam))
  );
  events.sort((a, b) => b.startTimestamp - a.startTimestamp);
  events = events.slice(0, maxEvents);

  const playerLogs = new Map();

  for (const ev of events) {
    await sleep(delayMs);
    let lineups;
    try {
      lineups = await fetch(`https://api.sofascore.com/api/v1/event/${ev.id}/lineups`).then((r) =>
        r.json()
      );
    } catch {
      continue;
    }
    if (!lineups?.confirmed) continue;

    const isHome = isOurTeam(ev.homeTeam);
    const side = isHome ? lineups.home : lineups.away;
    if (!side?.players?.length) continue;

    const date = new Date(ev.startTimestamp * 1000).toISOString().slice(0, 10);
    const opponent = isHome ? ev.awayTeam?.name : ev.homeTeam?.name;
    const hs = ev.homeScore?.current ?? ev.homeScore?.display ?? 0;
    const as = ev.awayScore?.current ?? ev.awayScore?.display ?? 0;
    const ourGoals = isHome ? hs : as;
    const oppGoals = isHome ? as : hs;
    let result = 'D';
    if (ourGoals > oppGoals) result = 'W';
    if (ourGoals < oppGoals) result = 'L';

    for (const entry of side.players) {
      const p = entry.player;
      const s = entry.statistics ?? {};
      if (!p?.name) continue;

      const minutes = Number(s.minutesPlayed) || 0;
      const goals = Number(s.goals ?? 0);
      const assists = Number(s.goalAssist ?? 0);
      const shotsOnTarget = Number(s.onTargetScoringAttempt ?? 0);
      const shotOffTarget = Number(s.shotOffTarget ?? 0);
      const shots = Number(s.totalShots ?? shotsOnTarget + shotOffTarget);
      const passes = Number(s.totalPass ?? 0);
      const cards = Number(s.yellowCards ?? 0) + Number(s.redCards ?? 0);
      const fouls = Number(s.fouls ?? 0);
      const saves = Number(s.saves ?? 0);
      const keeperSweeper = Number(s.totalKeeperSweeper ?? s.accurateKeeperSweeper ?? 0);
      const isGk = mapPosition(p.position) === 'Goalkeeper';

      if (minutes <= 0 && goals === 0 && assists === 0 && shots === 0 && !(isGk && saves > 0)) continue;

      const key = String(p.id);
      const game = {
        date,
        opponent: opponent ?? 'Unknown',
        competition: ev.tournament?.name ?? 'International',
        result,
        venue: isHome ? 'home' : 'away',
        minutes,
        goals,
        assists,
        shots,
        shotsOnTarget,
        passes,
        cards,
        fouls,
        rating: s.rating ? Number(s.rating) : null,
        ...(isGk || saves > 0 ? { saves, goalsConceded: oppGoals, keeperSweeper } : {})
      };

      if (!playerLogs.has(key)) {
        playerLogs.set(key, {
          id: slugify(TEAM_NAME, p.name),
          sofascoreId: p.id,
          name: p.name,
          position: mapPosition(p.position),
          number: entry.jerseyNumber ?? entry.shirtNumber ?? null,
          likelyStarter: false,
          gameLog: []
        });
      }

      const rec = playerLogs.get(key);
      if (entry.jerseyNumber) rec.number = entry.jerseyNumber;
      rec.gameLog.push(game);
    }
  }

  const squadPayload = await fetch(
    `https://api.sofascore.com/api/v1/team/${TEAM_ID}/players`
  ).then((r) => r.json());

  for (const row of squadPayload.players ?? []) {
    const p = row.player;
    if (!p?.id) continue;
    const key = String(p.id);
    if (!playerLogs.has(key)) {
      playerLogs.set(key, {
        id: slugify(TEAM_NAME, p.name),
        sofascoreId: p.id,
        name: p.name,
        position: mapPosition(p.position),
        number: row.jerseyNumber ?? null,
        likelyStarter: false,
        gameLog: []
      });
    }
  }

  const players = [...playerLogs.values()].map((rec) => {
    rec.gameLog.sort((a, b) => b.date.localeCompare(a.date));
    rec.gameLog = rec.gameLog.slice(0, 15);
    const starts = rec.gameLog.filter((g) => g.minutes >= 60).length;
    rec.likelyStarter = starts >= Math.max(2, Math.ceil(rec.gameLog.length * 0.4));
    return rec;
  });

  players.sort((a, b) => {
    const pos = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];
    const pd = pos.indexOf(a.position) - pos.indexOf(b.position);
    if (pd !== 0) return pd;
    return String(a.name).localeCompare(b.name);
  });

  return {
    team: TEAM_NAME,
    group: 'A',
    dataSource: 'sofascore-manual-import',
    importedAt: new Date().toISOString(),
    eventsProcessed: events.length,
    eventDates: events.map((e) => new Date(e.startTimestamp * 1000).toISOString().slice(0, 10)),
    players
  };
}
