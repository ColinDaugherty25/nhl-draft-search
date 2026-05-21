// NHL Draft Explorer — vanilla JS, no build step.

// Requests are routed through the local proxy in server.py, which adds the
// CORS headers the NHL API doesn't send.
const API_BASE = "/api/v1";
const DASH = "—";
const ALL_TEAMS = "ALL";

// Historical tricode -> current franchise tricode. Selecting a current team
// also includes picks from its franchise's older incarnations (Hartford
// Whalers picks show up under Carolina, etc.). The dropdown only lists the
// current 32 franchises.
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

// Current 32 NHL franchises. The dropdown only ever lists these; predecessor
// tricodes (HFD, QUE, MNS, CLR, AFM, WIN, PHX, ARI, ATL) are reachable by
// selecting their current-day successor via LINEAGE.
const TEAMS = [
  { tricode: "ANA", name: "Anaheim Ducks" },
  { tricode: "BOS", name: "Boston Bruins" },
  { tricode: "BUF", name: "Buffalo Sabres" },
  { tricode: "CGY", name: "Calgary Flames" },
  { tricode: "CAR", name: "Carolina Hurricanes" },
  { tricode: "CHI", name: "Chicago Blackhawks" },
  { tricode: "COL", name: "Colorado Avalanche" },
  { tricode: "CBJ", name: "Columbus Blue Jackets" },
  { tricode: "DAL", name: "Dallas Stars" },
  { tricode: "DET", name: "Detroit Red Wings" },
  { tricode: "EDM", name: "Edmonton Oilers" },
  { tricode: "FLA", name: "Florida Panthers" },
  { tricode: "LAK", name: "Los Angeles Kings" },
  { tricode: "MIN", name: "Minnesota Wild" },
  { tricode: "MTL", name: "Montréal Canadiens" },
  { tricode: "NSH", name: "Nashville Predators" },
  { tricode: "NJD", name: "New Jersey Devils" },
  { tricode: "NYI", name: "New York Islanders" },
  { tricode: "NYR", name: "New York Rangers" },
  { tricode: "OTT", name: "Ottawa Senators" },
  { tricode: "PHI", name: "Philadelphia Flyers" },
  { tricode: "PIT", name: "Pittsburgh Penguins" },
  { tricode: "SJS", name: "San Jose Sharks" },
  { tricode: "SEA", name: "Seattle Kraken" },
  { tricode: "STL", name: "St. Louis Blues" },
  { tricode: "TBL", name: "Tampa Bay Lightning" },
  { tricode: "TOR", name: "Toronto Maple Leafs" },
  { tricode: "UTA", name: "Utah Hockey Club" },
  { tricode: "VAN", name: "Vancouver Canucks" },
  { tricode: "VGK", name: "Vegas Golden Knights" },
  { tricode: "WSH", name: "Washington Capitals" },
  { tricode: "WPG", name: "Winnipeg Jets" },
];

const state = {
  year: null,
  teamTricode: ALL_TEAMS,
  picks: [],
};

// Career-stat caches survive year/team switches so re-viewing is instant.
const playerIdCache = new Map(); // key -> Promise<string|null>
const statsCache = new Map();    // playerId -> Promise<{position, totals}|null>
const LOADING = "·";

// Rows fetch their stats only after scrolling into view. Limits API calls
// for big "All teams" views; small filtered views fetch everything at once.
const statsObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const row = entry.target;
      statsObserver.unobserve(row);
      if (row._pick) fetchAndFillStats(row, row._pick);
    }
  },
  { rootMargin: "200px" },
);

// Tiny semaphore so we don't fire 30 fetches at once when a big list pops into view.
let activeFetches = 0;
const fetchWaiters = [];
async function gated(fn) {
  while (activeFetches >= 6) {
    await new Promise((resolve) => fetchWaiters.push(resolve));
  }
  activeFetches++;
  try {
    return await fn();
  } finally {
    activeFetches--;
    const next = fetchWaiters.shift();
    if (next) next();
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  populateTeamSelect();
  document.getElementById("team").addEventListener("change", (e) => {
    state.teamTricode = e.target.value;
    updateTeamLogo();
    render();
  });
  document.getElementById("year").addEventListener("change", (e) => {
    state.year = Number(e.target.value);
    loadYear(state.year);
  });
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
  const select = document.getElementById("team");
  const all = new Option("All teams", ALL_TEAMS);
  select.appendChild(all);
  for (const team of TEAMS) {
    select.appendChild(new Option(team.name, team.tricode));
  }
  select.value = state.teamTricode;
}

async function loadYear(year) {
  setStatus(`Loading ${year} draft…`, "loading");
  document.querySelector("#picks tbody").replaceChildren();
  try {
    const res = await fetch(`${API_BASE}/draft/picks/${year}/all`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.picks = data.picks || [];
    setStatus("", null);
    render();
  } catch (err) {
    state.picks = [];
    setStatus(`Couldn't load the ${year} draft (${err.message}).`, "error");
  }
}

function updateTeamLogo() {
  const img = document.getElementById("team-logo");
  if (state.teamTricode === ALL_TEAMS) {
    img.hidden = true;
    img.removeAttribute("src");
    img.alt = "";
    return;
  }
  const team = TEAMS.find((t) => t.tricode === state.teamTricode);
  img.src = `https://assets.nhle.com/logos/nhl/svg/${state.teamTricode}_light.svg`;
  img.alt = team ? `${team.name} logo` : `${state.teamTricode} logo`;
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
  // Reset the lazy-stats observer so it isn't holding refs to detached rows.
  statsObserver.disconnect();

  const tbody = document.querySelector("#picks tbody");
  tbody.replaceChildren();

  const filtered =
    state.teamTricode === ALL_TEAMS
      ? state.picks
      : state.picks.filter(
          (p) =>
            p.teamAbbrev === state.teamTricode ||
            LINEAGE[p.teamAbbrev] === state.teamTricode,
        );

  if (filtered.length === 0) {
    tbody.appendChild(emptyRow());
    return;
  }

  const rows = [...filtered].sort((a, b) => a.overallPick - b.overallPick);
  for (const pick of rows) {
    const tr = rowFor(pick);
    tbody.appendChild(tr);
    statsObserver.observe(tr);
  }
}

const STAT_KEYS = ["gamesPlayed", "goals", "assists", "points", "plusMinus", "pim"];

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
  const firstName = pick.firstName?.default ?? "";
  const lastName = pick.lastName?.default ?? "";
  const name = `${firstName} ${lastName}`.trim() || DASH;

  tr.appendChild(textCell(pick.overallPick ?? DASH));
  tr.appendChild(textCell(pick.round ?? DASH));
  tr.appendChild(textCell(pick.pickInRound ?? DASH));
  tr.appendChild(logoCell(pick));
  tr.appendChild(textCell(name));
  tr.appendChild(textCell(pick.positionCode || DASH));
  for (const _key of STAT_KEYS) {
    tr.appendChild(statCell(LOADING));
  }
  return tr;
}

async function fetchAndFillStats(row, pick) {
  if (!row.isConnected) return;
  const playerId = await findPlayerId(pick);
  if (!row.isConnected) return;
  const info = playerId ? await getStats(playerId) : null;
  if (!row.isConnected) return;
  fillStatsCells(row, pick, info);
}

function playerKey(pick) {
  return [
    pick.firstName?.default ?? "",
    pick.lastName?.default ?? "",
    pick.positionCode ?? "",
    pick.countryCode ?? "",
    pick.height ?? "",
  ].join("|");
}

function findPlayerId(pick) {
  const key = playerKey(pick);
  if (playerIdCache.has(key)) return playerIdCache.get(key);

  const promise = gated(async () => {
    const first = pick.firstName?.default;
    const last = pick.lastName?.default;
    if (!first || !last) return null;
    const q = encodeURIComponent(`${first} ${last}`);
    try {
      const res = await fetch(
        `/search/api/v1/search/player?culture=en-us&limit=20&q=${q}`,
      );
      if (!res.ok) return null;
      const candidates = await res.json();
      return chooseCandidate(candidates, pick);
    } catch {
      return null;
    }
  });
  playerIdCache.set(key, promise);
  return promise;
}

// Draft picks use LW/RW; the search endpoint uses L/R for those positions.
const POS_FALLBACK = { LW: "L", RW: "R" };

function chooseCandidate(list, pick) {
  if (!Array.isArray(list) || list.length === 0) return null;

  const first = (pick.firstName?.default ?? "").toLowerCase();
  const last = (pick.lastName?.default ?? "").toLowerCase();
  const fullName = `${first} ${last}`.trim();

  // Pass 0: exact full-name match. Critical because q=First+Last token-matches
  // also return other players sharing a surname (e.g. "Jakob Forsbacka Karlsson"
  // also returns "William Karlsson" who'd otherwise win on position/country/height).
  let pool = list.filter((c) => (c.name ?? "").toLowerCase() === fullName);
  if (pool.length === 0) pool = list;

  // Pass 1: positionCode match (with LW->L / RW->R fallback).
  if (pick.positionCode && pool.length > 1) {
    const match = pool.filter((c) => c.positionCode === pick.positionCode);
    const fallback =
      match.length === 0 && POS_FALLBACK[pick.positionCode]
        ? pool.filter(
            (c) => c.positionCode === POS_FALLBACK[pick.positionCode],
          )
        : [];
    if (match.length) pool = match;
    else if (fallback.length) pool = fallback;
  }
  if (pool.length > 1 && pick.countryCode) {
    const narrowed = pool.filter((c) => c.birthCountry === pick.countryCode);
    if (narrowed.length) pool = narrowed;
  }
  if (pool.length > 1 && pick.height) {
    const narrowed = pool.filter((c) => c.heightInInches === pick.height);
    if (narrowed.length) pool = narrowed;
  }
  return pool[0]?.playerId ?? null;
}

function getStats(playerId) {
  if (statsCache.has(playerId)) return statsCache.get(playerId);
  const promise = gated(async () => {
    try {
      const res = await fetch(`${API_BASE}/player/${playerId}/landing`);
      if (!res.ok) return null;
      const data = await res.json();
      return {
        position: data.position,
        totals: data.careerTotals?.regularSeason ?? null,
      };
    } catch {
      return null;
    }
  });
  statsCache.set(playerId, promise);
  return promise;
}

function fillStatsCells(row, pick, info) {
  const cells = row.querySelectorAll(".stats-cell");
  if (cells.length !== STAT_KEYS.length) return;
  const totals = info?.totals;
  const isGoalie = pick.positionCode === "G" || info?.position === "G";

  const values = totals
    ? [
        totals.gamesPlayed,
        isGoalie ? null : totals.goals,
        isGoalie ? null : totals.assists,
        isGoalie ? null : totals.points,
        isGoalie ? null : totals.plusMinus,
        totals.pim,
      ]
    : [null, null, null, null, null, null];

  values.forEach((v, i) => {
    cells[i].textContent = v == null ? DASH : String(v);
  });
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
  // Specific-team view: every row (including historicals merged via LINEAGE)
  // uses the current franchise logo so the page reads as one team's history.
  if (state.teamTricode !== ALL_TEAMS) {
    return `https://assets.nhle.com/logos/nhl/svg/${state.teamTricode}_light.svg`;
  }
  // All-teams view: era-accurate logo straight from the pick payload. The API
  // ships per-pick teamLogoLight URLs that work for defunct tricodes too.
  return pick.teamLogoLight ?? null;
}
