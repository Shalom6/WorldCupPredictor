import { getDataCatalog, getTeamProfiles as buildProfiles } from './teamProfiles.js';
import { getFixtureById, isKnockoutStage } from './fixturesCatalog.js';

export { getDataCatalog };

export function getFixtureContext(body) {
  const fixtureId = body?.fixtureId;
  const catalogFixture = fixtureId ? getFixtureById(fixtureId) : null;

  if (catalogFixture) {
    return {
      id: catalogFixture.id,
      competition: 'FIFA World Cup 2026',
      stage: catalogFixture.stage,
      group: catalogFixture.group ?? null,
      matchday: catalogFixture.matchday ?? null,
      venueCity: catalogFixture.venueCity,
      date: catalogFixture.date,
      homeTeam: catalogFixture.homeTeam,
      awayTeam: catalogFixture.awayTeam,
      neutralVenue: catalogFixture.neutralVenue ?? false,
      isKnockout: isKnockoutStage(catalogFixture.stage),
      finalScale: catalogFixture.stage === 'Final' ? 0.92 : 1,
      finalTempo: catalogFixture.stage === 'Final' ? 0.95 : 1
    };
  }

  return {
    competition: 'FIFA World Cup 2026',
    stage: body?.stage ?? 'Group Stage',
    group: body?.group ?? null,
    matchday: body?.matchday ?? null,
    venueCity: body?.venueCity ?? 'USA / Mexico / Canada',
    date: body?.date ?? 'June 2026',
    homeTeam: body?.homeTeam ?? 'Brazil',
    awayTeam: body?.awayTeam ?? 'Morocco',
    neutralVenue: body?.neutralVenue ?? false,
    isKnockout: isKnockoutStage(body?.stage ?? 'Group Stage'),
    finalScale: 1,
    finalTempo: 1
  };
}

export function getTeamProfiles(homeTeamName, awayTeamName) {
  return buildProfiles(homeTeamName, awayTeamName);
}
