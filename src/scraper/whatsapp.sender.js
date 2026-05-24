// Standalone WhatsApp Web message sender.
// Does NOT import from whatsapp.scraper.js — all navigation logic is
// self-contained so the scraper codebase is completely unchanged.
//
// Why keyboard.type() instead of ClipboardEvent:
//   WA Web checks event.isTrusted on paste. Events from page.evaluate() are
//   not trusted and are silently dropped. keyboard.type() generates native
//   trusted key events that WA Web always accepts.
//
// Newline handling:
//   Enter = SEND in WA Web.  Shift+Enter = newline.
//   We split on \n and press Shift+Enter between lines.

import { SELECTORS } from "./whatsapp.selectors.js";

const WA_URL = "https://web.whatsapp.com";
const NAV_TIMEOUT = Number(process.env.WA_NAV_TIMEOUT_MS) || 60_000;
const IDLE_TIMEOUT = Number(process.env.WA_IDLE_TIMEOUT_MS) || 30_000;
const MAX_CHARS_PER_MSG = 60_000;

/**
 * Navigates to a WhatsApp group and sends the message text.
 * Splits into multiple sends when text exceeds MAX_CHARS_PER_MSG.
 *
 * @param {import('playwright').Page} page  - open WA Web tab (already logged in)
 * @param {string} groupName                - exact group display name
 * @param {string} text                     - message body (may contain \n)
 */
export async function sendMessageToGroup(page, groupName, text) {
  console.log(`[Sender] Sending to "${groupName}" — ${text.length} chars`);

  await navigateToGroup(page, groupName);

  const chunks = splitIntoChunks(text, MAX_CHARS_PER_MSG);
  for (let i = 0; i < chunks.length; i++) {
    console.log(
      `[Sender] Chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`,
    );
    await typeAndSend(page, chunks[i]);
    if (i < chunks.length - 1) await page.waitForTimeout(1_000);
  }

  console.log(
    `[Sender] ✓ Delivered to "${groupName}" (${chunks.length} chunk(s))`,
  );
}

// ── Navigation ────────────────────────────────────────────────────────────────

async function navigateToGroup(page, groupName) {
  // Make sure WA Web is loaded and the search bar is visible
  const searchInput = page.locator(SELECTORS.SEARCH_INPUT).first();
  const searchReady = await searchInput
    .isVisible({ timeout: 5_000 })
    .catch(() => false);

  if (!searchReady) {
    console.log("[Sender] WA not ready — reloading");
    await page.goto(WA_URL, { waitUntil: "domcontentloaded" });
    await searchInput.waitFor({ state: "visible", timeout: NAV_TIMEOUT });
    await page.waitForTimeout(1_000);
  }

  // Type the group name into the search box
  await searchInput.click();
  await page.waitForTimeout(300);
  await searchInput.fill("");
  await searchInput.fill(groupName);
  console.log(`[Sender] Searching for group: "${groupName}"`);
  await page.waitForTimeout(1_500); // wait for search results to render

  // Try to click on the group — three selector strategies
  const clicked = await tryClickGroup(page, groupName);
  if (!clicked) {
    throw new Error(
      `[Sender] Group not found in WA search: "${groupName}". ` +
        `Check DAILY_STATUS_GROUP matches the exact WA group name.`,
    );
  }

  // Wait for the chat panel to open
  await page.waitForSelector("#main", {
    state: "visible",
    timeout: IDLE_TIMEOUT,
  });
  console.log(`[Sender] Opened group "${groupName}"`);

  // Clear the search bar (resets the left sidebar state)
  await page
    .locator(SELECTORS.SEARCH_CLEAR)
    .first()
    .click()
    .catch(() => {});

  // Give the compose box time to become interactive
  await page.waitForTimeout(1_000);
}

async function tryClickGroup(page, groupName) {
  // Strategy 1: span[title="exact name"] — most reliable when WA renders titles
  const byTitle = page.locator(`span[title="${groupName}"]`).first();
  if (await byTitle.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await byTitle.click();
    return true;
  }

  // Strategy 2: div[role="row"] containing the group name text
  const byRow = page
    .locator('div[role="row"]')
    .filter({ hasText: groupName })
    .first();
  if (await byRow.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await byRow.click();
    return true;
  }

  // Strategy 3: any element with exact matching text
  const byText = page.getByText(groupName, { exact: true }).first();
  if (await byText.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await byText.click();
    return true;
  }

  return false;
}

// ── Typing & sending ──────────────────────────────────────────────────────────

async function typeAndSend(page, text) {
  const composeBox = await findComposeBox(page);

  await composeBox.click();
  await composeBox.focus();
  await page.waitForTimeout(500);

  // execCommand('insertText') is the most reliable way to insert text into a
  // contenteditable div in Chromium. It:
  //   • requires no clipboard permissions
  //   • fires the React synthetic input event that WA Web listens for
  //   • handles long text, emoji, newlines all in one call (no char-by-char)
  //   • treats \n as Shift+Enter (newline inside message, not Send)
  const inserted = await page.evaluate((msg) => {
    const el = document.activeElement;
    if (!el) return false;
    return document.execCommand("insertText", false, msg);
  }, text);

  if (!inserted) {
    // Fallback: pressSequentially line by line with Shift+Enter between lines
    console.warn(
      "[Sender] execCommand insertText returned false — falling back to pressSequentially",
    );
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > 0) {
        await composeBox.pressSequentially(lines[i], { delay: 15 });
      }
      if (i < lines.length - 1) {
        await composeBox.press("Shift+Enter");
      }
    }
  }

  await page.waitForTimeout(500);

  // Send — try the visible send button first, fall back to Enter key
  const sentViaBtn = await clickSendButton(page);
  if (!sentViaBtn) {
    console.log("[Sender] Send button not found — pressing Enter");
    await page.keyboard.press("Enter");
  }

  await page.waitForTimeout(2_000);

  // Verify compose box is now empty (WA accepted the message)
  const stillHasContent = await composeBox
    .evaluate((el) => el.innerText.trim().length > 0)
    .catch(() => false);

  if (stillHasContent) {
    throw new Error(
      "[Sender] Compose box still has content after send — message may not have been delivered",
    );
  }
}

async function findComposeBox(page) {
  const candidates = [
    'div[contenteditable="true"][data-tab="10"]',
    'div[data-testid="conversation-compose-box-input"]',
    'div[contenteditable="true"][aria-label="Type a message"]',
    'div[contenteditable="true"][aria-label="Message"]',
    'div[contenteditable="true"][role="textbox"]',
  ];

  for (const sel of candidates) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 2_000 }).catch(() => false)) {
      console.log(`[Sender] Compose box: ${sel}`);
      return el;
    }
  }

  // Last resort: any contenteditable inside the footer of #main
  const fallback = page
    .locator('#main footer div[contenteditable="true"]')
    .first();
  if (await fallback.isVisible({ timeout: 10_000 }).catch(() => false)) {
    console.log("[Sender] Compose box: footer fallback");
    return fallback;
  }

  const title = await page.title().catch(() => "unknown");
  throw new Error(
    `[Sender] Compose box not found (page: "${title}"). WA selector may have changed.`,
  );
}

async function clickSendButton(page) {
  const selectors = [
    'button[data-testid="send"]',
    'span[data-testid="send"]',
    '[aria-label="Send"]',
    '[data-icon="send"]',
  ];
  for (const sel of selectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await btn.click();
      return true;
    }
  }
  return false;
}

// ── Chunking ──────────────────────────────────────────────────────────────────

function splitIntoChunks(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const blocks = text.split(/\n\n+/);
  const chunks = [];
  let current = "";
  for (const block of blocks) {
    const candidate = current ? `${current}\n\n${block}` : block;
    if (candidate.length <= maxLen) {
      current = candidate;
    } else {
      if (current) chunks.push(current);
      if (block.length > maxLen) {
        for (let i = 0; i < block.length; i += maxLen)
          chunks.push(block.slice(i, i + maxLen));
        current = "";
      } else {
        current = block;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
