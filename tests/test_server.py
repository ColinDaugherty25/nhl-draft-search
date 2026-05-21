"""Unit tests for pure logic in server.py.

These exercise only side-effect-free functions — no network, no HTTP server,
no thread pool. The integration of those pieces is covered by the local-dev
build path (server.py --build) and the GitHub Actions deploy.
"""
import os
import sys
import tempfile
import time
import unittest

# Make `import server` work whether tests are run from the project root or
# via `python3 -m unittest discover` from elsewhere.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import server  # noqa: E402


class ChooseCandidateTests(unittest.TestCase):
    """_choose_candidate matches a draft pick to a player from search results.

    The function is intentionally strict (exact full-name match first) because
    the search API does fuzzy first-name matching, which caused the "Medvedev
    bug" before the strict filter went in.
    """

    PICK_MEDVEDEV = {
        "firstName": {"default": "Alexei"},
        "lastName": {"default": "Medvedev"},
        "positionCode": "G",
        "countryCode": "RUS",
        "height": 75,
    }

    def test_empty_candidates_returns_none(self):
        self.assertIsNone(server._choose_candidate([], self.PICK_MEDVEDEV))
        self.assertIsNone(server._choose_candidate(None, self.PICK_MEDVEDEV))

    def test_strict_name_match_required(self):
        # The Medvedev bug regression: search returns Yashin for "Alexei
        # Medvedev" because fuzzy matching by first name; without the strict
        # filter we'd silently mis-link.
        candidates = [
            {"playerId": "8473512", "name": "Alexei Yashin", "positionCode": "C",
             "birthCountry": "RUS", "heightInInches": 75},
        ]
        self.assertIsNone(server._choose_candidate(candidates, self.PICK_MEDVEDEV))

    def test_single_exact_match_returns_id(self):
        candidates = [
            {"playerId": "12345", "name": "Alexei Medvedev", "positionCode": "G",
             "birthCountry": "RUS", "heightInInches": 75},
        ]
        self.assertEqual(server._choose_candidate(candidates, self.PICK_MEDVEDEV), "12345")

    def test_position_disambiguates(self):
        pick = {
            "firstName": {"default": "Jack"}, "lastName": {"default": "Hughes"},
            "positionCode": "C",
        }
        candidates = [
            {"playerId": "A", "name": "Jack Hughes", "positionCode": "D"},
            {"playerId": "B", "name": "Jack Hughes", "positionCode": "C"},
        ]
        self.assertEqual(server._choose_candidate(candidates, pick), "B")

    def test_position_fallback_lw_to_l(self):
        # Draft uses LW/RW, search uses L/R — the fallback bridges that.
        pick = {
            "firstName": {"default": "Alex"}, "lastName": {"default": "Ovechkin"},
            "positionCode": "LW",
        }
        candidates = [
            {"playerId": "A", "name": "Alex Ovechkin", "positionCode": "C"},
            {"playerId": "B", "name": "Alex Ovechkin", "positionCode": "L"},
        ]
        self.assertEqual(server._choose_candidate(candidates, pick), "B")

    def test_country_disambiguates(self):
        pick = {
            "firstName": {"default": "Mikko"}, "lastName": {"default": "Lehtonen"},
            "positionCode": "D", "countryCode": "FIN",
        }
        candidates = [
            {"playerId": "A", "name": "Mikko Lehtonen", "positionCode": "D",
             "birthCountry": "SWE"},
            {"playerId": "B", "name": "Mikko Lehtonen", "positionCode": "D",
             "birthCountry": "FIN"},
        ]
        self.assertEqual(server._choose_candidate(candidates, pick), "B")

    def test_height_disambiguates(self):
        pick = {
            "firstName": {"default": "Sebastian"}, "lastName": {"default": "Aho"},
            "positionCode": "C", "countryCode": "FIN", "height": 71,
        }
        candidates = [
            {"playerId": "A", "name": "Sebastian Aho", "positionCode": "C",
             "birthCountry": "FIN", "heightInInches": 73},
            {"playerId": "B", "name": "Sebastian Aho", "positionCode": "C",
             "birthCountry": "FIN", "heightInInches": 71},
        ]
        self.assertEqual(server._choose_candidate(candidates, pick), "B")


class CachePathTests(unittest.TestCase):
    def test_cache_path_uses_version(self):
        path = server._cache_path(2025)
        self.assertTrue(path.endswith(f"enriched-v{server.CACHE_VERSION}-2025.json"))
        self.assertIn("data", path)


class CacheFreshTests(unittest.TestCase):
    def test_missing_file_is_not_fresh(self):
        self.assertFalse(server._cache_fresh("/tmp/definitely-not-here-xyz.json"))

    def test_fresh_file_is_fresh(self):
        with tempfile.NamedTemporaryFile(delete=False) as f:
            f.write(b"{}")
            path = f.name
        try:
            self.assertTrue(server._cache_fresh(path))
        finally:
            os.unlink(path)

    def test_stale_file_is_not_fresh(self):
        with tempfile.NamedTemporaryFile(delete=False) as f:
            f.write(b"{}")
            path = f.name
        try:
            stale = time.time() - server.CACHE_TTL_SECONDS - 60
            os.utime(path, (stale, stale))
            self.assertFalse(server._cache_fresh(path))
        finally:
            os.unlink(path)


if __name__ == "__main__":
    unittest.main()
