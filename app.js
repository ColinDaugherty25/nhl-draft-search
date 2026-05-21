// NHL Draft Explorer — vanilla JS, no build step.

const API_BASE = "https://api-web.nhle.com/v1";
const DASH = "—";

const state = {
  year: 2023,
  picks: [],
};

document.addEventListener("DOMContentLoaded", () => {
  loadYear(state.year);
});

async function loadYear(year) {
  const res = await fetch(`${API_BASE}/draft/picks/${year}/all`);
  const data = await res.json();
  state.picks = data.picks || [];
  render();
}

function render() {
  const tbody = document.querySelector("#picks tbody");
  tbody.replaceChildren();

  const rows = [...state.picks].sort((a, b) => a.overallPick - b.overallPick);
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
