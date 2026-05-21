// NHL Draft Explorer — vanilla JS, no build step.

// Pass-through proxy prefix for the raw NHL API (used for /draft/picks/now to
// populate the year selector). Draft-year fetches go through /enriched instead
// so the response carries career stats inline.
const API_BASE = "/api/v1";
const ENRICHED_BASE = "/enriched";
const DASH = "—";
const LOADING = "·";
const ALL_TEAMS = "ALL";
const STAT_KEYS = ["gamesPlayed", "goals", "assists", "points", "plusMinus", "pim"];

// Bumped on every loadYear call so stale in-flight responses can be ignored
// when the user has already moved on to a different year.
let loadToken = 0;

// Historical tricode -> current franchise tricode. Used only to keep the
// team selection across year changes (Carolina selected, switch to 1985 ->
// auto-switch to "Hartford Whalers"). The dropdown itself is derived from
// each year's picks, so old and new teams appear era-accurately.
const LINEAGE = {
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
const REVERSE_LINEAGE = Object.entries(LINEAGE).reduce((acc, [oldTri, curTri]) => {
  (acc[curTri] ??= []).push(oldTri);
  return acc;
}, {});

// Given the previous selection and the set of tricodes available in the new
// year, follow LINEAGE forward (e.g. HFD -> CAR) or backward (CAR -> HFD) to
// keep the same franchise selected across year changes. Falls back to "All
// teams" when no era of the lineage drafted that year.
function pickBestTeam(current, availableTricodes) {
  if (current === ALL_TEAMS) return ALL_TEAMS;
  if (availableTricodes.has(current)) return current;
  const forward = LINEAGE[current];
  if (forward && availableTricodes.has(forward)) return forward;
  for (const predecessor of REVERSE_LINEAGE[current] ?? []) {
    if (availableTricodes.has(predecessor)) return predecessor;
  }
  return ALL_TEAMS;
}

const state = {
  year: null,
  teamTricode: ALL_TEAMS,
  picks: [],
  teamsByTricode: new Map(), // populated per year from pick.teamAbbrev/teamName/teamLogoLight
  sortKey: "overallPick",
  sortDir: "asc",
};

// First-click direction by column. Stats columns default to descending so
// clicking PTS once shows top scorers first; text/order columns default to
// ascending. Subsequent clicks on the same column toggle direction.
const DEFAULT_DIR = {
  gamesPlayed: "desc",
  goals: "desc",
  assists: "desc",
  points: "desc",
  plusMinus: "desc",
  pim: "desc",
};

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("team").addEventListener("change", (e) => {
    state.teamTricode = e.target.value;
    updateTeamLogo();
    render();
  });
  document.getElementById("year").addEventListener("change", (e) => {
    state.year = Number(e.target.value);
    loadYear(state.year);
  });
  document.querySelector("#picks thead").addEventListener("click", (e) => {
    const th = e.target.closest("th[data-key]");
    if (!th) return;
    const key = th.dataset.key;
    if (state.sortKey === key) {
      state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
    } else {
      state.sortKey = key;
      state.sortDir = DEFAULT_DIR[key] ?? "asc";
    }
    updateSortIndicator();
    render();
  });
  updateSortIndicator();
  await populateYearSelect();
  await loadYear(state.year);
});

async function populateYearSelect() {
  // /draft/picks/now 307-redirects to the current draft and includes
  // draftYears (years with API data) and draftYear (the year currently
  // populated). Default to draftYear so we don't open on an empty future draft.
  const res = await fetch(`${API_BASE}/draft/picks/now`);
  const data = await res.json();
  const years = [...(data.draftYears || [])].sort((a, b) => b - a);
  const select = document.getElementById("year");
  for (const year of years) {
    select.appendChild(new Option(String(year), String(year)));
  }
  state.year = data.draftYear ?? years[0];
  select.value = String(state.year);
}

function populateTeamSelect() {
  // Build the dropdown from the current year's picks so it lists only teams
  // that were in the league that year, with era-accurate names. The previous
  // selection is preserved if the franchise existed in this year too;
  // otherwise we won't have a state.teamTricode change here, the caller
  // handles cross-year auto-switching.
  const select = document.getElementById("team");
  const seen = new Map();
  for (const pick of state.picks) {
    const tri = pick.teamAbbrev;
    if (!tri || seen.has(tri)) continue;
    seen.set(tri, {
      tricode: tri,
      name: pick.teamName?.default ?? tri,
      logoUrl: pick.teamLogoLight ?? null,
    });
  }
  const teams = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));

  select.replaceChildren();
  select.appendChild(new Option("All teams", ALL_TEAMS));
  for (const team of teams) {
    select.appendChild(new Option(team.name, team.tricode));
  }
  state.teamsByTricode = seen;
  state.teamTricode = pickBestTeam(state.teamTricode, new Set(seen.keys()));
  select.value = state.teamTricode;
}

async function loadYear(year) {
  const myToken = ++loadToken;
  setStatus(`Loading ${year} draft…`, "loading");
  document.querySelector("#picks tbody").replaceChildren();

  // Fire both fetches in parallel: raw arrives fast (~200ms) and gives us the
  // table skeleton; enriched lands later (cold ~5-12s, cached ~20ms) and fills
  // career stats in place. The user sees names + logos immediately.
  const rawPromise = fetch(`${API_BASE}/draft/picks/${year}/all`).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
  const enrichedPromise = fetch(
    `${ENRICHED_BASE}/draft/picks/${year}/all`,
  )
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  try {
    const raw = await rawPromise;
    if (myToken !== loadToken) return;
    state.picks = raw.picks || [];
    populateTeamSelect();
    updateTeamLogo();
    render();
    setStatus("Loading stats…", "loading");
  } catch (err) {
    if (myToken !== loadToken) return;
    state.picks = [];
    populateTeamSelect();
    updateTeamLogo();
    setStatus(`Couldn't load the ${year} draft (${err.message}).`, "error");
    return;
  }

  const enriched = await enrichedPromise;
  if (myToken !== loadToken) return;
  if (enriched?.picks) {
    const byOverall = new Map(
      enriched.picks.map((p) => [p.overallPick, p.careerStats]),
    );
    for (const pick of state.picks) {
      pick.careerStats = byOverall.get(pick.overallPick) ?? null;
    }
    refreshStatCells();
  } else {
    // Enriched failed; mark all picks as resolved-with-no-data so the loading
    // dots flip to dashes rather than spinning forever.
    for (const pick of state.picks) pick.careerStats ??= null;
    refreshStatCells();
  }
  setStatus("", null);
}

function refreshStatCells() {
  // If we're currently sorted by a stat column, the row order will change
  // once careerStats lands — rebuild the table. Otherwise update cells in
  // place so we don't lose scroll position or flash the table.
  if (STAT_KEYS.includes(state.sortKey)) {
    render();
    return;
  }
  for (const tr of document.querySelectorAll("#picks tbody tr")) {
    if (!tr._pick) continue;
    const cells = tr.querySelectorAll(".stats-cell");
    const values = statValues(tr._pick);
    values.forEach((v, i) => {
      cells[i].textContent = v;
    });
    const nameTd = tr.querySelector(".name-cell");
    if (nameTd) nameTd.replaceChildren(playerNameNode(tr._pick));
  }
}

function updateTeamLogo() {
  const img = document.getElementById("team-logo");
  const team = state.teamsByTricode.get(state.teamTricode);
  if (!team || !team.logoUrl) {
    img.hidden = true;
    img.removeAttribute("src");
    img.alt = "";
    return;
  }
  img.src = team.logoUrl;
  img.alt = `${team.name} logo`;
  img.hidden = false;
  img.onerror = () => {
    img.hidden = true;
  };
}

function setStatus(text, kind) {
  const el = document.getElementById("status");
  el.textContent = text;
  el.className = "status" + (kind ? ` ${kind}` : "");
}

function render() {
  const tbody = document.querySelector("#picks tbody");
  tbody.replaceChildren();

  const filtered =
    state.teamTricode === ALL_TEAMS
      ? state.picks
      : state.picks.filter((p) => p.teamAbbrev === state.teamTricode);

  if (filtered.length === 0) {
    tbody.appendChild(emptyRow());
    return;
  }

  const rows = [...filtered].sort(compareBy(state.sortKey, state.sortDir));
  for (const pick of rows) {
    tbody.appendChild(rowFor(pick));
  }
}

function compareBy(key, dir) {
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

function sortValue(pick, key) {
  switch (key) {
    case "overallPick": return pick.overallPick ?? null;
    case "round":       return pick.round ?? null;
    case "pickInRound": return pick.pickInRound ?? null;
    case "name": {
      const last = pick.lastName?.default ?? "";
      const first = pick.firstName?.default ?? "";
      const s = `${last} ${first}`.trim().toLowerCase();
      return s || null;
    }
    case "positionCode": return pick.positionCode || null;
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

function updateSortIndicator() {
  for (const th of document.querySelectorAll("#picks thead th[data-key]")) {
    th.classList.toggle("sort-asc", th.dataset.key === state.sortKey && state.sortDir === "asc");
    th.classList.toggle("sort-desc", th.dataset.key === state.sortKey && state.sortDir === "desc");
  }
}

function emptyRow() {
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = 12;
  td.className = "empty";
  td.textContent =
    state.teamTricode === ALL_TEAMS
      ? "No picks for this year."
      : "No picks for this team in this year.";
  tr.appendChild(td);
  return tr;
}

function rowFor(pick) {
  const tr = document.createElement("tr");
  tr._pick = pick;

  tr.appendChild(textCell(pick.overallPick ?? DASH));
  tr.appendChild(textCell(pick.round ?? DASH));
  tr.appendChild(textCell(pick.pickInRound ?? DASH));
  tr.appendChild(logoCell(pick));
  tr.appendChild(nameCell(pick));
  tr.appendChild(textCell(pick.positionCode || DASH));
  for (const value of statValues(pick)) {
    tr.appendChild(statCell(value));
  }
  return tr;
}

function nameCell(pick) {
  const td = document.createElement("td");
  td.className = "name-cell";
  td.appendChild(playerNameNode(pick));
  return td;
}

function playerNameNode(pick) {
  const first = pick.firstName?.default ?? "";
  const last = pick.lastName?.default ?? "";
  const text = `${first} ${last}`.trim() || DASH;
  if (!pick.playerId) return document.createTextNode(text);
  const a = document.createElement("a");
  a.href = `https://www.nhl.com/player/${pick.playerId}`;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = text;
  return a;
}

function statValues(pick) {
  // careerStats is set to null once the enriched fetch resolves (with or
  // without data). Before that it's undefined and we render a loading dot
  // so users can tell "fetching" apart from "no NHL stats found".
  if (!("careerStats" in pick) || pick.careerStats === undefined) {
    return STAT_KEYS.map(() => LOADING);
  }
  const cs = pick.careerStats;
  if (!cs || cs.gamesPlayed == null) {
    return STAT_KEYS.map(() => DASH);
  }
  const isGoalie = pick.positionCode === "G" || cs.position === "G";
  const skater = (v) => (isGoalie ? null : v);
  const raw = [
    cs.gamesPlayed,
    skater(cs.goals),
    skater(cs.assists),
    skater(cs.points),
    skater(cs.plusMinus),
    cs.pim,
  ];
  return raw.map((v) => (v == null ? DASH : String(v)));
}

function statCell(value) {
  const td = document.createElement("td");
  td.className = "stats-cell";
  td.textContent = value;
  return td;
}

function textCell(value) {
  const td = document.createElement("td");
  td.textContent = value;
  return td;
}

function logoCell(pick) {
  const td = document.createElement("td");
  td.className = "logo-cell";
  const src = logoUrlForRow(pick);
  if (!src) return td;
  const img = document.createElement("img");
  img.className = "row-logo";
  img.alt = "";
  img.src = src;
  img.onerror = () => {
    img.style.visibility = "hidden";
  };
  td.appendChild(img);
  return td;
}

function logoUrlForRow(pick) {
  // Era-accurate logo from the pick payload. Since the dropdown now only lists
  // teams that drafted that year, every visible pick is from that year's team
  // and uses that team's era-correct logo automatically.
  return pick.teamLogoLight ?? null;
}
