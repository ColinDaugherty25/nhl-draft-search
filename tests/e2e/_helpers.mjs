// Shared Playwright boilerplate for E2E tests. Each test file launches its
// own browser; node:test runs each test file in its own process anyway, so
// sharing across files isn't possible without spawning a separate Playwright
// server.
import { chromium } from "playwright";

export const BASE_URL = process.env.NHL_TEST_URL ?? "http://localhost:8000";

// Locally we use channel: "chrome" so the test runner doesn't have to
// download ~150MB of Playwright-bundled browsers. In CI (PLAYWRIGHT_CI=1)
// there's no system Chrome, so use the bundled chromium installed by the
// "npx playwright install chromium" step in deploy.yml.
const launchOpts = { headless: true };
if (!process.env.PLAYWRIGHT_CI) launchOpts.channel = "chrome";

export async function openApp() {
  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE_URL + "/", { waitUntil: "load" });
  await page.waitForFunction(
    () => document.querySelectorAll("#picks tbody tr").length > 0,
    null,
    { timeout: 15000 }
  );
  return { browser, page };
}

export async function pickYear(page, year) {
  // Reset team filter first so the row count is predictable.
  await page.selectOption("#team", "ALL");
  await page.selectOption("#year", String(year));
  await page.waitForFunction(() => !document.getElementById("status").textContent, {
    timeout: 15000,
  });
}
