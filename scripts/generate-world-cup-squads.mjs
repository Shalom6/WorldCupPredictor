/**
 * Generates world-cup-players.json and rosters for all 48 national teams.
 * Run: node scripts/generate-world-cup-squads.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import historicalIndex from '../src/data/historical-index.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'src', 'data');

const GROUPS = historicalIndex.groups;
const TEAM_TO_GROUP = {};
for (const [g, teams] of Object.entries(GROUPS)) {
  for (const t of teams) TEAM_TO_GROUP[t] = g;
}

/** Real / expected squad seeds — expanded to 26 per nation in script */
const SQUAD_SEEDS = {
  Mexico: [
    ['Guillermo Ochoa', 'Goalkeeper', 0, true, 1],
    ['Luis Ángel Malagón', 'Goalkeeper', 0, false, 12],
    ['César Montes', 'Defender', 0.02, true, 4],
    ['Johan Vásquez', 'Defender', 0.02, true, 5],
    ['Jorge Sánchez', 'Defender', 0.03, true, 2],
    ['Gerardo Arteaga', 'Defender', 0.04, true, 3],
    ['Edson Álvarez', 'Midfielder', 0.05, true, 4],
    ['Luis Chávez', 'Midfielder', 0.06, true, 24],
    ['Orbelín Pineda', 'Midfielder', 0.08, true, 17],
    ['Luis Quiñones', 'Midfielder', 0.07, true, 11],
    ['Hirving Lozano', 'Forward', 0.14, true, 22],
    ['Raúl Jiménez', 'Forward', 0.18, true, 9],
    ['Santiago Giménez', 'Forward', 0.22, true, 11],
    ['Uriel Antuna', 'Forward', 0.1, true, 15],
    ['Alexis Vega', 'Forward', 0.09, false, 10]
  ],
  Brazil: [
    ['Alisson', 'Goalkeeper', 0, true, 1],
    ['Ederson', 'Goalkeeper', 0, false, 23],
    ['Marquinhos', 'Defender', 0.03, true, 4],
    ['Gabriel Magalhães', 'Defender', 0.02, true, 3],
    ['Danilo', 'Defender', 0.03, true, 2],
    ['Wesley', 'Defender', 0.02, true, 13],
    ['Casemiro', 'Midfielder', 0.04, true, 5],
    ['Bruno Guimarães', 'Midfielder', 0.06, true, 5],
    ['Paquetá', 'Midfielder', 0.08, true, 8],
    ['Rodrygo', 'Forward', 0.16, true, 10],
    ['Vinícius Júnior', 'Forward', 0.2, true, 7],
    ['Raphinha', 'Forward', 0.14, true, 11],
    ['Richarlison', 'Forward', 0.12, true, 9],
    ['Endrick', 'Forward', 0.11, false, 19],
    ['Estêvão', 'Forward', 0.1, false, 20]
  ],
  Argentina: [
    ['Emiliano Martínez', 'Goalkeeper', 0, true, 23],
    ['Cristian Romero', 'Defender', 0.02, true, 13],
    ['Nicolás Otamendi', 'Defender', 0.02, true, 19],
    ['Marcos Acuña', 'Defender', 0.04, true, 8],
    ['Nahuel Molina', 'Defender', 0.03, true, 4],
    ['Enzo Fernández', 'Midfielder', 0.08, true, 24],
    ['Alexis Mac Allister', 'Midfielder', 0.07, true, 20],
    ['Rodrigo De Paul', 'Midfielder', 0.06, true, 7],
    ['Leandro Paredes', 'Midfielder', 0.04, true, 5],
    ['Lionel Messi', 'Forward', 0.28, true, 10],
    ['Lautaro Martínez', 'Forward', 0.22, true, 22],
    ['Julián Álvarez', 'Forward', 0.18, true, 9],
    ['Ángel Di María', 'Forward', 0.12, false, 11],
    ['Giovani Lo Celso', 'Midfielder', 0.09, false, 16]
  ],
  France: [
    ['Mike Maignan', 'Goalkeeper', 0, true, 16],
    ['William Saliba', 'Defender', 0.02, true, 17],
    ['Dayot Upamecano', 'Defender', 0.02, true, 4],
    ['Jules Koundé', 'Defender', 0.03, true, 5],
    ['Théo Hernandez', 'Defender', 0.05, true, 22],
    ['Aurélien Tchouaméni', 'Midfielder', 0.05, true, 8],
    ['Adrien Rabiot', 'Midfielder', 0.06, true, 14],
    ['Warren Zaïre-Emery', 'Midfielder', 0.07, true, 33],
    ['Ousmane Dembélé', 'Forward', 0.14, true, 11],
    ['Kylian Mbappé', 'Forward', 0.26, true, 10],
    ['Olivier Giroud', 'Forward', 0.16, true, 9],
    ['Antoine Griezmann', 'Forward', 0.15, true, 7],
    ['Randal Kolo Muani', 'Forward', 0.1, false, 12]
  ],
  England: [
    ['Jordan Pickford', 'Goalkeeper', 0, true, 1],
    ['John Stones', 'Defender', 0.02, true, 5],
    ['Harry Maguire', 'Defender', 0.02, true, 6],
    ['Kyle Walker', 'Defender', 0.03, true, 2],
    ['Trent Alexander-Arnold', 'Defender', 0.06, true, 66],
    ['Declan Rice', 'Midfielder', 0.04, true, 4],
    ['Jude Bellingham', 'Midfielder', 0.1, true, 10],
    ['Phil Foden', 'Midfielder', 0.12, true, 47],
    ['Bukayo Saka', 'Forward', 0.14, true, 7],
    ['Harry Kane', 'Forward', 0.24, true, 9],
    ['Ollie Watkins', 'Forward', 0.12, true, 11],
    ['Anthony Gordon', 'Forward', 0.1, false, 18]
  ],
  Spain: [
    ['Unai Simón', 'Goalkeeper', 0, true, 23],
    ['Aymeric Laporte', 'Defender', 0.02, true, 14],
    ['Robin Le Normand', 'Defender', 0.02, true, 24],
    ['Dani Carvajal', 'Defender', 0.04, true, 2],
    ['Pedri', 'Midfielder', 0.08, true, 8],
    ['Rodri', 'Midfielder', 0.05, true, 16],
    ['Fabián Ruiz', 'Midfielder', 0.07, true, 8],
    ['Gavi', 'Midfielder', 0.06, true, 9],
    ['Lamine Yamal', 'Forward', 0.16, true, 19],
    ['Nico Williams', 'Forward', 0.14, true, 17],
    ['Álvaro Morata', 'Forward', 0.18, true, 7],
    ['Mikel Oyarzabal', 'Forward', 0.12, true, 21]
  ],
  Germany: [
    ['Manuel Neuer', 'Goalkeeper', 0, true, 1],
    ['Antonio Rüdiger', 'Defender', 0.02, true, 2],
    ['Jonathan Tah', 'Defender', 0.02, true, 4],
    ['Joshua Kimmich', 'Midfielder', 0.06, true, 6],
    ['Ilkay Gündogan', 'Midfielder', 0.07, true, 21],
    ['Florian Wirtz', 'Midfielder', 0.12, true, 10],
    ['Jamal Musiala', 'Midfielder', 0.14, true, 10],
    ['Kai Havertz', 'Forward', 0.14, true, 7],
    ['Niclas Füllkrug', 'Forward', 0.16, true, 9],
    ['Leroy Sané', 'Forward', 0.12, true, 10]
  ],
  USA: [
    ['Matt Turner', 'Goalkeeper', 0, true, 1],
    ['Chris Richards', 'Defender', 0.02, true, 3],
    ['Antonee Robinson', 'Defender', 0.04, true, 5],
    ['Tyler Adams', 'Midfielder', 0.04, true, 4],
    ['Weston McKennie', 'Midfielder', 0.06, true, 8],
    ['Yunus Musah', 'Midfielder', 0.05, true, 6],
    ['Christian Pulisic', 'Forward', 0.16, true, 10],
    ['Gio Reyna', 'Midfielder', 0.1, true, 7],
    ['Folarin Balogun', 'Forward', 0.14, true, 9],
    ['Ricardo Pepi', 'Forward', 0.12, false, 19]
  ],
  Portugal: [
    ['Diogo Costa', 'Goalkeeper', 0, true, 22],
    ['Rúben Dias', 'Defender', 0.02, true, 4],
    ['Nuno Mendes', 'Defender', 0.04, true, 19],
    ['João Cancelo', 'Defender', 0.05, true, 20],
    ['Bruno Fernandes', 'Midfielder', 0.12, true, 8],
    ['Bernardo Silva', 'Midfielder', 0.1, true, 10],
    ['Vitinha', 'Midfielder', 0.06, true, 23],
    ['Cristiano Ronaldo', 'Forward', 0.22, true, 7],
    ['Rafael Leão', 'Forward', 0.14, true, 17],
    ['Diogo Jota', 'Forward', 0.15, true, 21]
  ],
  Netherlands: [
    ['Virgil van Dijk', 'Defender', 0.03, true, 4],
    ['Nathan Aké', 'Defender', 0.02, true, 5],
    ['Denzel Dumfries', 'Defender', 0.04, true, 22],
    ['Frenkie de Jong', 'Midfielder', 0.06, true, 21],
    ['Tijjani Reijnders', 'Midfielder', 0.08, true, 14],
    ['Memphis Depay', 'Forward', 0.16, true, 10],
    ['Cody Gakpo', 'Forward', 0.14, true, 11],
    ['Brian Brobbey', 'Forward', 0.12, true, 9]
  ],
  Belgium: [
    ['Thibaut Courtois', 'Goalkeeper', 0, true, 1],
    ['Kevin De Bruyne', 'Midfielder', 0.14, true, 7],
    ['Youri Tielemans', 'Midfielder', 0.06, true, 8],
    ['Romelu Lukaku', 'Forward', 0.2, true, 10],
    ['Jeremy Doku', 'Forward', 0.12, true, 11],
    ['Loïs Openda', 'Forward', 0.14, true, 20]
  ],
  Croatia: [
    ['Dominik Livaković', 'Goalkeeper', 0, true, 1],
    ['Joško Gvardiol', 'Defender', 0.03, true, 4],
    ['Luka Modrić', 'Midfielder', 0.08, true, 10],
    ['Mateo Kovačić', 'Midfielder', 0.05, true, 8],
    ['Bruno Petković', 'Forward', 0.14, true, 9],
    ['Marko Livaja', 'Forward', 0.1, false, 14]
  ],
  Morocco: [
    ['Yassine Bounou', 'Goalkeeper', 0, true, 1],
    ['Achraf Hakimi', 'Defender', 0.06, true, 2],
    ['Sofyan Amrabat', 'Midfielder', 0.04, true, 4],
    ['Hakim Ziyech', 'Midfielder', 0.1, true, 7],
    ['Youssef En-Nesyri', 'Forward', 0.18, true, 19]
  ],
  Japan: [
    ['Takefusa Kubo', 'Forward', 0.12, true, 20],
    ['Kaoru Mitoma', 'Forward', 0.14, true, 7],
    ['Daizen Maeda', 'Forward', 0.1, true, 9],
    ['Wataru Endo', 'Midfielder', 0.04, true, 6]
  ],
  'South Korea': [
    ['Son Heung-min', 'Forward', 0.22, true, 7],
    ['Kim Min-jae', 'Defender', 0.02, true, 4],
    ['Lee Kang-in', 'Midfielder', 0.1, true, 18],
    ['Hwang Hee-chan', 'Forward', 0.12, true, 11]
  ],
  Uruguay: [
    ['Federico Valverde', 'Midfielder', 0.1, true, 15],
    ['Darwin Núñez', 'Forward', 0.18, true, 9],
    ['Luis Suárez', 'Forward', 0.14, true, 9]
  ],
  Colombia: [
    ['James Rodríguez', 'Midfielder', 0.12, true, 10],
    ['Luis Díaz', 'Forward', 0.18, true, 7],
    ['Radamel Falcao', 'Forward', 0.12, false, 9]
  ],
  Senegal: [
    ['Édouard Mendy', 'Goalkeeper', 0, true, 16],
    ['Kalidou Koulibaly', 'Defender', 0.02, true, 3],
    ['Sadio Mané', 'Forward', 0.18, true, 10],
    ['Nicolas Jackson', 'Forward', 0.14, true, 15]
  ],
  Switzerland: [
    ['Granit Xhaka', 'Midfielder', 0.06, true, 10],
    ['Xherdan Shaqiri', 'Midfielder', 0.1, true, 23],
    ['Breel Embolo', 'Forward', 0.14, true, 7]
  ],
  Austria: [
    ['Marcel Sabitzer', 'Midfielder', 0.08, true, 9],
    ['Marko Arnautović', 'Forward', 0.14, true, 10]
  ],
  Norway: [
    ['Erling Haaland', 'Forward', 0.28, true, 9],
    ['Martin Ødegaard', 'Midfielder', 0.12, true, 10],
    ['Alexander Sørloth', 'Forward', 0.14, true, 19]
  ],
  Sweden: [
    ['Victor Lindelöf', 'Defender', 0.02, true, 3],
    ['Alexander Isak', 'Forward', 0.2, true, 9],
    ['Dejan Kulusevski', 'Forward', 0.12, true, 21]
  ],
  Ecuador: [
    ['Enner Valencia', 'Forward', 0.16, true, 13],
    ['Moisés Caicedo', 'Midfielder', 0.06, true, 23]
  ],
  Australia: [
    ['Mathew Ryan', 'Goalkeeper', 0, true, 1],
    ['Harry Souttar', 'Defender', 0.02, true, 4],
    ['Mitchell Duke', 'Forward', 0.12, true, 15]
  ],
  Canada: [
    ['Alphonso Davies', 'Defender', 0.05, true, 19],
    ['Jonathan David', 'Forward', 0.18, true, 10],
    ['Alphonso Davies', 'Defender', 0.05, true, 19]
  ],
  Türkiye: [
    ['Hakan Çalhanoğlu', 'Midfielder', 0.1, true, 10],
    ['Arda Güler', 'Midfielder', 0.08, true, 15],
    ['Cenk Tosun', 'Forward', 0.12, true, 9]
  ],
  Scotland: [
    ['Andy Robertson', 'Defender', 0.04, true, 3],
    ['Scott McTominay', 'Midfielder', 0.08, true, 8],
    ['Che Adams', 'Forward', 0.12, true, 10]
  ],
  Wales: [],
  Ghana: [
    ['Thomas Partey', 'Midfielder', 0.05, true, 5],
    ['Mohammed Kudus', 'Forward', 0.14, true, 20],
    ['Jordan Ayew', 'Forward', 0.1, true, 9]
  ],
  Iran: [
    ['Mehdi Taremi', 'Forward', 0.16, true, 9],
    ['Sardar Azmoun', 'Forward', 0.14, true, 10]
  ],
  Egypt: [
    ['Mohamed Salah', 'Forward', 0.24, true, 10],
    ['Omar Marmoush', 'Forward', 0.12, true, 22]
  ],
  Algeria: [
    ['Riyad Mahrez', 'Forward', 0.14, true, 7],
    ['Ismaël Bennacer', 'Midfielder', 0.06, true, 8]
  ],
  Tunisia: [
    ['Wahbi Khazri', 'Forward', 0.12, true, 10],
    ['Aïssa Mandi', 'Defender', 0.02, true, 4]
  ],
  'South Africa': [
    ['Percy Tau', 'Forward', 0.12, true, 11],
    ['Ronwen Williams', 'Goalkeeper', 0, true, 1]
  ],
  Paraguay: [
    ['Miguel Almirón', 'Midfielder', 0.1, true, 10],
    ['Antonio Sanabria', 'Forward', 0.12, true, 9]
  ],
  Czechia: [
    ['Patrik Schick', 'Forward', 0.16, true, 10],
    ['Tomáš Souček', 'Midfielder', 0.06, true, 22]
  ],
  'Bosnia and Herzegovina': [
    ['Edin Džeko', 'Forward', 0.16, true, 11],
    ['Miralem Pjanić', 'Midfielder', 0.08, true, 15]
  ],
  Qatar: [
    ['Almoez Ali', 'Forward', 0.14, true, 19],
    ['Akram Afif', 'Forward', 0.12, true, 11]
  ],
  Haiti: [
    ['Duckens Nazon', 'Forward', 0.12, true, 9]
  ],
  Curaçao: [
    ['Leandro Bacuna', 'Midfielder', 0.08, true, 7]
  ],
  "Côte d'Ivoire": [
    ['Sébastien Haller', 'Forward', 0.16, true, 9],
    ['Franck Kessié', 'Midfielder', 0.06, true, 8]
  ],
  'New Zealand': [
    ['Chris Wood', 'Forward', 0.14, true, 9]
  ],
  'Cape Verde': [
    ['Ryan Mendes', 'Forward', 0.1, true, 11]
  ],
  'Saudi Arabia': [
    ['Salem Al-Dawsari', 'Forward', 0.12, true, 10],
    ['Saud Abdulhamid', 'Defender', 0.04, true, 2]
  ],
  Iraq: [
    ['Aymen Dhahbi', 'Forward', 0.1, true, 9]
  ],
  Jordan: [
    ['Musa Al-Taamari', 'Forward', 0.12, true, 10]
  ],
  Uzbekistan: [
    ['Eldor Shomurodov', 'Forward', 0.12, true, 9]
  ],
  'DR Congo': [
    ['Yoane Wissa', 'Forward', 0.14, true, 20],
    ['Cédric Bakambu', 'Forward', 0.12, true, 9]
  ],
  Panama: [
    ['Adalberto Carrasquilla', 'Midfielder', 0.08, true, 8],
    ['José Fajardo', 'Forward', 0.1, true, 9]
  ]
};

const DEPTH_FIRST = [
  'Marco', 'Luca', 'Diego', 'André', 'Carlos', 'Pablo', 'Felipe', 'Hugo', 'Ivan', 'João',
  'Kenji', 'Luis', 'Mateo', 'Nico', 'Omar', 'Paulo', 'Quentin', 'Ravi', 'Samir', 'Tomás'
];
const DEPTH_LAST = [
  'Silva', 'Santos', 'García', 'Rodriguez', 'Martinez', 'Kowalski', 'Nguyen', 'Petrov',
  'Okonkwo', 'Hansen', 'Ali', 'Chen', 'Dubois', 'Eriksson', 'Fernandes', 'Gonzalez'
];
const POSITIONS_DEPTH = [
  ['Goalkeeper', 0, 0.02],
  ['Defender', 0.02, 0.04],
  ['Defender', 0.02, 0.05],
  ['Midfielder', 0.04, 0.07],
  ['Midfielder', 0.05, 0.08],
  ['Forward', 0.06, 0.1]
];

function slugify(team, name) {
  return `${team}-${name}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function round(n, dp = 2) {
  const p = 10 ** dp;
  return Math.round(n * p) / p;
}

function positionKind(pos) {
  const p = String(pos).toLowerCase();
  if (p.includes('goal')) return 'gk';
  if (p.includes('def')) return 'def';
  if (p.includes('mid')) return 'mid';
  return 'fwd';
}

function ratesFromProfile(xgShare, position, starter) {
  const kind = positionKind(position);
  const base = starter ? 1 : 0.55;
  const xg = Math.max(xgShare, kind === 'gk' ? 0 : 0.02);

  const goals90 = kind === 'gk' ? 0 : round(xg * 1.8 * base, 2);
  const assists90 = kind === 'fwd' ? round(xg * 0.9 * base, 2) : kind === 'mid' ? round(xg * 1.2 * base, 2) : round(xg * 0.4, 2);
  const shots90 = kind === 'gk' ? 0 : round(1.2 + xg * 8 * base, 1);
  const sot90 = round(shots90 * (kind === 'fwd' ? 0.38 : 0.28), 1);
  const passes90 = kind === 'gk' ? round(22 * base, 0) : round(35 + (kind === 'mid' ? 35 : 15) * base, 0);
  const cards90 = kind === 'def' ? round(0.18 * base, 2) : round(0.08 * base, 2);
  const fouls90 = kind === 'def' ? round(1.1 * base, 1) : round(0.7 * base, 1);
  const minutesAvg = starter ? 78 + Math.floor(xg * 40) : 35 + Math.floor(xg * 30);

  return { goals90, assists90, shots90, sot90, passes90, cards90, fouls90, minutesAvg };
}

function poissonHit(lambda, line, n = 10) {
  let hits = 0;
  for (let i = 0; i < n; i++) {
    const noise = 0.75 + Math.random() * 0.5;
    const lam = lambda * noise;
    let k = 0;
    const u = Math.random();
    let p = Math.exp(-lam);
    let cum = p;
    while (u > cum && k < 12) {
      k++;
      p = (p * lam) / k;
      cum += p;
    }
    if (k > line) hits++;
  }
  return Math.round((hits / n) * 100);
}

function generateGameLog(rates, position, n = 10) {
  const kind = positionKind(position);
  const opponents = ['Qualifying', 'Friendly', 'Nations League', 'WCQ', 'Friendly'];
  const results = ['W', 'D', 'L', 'W', 'D'];

  return Array.from({ length: n }, (_, i) => {
    const mins = Math.max(0, Math.min(90, Math.round(rates.minutesAvg + (Math.random() - 0.5) * 30)));
    const factor = mins / 90;
    const goals = kind === 'gk' ? 0 : Math.random() < rates.goals90 * factor ? (Math.random() < 0.15 ? 2 : 1) : 0;
    const assists = kind === 'gk' ? 0 : Math.random() < rates.assists90 * factor ? 1 : 0;
    const shots = kind === 'gk' ? 0 : Math.max(0, Math.round(rates.shots90 * factor + (Math.random() - 0.4) * 2));
    const sot = Math.min(shots, Math.max(0, Math.round(rates.sot90 * factor + (Math.random() - 0.5))));
    const cards = Math.random() < rates.cards90 * factor ? 1 : 0;
    const fouls = Math.max(0, Math.round(rates.fouls90 * factor + (Math.random() - 0.5) * 2));

    let saves = 0;
    let goalsConceded = 0;
    let keeperSweeper = 0;
    if (kind === 'gk') {
      goalsConceded =
        mins >= 60
          ? Math.random() < 0.45
            ? 0
            : Math.random() < 0.7
              ? 1
              : Math.random() < 0.9
                ? 2
                : 3
          : Math.random() < 0.65
            ? 0
            : 1;
      saves = Math.max(0, Math.round(1 + goalsConceded * (1.5 + Math.random()) + factor * (2 + Math.random() * 4)));
      keeperSweeper = Math.random() < 0.25 ? Math.ceil(Math.random() * 2) : 0;
    }

    return {
      date: `2025-${String(12 - Math.floor(i / 2)).padStart(2, '0')}-${String(28 - (i % 4) * 3).padStart(2, '0')}`,
      opponent: `Opponent ${String.fromCharCode(65 + (i % 5))}`,
      competition: opponents[i % opponents.length],
      result: results[i % results.length],
      minutes: mins,
      goals,
      assists,
      shots,
      shotsOnTarget: sot,
      cards,
      fouls,
      passes: Math.round(rates.passes90 * factor),
      ...(kind === 'gk' ? { saves, goalsConceded, keeperSweeper } : {})
    };
  });
}

function hitRatesFromLog(log, rates) {
  const l5 = log.slice(0, 5);
  const l10 = log;

  const hit = (games, fn, line) => {
    const h = games.filter((g) => fn(g) > line).length;
    return Math.round((h / games.length) * 100);
  };

  return {
    goals05: {
      l5: hit(l5, (g) => g.goals, 0),
      l10: hit(l10, (g) => g.goals, 0),
      season: poissonHit(rates.goals90, 0.5, 20)
    },
    goals15: {
      l5: hit(l5, (g) => g.goals, 1),
      l10: hit(l10, (g) => g.goals, 1),
      season: poissonHit(rates.goals90, 1.5, 20)
    },
    assists05: {
      l5: hit(l5, (g) => g.assists, 0),
      l10: hit(l10, (g) => g.assists, 0),
      season: poissonHit(rates.assists90, 0.5, 20)
    },
    shots15: {
      l5: hit(l5, (g) => g.shots, 1),
      l10: hit(l10, (g) => g.shots, 1),
      season: poissonHit(rates.shots90, 1.5, 20)
    },
    shots25: {
      l5: hit(l5, (g) => g.shots, 2),
      l10: hit(l10, (g) => g.shots, 2),
      season: poissonHit(rates.shots90, 2.5, 20)
    },
    sot05: {
      l5: hit(l5, (g) => g.shotsOnTarget, 0),
      l10: hit(l10, (g) => g.shotsOnTarget, 0),
      season: poissonHit(rates.sot90, 0.5, 20)
    },
    cards05: {
      l5: hit(l5, (g) => g.cards, 0),
      l10: hit(l10, (g) => g.cards, 0),
      season: poissonHit(rates.cards90, 0.5, 20)
    },
    fouls15: {
      l5: hit(l5, (g) => g.fouls, 1),
      l10: hit(l10, (g) => g.fouls, 1),
      season: poissonHit(rates.fouls90, 1.5, 20)
    }
  };
}

function expandSquad(team) {
  const seeds = SQUAD_SEEDS[team] ?? [];
  const seen = new Set();
  const roster = [];

  for (const [name, position, xgShare, likelyStarter, number] of seeds) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    roster.push({ name, position, xgShare, likelyStarter, number, benchImpact: !likelyStarter });
  }

  let num = 1;
  const usedNumbers = new Set(roster.map((p) => p.number));
  while (roster.length < 26) {
    const idx = roster.length;
    const [pos, xgMin, xgMax] = POSITIONS_DEPTH[idx % POSITIONS_DEPTH.length];
    const xgShare = round(xgMin + Math.random() * (xgMax - xgMin), 2);
    const first = DEPTH_FIRST[idx % DEPTH_FIRST.length];
    const last = DEPTH_LAST[(idx + roster.length) % DEPTH_LAST.length];
    const name = `${first} ${last}`;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    while (usedNumbers.has(num)) num++;
    usedNumbers.add(num);
    const likelyStarter = roster.filter((p) => p.likelyStarter).length < 11 && pos !== 'Goalkeeper';
    roster.push({
      name,
      position: pos,
      xgShare,
      likelyStarter,
      number: num++,
      benchImpact: !likelyStarter
    });
  }

  return roster.slice(0, 26);
}

const allTeams = historicalIndex.teams;
const players = [];
const rosters = {};

for (const team of allTeams) {
  const group = TEAM_TO_GROUP[team] ?? '?';
  const squad = expandSquad(team);
  rosters[team] = [];

  for (const p of squad) {
    const rates = ratesFromProfile(p.xgShare, p.position, p.likelyStarter);
    const gameLog = generateGameLog(rates, p.position);
    const hitRates = hitRatesFromLog(gameLog, rates);
    const id = slugify(team, p.name);

    const player = {
      id,
      name: p.name,
      team,
      group,
      confederation: null,
      position: p.position,
      number: p.number,
      likelyStarter: p.likelyStarter,
      benchImpact: p.benchImpact,
      minutesFactor: p.likelyStarter ? round(0.75 + p.xgShare * 0.8, 2) : round(0.35 + p.xgShare, 2),
      xgShare: p.xgShare,
      seasonRates: rates,
      hitRates,
      gameLog,
      searchText: `${p.name} ${team} ${p.position} ${group}`.toLowerCase()
    };

    players.push(player);
    rosters[team].push({
      name: p.name,
      position: p.position,
      likelyStarter: p.likelyStarter,
      benchImpact: p.benchImpact,
      minutesFactor: player.minutesFactor,
      xgShare: p.xgShare
    });
  }
}

players.sort((a, b) => a.name.localeCompare(b.name));

fs.writeFileSync(
  path.join(dataDir, 'world-cup-players.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      playerCount: players.length,
      teamCount: allTeams.length,
      players
    },
    null,
    2
  )
);

fs.writeFileSync(path.join(dataDir, 'rosters-2025-26.json'), JSON.stringify(rosters, null, 2));

console.log(`Generated ${players.length} players across ${allTeams.length} teams`);
