// Year and team dropdowns populate correctly on initial load.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openApp } from "./_helpers.mjs";

test("year selector populates from years.json and defaults to draftYear", async () => {
  const { browser, page } = await openApp();
  try {
    const years = await page.$$eval("#year option", (opts) =>
      opts.map((o) => Number(o.value))
    );
    assert.ok(years.length >= 40, `expected ≥40 years, got ${years.length}`);
    assert.ok(years.includes(1979), "1979 missing from year list");

    // The default is years.json's draftYear (the most recent completed draft),
    // not necessarily max(draftYears) — the API exposes next year's draft order
    // in the list before that season has started.
    const expectedDefault = await page.evaluate(async () => {
      const r = await fetch("/data/years.json");
      return (await r.json()).draftYear;
    });
    const current = await page.$eval("#year", (s) => Number(s.value));
    assert.equal(current, expectedDefault);
  } finally {
    await browser.close();
  }
});

test("team selector lists All teams + current franchises on load", async () => {
  const { browser, page } = await openApp();
  try {
    const teams = await page.$$eval("#team option", (opts) =>
      opts.map((o) => ({ value: o.value, label: o.textContent }))
    );
    assert.equal(teams[0].value, "ALL", "first option should be ALL");
    assert.equal(teams[0].label, "All teams");

    // Latest year has ≥31 franchises (32 normally; Utah was 32nd from 2024
    // onward and they trade picks, so 31 is the conservative floor).
    assert.ok(
      teams.length >= 32,
      `expected ≥32 options (ALL + ≥31 franchises), got ${teams.length}`
    );
  } finally {
    await browser.close();
  }
});
