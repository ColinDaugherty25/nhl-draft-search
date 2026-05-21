// NHL Draft Explorer — vanilla JS, no build step.

// Requests are routed through the local proxy in server.py, which adds the
// CORS headers the NHL API doesn't send.
const API_BASE = "/api/v1";
const DASH = "—";
const ALL_TEAMS = "ALL";

// Current 32 NHL franchises. Picks from defunct teams (e.g. HFD, QUE) still
// appear in older draft data — they render under "All teams" but aren't in
// this dropdown.
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

  const rows = [...filtered].sort((a, b) => a.overallPick - b.overallPick);
  for (const pick of rows) {
    tbody.appendChild(rowFor(pick));
  }
}

function emptyRow() {
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = 6;
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
  const firstName = pick.firstName?.default ?? "";
  const lastName = pick.lastName?.default ?? "";
  const name = `${firstName} ${lastName}`.trim() || DASH;

  tr.appendChild(textCell(pick.overallPick ?? DASH));
  tr.appendChild(textCell(pick.round ?? DASH));
  tr.appendChild(textCell(pick.pickInRound ?? DASH));
  tr.appendChild(logoCell(pick.teamAbbrev));
  tr.appendChild(textCell(name));
  tr.appendChild(textCell(pick.positionCode || DASH));
  return tr;
}

function textCell(value) {
  const td = document.createElement("td");
  td.textContent = value;
  return td;
}

function logoCell(tricode) {
  const td = document.createElement("td");
  td.className = "logo-cell";
  if (!tricode) return td;
  const img = document.createElement("img");
  img.className = "row-logo";
  img.alt = "";
  img.src = `https://assets.nhle.com/logos/nhl/svg/${tricode}_light.svg`;
  img.onerror = () => {
    img.style.visibility = "hidden";
  };
  td.appendChild(img);
  return td;
}
