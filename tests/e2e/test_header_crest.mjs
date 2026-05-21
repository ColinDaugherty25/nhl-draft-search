// The header swaps the literal word "NHL" for the NHL shield. The accessible
// name still reads "NHL Draft Explorer" (image alt + remaining text), so
// screen readers / search engines see no change.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openApp } from "./_helpers.mjs";

test("NHL crest renders in the header with alt='NHL'", async () => {
  const { browser, page } = await openApp();
  try {
    const crest = await page.evaluate(() => {
      const img = document.querySelector("h1 .nhl-crest");
      if (!img) return null;
      return {
        alt: img.alt,
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        src: img.src,
      };
    });
    assert.ok(crest, "expected an <img.nhl-crest> inside the h1");
    assert.equal(crest.alt, "NHL");
    assert.ok(crest.src.includes("assets.nhle.com"), `unexpected src: ${crest.src}`);
    assert.equal(crest.complete, true, "crest image did not finish loading");
    assert.ok(crest.naturalWidth > 0, "crest image rendered with zero width");
  } finally {
    await browser.close();
  }
});

test("accessible header reads 'NHL Draft Explorer' (alt + text)", async () => {
  const { browser, page } = await openApp();
  try {
    const composite = await page.$eval("h1", (h1) => {
      const alt = h1.querySelector(".nhl-crest")?.alt ?? "";
      const text = h1.textContent.replace(/\s+/g, " ").trim();
      return `${alt} ${text}`.replace(/\s+/g, " ").trim();
    });
    assert.equal(composite, "NHL Draft Explorer");
  } finally {
    await browser.close();
  }
});

test("crest swaps to classic shield for ≤2004 drafts and back to modern for ≥2005", async () => {
  const { browser, page } = await openApp();
  try {
    // Wait for default crest (modern) to be loaded.
    await page.waitForFunction(() => {
      const img = document.querySelector(".nhl-crest");
      return img.complete && img.naturalWidth > 0;
    });

    // Switch to 1985 — classic shield expected.
    await page.selectOption("#year", "1985");
    await page.waitForFunction(() => !document.getElementById("status").textContent);
    await page.waitForFunction(() => {
      const img = document.querySelector(".nhl-crest");
      return img.src.endsWith("assets/nhl-classic.svg") && img.complete && img.naturalWidth > 0;
    }, null, { timeout: 5000 });

    // Back to 2025 — modern shield expected.
    await page.selectOption("#year", "2025");
    await page.waitForFunction(() => !document.getElementById("status").textContent);
    await page.waitForFunction(() => {
      const img = document.querySelector(".nhl-crest");
      return img.src.endsWith("NHL_light.svg") && img.complete && img.naturalWidth > 0;
    }, null, { timeout: 5000 });

    // Cutover year edge case: 2004 = classic, 2005 = modern.
    await page.selectOption("#year", "2004");
    await page.waitForFunction(() => !document.getElementById("status").textContent);
    await page.waitForFunction(
      () => document.querySelector(".nhl-crest").src.endsWith("assets/nhl-classic.svg"),
      null,
      { timeout: 5000 }
    );

    await page.selectOption("#year", "2005");
    await page.waitForFunction(() => !document.getElementById("status").textContent);
    await page.waitForFunction(
      () => document.querySelector(".nhl-crest").src.endsWith("NHL_light.svg"),
      null,
      { timeout: 5000 }
    );
  } finally {
    await browser.close();
  }
});
