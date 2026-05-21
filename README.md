# NHL Draft Explorer

A static web app for browsing every NHL Entry Draft pick from 1979 to present, by team and year.

**Live site:** <https://colindaugherty25.github.io/nhl-draft-search/>

## Features

- Browse 48 years of NHL drafts (1979–2026)
- Per-year team dropdown with era-accurate names — 1985 lists "Hartford Whalers" and "Minnesota North Stars"; 2010 lists "Atlanta Thrashers"; 2025 lists the current 32 franchises
- Era-accurate row logos from `assets.nhle.com` (Whalers crest for Hartford picks, Nordiques fleur-de-lis for Quebec, etc.)
- Click any team logo (row or header) to open that franchise's NHL.com page — relocated franchises follow their lineage (HFD → Hurricanes, QUE → Avalanche, ATL Thrashers → Jets, etc.)
- Click any player name to open their NHL.com profile in a new tab
- Sortable columns — text/order columns default to ascending, stats columns default to descending (so clicking PTS once shows top scorers first). Loading/no-data rows sink to the bottom regardless of direction
- Team filter survives year changes via lineage mapping (Carolina selected → switch to 1985 → auto-reselects "Hartford Whalers")

## How it works

The frontend is pure static files (`index.html`, `app.js`, `styles.css`) consuming pre-built JSON in `data/`. A GitHub Action enriches the data nightly by hitting the NHL public API for each draft pick's career stats and writes the result to `data/enriched-v3-{year}.json`. No runtime server, no CORS proxy, no backend in production.

## Run it locally

```sh
python3 server.py
```

Then open <http://localhost:8000>. The local server serves the same static files. If you click a year whose JSON isn't yet in `data/`, it transparently runs the enrichment for that year and writes the result so the next click is instant.

To force a rebuild of specific years:

```sh
python3 server.py --build 2025 2024 2023
```

Without arguments it refreshes the latest 5 years (`PREWARM_COUNT`). This is the exact command GitHub Actions runs.

## Tests

```sh
bash tests/run.sh
```

Runs three layers: Python `unittest` for `server.py` pure logic, Node `node:test` for `js/pure.mjs`, and Playwright end-to-end tests against the dev server. The same suite gates the GitHub Pages deploy. See [tests/README.md](tests/README.md) for details and the convention for adding tests as new features land.

## Deployment & data refresh

`.github/workflows/deploy.yml` builds and publishes the site to GitHub Pages on three triggers:

- Every push to `main` (HTML/CSS/JS changes go live within ~30s)
- Daily cron at 11:00 UTC (refreshes the latest 5 years' enriched JSON so active players' season stats stay current)
- Manual `workflow_dispatch` (button in the Actions tab)

`actions/cache@v4` carries the `data/` directory across runs so old draft years' files persist without being re-enriched every day. Deploy uses `actions/deploy-pages` — the artifact ships directly to Pages without committing back to `main`.

## Project layout

- `index.html` / `styles.css` / `app.js` — the static frontend
- `js/pure.mjs` — pure logic (LINEAGE, sort comparators, etc.) shared by `app.js` and the JS unit tests
- `server.py` — local dev server + `--build` CLI for data enrichment
- `data/` — pre-built JSON consumed by the frontend (one file per year + `years.json`)
- `tests/` — Python + JS unit + Playwright E2E test suite
- `.github/workflows/deploy.yml` — test gate, daily refresh, GitHub Pages deploy
