# Tests

Three layers. Run them all with `bash tests/run.sh` from the project root.

## Layers

| Layer | Location | Tooling | What it covers |
|---|---|---|---|
| Python unit | `tests/test_server.py` | stdlib `unittest` | Pure logic in `server.py` — `_choose_candidate`, `_cache_path`, `_cache_fresh` |
| JS unit | `tests/unit/test_pure.mjs` | stdlib `node:test` + `node:assert` | Pure logic in `js/pure.mjs` — `LINEAGE`/`REVERSE_LINEAGE`/`NHL_TEAM_SLUGS`, `pickBestTeam`, `teamPageUrl`, `compareBy`/`sortValue` |
| End-to-end | `tests/e2e/test_*.mjs` | Playwright (system Chrome via `channel: "chrome"`) | User-visible behavior — year picker, team filter, sorting, lineage-aware logo links |

## Adding tests for new features

Each new feature should land with the test for the layer it touches:

- New pure helper in `server.py` → add a `unittest.TestCase` in `tests/test_server.py`.
- New pure helper or constant in `js/pure.mjs` → add a `test(...)` in `tests/unit/test_pure.mjs`.
- New UI behavior (new control, new column, new click target) → add a file `tests/e2e/test_<feature>.mjs` using `_helpers.mjs` for the Playwright boilerplate.

If a feature touches DOM-bound code that depends on pure helpers, prefer extracting the pure piece into `js/pure.mjs` so it can be unit-tested without a browser.

## Dependencies

Production runtime is stdlib-only (vanilla JS + stdlib Python). The test runner uses Playwright as a dev dep, installed at first run via:

```sh
npm install --no-save --no-package-lock playwright
```

This creates `./node_modules/playwright` (gitignored) without producing a committed `package.json` or `package-lock.json`. The E2E suite uses `channel: "chrome"` to drive the system-installed Google Chrome, so there's no Playwright browser download either.

## CI

The same three layers run in `.github/workflows/deploy.yml` as the `test` job. The `build` job depends on it, so broken tests block the GitHub Pages deploy.
