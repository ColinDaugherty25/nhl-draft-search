// NHL Draft Explorer — vanilla JS, no build step.

// All data comes from pre-built static JSON in data/, populated by
// server.py --build (locally) or the GitHub Pages deploy workflow. No
// runtime proxy is required.
import {
  DASH,
  ALL_TEAMS,
  STAT_KEYS,
  DEFAULT_DIR,
  teamPageUrl,
  pickBestTeam,
  compareBy,
} from "./js/pure.mjs";

const DATA_BASE = "data";
const CACHE_VERSION = 3;

// Bumped on every loadYear call so stale in-flight responses can be ignored
// when the user has already moved on to a different year.
let loadToken = 0;

const state = {
  year: null,
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
  // Snapshot of the NHL API's /draft/picks/now ({draftYear, draftYears}),
  // refreshed nightly by the deploy workflow. Default to draftYear so we
  // don't open on an empty future draft.
  const res = await fetch(`${DATA_BASE}/years.json`);
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

  const filtered =
    state.teamTricode === ALL_TEAMS
      ? state.picks
      : state.picks.filter((p) => p.teamAbbrev === state.teamTricode);

  if (filtered.length === 0) {
    tbody.appendChild(emptyRow());
    return;
  }

  const rows = [...filtered].sort(compareBy(state.sortKey, state.sortDir));

  // Round dividers only make sense when picks are visually grouped by round —
  // that's the overallPick (default) and round sort keys, all-teams view only.
  // Other sort keys (name, position, stats) interleave rounds and dividers
  // would land at nearly every row.
  const showDividers =
    state.teamTricode === ALL_TEAMS &&
    (state.sortKey === "overallPick" || state.sortKey === "round");

  let lastRound = null;
  for (const pick of rows) {
    if (showDividers && pick.round !== lastRound) {
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
