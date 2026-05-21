# NHL Draft Explorer

A static web app for browsing NHL Entry Draft picks by team and year. No build step, no dependencies.

## Run it

The app calls the public NHL API directly from the browser. Some browsers block `fetch` from `file://` URLs, so the simplest reliable way is to serve over `http://localhost`:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

Alternatively, open `index.html` directly — it usually works, but if requests fail use the local server above.

## Files

- `index.html` — markup and layout
- `styles.css` — styling
- `app.js` — fetch, state, rendering
