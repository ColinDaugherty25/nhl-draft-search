// Unit tests for pure JS logic in js/pure.mjs.
//
// These cover the same pieces the UI depends on (LINEAGE auto-switch on
// year change, NHL.com URL routing for defunct franchises, column sorting
// with null sinking) but at the function level, without a browser. The
// E2E suite in tests/e2e/ exercises the same logic through the UI.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ALL_TEAMS,
  LINEAGE,
  REVERSE_LINEAGE,
  NHL_TEAM_SLUGS,
  teamPageUrl,
  pickBestTeam,
  compareBy,
  sortValue,
} from "../../js/pure.mjs";

test("teamPageUrl — current franchise maps to NHL.com slug", () => {
  assert.equal(teamPageUrl("TOR"), "https://www.nhl.com/mapleleafs");
  assert.equal(teamPageUrl("SJS"), "https://www.nhl.com/sharks");
  assert.equal(teamPageUrl("UTA"), "https://www.nhl.com/utah");
});

test("teamPageUrl — defunct franchise routes through LINEAGE", () => {
  assert.equal(teamPageUrl("HFD"), "https://www.nhl.com/hurricanes"); // Whalers -> Hurricanes
  assert.equal(teamPageUrl("QUE"), "https://www.nhl.com/avalanche");  // Nordiques -> Avalanche
  assert.equal(teamPageUrl("MNS"), "https://www.nhl.com/stars");       // North Stars -> Stars
  assert.equal(teamPageUrl("ATL"), "https://www.nhl.com/jets");        // Thrashers -> Jets
});

test("teamPageUrl — transitive LINEAGE (WIN -> UTA)", () => {
  // Original Winnipeg Jets relocated through Phoenix and Arizona to Utah.
  // LINEAGE flattens this so the click goes straight to /utah.
  assert.equal(teamPageUrl("WIN"), "https://www.nhl.com/utah");
  assert.equal(teamPageUrl("PHX"), "https://www.nhl.com/utah");
  assert.equal(teamPageUrl("ARI"), "https://www.nhl.com/utah");
});

test("teamPageUrl — unknown / falsy input yields null", () => {
  assert.equal(teamPageUrl("XYZ"), null);
  assert.equal(teamPageUrl(""), null);
  assert.equal(teamPageUrl(null), null);
  assert.equal(teamPageUrl(undefined), null);
});

test("pickBestTeam — ALL_TEAMS sticks", () => {
  assert.equal(pickBestTeam(ALL_TEAMS, new Set(["BOS", "TOR"])), ALL_TEAMS);
});

test("pickBestTeam — current selection preserved when available", () => {
  assert.equal(pickBestTeam("BOS", new Set(["BOS", "TOR", "MTL"])), "BOS");
});

test("pickBestTeam — follows LINEAGE forward (HFD selected, year only has CAR)", () => {
  assert.equal(pickBestTeam("HFD", new Set(["CAR", "BOS"])), "CAR");
});

test("pickBestTeam — follows REVERSE_LINEAGE backward (CAR selected, year only has HFD)", () => {
  assert.equal(pickBestTeam("CAR", new Set(["HFD", "BOS"])), "HFD");
});

test("pickBestTeam — UTA selected, predecessor exists (year only has WIN)", () => {
  assert.equal(pickBestTeam("UTA", new Set(["WIN", "EDM"])), "WIN");
});

test("pickBestTeam — falls back to ALL_TEAMS when no era is in set", () => {
  assert.equal(pickBestTeam("HFD", new Set(["BOS", "TOR"])), ALL_TEAMS);
});

test("compareBy — ascending by overallPick puts 1 first", () => {
  const picks = [{ overallPick: 3 }, { overallPick: 1 }, { overallPick: 2 }];
  picks.sort(compareBy("overallPick", "asc"));
  assert.deepEqual(picks.map((p) => p.overallPick), [1, 2, 3]);
});

test("compareBy — descending by points puts highest first", () => {
  const picks = [
    { overallPick: 1, careerStats: { points: 100 } },
    { overallPick: 2, careerStats: { points: 500 } },
    { overallPick: 3, careerStats: { points: 250 } },
  ];
  picks.sort(compareBy("points", "desc"));
  assert.deepEqual(picks.map((p) => p.careerStats.points), [500, 250, 100]);
});

test("compareBy — nulls sink to bottom regardless of direction", () => {
  const picks = [
    { overallPick: 1, careerStats: { points: 100 } },
    { overallPick: 2, careerStats: null },
    { overallPick: 3, careerStats: { points: 50 } },
  ];
  // Descending: nulls still last
  const desc = [...picks].sort(compareBy("points", "desc"));
  assert.equal(desc[desc.length - 1].overallPick, 2);
  // Ascending: nulls still last (not first)
  const asc = [...picks].sort(compareBy("points", "asc"));
  assert.equal(asc[asc.length - 1].overallPick, 2);
});

test("compareBy — ties broken by overallPick", () => {
  const picks = [
    { overallPick: 5, careerStats: { goals: 10 } },
    { overallPick: 2, careerStats: { goals: 10 } },
    { overallPick: 8, careerStats: { goals: 10 } },
  ];
  picks.sort(compareBy("goals", "desc"));
  assert.deepEqual(picks.map((p) => p.overallPick), [2, 5, 8]);
});

test("sortValue — name composes last + first, lowercased", () => {
  const pick = {
    firstName: { default: "Connor" },
    lastName: { default: "McDavid" },
  };
  assert.equal(sortValue(pick, "name"), "mcdavid connor");
});

test("sortValue — missing careerStats yields null", () => {
  assert.equal(sortValue({ overallPick: 1 }, "points"), null);
  assert.equal(sortValue({ overallPick: 1, careerStats: null }, "points"), null);
});

test("LINEAGE consistency — every successor has a NHL_TEAM_SLUGS entry", () => {
  // Catches "added a relocation but forgot the slug map" regressions.
  for (const [from, to] of Object.entries(LINEAGE)) {
    assert.ok(
      to in NHL_TEAM_SLUGS,
      `LINEAGE points ${from} -> ${to}, but ${to} has no NHL_TEAM_SLUGS entry`
    );
  }
});

test("REVERSE_LINEAGE is consistent with LINEAGE", () => {
  for (const [from, to] of Object.entries(LINEAGE)) {
    assert.ok(
      (REVERSE_LINEAGE[to] || []).includes(from),
      `REVERSE_LINEAGE[${to}] missing ${from}`
    );
  }
});
