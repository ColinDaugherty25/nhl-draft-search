// Defunct franchise row logos link to the current franchise's NHL.com page,
// and the team selector auto-switches across year changes via LINEAGE.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openApp, pickYear } from "./_helpers.mjs";

async function rowLogoHrefFor(page, tricode) {
  return page.evaluate((tri) => {
    for (const tr of document.querySelectorAll("#picks tbody tr")) {
      const img = tr.querySelector(".row-logo");
      const m = img?.src?.match(/\/svg\/([A-Z]{3})/);
      if (m && m[1] === tri) return tr.querySelector("a")?.href ?? null;
    }
    return null;
  }, tricode);
}

test("1985 — HFD row logo links to Hurricanes", async () => {
  const { browser, page } = await openApp();
  try {
    await pickYear(page, 1985);
    assert.equal(await rowLogoHrefFor(page, "HFD"), "https://www.nhl.com/hurricanes");
    assert.equal(await rowLogoHrefFor(page, "QUE"), "https://www.nhl.com/avalanche");
    assert.equal(await rowLogoHrefFor(page, "MNS"), "https://www.nhl.com/stars");
  } finally {
    await browser.close();
  }
});

test("1979 — WIN (original Jets) row logo links to Utah (transitive LINEAGE)", async () => {
  const { browser, page } = await openApp();
  try {
    await pickYear(page, 1979);
    assert.equal(await rowLogoHrefFor(page, "WIN"), "https://www.nhl.com/utah");
  } finally {
    await browser.close();
  }
});

test("year change preserves franchise via LINEAGE (CAR 2025 -> HFD 1985)", async () => {
  const { browser, page } = await openApp();
  try {
    await pickYear(page, 2025);
    await page.selectOption("#team", "CAR");
    await page.selectOption("#year", "1985");
    await page.waitForFunction(() => !document.getElementById("status").textContent, {
      timeout: 10000,
    });
    const team = await page.$eval("#team", (s) => s.value);
    assert.equal(team, "HFD", `expected team auto-switch to HFD, got ${team}`);
  } finally {
    await browser.close();
  }
});

test("year change preserves franchise via REVERSE_LINEAGE (HFD 1985 -> CAR 2025)", async () => {
  const { browser, page } = await openApp();
  try {
    await pickYear(page, 1985);
    await page.selectOption("#team", "HFD");
    await page.selectOption("#year", "2025");
    await page.waitForFunction(() => !document.getElementById("status").textContent, {
      timeout: 10000,
    });
    const team = await page.$eval("#team", (s) => s.value);
    assert.equal(team, "CAR", `expected team auto-switch to CAR, got ${team}`);
  } finally {
    await browser.close();
  }
});
