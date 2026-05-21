#!/usr/bin/env python3
"""Static file server + NHL API proxy + draft-pick stats enrichment.

The NHL endpoints do not send CORS headers, so the browser blocks direct
fetches. This script serves the static site AND proxies three prefixes:
    /api/      -> https://api-web.nhle.com       (draft picks, player landing)
    /search/   -> https://search.d3.nhle.com     (player search)
    /enriched/ -> built locally; joins draft picks with each player's
                  career totals (one fat response instead of ~450 small ones).

Run from the project root:
    python3 server.py
Then open: http://localhost:8000
"""

import http.client
import http.server
import json
import os
import socketserver
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

PORT = 8000
ROUTES = (
    ("/api/",    "https://api-web.nhle.com"),
    ("/search/", "https://search.d3.nhle.com"),
)

NHL_API = "https://api-web.nhle.com"
NHL_SEARCH = "https://search.d3.nhle.com"

CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
CACHE_TTL_SECONDS = 24 * 60 * 60
# Bump when the enriched response shape changes so old cache files are ignored.
CACHE_VERSION = 3

ENRICHMENT_WORKERS = 12

# Draft uses LW/RW, search uses L/R.
POS_FALLBACK = {"LW": "L", "RW": "R"}


def _upstream_get(url):
    """GET an upstream URL and return (status, content_type, body).

    Uses urllib so HTTP redirects (e.g. /draft/picks/now 307s) are followed
    automatically. Used by the small number of proxy calls per page load; the
    high-volume enrichment loop uses _upstream_json_fast instead."""
    req = urllib.request.Request(url, headers={"User-Agent": "nhl-draft-explorer/1.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.status, resp.headers.get("Content-Type", "application/json"), resp.read()


def _upstream_json(url):
    """GET an upstream URL and return parsed JSON, or None on any failure."""
    try:
        _, _, body = _upstream_get(url)
        return json.loads(body)
    except Exception:  # noqa: BLE001
        return None


# Per-thread keep-alive HTTPS connections, keyed by host. Each enrichment
# worker makes ~75 calls in a tight loop; reusing one TCP+TLS handshake per
# (thread, host) shaves ~50-100ms off every call after the first.
_tls = threading.local()


def _get_conn(host):
    conns = getattr(_tls, "conns", None)
    if conns is None:
        conns = {}
        _tls.conns = conns
    if host not in conns:
        conns[host] = http.client.HTTPSConnection(host, timeout=15)
    return conns[host]


def _drop_conn(host):
    conns = getattr(_tls, "conns", None) or {}
    c = conns.pop(host, None)
    if c is not None:
        try:
            c.close()
        except Exception:  # noqa: BLE001
            pass


def _upstream_json_fast(url):
    """Like _upstream_json but uses a per-thread keep-alive connection. Does
    NOT follow redirects — only used for enrichment endpoints that return 200
    directly (search and /player/{id}/landing)."""
    parsed = urllib.parse.urlsplit(url)
    path = parsed.path + (("?" + parsed.query) if parsed.query else "")
    # One retry if the connection went stale between calls.
    for attempt in range(2):
        try:
            conn = _get_conn(parsed.netloc)
            conn.request("GET", path, headers={"User-Agent": "nhl-draft-explorer/1.0"})
            resp = conn.getresponse()
            body = resp.read()
            if resp.status != 200:
                return None
            return json.loads(body)
        except (http.client.HTTPException, ConnectionError, OSError, json.JSONDecodeError):
            _drop_conn(parsed.netloc)
            if attempt == 1:
                return None


def _choose_candidate(candidates, pick):
    """Pick the most likely playerId for a draft pick. Port of chooseCandidate
    in app.js. Exact full-name match first, then position (with LW/RW->L/R
    fallback), then country, then height."""
    if not isinstance(candidates, list) or not candidates:
        return None

    first = (pick.get("firstName") or {}).get("default", "")
    last = (pick.get("lastName") or {}).get("default", "")
    full_name = f"{first} {last}".strip().lower()

    # Strict exact-name match. The search API does fuzzy matching by first name
    # alone, so without this guard a draft pick whose actual person isn't in
    # the player index (e.g. unsigned 2025 prospects) silently matches an
    # unrelated player with the same first name and country — the Medvedev
    # bug: "Alexei Medvedev" matched Alexei Yashin because both are 6'3" RUS.
    pool = [c for c in candidates if (c.get("name") or "").lower() == full_name]
    if not pool:
        return None

    pos = pick.get("positionCode")
    if pos and len(pool) > 1:
        exact = [c for c in pool if c.get("positionCode") == pos]
        fallback = (
            [c for c in pool if c.get("positionCode") == POS_FALLBACK[pos]]
            if not exact and pos in POS_FALLBACK
            else []
        )
        if exact:
            pool = exact
        elif fallback:
            pool = fallback

    country = pick.get("countryCode")
    if len(pool) > 1 and country:
        narrowed = [c for c in pool if c.get("birthCountry") == country]
        if narrowed:
            pool = narrowed

    height = pick.get("height")
    if len(pool) > 1 and height:
        narrowed = [c for c in pool if c.get("heightInInches") == height]
        if narrowed:
            pool = narrowed

    return pool[0].get("playerId") if pool else None


def _enrich_one(pick):
    """Resolve a pick -> {playerId, stats} (or None). playerId enables a deep
    link from the player's name in the table to nhl.com/player/{id}."""
    first = (pick.get("firstName") or {}).get("default")
    last = (pick.get("lastName") or {}).get("default")
    if not first or not last:
        return None
    q = urllib.parse.quote_plus(f"{first} {last}")
    candidates = _upstream_json_fast(
        f"{NHL_SEARCH}/api/v1/search/player?culture=en-us&limit=20&q={q}"
    )
    player_id = _choose_candidate(candidates, pick)
    if not player_id:
        return None
    landing = _upstream_json_fast(f"{NHL_API}/v1/player/{player_id}/landing")
    if not landing:
        return {"playerId": player_id, "stats": None}
    totals = (landing.get("careerTotals") or {}).get("regularSeason") or {}
    return {
        "playerId": player_id,
        "stats": {
            "position": landing.get("position"),
            "gamesPlayed": totals.get("gamesPlayed"),
            "goals": totals.get("goals"),
            "assists": totals.get("assists"),
            "points": totals.get("points"),
            "plusMinus": totals.get("plusMinus"),
            "pim": totals.get("pim"),
        },
    }


def _build_enriched(year):
    raw = _upstream_json(f"{NHL_API}/v1/draft/picks/{year}/all")
    if raw is None:
        return None
    picks = raw.get("picks") or []

    with ThreadPoolExecutor(max_workers=ENRICHMENT_WORKERS) as pool:
        results = list(pool.map(_enrich_one, picks))
    for pick, result in zip(picks, results):
        pick["playerId"] = result["playerId"] if result else None
        pick["careerStats"] = result["stats"] if result else None

    raw["picks"] = picks
    return raw


def _enriched_response(year):
    """Return (status, body_bytes) for /enriched/draft/picks/{year}/all."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache_path = os.path.join(CACHE_DIR, f"enriched-v{CACHE_VERSION}-{year}.json")

    if os.path.exists(cache_path):
        age = time.time() - os.path.getmtime(cache_path)
        if age < CACHE_TTL_SECONDS:
            with open(cache_path, "rb") as f:
                return 200, f.read()

    enriched = _build_enriched(year)
    if enriched is None:
        return 502, b'{"error":"upstream draft fetch failed"}'

    body = json.dumps(enriched).encode()
    with open(cache_path, "wb") as f:
        f.write(body)
    return 200, body


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/enriched/draft/picks/"):
            self._enriched()
            return
        for prefix, base in ROUTES:
            if self.path.startswith(prefix):
                self._proxy(base + self.path[len(prefix) - 1:])  # keep leading /
                return
        super().do_GET()

    def _enriched(self):
        # /enriched/draft/picks/{year}/all
        parts = self.path.strip("/").split("/")
        try:
            year = int(parts[3])
        except (IndexError, ValueError):
            self._error(400, "expected /enriched/draft/picks/{year}/all")
            return
        try:
            status, body = _enriched_response(year)
        except Exception as exc:  # noqa: BLE001
            self._error(502, f"enrichment error: {exc}")
            return
        self._respond(status, "application/json", body)

    def _proxy(self, url):
        try:
            status, ctype, body = _upstream_get(url)
            self._respond(status, ctype, body)
        except urllib.error.HTTPError as exc:
            self._error(exc.code, f"Upstream HTTP {exc.code}: {exc.reason}")
        except Exception as exc:  # noqa: BLE001
            self._error(502, f"Upstream error: {exc}")

    def _respond(self, status, content_type, body):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _error(self, status, message):
        self._respond(status, "text/plain; charset=utf-8", message.encode())


def main():
    with socketserver.ThreadingTCPServer(("", PORT), Handler) as httpd:
        httpd.allow_reuse_address = True
        print(f"NHL Draft Explorer serving at http://localhost:{PORT}/")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down.")
            sys.exit(0)


if __name__ == "__main__":
    main()
