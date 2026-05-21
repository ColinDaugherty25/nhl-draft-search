// Pick column was removed; Nationality column was added between Player and
// Pos, showing a country flag. Sortable by countryCode.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openApp, pickYear, PICK_ROW_SELECTOR } from "./_helpers.mjs";

test("Pick column header is gone, Nat header exists with text 'Nat'", async () => {
  const { browser, page } = await openApp();
  try {
    const pickGone = await page.$('#picks thead th[data-key="pickInRound"]');
    assert.equal(pickGone, null, "Pick column header should not exist");

    const nat = await page.$eval('#picks thead th[data-key="countryCode"]', (th) => ({
      text: th.textContent.trim(),
    }));
    assert.equal(nat.text, "Nat");
  } finally {
    await browser.close();
  }
});

test("Nat column sits between Player and Pos in DOM order", async () => {
  const { browser, page } = await openApp();
  try {
    const keys = await page.$$eval(
      "#picks thead tr:first-child th[data-key]",
      (ths) => ths.map((th) => th.dataset.key)
    );
    const playerIdx = keys.indexOf("name");
    const natIdx = keys.indexOf("countryCode");
    const posIdx = keys.indexOf("positionCode");
    assert.ok(natIdx === playerIdx + 1, `Nat (${natIdx}) should be right after Player (${playerIdx})`);
    assert.ok(natIdx === posIdx - 1, `Nat (${natIdx}) should be right before Pos (${posIdx})`);
  } finally {
    await browser.close();
  }
});

test("2025 #1 overall (Schaefer) shows the Canadian flag", async () => {
  const { browser, page } = await openApp();
  try {
    await pickYear(page, 2025);
    const result = await page.evaluate((sel) => {
      const tr = document.querySelector(sel);
      const flag = tr.querySelector(".row-flag");
      return { src: flag?.src, alt: flag?.alt };
    }, PICK_ROW_SELECTOR);
    assert.ok(result.src.endsWith("/ca.svg"), `expected /ca.svg, got ${result.src}`);
    assert.equal(result.alt, "CAN");
  } finally {
    await browser.close();
  }
});

test("older draft (1985) still renders flags", async () => {
  const { browser, page } = await openApp();
  try {
    await pickYear(page, 1985);
    const flagCount = await page.$$eval(
      `${PICK_ROW_SELECTOR} .row-flag`,
      (imgs) => imgs.length
    );
    assert.ok(flagCount > 0, "expected at least one flag in 1985");
  } finally {
    await browser.close();
  }
});

test("clicking Nat header actually sorts (load-bearing check that sortValue is wired)", async () => {
  const { browser, page } = await openApp();
  try {
    await pickYear(page, 2025);
    await page.click('#picks th[data-key="countryCode"]');
    await page.waitForTimeout(150);

    const cls = await page.$eval('#picks th[data-key="countryCode"]', (th) => th.className);
    assert.match(cls, /sort-asc/, `expected sort-asc, got "${cls}"`);

    // Consecutive picks should have non-decreasing countryCode.
    const codes = await page.$$eval(`${PICK_ROW_SELECTOR} .row-flag`, (imgs) =>
      imgs.map((img) => img.alt)
    );
    for (let i = 1; i < codes.length; i++) {
      assert.ok(
        codes[i - 1] <= codes[i],
        `sort broken at index ${i}: ${codes[i - 1]} > ${codes[i]}`
      );
    }
  } finally {
    await browser.close();
  }
});
