// NHL Draft Explorer — vanilla JS, no build step.

// All data comes from pre-built static JSON in data/, populated by
// server.py --build (locally) or the GitHub Pages deploy workflow. No
// runtime proxy is required.
import {
  DASH,
  ALL_TEAMS,
  ALL_YEARS,
  STAT_KEYS,
  DEFAULT_DIR,
  teamPageUrl,
  pickBestTeam,
  compareBy,
  compareByForMode,
  showYearDividers,
  teamHistoryFilter,
  nhlCrestForYear,
  NHL_CREST_MODERN,
  flagUrlForCountry,
} from "./js/pure.mjs";

const DATA_BASE = "data";
const CACHE_VERSION = 3;

// Bumped on every loadYear call so stale in-flight responses can be ignored
// when the user has already moved on to a different year.
let loadToken = 0;

const state = {
  year: null,
  years: [],            // populated by populateYearSelect; iterated by loadAllYears
  teamTricode: ALL_TEAMS,
  picks: [],
  teamsByTricode: new Map(), // populated per year from pick.teamAbbrev/teamName/teamLogoLight
  sortKey: "overallPick",
  sortDir: "asc",
};

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("team").addEventListener("change", (e) => {
    state.teamTricode = e.target.value;
    updateTeamLogo();
    render();
  });
  document.getElementById("year").addEventListener("change", (e) => {
    const v = e.target.value;
    state.year = v === ALL_YEARS ? ALL_YEARS : Number(v);
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
  // Snapshot of the NHL API's /draft/picks/now ({draftYear, draftYears}),
  // refreshed nightly by the deploy workflow. Default to draftYear so we
  // don't open on an empty future draft. "All years" sits at the top to
  // enter team-history mode without auto-selecting it on first paint.
  const res = await fetch(`${DATA_BASE}/years.json`);
  const data = await res.json();
  const years = [...(data.draftYears || [])].sort((a, b) => b - a);
  state.years = years;
  const select = document.getElementById("year");
  select.appendChild(new Option("All years", ALL_YEARS));
  for (const year of years) {
    select.appendChild(new Option(String(year), String(year)));
  }
  state.year = data.draftYear ?? years[0];
  select.value = String(state.year);
}

function populateTeamSelect() {
  // Build the dropdown from the picks of the relevant year — for single-year
  // mode that's every pick currently loaded, with era-accurate names. In
  // team-history mode (state.year === ALL_YEARS) state.picks holds every
  // year concatenated, so we narrow to the most-recent year that actually has
  // picks (an upcoming-but-undrafted year like 2026 has 0 picks and would
  // produce an empty dropdown). That gives the current 32 franchises with
  // current names. pickBestTeam preserves the selection across mode switches.
  const select = document.getElementById("team");
  let sourcePicks;
  if (state.year === ALL_YEARS) {
    const years = state.picks.map((p) => p.draftYear).filter((y) => y != null);
    const latest = years.length ? Math.max(...years) : null;
    sourcePicks = latest == null ? [] : state.picks.filter((p) => p.draftYear === latest);
  } else {
    sourcePicks = state.picks;
  }
  const seen = new Map();
  for (const pick of sourcePicks) {
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
  if (year === ALL_YEARS) return loadAllYears();
  const myToken = ++loadToken;
  setStatus(`Loading ${year} draft…`, "loading");
  document.querySelector("#picks tbody").replaceChildren();
  // Swap the era-accurate NHL crest before the fetch completes so the header
  // updates instantly even on slow networks / uncached year builds.
  updateNhlCrest();

  try {
    const res = await fetch(`${DATA_BASE}/enriched-v${CACHE_VERSION}-${year}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (myToken !== loadToken) return;
    state.picks = data.picks || [];
    populateTeamSelect();
    updateTeamLogo();
    render();
    setStatus("", null);
  } catch (err) {
    if (myToken !== loadToken) return;
    state.picks = [];
    populateTeamSelect();
    updateTeamLogo();
    setStatus(`Couldn't load the ${year} draft (${err.message}).`, "error");
  }
}

async function loadAllYears() {
  const myToken = ++loadToken;
  setStatus("Loading all drafts…", "loading");
  document.querySelector("#picks tbody").replaceChildren();
  updateNhlCrest();

  try {
    // Fetch every year in parallel. Each year file is ~50KB so the total
    // payload is a few MB; the browser HTTP cache makes re-entry instant.
    const results = await Promise.all(
      state.years.map((year) =>
        fetch(`${DATA_BASE}/enriched-v${CACHE_VERSION}-${year}.json`).then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status} on ${year}`);
          const data = await res.json();
          // Inject draftYear so the comparator + year-divider grouping +
          // dropdown filter can read it off each pick.
          for (const pick of data.picks || []) pick.draftYear = year;
          return data.picks || [];
        })
      )
    );
    if (myToken !== loadToken) return;
    state.picks = results.flat();
    populateTeamSelect();
    updateTeamLogo();
    render();
    setStatus("", null);
  } catch (err) {
    if (myToken !== loadToken) return;
    state.picks = [];
    populateTeamSelect();
    updateTeamLogo();
    setStatus(`Couldn't load all drafts (${err.message}).`, "error");
  }
}

function updateNhlCrest() {
  const img = document.querySelector(".nhl-crest");
  if (!img) return;
  // Team-history mode spans every era; pin to the modern crest rather than
  // letting nhlCrestForYear() coerce "ALL_YEARS" to NaN and fall to classic.
  const url = state.year === ALL_YEARS ? NHL_CREST_MODERN : nhlCrestForYear(state.year);
  if (!img.src.endsWith(url) && img.src !== url) img.src = url;
}

function updateTeamLogo() {
  const link = document.getElementById("team-logo-link");
  const img = document.getElementById("team-logo");
  const team = state.teamsByTricode.get(state.teamTricode);
  if (!team || !team.logoUrl) {
    link.hidden = true;
    link.removeAttribute("href");
    img.removeAttribute("src");
    img.alt = "";
    return;
  }
  img.src = team.logoUrl;
  img.alt = `${team.name} logo`;
  const url = teamPageUrl(state.teamTricode);
  if (url) link.href = url;
  else link.removeAttribute("href");
  link.hidden = false;
  img.onerror = () => {
    link.hidden = true;
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

  const teamHistoryMode = state.year === ALL_YEARS;
  // Lineage-aware filter in team-history mode (HFD picks belong to CAR, etc.);
  // exact-tricode match in single-year mode where era-accurate names already
  // disambiguate the dropdown.
  let filtered;
  if (state.teamTricode === ALL_TEAMS) {
    filtered = teamHistoryMode ? [] : state.picks;
  } else if (teamHistoryMode) {
    filtered = state.picks.filter((p) => teamHistoryFilter(p, state.teamTricode));
  } else {
    filtered = state.picks.filter((p) => p.teamAbbrev === state.teamTricode);
  }

  if (filtered.length === 0) {
    tbody.appendChild(emptyRow());
    return;
  }

  const comparator = teamHistoryMode
    ? compareByForMode("team-history", state.sortKey, state.sortDir)
    : compareBy(state.sortKey, state.sortDir);
  const rows = [...filtered].sort(comparator);

  // Round dividers only make sense when picks are visually grouped by round —
  // that's the overallPick (default) and round sort keys, all-teams view only.
  // Other sort keys (name, position, stats) interleave rounds and dividers
  // would land at nearly every row. Year dividers play the same role in
  // team-history mode, gated by showYearDividers.
  const showRoundDividers =
    !teamHistoryMode &&
    state.teamTricode === ALL_TEAMS &&
    (state.sortKey === "overallPick" || state.sortKey === "round");
  const showYearDiv = showYearDividers(state);

  let lastRound = null;
  let lastYear = null;
  for (const pick of rows) {
    if (showYearDiv && pick.draftYear !== lastYear) {
      tbody.appendChild(yearDividerRow(pick.draftYear));
      lastYear = pick.draftYear;
      lastRound = null;
    }
    if (showRoundDividers && pick.round !== lastRound) {
      tbody.appendChild(roundDividerRow(pick.round));
      lastRound = pick.round;
    }
    tbody.appendChild(rowFor(pick));
  }
}

function roundDividerRow(round) {
  const tr = document.createElement("tr");
  tr.className = "round-divider";
  tr.dataset.round = String(round);
  const td = document.createElement("td");
  td.colSpan = 12;
  td.textContent = `Round ${round}`;
  tr.appendChild(td);
  return tr;
}

function yearDividerRow(year) {
  const tr = document.createElement("tr");
  tr.className = "year-divider";
  tr.dataset.year = String(year);
  const td = document.createElement("td");
  td.colSpan = 12;
  td.textContent = String(year);
  tr.appendChild(td);
  return tr;
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
  if (state.year === ALL_YEARS && state.teamTricode === ALL_TEAMS) {
    td.textContent = "Pick a team to see its draft history.";
  } else if (state.teamTricode === ALL_TEAMS) {
    td.textContent = "No picks for this year.";
  } else {
    td.textContent = "No picks for this team in this year.";
  }
  tr.appendChild(td);
  return tr;
}

function rowFor(pick) {
  const tr = document.createElement("tr");

  tr.appendChild(textCell(pick.overallPick ?? DASH));
  tr.appendChild(textCell(pick.round ?? DASH));
  tr.appendChild(logoCell(pick));
  tr.appendChild(nameCell(pick));
  tr.appendChild(flagCell(pick));
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
  const url = teamPageUrl(pick.teamAbbrev);
  if (url) {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.appendChild(img);
    td.appendChild(a);
  } else {
    td.appendChild(img);
  }
  return td;
}

function logoUrlForRow(pick) {
  // Era-accurate logo from the pick payload. Since the dropdown now only lists
  // teams that drafted that year, every visible pick is from that year's team
  // and uses that team's era-correct logo automatically.
  return pick.teamLogoLight ?? null;
}

function flagCell(pick) {
  const td = document.createElement("td");
  td.className = "flag-cell";
  const url = flagUrlForCountry(pick.countryCode);
  if (!url) return td;
  const img = document.createElement("img");
  img.className = "row-flag";
  img.alt = pick.countryCode ?? "";
  img.src = url;
  img.onerror = () => {
    img.style.visibility = "hidden";
  };
  td.appendChild(img);
  return td;
}
