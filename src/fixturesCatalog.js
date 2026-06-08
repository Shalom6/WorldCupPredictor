import fixturesData from './data/fixtures.json' with { type: 'json' };

export function getAllFixtures() {
  return {
    competition: fixturesData.competition,
    hostCountries: fixturesData.hostCountries,
    groupStage: fixturesData.groupStage,
    knockout: fixturesData.knockout ?? []
  };
}

export function getGroupStageFixtures(group = null) {
  const all = fixturesData.groupStage ?? [];
  if (!group) return all;
  return all.filter((f) => f.group === group);
}

export function getKnockoutFixtures() {
  return fixturesData.knockout ?? [];
}

export function getFixtureById(fixtureId) {
  const all = [...(fixturesData.groupStage ?? []), ...(fixturesData.knockout ?? [])];
  return all.find((f) => f.id === fixtureId) ?? null;
}

export function getGroups() {
  const groups = new Set((fixturesData.groupStage ?? []).map((f) => f.group));
  return [...groups].sort();
}

export function getTeamsInGroup(group) {
  const matches = getGroupStageFixtures(group);
  const teams = new Set();
  for (const m of matches) {
    teams.add(m.homeTeam);
    teams.add(m.awayTeam);
  }
  return [...teams];
}

export function listAllTeams() {
  const teams = new Set();
  for (const f of fixturesData.groupStage ?? []) {
    teams.add(f.homeTeam);
    teams.add(f.awayTeam);
  }
  for (const f of fixturesData.knockout ?? []) {
    teams.add(f.homeTeam);
    teams.add(f.awayTeam);
  }
  return [...teams].sort();
}

export function isKnockoutStage(stage) {
  return stage && stage !== 'Group Stage';
}
