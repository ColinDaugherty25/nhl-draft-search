# NHL Draft Explorer

A static web app for browsing NHL Entry Draft picks by team and year. No build step, no dependencies (Python 3 is used only to serve the files and proxy the API).

Repo: <https://github.com/ColinDaugherty25/nhl-draft-search>

## Run it

```sh
python3 server.py
```

Then open <http://localhost:8000>.

`server.py` does two things: serves the static files (`index.html`, `styles.css`, `app.js`) and proxies any request under `/api/` to `https://api-web.nhle.com`. The proxy is needed because the NHL API does not send CORS headers, so the browser would otherwise block direct calls to it.

## Files

- `index.html` — markup and layout
- `styles.css` — styling
- `app.js` — fetch, state, rendering (talks to `/api/v1/...` via the local proxy)
- `server.py` — static server + NHL API proxy
