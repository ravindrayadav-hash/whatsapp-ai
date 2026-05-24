import path from "path";
import { chromium } from "playwright";
import { SELECTORS } from "./whatsapp.selectors.js";

const SESSION_DIR = process.env.WA_SESSION_DIR || "./wa-session";
const HEADLESS = process.env.WA_HEADLESS === "true";
const NAV_TIMEOUT = Number(process.env.WA_NAV_TIMEOUT_MS) || 60_000;
const IDLE_TIMEOUT = Number(process.env.WA_IDLE_TIMEOUT_MS) || 30_000;
const WA_URL = "https://web.whatsapp.com";

/**
 * Launches the main persistent browser context.
 * One instance shared across all groups per tick.
 * Handles QR login on first run; restores session on subsequent runs.
 *
 * @returns {Promise<import('playwright').BrowserContext>}
 */
export async function launchMainSession() {
  const userDataDir = path.resolve(SESSION_DIR);

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: HEADLESS,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
    // Grant clipboard access so the sender can paste messages via Ctrl+V.
    // Without this, navigator.clipboard.writeText() is blocked by the browser.
    permissions: ["clipboard-read", "clipboard-write"],
  });

  // Use the first page to verify login / handle QR
  const loginPage = context.pages()[0] || (await context.newPage());
  loginPage.setDefaultTimeout(IDLE_TIMEOUT);
  loginPage.setDefaultNavigationTimeout(NAV_TIMEOUT);

  await loginPage.goto(WA_URL, { waitUntil: "domcontentloaded" });
  await waitForLogin(loginPage);

  // Close the login page — each group will open its own tab
  await loginPage.close().catch(() => {});

  return context;
}

/**
 * Opens a fresh WA Web tab inside the shared context for a single group.
 * The persistent session means no QR scan is needed.
 *
 * @param {import('playwright').BrowserContext} context
 * @returns {Promise<import('playwright').Page>}
 */
export async function openGroupPage(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(IDLE_TIMEOUT);
  page.setDefaultNavigationTimeout(NAV_TIMEOUT);

  await page.goto(WA_URL, { waitUntil: "domcontentloaded" });

  // If WA shows "open in another window" conflict dialog, click "Use here"
  const useHereBtn = page.locator(SELECTORS.USE_HERE_BTN).first();
  const conflictVisible = await useHereBtn
    .isVisible({ timeout: 5_000 })
    .catch(() => false);
  if (conflictVisible) {
    console.log('[WA] Conflict dialog detected — clicking "Use here"');
    await useHereBtn.click().catch(() => {});
    await page.waitForTimeout(1500);
  }

  // Wait for WA to be ready (no QR expected — session already authenticated)
  const searchInput = page.locator(SELECTORS.SEARCH_INPUT).first();
  await searchInput.waitFor({ state: "visible", timeout: NAV_TIMEOUT });

  console.log("[WA] Tab ready");
  return page;
}

/**
 * Closes a single group tab cleanly.
 * @param {import('playwright').Page} page
 */
export async function closeGroupPage(page) {
  await page.close().catch(() => {});
}

/**
 * Closes the entire browser context (called at end of tick).
 * @param {import('playwright').BrowserContext} context
 */
export async function closeSession(context) {
  await context.close().catch(() => {});
}

async function waitForLogin(page) {
  await page.waitForSelector(`${SELECTORS.QR_CODE}, ${SELECTORS.MAIN_APP}`, {
    timeout: NAV_TIMEOUT,
  });

  const isQR = await page.$(SELECTORS.QR_CODE);
  if (isQR) {
    console.log("[WA] QR code detected — scan with your phone to log in...");
    await page.waitForSelector(SELECTORS.MAIN_APP, { timeout: NAV_TIMEOUT });
    console.log("[WA] Login successful — session saved");
  }

  await page
    .waitForSelector(SELECTORS.LOADING_SPINNER, {
      state: "hidden",
      timeout: NAV_TIMEOUT,
    })
    .catch(() => {});

  console.log("[WA] Session verified");
}
