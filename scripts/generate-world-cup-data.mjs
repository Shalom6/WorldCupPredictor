/**
 * Generates national-teams.json and fixtures.json for FIFA World Cup 2026.
 * Run: node scripts/generate-world-cup-data.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'src', 'data');

/** @type {Record<string, { strength: number, confederation: string, aliases?: string[] }>} */
const TEAM_META = {
  Mexico: { strength: 72, confederation: 'CONCACAF', aliases: ['MEX'] },
  'South Africa': { strength: 58, confederation: 'CAF', aliases: ['RSA'] },
  'South Korea': { strength: 68, confederation: 'AFC', aliases: ['Korea Republic', 'KOR'] },
  Czechia: { strength: 66, confederation: 'UEFA', aliases: ['Czech Republic', 'CZE'] },
  Canada: { strength: 70, confederation: 'CONCACAF', aliases: ['CAN'] },
  'Bosnia and Herzegovina': { strength: 62, confederation: 'UEFA', aliases: ['Bosnia', 'BIH'] },
  Qatar: { strength: 55, confederation: 'AFC', aliases: ['QAT'] },
  Switzerland: { strength: 74, confederation: 'UEFA', aliases: ['SUI'] },
  Brazil: { strength: 92, confederation: 'CONMEBOL', aliases: ['BRA'] },
  Morocco: { strength: 78, confederation: 'CAF', aliases: ['MAR'] },
  Haiti: { strength: 42, confederation: 'CONCACAF', aliases: ['HAI'] },
  Scotland: { strength: 64, confederation: 'UEFA', aliases: ['SCO'] },
  USA: { strength: 76, confederation: 'CONCACAF', aliases: ['United States', 'USMNT'] },
  Paraguay: { strength: 63, confederation: 'CONMEBOL', aliases: ['PAR'] },
  Australia: { strength: 67, confederation: 'AFC', aliases: ['AUS', 'Socceroos'] },
  Türkiye: { strength: 69, confederation: 'UEFA', aliases: ['Turkey', 'TUR'] },
  Germany: { strength: 86, confederation: 'UEFA', aliases: ['GER'] },
  Curaçao: { strength: 40, confederation: 'CONCACAF', aliases: ['Curacao', 'CUW'] },
  "Côte d'Ivoire": { strength: 65, confederation: 'CAF', aliases: ["Ivory Coast", 'CIV'] },
  Ecuador: { strength: 68, confederation: 'CONMEBOL', aliases: ['ECU'] },
  Netherlands: { strength: 84, confederation: 'UEFA', aliases: ['NED', 'Holland'] },
  Japan: { strength: 77, confederation: 'AFC', aliases: ['JPN'] },
  Sweden: { strength: 70, confederation: 'UEFA', aliases: ['SWE'] },
  Tunisia: { strength: 61, confederation: 'CAF', aliases: ['TUN'] },
  Belgium: { strength: 82, confederation: 'UEFA', aliases: ['BEL'] },
  Egypt: { strength: 66, confederation: 'CAF', aliases: ['EGY'] },
  Iran: { strength: 64, confederation: 'AFC', aliases: ['IR Iran', 'IRN'] },
  'New Zealand': { strength: 48, confederation: 'OFC', aliases: ['NZL'] },
  Spain: { strength: 88, confederation: 'UEFA', aliases: ['ESP'] },
  'Cape Verde': { strength: 52, confederation: 'CAF', aliases: ['Cabo Verde', 'CPV'] },
  'Saudi Arabia': { strength: 60, confederation: 'AFC', aliases: ['KSA'] },
  Uruguay: { strength: 80, confederation: 'CONMEBOL', aliases: ['URU'] },
  France: { strength: 90, confederation: 'UEFA', aliases: ['FRA'] },
  Senegal: { strength: 75, confederation: 'CAF', aliases: ['SEN'] },
  Iraq: { strength: 54, confederation: 'AFC', aliases: ['IRQ'] },
  Norway: { strength: 73, confederation: 'UEFA', aliases: ['NOR'] },
  Argentina: { strength: 93, confederation: 'CONMEBOL', aliases: ['ARG'] },
  Algeria: { strength: 67, confederation: 'CAF', aliases: ['ALG'] },
  Austria: { strength: 71, confederation: 'UEFA', aliases: ['AUT'] },
  Jordan: { strength: 53, confederation: 'AFC', aliases: ['JOR'] },
  Portugal: { strength: 85, confederation: 'UEFA', aliases: ['POR'] },
  Colombia: { strength: 79, confederation: 'CONMEBOL', aliases: ['COL'] },
  Uzbekistan: { strength: 50, confederation: 'AFC', aliases: ['UZB'] },
  'DR Congo': { strength: 59, confederation: 'CAF', aliases: ['Congo DR', 'COD'] },
  England: { strength: 87, confederation: 'UEFA', aliases: ['ENG'] },
  Croatia: { strength: 81, confederation: 'UEFA', aliases: ['CRO'] },
  Ghana: { strength: 62, confederation: 'CAF', aliases: ['GHA'] },
  Panama: { strength: 56, confederation: 'CONCACAF', aliases: ['PAN'] }
};

const GROUPS = {
  A: ['Mexico', 'South Africa', 'South Korea', 'Czechia'],
  B: ['Canada', 'Bosnia and Herzegovina', 'Qatar', 'Switzerland'],
  C: ['Brazil', 'Morocco', 'Haiti', 'Scotland'],
  D: ['USA', 'Paraguay', 'Australia', 'Türkiye'],
  E: ['Germany', 'Curaçao', "Côte d'Ivoire", 'Ecuador'],
  F: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'],
  G: ['Belgium', 'Egypt', 'Iran', 'New Zealand'],
  H: ['Spain', 'Cape Verde', 'Saudi Arabia', 'Uruguay'],
  I: ['France', 'Senegal', 'Iraq', 'Norway'],
  J: ['Argentina', 'Algeria', 'Austria', 'Jordan'],
  K: ['Portugal', 'Colombia', 'Uzbekistan', 'DR Congo'],
  L: ['England', 'Croatia', 'Ghana', 'Panama']
};

const MATCHDAY_DATES = ['June 11–15, 2026', 'June 16–22, 2026', 'June 23–27, 2026'];
const VENUES = [
  'Mexico City', 'Toronto', 'Los Angeles', 'Vancouver', 'Atlanta', 'Miami',
  'Dallas', 'Houston', 'Seattle', 'San Francisco', 'New York', 'Guadalajara'
];

function strengthToRates(strength) {
  const norm = strength / 100;
  const goalsFor = 0.75 + norm * 1.45;
  const goalsAgainst = 1.55 - norm * 0.85;
  const possession = 42 + norm * 18;
  const knockoutWinRate = 0.35 + norm * 0.35;
  return {
    goalsFor: round(goalsFor, 2),
    goalsAgainst: round(goalsAgainst, 2),
    possession: round(possession, 0),
    knockoutWinRate: round(knockoutWinRate, 2)
  };
}

function round(n, dp = 2) {
  const p = 10 ** dp;
  return Math.round(n * p) / p;
}

function buildTeamBundle(name, meta) {
  const rates = strengthToRates(meta.strength);
  const aliases = [name, ...(meta.aliases ?? [])];

  return {
    name,
    aliases,
    confederation: meta.confederation,
    fifaStrength: meta.strength,
    historical: {
      era: '1930-2026',
      worldCups: Math.floor(meta.strength / 12),
      avgGoalsForWc: rates.goalsFor,
      avgGoalsAgainstWc: rates.goalsAgainst,
      avgPossession: rates.possession,
      knockoutWinRate: rates.knockoutWinRate,
      note: 'Long-run World Cup-era prior (1930-2026)'
    },
    season2026: {
      label: '2026',
      wcQualifying: {
        played: 10,
        wins: Math.round(meta.strength / 15),
        draws: 2,
        losses: Math.max(0, 10 - Math.round(meta.strength / 15) - 2),
        goalsFor: Math.round(rates.goalsFor * 10),
        goalsAgainst: Math.round(rates.goalsAgainst * 10),
        xgFor: round(rates.goalsFor * 10 * 1.05, 1),
        xgAgainst: round(rates.goalsAgainst * 10 * 0.95, 1),
        shotsPerMatch: round(10 + meta.strength / 12, 1),
        shotsOnTargetPerMatch: round(3.5 + meta.strength / 25, 1),
        cornersPerMatch: round(4.5 + meta.strength / 30, 1)
      },
      formLast10: buildForm(rates)
    }
  };
}

function buildForm(rates) {
  const results = ['W', 'D', 'L'];
  return Array.from({ length: 10 }, (_, i) => {
    const r = results[i % 3];
    const gf = r === 'W' ? Math.ceil(rates.goalsFor) : r === 'D' ? 1 : Math.floor(rates.goalsFor * 0.5);
    const ga = r === 'L' ? Math.ceil(rates.goalsAgainst) : r === 'D' ? 1 : Math.floor(rates.goalsAgainst * 0.5);
    return { result: r, goalsFor: gf, goalsAgainst: ga, competition: 'WCQ' };
  });
}

function buildFixtures() {
  const fixtures = [];
  let id = 1;

  for (const [group, teams] of Object.entries(GROUPS)) {
    const pairings = [
      [0, 1, 2, 3],
      [0, 2, 1, 3],
      [0, 3, 1, 2]
    ];

    pairings.forEach((p, mdIdx) => {
      fixtures.push({
        id: `GS-${group}-${mdIdx * 2 + 1}`,
        stage: 'Group Stage',
        group,
        matchday: mdIdx + 1,
        homeTeam: teams[p[0]],
        awayTeam: teams[p[1]],
        date: MATCHDAY_DATES[mdIdx],
        venueCity: VENUES[(id - 1) % VENUES.length],
        neutralVenue: false
      });
      id++;
      fixtures.push({
        id: `GS-${group}-${mdIdx * 2 + 2}`,
        stage: 'Group Stage',
        group,
        matchday: mdIdx + 1,
        homeTeam: teams[p[2]],
        awayTeam: teams[p[3]],
        date: MATCHDAY_DATES[mdIdx],
        venueCity: VENUES[(id - 1) % VENUES.length],
        neutralVenue: false
      });
      id++;
    });
  }

  return {
    competition: 'FIFA World Cup 2026',
    hostCountries: ['USA', 'Mexico', 'Canada'],
    groupStage: fixtures,
    knockout: []
  };
}

const teams = {};
const aliasIndex = {};

for (const [name, meta] of Object.entries(TEAM_META)) {
  teams[name] = buildTeamBundle(name, meta);
  aliasIndex[name] = name;
  for (const alias of meta.aliases ?? []) {
    aliasIndex[alias] = name;
  }
}

const historicalIndex = {
  era: '1930-2026',
  description: 'Long-run World Cup-era baselines used as priors when blending national team profiles',
  blendWeights: {
    historical: 0.25,
    season2026: 0.55,
    formLast10: 0.2
  },
  teams: Object.keys(teams),
  groups: GROUPS
};

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'national-teams.json'), JSON.stringify({ teams, aliasIndex }, null, 2));
fs.writeFileSync(path.join(dataDir, 'fixtures.json'), JSON.stringify(buildFixtures(), null, 2));
fs.writeFileSync(path.join(dataDir, 'historical-index.json'), JSON.stringify(historicalIndex, null, 2));

console.log(`Generated ${Object.keys(teams).length} teams, ${buildFixtures().groupStage.length} group fixtures`);
