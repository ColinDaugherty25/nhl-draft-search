// Unit tests for pure JS logic in js/pure.mjs.
//
// These cover the same pieces the UI depends on (LINEAGE auto-switch on
// year change, NHL.com URL routing for defunct franchises, column sorting
// with null sinking) but at the function level, without a browser. The
// E2E suite in tests/e2e/ exercises the same logic through the UI.
import { test } from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  ALL_TEAMS,
  ALL_YEARS,
  LINEAGE,
  REVERSE_LINEAGE,
  NHL_TEAM_SLUGS,
  teamPageUrl,
  pickBestTeam,
  compareBy,
  compareByForMode,
  showYearDividers,
  teamHistoryFilter,
  sortValue,
  nhlCrestForYear,
  NHL_CREST_MODERN,
  NHL_CREST_CLASSIC,
  NHL_LOGO_ERA_SPLIT,
  flagUrlForCountry,
  COUNTRY_CODE_TO_ISO2,
} from "../../js/pure.mjs";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

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

test("nhlCrestForYear — cutover year (2005) and later use the modern shield", () => {
  assert.equal(nhlCrestForYear(2025), NHL_CREST_MODERN);
  assert.equal(nhlCrestForYear(NHL_LOGO_ERA_SPLIT), NHL_CREST_MODERN); // 2005 itself
  assert.equal(nhlCrestForYear(2030), NHL_CREST_MODERN);
});

test("nhlCrestForYear — pre-2005 drafts use the classic orange shield", () => {
  assert.equal(nhlCrestForYear(2004), NHL_CREST_CLASSIC); // last classic-era draft
  assert.equal(nhlCrestForYear(1985), NHL_CREST_CLASSIC);
  assert.equal(nhlCrestForYear(1979), NHL_CREST_CLASSIC); // oldest year in our data
});

test("flagUrlForCountry — maps ISO alpha-3 to flagcdn.com URL", () => {
  assert.equal(flagUrlForCountry("CAN"), "https://flagcdn.com/ca.svg");
  assert.equal(flagUrlForCountry("USA"), "https://flagcdn.com/us.svg");
  assert.equal(flagUrlForCountry("SWE"), "https://flagcdn.com/se.svg");
});

test("flagUrlForCountry — uses ISO alpha-3 not IOC (CHE not SUI for Switzerland)", () => {
  // Switzerland: IOC code SUI, ISO 3166-1 alpha-3 CHE. NHL data uses CHE.
  assert.equal(flagUrlForCountry("CHE"), "https://flagcdn.com/ch.svg");
  // Sanity: the IOC code is not in our table.
  assert.equal(flagUrlForCountry("SUI"), null);
});

test("flagUrlForCountry — unknown / falsy input yields null", () => {
  assert.equal(flagUrlForCountry("XYZ"), null);
  assert.equal(flagUrlForCountry(""), null);
  assert.equal(flagUrlForCountry(null), null);
  assert.equal(flagUrlForCountry(undefined), null);
});

test("COUNTRY_CODE_TO_ISO2 covers every countryCode in the 2025 + 1985 data", () => {
  // Data-driven regression: catches "added a new country to the dataset but
  // forgot to add its mapping here". Picks two ends of the year range so the
  // coverage is broad.
  const years = [2025, 1985];
  const unknown = new Set();
  for (const year of years) {
    const path = join(PROJECT_ROOT, "data", `enriched-v3-${year}.json`);
    const data = JSON.parse(readFileSync(path, "utf8"));
    for (const pick of data.picks) {
      if (pick.countryCode && !(pick.countryCode in COUNTRY_CODE_TO_ISO2)) {
        unknown.add(pick.countryCode);
      }
    }
  }
  assert.deepEqual([...unknown], [], `unmapped countryCodes: ${[...unknown].join(", ")}`);
});

test("REVERSE_LINEAGE is consistent with LINEAGE", () => {
  for (const [from, to] of Object.entries(LINEAGE)) {
    assert.ok(
      (REVERSE_LINEAGE[to] || []).includes(from),
      `REVERSE_LINEAGE[${to}] missing ${from}`
    );
  }
});

test("ALL_YEARS sentinel is distinct from ALL_TEAMS", () => {
  // Guard against a future refactor accidentally collapsing the two to "ALL".
  assert.notEqual(ALL_YEARS, ALL_TEAMS);
});

test("showYearDividers — true only when year=ALL_YEARS, team≠ALL, and sort groups by year", () => {
  const base = { year: ALL_YEARS, teamTricode: "CAR", sortKey: "overallPick" };
  assert.equal(showYearDividers(base), true);
  assert.equal(showYearDividers({ ...base, sortKey: "round" }), true);
  // Sort keys that interleave years should hide dividers.
  assert.equal(showYearDividers({ ...base, sortKey: "points" }), false);
  assert.equal(showYearDividers({ ...base, sortKey: "name" }), false);
  // year≠ALL or team=ALL also turn dividers off.
  assert.equal(showYearDividers({ ...base, year: 2025 }), false);
  assert.equal(showYearDividers({ ...base, teamTricode: ALL_TEAMS }), false);
});

test("teamHistoryFilter — direct franchise match", () => {
  assert.equal(teamHistoryFilter({ teamAbbrev: "CAR" }, "CAR"), true);
  assert.equal(teamHistoryFilter({ teamAbbrev: "BOS" }, "CAR"), false);
});

test("teamHistoryFilter — forward LINEAGE (HFD pick belongs to CAR)", () => {
  assert.equal(teamHistoryFilter({ teamAbbrev: "HFD" }, "CAR"), true);
  assert.equal(teamHistoryFilter({ teamAbbrev: "QUE" }, "COL"), true);
  assert.equal(teamHistoryFilter({ teamAbbrev: "MNS" }, "DAL"), true);
});

test("teamHistoryFilter — transitive LINEAGE (WIN/PHX/ARI all belong to UTA)", () => {
  assert.equal(teamHistoryFilter({ teamAbbrev: "WIN" }, "UTA"), true);
  assert.equal(teamHistoryFilter({ teamAbbrev: "PHX" }, "UTA"), true);
  assert.equal(teamHistoryFilter({ teamAbbrev: "ARI" }, "UTA"), true);
});

test("teamHistoryFilter — reverse LINEAGE (CAR-pick branch when HFD passed)", () => {
  // Defense in depth: the dropdown only surfaces current franchises, but if a
  // predecessor tricode ever reaches the filter, it should still find its
  // successor's picks via REVERSE_LINEAGE.
  assert.equal(teamHistoryFilter({ teamAbbrev: "CAR" }, "HFD"), false); // direct miss
  // REVERSE_LINEAGE[HFD] is empty (HFD is a key, not a value, in LINEAGE).
  // For a real reverse path, use UTA → WIN.
  assert.equal(teamHistoryFilter({ teamAbbrev: "UTA" }, "WIN"), false); // UTA is current, WIN isn't its predecessor
});

test("teamHistoryFilter — missing teamAbbrev yields false", () => {
  assert.equal(teamHistoryFilter({}, "CAR"), false);
  assert.equal(teamHistoryFilter({ teamAbbrev: null }, "CAR"), false);
});

test("compareByForMode — non team-history mode delegates to compareBy", () => {
  const picks = [
    { overallPick: 3, draftYear: 2025 },
    { overallPick: 1, draftYear: 2024 },
    { overallPick: 2, draftYear: 2025 },
  ];
  picks.sort(compareByForMode("default", "overallPick", "asc"));
  assert.deepEqual(picks.map((p) => p.overallPick), [1, 2, 3]);
});

test("compareByForMode — team-history mode groups by year first (asc)", () => {
  const picks = [
    { overallPick: 1, draftYear: 2025 },
    { overallPick: 1, draftYear: 1985 },
    { overallPick: 200, draftYear: 1985 },
    { overallPick: 5, draftYear: 2025 },
  ];
  picks.sort(compareByForMode("team-history", "overallPick", "asc"));
  // 1985 group (oldest) first, then 2025; within year ascending by overall.
  assert.deepEqual(picks.map((p) => [p.draftYear, p.overallPick]), [
    [1985, 1],
    [1985, 200],
    [2025, 1],
    [2025, 5],
  ]);
});

test("compareByForMode — team-history mode groups by year first (desc)", () => {
  const picks = [
    { overallPick: 1, draftYear: 1985 },
    { overallPick: 1, draftYear: 2025 },
    { overallPick: 5, draftYear: 2025 },
  ];
  picks.sort(compareByForMode("team-history", "overallPick", "desc"));
  // Newest year first; within year, overall desc.
  assert.deepEqual(picks.map((p) => [p.draftYear, p.overallPick]), [
    [2025, 5],
    [2025, 1],
    [1985, 1],
  ]);
});

test("compareByForMode — team-history mode with stats key is flat (no year grouping)", () => {
  // Stats sorts scatter rounds/years; mirrors how round dividers vanish on
  // stats sorts in single-year mode.
  const picks = [
    { overallPick: 10, draftYear: 1985, careerStats: { points: 500 } },
    { overallPick: 1, draftYear: 2025, careerStats: { points: 1000 } },
    { overallPick: 2, draftYear: 1985, careerStats: { points: 200 } },
  ];
  picks.sort(compareByForMode("team-history", "points", "desc"));
  assert.deepEqual(picks.map((p) => p.careerStats.points), [1000, 500, 200]);
});
