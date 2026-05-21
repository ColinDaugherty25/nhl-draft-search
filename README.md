# NHL Draft Explorer

A static web app for browsing NHL Entry Draft picks by team and year. Era-accurate team logos, career stats per pick, sortable columns, and deep links to each player's NHL.com profile.

**Live site:** <https://colindaugherty25.github.io/nhl-draft-search/>

**Repo:** <https://github.com/ColinDaugherty25/nhl-draft-search>

## How it works

The frontend is pure static files (`index.html`, `app.js`, `styles.css`) that consume pre-built JSON in `data/`. A GitHub Action enriches the data nightly by hitting the NHL public API for each draft pick's career stats and writes the result to `data/enriched-v3-{year}.json`. No runtime server, no CORS proxy, no backend.

## Run it locally

```sh
python3 server.py
```

Then open <http://localhost:8000>. The local server serves the same static files plus on-demand enrichment for any year not already in `data/` (so you can click any year without running a full build first).

To force a rebuild of specific years' data:

```sh
python3 server.py --build 2025 2024 2023
```

Run without arguments to refresh the latest 5 draft years (`PREWARM_COUNT`).

## Files

- `index.html` / `styles.css` / `app.js` — the static frontend
- `server.py` — local dev server + `--build` CLI for data enrichment
- `data/` — pre-built JSON consumed by the frontend (one file per year + `years.json`)
- `.github/workflows/deploy.yml` — daily refresh + GitHub Pages deploy
