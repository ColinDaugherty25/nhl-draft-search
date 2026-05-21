// Round-divider rows appear in the All-teams view when picks are grouped by
// round (sort key = overallPick or round). Hidden when a team is filtered or
// when sorting interleaves rounds (name, position, stats).
import { test } from "node:test";
import assert from "node:assert/strict";
import { openApp, pickYear } from "./_helpers.mjs";

async function dividers(page) {
  return page.$$eval("tr.round-divider", (rows) =>
    rows.map((tr) => ({
      round: Number(tr.dataset.round),
      text: tr.querySelector("td").textContent,
    }))
  );
}

test("default view: one divider per round, in ascending order, labeled 'Round N'", async () => {
  const { browser, page } = await openApp();
  try {
    await pickYear(page, 2025);
    const divs = await dividers(page);
    assert.ok(divs.length > 0, "expected at least one divider");

    // Each divider's text matches its round attribute.
    for (const d of divs) assert.equal(d.text, `Round ${d.round}`);

    // Strictly ascending (since default sort is overallPick asc).
    const rounds = divs.map((d) => d.round);
    const sorted = [...rounds].sort((a, b) => a - b);
    assert.deepEqual(rounds, sorted, "dividers should be in ascending order");

    // Divider count matches the unique-round count for that year (no missing
    // or extra dividers).
    const uniqueRounds = await page.evaluate(async () => {
      const r = await fetch("/data/enriched-v3-2025.json");
      const { picks } = await r.json();
      return new Set(picks.map((p) => p.round)).size;
    });
    assert.equal(divs.length, uniqueRounds);
  } finally {
    await browser.close();
  }
});

test("first divider precedes the first pick of its round", async () => {
  const { browser, page } = await openApp();
  try {
    await pickYear(page, 2025);
    // The very first <tr> in the tbody should be a divider for round 1
    // (since sort is overallPick asc), and the next tr should be a pick row
    // whose overallPick = 1.
    const result = await page.evaluate(() => {
      const trs = document.querySelectorAll("#picks tbody tr");
      const first = trs[0];
      const second = trs[1];
      return {
        firstIsDivider: first?.classList.contains("round-divider"),
        firstRound: first?.dataset.round,
        secondIsPick: !second?.classList.contains("round-divider"),
        secondOverall: second?.querySelector("td")?.textContent,
      };
    });
    assert.equal(result.firstIsDivider, true, "first row should be divider");
    assert.equal(result.firstRound, "1");
    assert.equal(result.secondIsPick, true, "second row should be a pick");
    assert.equal(result.secondOverall, "1", "first pick should be overall #1");
  } finally {
    await browser.close();
  }
});

test("dividers disappear when a single team is selected", async () => {
  const { browser, page } = await openApp();
  try {
    await pickYear(page, 2025);
    await page.selectOption("#team", "BOS");
    await page.waitForTimeout(150);
    assert.deepEqual(await dividers(page), []);
  } finally {
    await browser.close();
  }
});

test("dividers disappear when sorting by Player name", async () => {
  const { browser, page } = await openApp();
  try {
    await pickYear(page, 2025);
    await page.click('#picks th[data-key="name"]');
    await page.waitForTimeout(150);
    assert.deepEqual(await dividers(page), []);
  } finally {
    await browser.close();
  }
});

test("dividers disappear when sorting by PTS (stats column)", async () => {
  const { browser, page } = await openApp();
  try {
    await pickYear(page, 2025);
    await page.click('#picks th[data-key="points"]');
    await page.waitForTimeout(150);
    assert.deepEqual(await dividers(page), []);
  } finally {
    await browser.close();
  }
});

test("dividers reorder when toggling Overall to descending", async () => {
  const { browser, page } = await openApp();
  try {
    await pickYear(page, 2025);
    // Default is overallPick asc; click toggles to desc.
    await page.click('#picks th[data-key="overallPick"]');
    await page.waitForTimeout(150);
    const divs = await dividers(page);
    assert.ok(divs.length > 0);
    const rounds = divs.map((d) => d.round);
    const sortedDesc = [...rounds].sort((a, b) => b - a);
    assert.deepEqual(rounds, sortedDesc, "dividers should be 7→1 when sort is desc");
    assert.equal(divs[0].text, `Round ${divs[0].round}`);
  } finally {
    await browser.close();
  }
});

test("dividers also appear when sorting by Round", async () => {
  const { browser, page } = await openApp();
  try {
    await pickYear(page, 2025);
    await page.click('#picks th[data-key="round"]');
    await page.waitForTimeout(150);
    const divs = await dividers(page);
    assert.ok(divs.length > 0, "expected dividers when sort key is round");
  } finally {
    await browser.close();
  }
});

test("dividers count matches a different year's rounds", async () => {
  const { browser, page } = await openApp();
  try {
    await pickYear(page, 1985);
    const divs = await dividers(page);
    const uniqueRounds = await page.evaluate(async () => {
      const r = await fetch("/data/enriched-v3-1985.json");
      const { picks } = await r.json();
      return new Set(picks.map((p) => p.round)).size;
    });
    assert.equal(divs.length, uniqueRounds);
  } finally {
    await browser.close();
  }
});
