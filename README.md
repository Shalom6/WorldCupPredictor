# World Cup 2026 Predictor

FIFA World Cup 2026 match predictor — forked from the UCL Final Predictor with the same UI, APIs, Poisson model, Polymarket integration, stats engine, and Groq AI analyst.

**Runs on separate ports** from the UCL app so both can run side by side:
- Web UI: `http://localhost:3001`
- Express API: `http://localhost:4002`

## Features

- **Group Stage** — all 72 group matches across 12 groups (A–L), 48 national teams
- **Predictions** — win/draw/loss probabilities, scorelines, model + Polymarket blend
- **Stats** — expected match stats, betting categories, player props
- **Players** — Linemate-style player research: search all 1,248 squad players, hit rates, game logs, prop lines
- **Knockouts** — structure ready; fixtures will be added after group stage (ET/penalties supported)

## Quick start

```bash
cd WorldCupPredictor
npm install
cp .env.example .env.local   # add GROQ_API_KEY for AI analyst
npm run dev
```

Open [http://localhost:3001](http://localhost:3001).

## Real player data (API-Football)

1. Register at [api-football.com](https://www.api-football.com/) (free tier: ~100 requests/day).
2. Add to `.env.local`:
   ```
   API_FOOTBALL_KEY=your_key_here
   ```
3. Import international match logs (defaults to Morocco + Brazil):
   ```bash
   npm run import:api-football
   npm run import:api-football -- --teams Morocco,Brazil,France
   npm run import:api-football -- --all          # all 48 nations (use cache!)
   npm run import:api-football -- --force        # bypass cache
   ```

Responses are cached under `src/data/api-cache/` for 24h–7d so re-runs don't burn your daily quota.

Imported players show **"Live data · API-Football · International caps only"** in the Players tab with real competition names (WCQ, Friendlies, Nations League, etc.). Other teams stay on estimated data until imported.

## Data

National team profiles are generated from FIFA-strength ratings and World Cup history priors:

```bash
npm run generate:squads
```

This writes:
- `src/data/world-cup-players.json` — 1,248 players (26 per nation) with game logs & hit rates
- `src/data/rosters-2025-26.json` — squad data wired into match predictions

Team/fixture data:

```bash
npm run generate:data
```

This writes:
- `src/data/national-teams.json` — 48 teams
- `src/data/fixtures.json` — 72 group-stage fixtures
- `src/data/historical-index.json` — blend weights

## API (same shape as UCL app)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/players` | GET | Search squad players (`?q=&team=&group=&position=`) or detail (`?id=`) |
| `/api/predictions` | POST | Full prediction engine |
| `/api/predictions/market` | POST | Live Polymarket re-blend |
| `/api/stats` | GET | Match stats & props |
| `/api/analyst` | POST | AI market analyst |
| `/api/polymarket` | GET | Raw Polymarket lookup |

## Adding knockout fixtures

When the group stage finishes, append knockout matches to `fixtures.json` under the `knockout` array:

```json
{
  "id": "R32-1",
  "stage": "Round of 32",
  "homeTeam": "Brazil",
  "awayTeam": "Japan",
  "date": "June 28, 2026",
  "venueCity": "Los Angeles",
  "neutralVenue": true
}
```

Knockout stages automatically enable extra-time and penalty resolution in the prediction engine.

## UCL app

The original UCL Final Predictor in `UCL-Prediction-App/` is unchanged. Both apps share the same core prediction logic but use separate data and ports.
