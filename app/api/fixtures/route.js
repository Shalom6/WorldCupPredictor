import { getAllFixtures, getGroups } from '../../../src/fixturesCatalog.js';

export async function GET() {
  const catalog = getAllFixtures();
  return Response.json({
    ...catalog,
    groups: getGroups()
  });
}
