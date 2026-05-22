// Team-history view: year=ALL_YEARS + a specific team shows every pick that
// franchise has ever made, grouped by year with year-divider rows. Lineage is
// folded in (Hartford picks show up under Carolina). Year dividers behave like
// round dividers — visible on Overall/Round sorts, hidden on stats/name sorts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openApp, pickYear, PICK_ROW_SELECTOR } from "./_helpers.mjs";

const ALL_YEARS = "ALL_YEARS";

async function yearDividers(page) {
  return page.$$eval("tr.year-divider", (rows) =>
    rows.map((tr) => ({
      year: Number(tr.dataset.year),
      text: tr.querySelector("td").textContent,
    }))
  );
}

async function pickTricodes(page) {
  return page.$$eval(PICK_ROW_SELECTOR, (rows) =>
    rows.map((tr) => {
      const img = tr.querySelector(".row-logo");
      return img?.src?.match(/\/svg\/([A-Z]{3})/)?.[1];
    })
  );
}

async function enterTeamHistory(page, tricode) {
  await page.selectOption("#year", ALL_YEARS);
  await page.waitForFunction(() => !document.getElementById("status").textContent, {
    timeout: 30000,
  });
  await page.selectOption("#team", tricode);
  await page.waitForTimeout(150);
}

test("All years + Carolina renders picks from both CAR and HFD eras", async () => {
  const { browser, page } = await openApp();
  try {
    await enterTeamHistory(page, "CAR");
    const tricodes = await pickTricodes(page);
    assert.ok(tricodes.includes("CAR"), "expected at least one CAR-era pick");
    assert.ok(tricodes.includes("HFD"), "expected at least one HFD-era pick via lineage");
    // Sanity: nothing slips in from another franchise.
    for (const tri of tricodes) {
      assert.ok(tri === "CAR" || tri === "HFD", `unexpected tricode in team-history row: ${tri}`);
    }
  } finally {
    await browser.close();
  }
});

test("Year-divider rows appear newest-first by default", async () => {
  const { browser, page } = await openApp();
  try {
    await enterTeamHistory(page, "CAR");
    const divs = await yearDividers(page);
    assert.ok(divs.length > 1, "expected multiple year dividers for the franchise");

    // Each divider's text matches its year attribute.
    for (const d of divs) assert.equal(d.text, String(d.year));

    // Year groups always go newest-first so recent drafts sit at the top.
    const years = divs.map((d) => d.year);
    const sortedDesc = [...years].sort((a, b) => b - a);
    assert.deepEqual(years, sortedDesc, "year dividers should be newest-first");
  } finally {
    await browser.close();
  }
});

test("Year-divider order stays newest-first after toggling Overall sort", async () => {
  // Year-group direction is decoupled from within-year sort direction; the
  // toggle reverses pick order within each year but the year sections
  // themselves always lead with the most recent draft.
  const { browser, page } = await openApp();
  try {
    await enterTeamHistory(page, "CAR");
    await page.click('#picks th[data-key="overallPick"]');
    await page.waitForTimeout(150);
    const divs = await yearDividers(page);
    const years = divs.map((d) => d.year);
    const sortedDesc = [...years].sort((a, b) => b - a);
    assert.deepEqual(years, sortedDesc, "year dividers should remain newest-first");
  } finally {
    await browser.close();
  }
});

test("Year dividers vanish when sorting by Player name", async () => {
  const { browser, page } = await openApp();
  try {
    await enterTeamHistory(page, "CAR");
    await page.click('#picks th[data-key="name"]');
    await page.waitForTimeout(150);
    assert.deepEqual(await yearDividers(page), []);
  } finally {
    await browser.close();
  }
});

test("Year dividers vanish when sorting by PTS (stats column)", async () => {
  const { browser, page } = await openApp();
  try {
    await enterTeamHistory(page, "CAR");
    await page.click('#picks th[data-key="points"]');
    await page.waitForTimeout(150);
    assert.deepEqual(await yearDividers(page), []);
  } finally {
    await browser.close();
  }
});

test("Switching back to a specific year restores round dividers and clears year dividers", async () => {
  const { browser, page } = await openApp();
  try {
    await enterTeamHistory(page, "CAR");
    assert.ok((await yearDividers(page)).length > 0, "preconditions: year dividers visible");

    await pickYear(page, 2025); // pickYear resets team to ALL first
    await page.waitForTimeout(150);

    assert.deepEqual(await yearDividers(page), [], "year dividers should be gone");
    const roundDivs = await page.$$eval("tr.round-divider", (rows) => rows.length);
    assert.ok(roundDivs > 0, "round dividers should return in single-year + all-teams view");
  } finally {
    await browser.close();
  }
});

test("All years + All teams shows the empty-state prompt", async () => {
  const { browser, page } = await openApp();
  try {
    await page.selectOption("#year", ALL_YEARS);
    await page.waitForFunction(() => !document.getElementById("status").textContent, {
      timeout: 30000,
    });
    await page.selectOption("#team", "ALL");
    await page.waitForTimeout(150);

    const empty = await page.$eval("#picks tbody td.empty", (td) => td.textContent);
    assert.equal(empty, "Pick a team to see its draft history.");
    assert.deepEqual(await yearDividers(page), []);
    // The emptyRow <tr> itself matches PICK_ROW_SELECTOR (no class), so count
    // only rows that have a player name cell — i.e. actual pick rows.
    const realPickRows = await page.$$eval("#picks tbody .name-cell", (els) => els.length);
    assert.equal(realPickRows, 0);
  } finally {
    await browser.close();
  }
});

test("Hartford-era row logo still links to the current Hurricanes page via lineage", async () => {
  const { browser, page } = await openApp();
  try {
    await enterTeamHistory(page, "CAR");
    // Find the first row whose logo has /svg/HFD/ in its src and inspect its
    // parent <a> href. Hurricanes lineage routes HFD → /hurricanes.
    const href = await page.evaluate(() => {
      const rows = document.querySelectorAll("#picks tbody tr:not(.round-divider):not(.year-divider)");
      for (const tr of rows) {
        const img = tr.querySelector(".row-logo");
        if (img && /\/svg\/HFD/.test(img.src)) {
          return img.closest("a")?.href ?? null;
        }
      }
      return null;
    });
    assert.ok(href, "expected to find at least one HFD-era row with a logo link");
    assert.match(href, /\/hurricanes$/, `expected lineage link to /hurricanes, got ${href}`);
  } finally {
    await browser.close();
  }
});
