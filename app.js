// NHL Draft Explorer — vanilla JS, no build step.

const API_BASE = "https://api-web.nhle.com/v1";
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
  const res = await fetch(`${API_BASE}/draft/picks/${year}/all`);
  const data = await res.json();
  state.picks = data.picks || [];
  render();
}

function render() {
  const tbody = document.querySelector("#picks tbody");
  tbody.replaceChildren();

  const filtered =
    state.teamTricode === ALL_TEAMS
      ? state.picks
      : state.picks.filter((p) => p.teamAbbrev === state.teamTricode);

  const rows = [...filtered].sort((a, b) => a.overallPick - b.overallPick);
  for (const pick of rows) {
    tbody.appendChild(rowFor(pick));
  }
}

function rowFor(pick) {
  const tr = document.createElement("tr");
  const firstName = pick.firstName?.default ?? "";
  const lastName = pick.lastName?.default ?? "";
  const name = `${firstName} ${lastName}`.trim() || DASH;

  for (const value of [
    pick.overallPick ?? DASH,
    pick.round ?? DASH,
    pick.pickInRound ?? DASH,
    name,
    pick.positionCode || DASH,
  ]) {
    const td = document.createElement("td");
    td.textContent = value;
    tr.appendChild(td);
  }
  return tr;
}
