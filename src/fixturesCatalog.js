import fixturesData from './data/fixtures.json' with { type: 'json' };
import matchResultsData from './data/match-results.json' with { type: 'json' };

const RESULTS = matchResultsData.results ?? {};

function withMatchResult(fixture) {
  if (!fixture) return null;
  const result = RESULTS[fixture.id];
  if (!result) return fixture;
  return {
    ...fixture,
    ...result,
    status: result.status ?? 'finished'
  };
}

export function getAllFixtures() {
  return {
    competition: fixturesData.competition,
    hostCountries: fixturesData.hostCountries,
    groupStage: (fixturesData.groupStage ?? []).map(withMatchResult),
    knockout: (fixturesData.knockout ?? []).map(withMatchResult)
  };
}

export function getGroupStageFixtures(group = null) {
  const all = (fixturesData.groupStage ?? []).map(withMatchResult);
  if (!group) return all;
  return all.filter((f) => f.group === group);
}

export function getKnockoutFixtures() {
  return (fixturesData.knockout ?? []).map(withMatchResult);
}

export function getFixtureById(fixtureId) {
  const all = [...(fixturesData.groupStage ?? []), ...(fixturesData.knockout ?? [])];
  const fixture = all.find((f) => f.id === fixtureId) ?? null;
  return withMatchResult(fixture);
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
