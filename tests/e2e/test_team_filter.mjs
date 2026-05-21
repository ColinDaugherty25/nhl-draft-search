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

test("selected-team logo sits in the right portion of the layout, inside the container", async () => {
  const { browser, page } = await openApp();
  try {
    await pickYear(page, 2025);
    await page.selectOption("#team", "BOS");
    await page.waitForTimeout(100);
    const rects = await page.evaluate(() => {
      const h1 = document.querySelector("h1").getBoundingClientRect();
      const link = document.querySelector("#team-logo-link").getBoundingClientRect();
      const container = document.querySelector(".container").getBoundingClientRect();
      return {
        h1Right: h1.right,
        linkLeft: link.left,
        linkRight: link.right,
        linkWidth: link.width,
        containerRight: container.right,
      };
    });
    assert.ok(rects.linkWidth > 0, "team-logo-link should have non-zero width when shown");
    assert.ok(
      rects.linkLeft > rects.h1Right,
      `expected team logo right of h1: h1.right=${rects.h1Right} linkLeft=${rects.linkLeft}`
    );
    // After the resize/reposition: the logo is pulled inward from the container's
    // right edge (it sits above the stats columns, not flush right).
    assert.ok(
      rects.linkRight < rects.containerRight - 20,
      `expected logo inset from container right by >20px, got ` +
        `containerRight=${rects.containerRight} linkRight=${rects.linkRight}`
    );
  } finally {
    await browser.close();
  }
});

test("selected-team logo is sized large with top aligned to the title crest", async () => {
  const { browser, page } = await openApp();
  try {
    await pickYear(page, 2025);
    await page.selectOption("#team", "BOS");
    await page.waitForTimeout(100);
    const rects = await page.evaluate(() => {
      const h1 = document.querySelector("h1").getBoundingClientRect();
      const link = document.querySelector("#team-logo-link").getBoundingClientRect();
      const crest = document.querySelector(".nhl-crest").getBoundingClientRect();
      return {
        linkTop: link.top,
        linkHeight: link.height,
        crestTop: crest.top,
        h1Top: h1.top,
      };
    });
    assert.ok(
      rects.linkHeight >= 90,
      `expected team logo height >=90 (much larger than the prior 56px), got ${rects.linkHeight}`
    );
    assert.ok(
      Math.abs(rects.linkTop - rects.crestTop) <= 10,
      `expected logo top within 10px of NHL crest top: linkTop=${rects.linkTop} ` +
        `crestTop=${rects.crestTop} (diff ${Math.abs(rects.linkTop - rects.crestTop)})`
    );
  } finally {
    await browser.close();
  }
});
