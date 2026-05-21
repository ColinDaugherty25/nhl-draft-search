#!/usr/bin/env python3
"""Static file server + NHL API proxy.

The NHL API (api-web.nhle.com) does not send CORS headers, so the browser
blocks direct fetches. This script serves the static site AND proxies any
request under /api/ to api-web.nhle.com, adding an Access-Control-Allow-Origin
header so the browser is happy.

Run from the project root:
    python3 server.py
Then open: http://localhost:8000
"""

import http.server
import socketserver
import sys
import urllib.error
import urllib.request

PORT = 8000
PROXY_PREFIX = "/api/"
NHL_API_BASE = "https://api-web.nhle.com"


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith(PROXY_PREFIX):
            self._proxy()
        else:
            super().do_GET()

    def _proxy(self):
        upstream_path = self.path[len(PROXY_PREFIX) - 1:]  # keep leading slash
        url = NHL_API_BASE + upstream_path
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "nhl-draft-explorer/1.0"}
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = resp.read()
                self.send_response(resp.status)
                self.send_header(
                    "Content-Type",
                    resp.headers.get("Content-Type", "application/json"),
                )
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as exc:
            self._error(exc.code, f"Upstream HTTP {exc.code}: {exc.reason}")
        except Exception as exc:  # noqa: BLE001
            self._error(502, f"Upstream error: {exc}")

    def _error(self, status, message):
        body = message.encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


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
