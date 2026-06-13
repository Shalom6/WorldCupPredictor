# World Cup results automation

Automatic updates when matches finish — no manual chat prompts needed.

## What runs

`scripts/sync-live-results.mjs` pulls the [ESPN FIFA World Cup scoreboard](https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard), matches games to `fixtures.json`, and writes:

- `src/data/match-results.json` — score, scorers, assists, team stats
- `src/data/espn-fixture-map.json` — fixture id ↔ ESPN event id

The app picks up changes on refresh (Stats **Actual**, Predictions match report, Players **This match** for scores).

## GitHub Actions (recommended — already configured)

Workflow: `.github/workflows/sync-wc-results.yml`

- Runs **every 15 minutes** + manual **Run workflow** in GitHub Actions
- Commits and **pushes to `main`** when results change

**One-time setup:** ensure Actions are enabled on [github.com/Shalom6/WorldCupPredictor](https://github.com/Shalom6/WorldCupPredictor) → Settings → Actions.

## Local / manual

```bash
npm run sync:results          # fetch + write files
npm run sync:results -- --dry-run
npm run sync:results -- --commit   # also git commit + push
```

## Cursor Automation (Option 3)

Create an automation in Cursor (**Automations** → New):

| Field | Value |
|--------|--------|
| **Name** | World Cup results sync |
| **Trigger** | Schedule — every 15 minutes (`*/15 * * * *`) or every 30 min during match windows |
| **Repo** | `Shalom6/WorldCupPredictor` · branch `main` |
| **Model** | Cloud agent (needs network) |

**Prompt for the agent:**

```
In the WorldCupPredictor repo:

1. Run: node scripts/sync-live-results.mjs
2. If src/data/match-results.json or src/data/espn-fixture-map.json changed:
   - git add those files
   - git commit -m "chore: sync World Cup match results from ESPN"
   - git push origin main
3. Reply with which fixtures were updated (fixture id, score) or "no changes".

Do not modify unrelated files. Skip player log patches unless explicitly requested.
```

You can use GitHub Actions *or* Cursor Automation — both call the same script. Actions is more reliable when the IDE is closed.

## Player box scores (automated)

`scripts/sync-match-players.mjs` reads ESPN rosters + substitution events and writes per-player game logs (minutes, goals, shots, cards) into `data/group-*/` raw + squad files, then refreshes `world-cup-players.json`.

`npm run sync:results` runs player sync automatically after team results. Use `--no-players` to skip.

```bash
npm run sync:players
npm run sync:players -- --fixture=GS-A-1
npm run sync:players -- --commit
```

Name matching handles accent differences and Korean name order (e.g. `Lee Kang-In` ↔ `Kang-in Lee`). Players not in the squad file are logged as unmatched.

## Player box scores (legacy manual patches)

Manual patch scripts still work if ESPN data is incomplete:

```bash
node scripts/patch-gs-a-N.mjs
npm run import:manual-teams -- --group=A
```

## Tournament schedule tip

To reduce API noise after the World Cup, disable or delete the GitHub workflow cron, or change the cron to match days only (e.g. `*/15 14-23 11-19,20-27 6 *` for June match windows UTC — tune for your timezone).
