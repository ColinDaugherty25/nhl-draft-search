# NHL Draft Explorer — Project Spec

A web app that displays NHL Entry Draft data organized by team, for every year the
draft has existed. This document is the build spec — hand it to Claude Code as the
starting prompt.

## Goal

Build a site where a user can browse NHL draft picks. The primary view is **by team**:
pick a team and a year (or "all years") and see every player that team drafted, with
round, overall pick number, position, and the prospect's name. A secondary view lets
the user browse a full draft by year (all teams, ordered by overall pick).

## Data source

The NHL has a free public API. No API key, no authentication, no signup required.

- **Base URL:** `https://api-web.nhle.com`
- **Picks for a given draft year:** `GET /v1/draft/picks/{year}/all`
  - `{year}` is a four-digit year, e.g. `2023`.
  - The `all` segment returns every round; you can also pass a round number `1`–`7`.
  - Example: `https://api-web.nhle.com/v1/draft/picks/2023/all`
- **List of all draft years available:** `GET /v1/draft/picks/now` returns the most
  recent draft and includes a `draftYears` array listing every year the API knows
  about. Use this to populate the year selector instead of hardcoding.

### Response shape (per pick)

Each pick object includes roughly these fields (names confirmed against the live API;
verify exact casing when you implement, and guard against missing fields for older
drafts where some data is absent):

- `round` — round number
- `pickInRound` — pick number within the round
- `overallPick` — overall selection number
- `teamId` and team abbreviation / name fields
- prospect `firstName` / `lastName` (each an object with a `default` string)
- `positionCode` — e.g. `C`, `LW`, `D`, `G`
- `countryCode`, `birthDate`, and amateur club fields where available

> The first NHL Amateur Draft was held in **1963**, so that's the earliest year. Build
> the year list dynamically from the API rather than assuming a fixed range, since
> early years have sparser data and the latest year changes annually.

## Suggested tech stack (beginner-friendly)

Plain **HTML + CSS + vanilla JavaScript**, no build step and no framework. The app
calls the API directly with `fetch` from the browser. This keeps the whole project to a
few files you can open directly or serve with any static server. If you'd rather use
React later, the data layer stays the same.

## File structure

```
nhl-draft-explorer/
  index.html       # markup + layout
  styles.css       # styling
  app.js           # fetch, state, rendering
  README.md        # how to run it
```

## Features

### Must have (v1)

1. A **year selector** populated dynamically from the API's list of draft years.
2. A **team selector** listing all 32 current franchises (plus the option to show all
   teams). For the by-team view, filter the chosen year's picks down to that team.
3. A **results table** showing, for each pick: overall pick number, round,
   pick-in-round, player name, and position.
4. A **loading state** while a request is in flight and a clear **error message** if a
   request fails (network error, or a year with no data).
5. Sensible empty states (e.g. a team that made no picks in a given year).
6. Team logos accompanying each page. 

### Nice to have (v2)

- Toggle between "By Team" and "Full Draft Order" views.
- A text **search box** to filter the current results by player name.
- Sortable columns (by overall pick, by round, by name).
- Cache fetched years in memory so re-selecting a year doesn't re-fetch.
- Show the team logo or a colored badge next to each team.

## Implementation notes

- **One request per year.** Fetch a whole year with `/all`, store it, then filter
  client-side by team. Don't fire a request per team.
- **Handle older drafts gracefully.** Pre-2000s picks may be missing position, birth
  country, or amateur club. Render a dash (`—`) for missing values rather than
  `undefined`.
- **Name fields are localized objects.** Read `firstName.default` and
  `lastName.default` rather than treating them as plain strings.
- **CORS:** the NHL API is generally fetchable from the browser, but if you hit a CORS
  wall during local development, run a tiny static server (e.g. `python3 -m http.server`)
  and serve over `http://localhost` rather than opening the file with `file://`.
- **Rate limiting:** be polite — this is an unofficial public endpoint. Cache results
  and avoid hammering it in loops.

## Suggested build order

1. Hardcode a single year (e.g. `2023`), fetch `/all`, and `console.log` the result to
   learn the real shape of the data.
2. Render every pick for that year into a plain table.
3. Add the team filter on top of the rendered data.
4. Add the year selector, populated from the API's year list.
5. Add loading and error states.
6. Style it, then layer in the v2 nice-to-haves.

## Stretch ideas

- A "draft class report card" that links each pick to the player's career stats via the
  player endpoints (`/v1/player/{id}/landing`).
- A team-history view: total picks by round across all years, or a team's most recent
  first-round picks.
- Compare two teams' draft output side by side for a chosen year.

## Starter prompt for Claude Code

> Build a static web app (HTML/CSS/vanilla JS, no framework, no build step) called NHL
> Draft Explorer following the attached spec. Start with the must-have v1 features. Use
> the NHL API at `https://api-web.nhle.com/v1/draft/picks/{year}/all` and populate the
> year list from `/v1/draft/picks/now`. Fetch one year at a time and filter by team on
> the client. Include loading and error states, handle missing fields on older drafts
> with a dash, and read player names from the `.default` subfield. Add a README with run
> instructions.
