// Pure logic — no DOM, no fetch, no module-level side effects. Imported by
// app.js (browser, via <script type="module">) and by tests/unit/test_pure.mjs
// (Node, via node --test).

export const DASH = "—";
export const ALL_TEAMS = "ALL";
// Distinct sentinel from ALL_TEAMS so a `value === "ALL"` check on the wrong
// <select> can never silently match. Used by the year dropdown's "All years"
// option to enter team-history mode.
export const ALL_YEARS = "ALL_YEARS";
export const STAT_KEYS = ["gamesPlayed", "goals", "assists", "points", "plusMinus", "pim"];

// Historical tricode -> current franchise tricode. Two consumers:
//   1. pickBestTeam — when the year changes and the selected team didn't
//      exist that year, follow LINEAGE forward (HFD -> CAR) or backward
//      (CAR -> HFD) to keep the same franchise selected.
//   2. teamPageUrl — clicking a defunct franchise's logo (Whalers, Nordiques,
//      etc.) routes to the current franchise's NHL.com page.
// The dropdown itself is derived from each year's picks, so old and new
// teams appear era-accurately regardless of LINEAGE.
export const LINEAGE = {
  HFD: "CAR", // Hartford Whalers     -> Carolina Hurricanes  (1997)
  QUE: "COL", // Quebec Nordiques     -> Colorado Avalanche   (1995)
  MNS: "DAL", // Minnesota North Stars -> Dallas Stars        (1993)
  CLR: "NJD", // Colorado Rockies     -> New Jersey Devils    (1982)
  AFM: "CGY", // Atlanta Flames       -> Calgary Flames       (1980)
  WIN: "UTA", // Original Winnipeg Jets -> PHX -> ARI -> Utah
  PHX: "UTA", // Phoenix Coyotes      -> Arizona Coyotes -> Utah
  ARI: "UTA", // Arizona Coyotes      -> Utah Hockey Club     (2024)
  ATL: "WPG", // Atlanta Thrashers    -> Winnipeg Jets        (2011)
};

// Reverse: current franchise tricode -> [predecessors]
export const REVERSE_LINEAGE = Object.entries(LINEAGE).reduce((acc, [oldTri, curTri]) => {
  (acc[curTri] ??= []).push(oldTri);
  return acc;
}, {});

// Current-franchise tricode -> NHL.com URL slug. Historical tricodes
// (HFD, QUE, MNS, ATL, etc.) go through LINEAGE first to find the current
// franchise, then this map produces the slug. Anything not in the map
// (defunct franchise with no successor) yields no link.
export const NHL_TEAM_SLUGS = {
  ANA: "ducks", BOS: "bruins", BUF: "sabres", CAR: "hurricanes",
  CBJ: "bluejackets", CGY: "flames", CHI: "blackhawks", COL: "avalanche",
  DAL: "stars", DET: "redwings", EDM: "oilers", FLA: "panthers",
  LAK: "kings", MIN: "wild", MTL: "canadiens", NJD: "devils",
  NSH: "predators", NYI: "islanders", NYR: "rangers", OTT: "senators",
  PHI: "flyers", PIT: "penguins", SEA: "kraken", SJS: "sharks",
  STL: "blues", TBL: "lightning", TOR: "mapleleafs", UTA: "utah",
  VAN: "canucks", VGK: "goldenknights", WPG: "jets", WSH: "capitals",
};

// First-click direction by column. Stats columns default to descending so
// clicking PTS once shows top scorers first; text/order columns default to
// ascending. Subsequent clicks on the same column toggle direction.
export const DEFAULT_DIR = {
  gamesPlayed: "desc",
  goals: "desc",
  assists: "desc",
  points: "desc",
  plusMinus: "desc",
  pim: "desc",
};

// Era-accurate NHL crest. The league switched from the classic orange-shield
// logo to the modern silver/black shield just before the 2005 draft, so any
// draft year >= 2005 uses the modern logo; everything earlier uses the
// classic. The modern logo is loaded from the same NHL CDN that serves team
// logos; the classic shield is self-hosted (no NHL CDN entry for it).
export const NHL_LOGO_ERA_SPLIT = 2005;
export const NHL_CREST_MODERN = "https://assets.nhle.com/logos/nhl/svg/NHL_light.svg";
export const NHL_CREST_CLASSIC = "assets/nhl-classic.svg";

export function nhlCrestForYear(year) {
  return year >= NHL_LOGO_ERA_SPLIT ? NHL_CREST_MODERN : NHL_CREST_CLASSIC;
}

// Country flags. The pick.countryCode in our data uses ISO 3166-1 alpha-3
// codes (CAN, USA, CHE — not the IOC's CAN/USA/SUI). flagcdn.com serves SVG
// flags keyed by alpha-2, so we map at lookup time. The list covers every
// code that appears in data/enriched-v3-*.json across all 48 years (1979–
// 2026); add more entries here when a new country shows up.
export const COUNTRY_CODE_TO_ISO2 = {
  CAN: "ca", USA: "us", SWE: "se", RUS: "ru", FIN: "fi", CZE: "cz",
  SVK: "sk", DEU: "de", CHE: "ch", BLR: "by", LVA: "lv", UKR: "ua",
  DNK: "dk", NOR: "no", KAZ: "kz", GBR: "gb", AUT: "at", POL: "pl",
  FRA: "fr", SVN: "si", ITA: "it", CHN: "cn", JPN: "jp", HUN: "hu",
  AUS: "au", KOR: "kr", LTU: "lt", ZAF: "za", HRV: "hr", BRA: "br",
  NGA: "ng", EST: "ee", BHS: "bs", BEL: "be", MNE: "me", TZA: "tz",
  HTI: "ht", THA: "th", JAM: "jm", MKD: "mk", NLD: "nl", UZB: "uz",
  BRN: "bn",
};

export function flagUrlForCountry(code3) {
  const iso2 = COUNTRY_CODE_TO_ISO2[code3];
  return iso2 ? `https://flagcdn.com/${iso2}.svg` : null;
}

export function teamPageUrl(tricode) {
  if (!tricode) return null;
  const current = LINEAGE[tricode] ?? tricode;
  const slug = NHL_TEAM_SLUGS[current];
  return slug ? `https://www.nhl.com/${slug}` : null;
}

// Given the previous selection and the set of tricodes available in the new
// year, follow LINEAGE forward (e.g. HFD -> CAR) or backward (CAR -> HFD) to
// keep the same franchise selected across year changes. Falls back to "All
// teams" when no era of the lineage drafted that year.
export function pickBestTeam(current, availableTricodes) {
  if (current === ALL_TEAMS) return ALL_TEAMS;
  if (availableTricodes.has(current)) return current;
  const forward = LINEAGE[current];
  if (forward && availableTricodes.has(forward)) return forward;
  for (const predecessor of REVERSE_LINEAGE[current] ?? []) {
    if (availableTricodes.has(predecessor)) return predecessor;
  }
  return ALL_TEAMS;
}

// In team-history mode (year=ALL_YEARS + a specific team), draft classes are
// visually grouped by year — but only when the sort key keeps picks naturally
// ordered by year. For overallPick/round, picks within a class sort by the
// chosen key; for stats/name sorts, year grouping would scatter dividers
// everywhere so we hide them and sort flat instead.
export function showYearDividers(state) {
  return (
    state.year === ALL_YEARS &&
    state.teamTricode !== ALL_TEAMS &&
    (state.sortKey === "overallPick" || state.sortKey === "round")
  );
}

// Lineage-aware membership test: does `pick` belong to the franchise
// identified by `currentTricode`? Direct match, plus forward LINEAGE
// (HFD pick when CAR is selected) and reverse LINEAGE (CAR pick when HFD is
// selected, in case a predecessor tricode is ever passed).
export function teamHistoryFilter(pick, currentTricode) {
  const tri = pick.teamAbbrev;
  if (!tri) return false;
  if (tri === currentTricode) return true;
  if (LINEAGE[tri] === currentTricode) return true;
  return (REVERSE_LINEAGE[currentTricode] ?? []).includes(tri);
}

// Comparator wrapping compareBy with year-first ordering for team-history mode.
// When grouping by year (overallPick or round sorts), year groups always go
// newest-first (recent drafts read more often than ancient ones), and within a
// year picks follow compareBy(key, dir). For stats/name sorts (or non
// team-history mode) return compareBy(key, dir) unchanged.
export function compareByForMode(mode, key, dir) {
  const inner = compareBy(key, dir);
  if (mode !== "team-history") return inner;
  if (key !== "overallPick" && key !== "round") return inner;
  return (a, b) => {
    const ay = a.draftYear ?? null;
    const by = b.draftYear ?? null;
    if (ay !== by) {
      if (ay == null) return 1;
      if (by == null) return -1;
      return by - ay;
    }
    return inner(a, b);
  };
}

export function compareBy(key, dir) {
  const sign = dir === "asc" ? 1 : -1;
  return (a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    // Nulls (missing data, loading dots) sink to the bottom regardless of dir
    // so the user always sees real values first. Tie-break by overallPick to
    // keep order stable when stats arrive and ties get broken.
    if (av == null && bv == null) return a.overallPick - b.overallPick;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av === bv) return a.overallPick - b.overallPick;
    if (typeof av === "string") return sign * av.localeCompare(bv);
    return sign * (av - bv);
  };
}

export function sortValue(pick, key) {
  switch (key) {
    case "overallPick": return pick.overallPick ?? null;
    case "round":       return pick.round ?? null;
    case "name": {
      const last = pick.lastName?.default ?? "";
      const first = pick.firstName?.default ?? "";
      const s = `${last} ${first}`.trim().toLowerCase();
      return s || null;
    }
    case "positionCode": return pick.positionCode || null;
    case "countryCode":  return pick.countryCode || null;
    case "gamesPlayed":
    case "goals":
    case "assists":
    case "points":
    case "plusMinus":
    case "pim":
      // careerStats undefined → enriched not in yet → sort as null (bottom).
      // careerStats === null → no NHL data → also null (bottom).
      return pick.careerStats?.[key] ?? null;
    default: return null;
  }
}
