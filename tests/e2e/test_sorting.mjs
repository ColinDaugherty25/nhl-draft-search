// Column header clicks sort the table. Stats columns default to descending
// on first click; text/order columns default to ascending. Subsequent clicks
// toggle direction. Nulls always sink to the bottom.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openApp, pickYear } from "./_helpers.mjs";

async function headerClass(page, key) {
  return page.$eval(`#picks th[data-key="${key}"]`, (th) => th.className);
}

test("clicking PTS first time sorts descending (stats default)", async () => {
  const { browser, page } = await openApp();
  try {
    await pickYear(page, 2010); // older year so career stats are populated
    await page.click('#picks th[data-key="points"]');
    await page.waitForTimeout(100);

    const cls = await headerClass(page, "points");
    assert.match(cls, /sort-desc/, `expected sort-desc, got "${cls}"`);

    // First non-null points value in the table should be the max.
    const points = await page.$$eval("#picks tbody tr", (rows) =>
      rows
        .map((tr) => {
          const cells = tr.querySelectorAll(".stats-cell");
          // [GP, G, A, PTS, +/-, PIM]
          const ptsText = cells[3]?.textContent ?? "—";
          return ptsText === "—" ? null : Number(ptsText);
        })
        .filter((v) => v != null)
    );
    if (points.length >= 2) {
      assert.ok(points[0] >= points[1], "first row's PTS not >= second");
    }
  } finally {
    await browser.close();
  }
});

test("clicking Overall toggles direction on repeated clicks", async () => {
  const { browser, page } = await openApp();
  try {
    await pickYear(page, 2025);
    // Default state is sort by overallPick asc. Click toggles to desc.
    await page.click('#picks th[data-key="overallPick"]');
    await page.waitForTimeout(100);
    assert.match(await headerClass(page, "overallPick"), /sort-desc/);

    // Click again -> back to asc.
    await page.click('#picks th[data-key="overallPick"]');
    await page.waitForTimeout(100);
    assert.match(await headerClass(page, "overallPick"), /sort-asc/);
  } finally {
    await browser.close();
  }
});

test("sorting by PTS ascending — nulls (—) still at bottom", async () => {
  const { browser, page } = await openApp();
  try {
    // Use a recent year so many picks still have careerStats == null.
    await pickYear(page, 2024);
    await page.click('#picks th[data-key="points"]'); // first click: desc
    await page.click('#picks th[data-key="points"]'); // second click: asc
    await page.waitForTimeout(100);

    const lastRowPts = await page.$$eval("#picks tbody tr", (rows) => {
      const tr = rows[rows.length - 1];
      const cells = tr?.querySelectorAll(".stats-cell");
      return cells?.[3]?.textContent ?? null;
    });
    assert.equal(
      lastRowPts,
      "—",
      `last row should be a null/dash when sorting PTS asc, got "${lastRowPts}"`
    );
  } finally {
    await browser.close();
  }
});
