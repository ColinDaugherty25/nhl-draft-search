// Selecting a team narrows the table to that team's picks and surfaces
// the team's logo in the header. Switching back to "All teams" hides it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openApp, pickYear, PICK_ROW_SELECTOR } from "./_helpers.mjs";

test("selecting Bruins narrows the table to BOS picks only", async () => {
  const { browser, page } = await openApp();
  try {
    await pickYear(page, 2025);
    await page.selectOption("#team", "BOS");
    await page.waitForTimeout(150);
    const tricodes = await page.$$eval(PICK_ROW_SELECTOR, (rows) =>
      rows.map((tr) => {
        const img = tr.querySelector(".row-logo");
        return img?.src?.match(/\/svg\/([A-Z]{3})/)?.[1];
      })
    );
    assert.ok(tricodes.length >= 1, "expected ≥1 BOS pick");
    for (const tri of tricodes) {
      assert.equal(tri, "BOS", "non-BOS row visible while BOS filter active");
    }
  } finally {
    await browser.close();
  }
});

test("header logo appears for a team and hides on All teams", async () => {
  const { browser, page } = await openApp();
  try {
    await pickYear(page, 2025);
    await page.selectOption("#team", "BOS");
    let hidden = await page.$eval("#team-logo-link", (a) => a.hidden);
    assert.equal(hidden, false, "header logo should show when a team is selected");

    await page.selectOption("#team", "ALL");
    hidden = await page.$eval("#team-logo-link", (a) => a.hidden);
    assert.equal(hidden, true, "header logo should hide on All teams");
  } finally {
    await browser.close();
  }
});
