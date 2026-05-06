import { SELECTORS } from './whatsapp.selectors.js';
import { extractMessagesFromDOM, parsePrePlainText } from './whatsapp.parser.js';

const MSG_LIMIT    = Number(process.env.WA_MESSAGE_LIMIT)   || 5000;
const IDLE_TIMEOUT = Number(process.env.WA_IDLE_TIMEOUT_MS) || 30_000;

/**
 * @param {import('playwright').Page} page
 * @param {string} groupName
 * @param {string|null} [cursor]
 *   ISO timestamp of the last known message in DB.
 *   null  → first run, extract full history via Phase 1 + Phase 2 scroll.
 *   string → incremental run; extract only messages strictly after this timestamp.
 * @param {number} [limit]   max messages to return
 */
export async function scrapeGroupMessages(page, groupName, cursor = null, limit = MSG_LIMIT) {
  await openGroup(page, groupName);
  return cursor === null
    ? extractFullHistory(page, limit)
    : extractSinceCursor(page, cursor, limit);
}

// ── Step 1: Navigate to the group ──────────────────────────────────────────

async function openGroup(page, groupName) {
  await returnToSearchState(page);

  const searchInput = page.locator(SELECTORS.SEARCH_INPUT).first();
  await searchInput.waitFor({ state: 'visible', timeout: IDLE_TIMEOUT });
  await searchInput.click();
  await searchInput.fill('');
  await searchInput.fill(groupName);

  await page.waitForTimeout(1200);

  const matched = await findChatRow(page, groupName);

  if (!matched) {
    await page.locator(SELECTORS.SEARCH_CLEAR).first().click().catch(() => {});
    throw new Error(`Group not found: "${groupName}"`);
  }

  await matched.click();

  // Clear search so WA returns to normal chat list — needed before scraping next group
  await page.locator(SELECTORS.SEARCH_CLEAR).first().click().catch(() => {});

  // Wait for the conversation pane
  await page.waitForSelector('#main', { state: 'visible', timeout: IDLE_TIMEOUT });

  const headerTitle = await page
    .locator(SELECTORS.CONV_HEADER)
    .textContent({ timeout: 5_000 })
    .catch(() => '');

  console.log(`[Scraper] Opened chat: "${headerTitle || groupName}"`);
}

async function returnToSearchState(page) {
  const searchInput = page.locator(SELECTORS.SEARCH_INPUT).first();

  const alreadyVisible = await searchInput.isVisible({ timeout: 1_500 }).catch(() => false);
  if (alreadyVisible) return;

  await page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded' });
  await searchInput.waitFor({ state: 'visible', timeout: IDLE_TIMEOUT });
  await page.waitForTimeout(800);
}

async function findChatRow(page, groupName) {
  // Strategy 1: span[title] → parent div[role="row"]
  const titleSpan = page.locator(`span[title="${groupName}"]`).first();
  const spanVisible = await titleSpan.isVisible({ timeout: 5_000 }).catch(() => false);

  if (spanVisible) {
    const row = titleSpan.locator('xpath=ancestor::div[@role="row"]').first();
    if (await row.isVisible({ timeout: 2_000 }).catch(() => false)) return row;
    return titleSpan;
  }

  // Strategy 2: div[role="row"] with matching text
  const rowByText = page.locator('div[role="row"]').filter({ hasText: groupName }).first();
  if (await rowByText.isVisible({ timeout: 3_000 }).catch(() => false)) return rowByText;

  // Strategy 3: exact text match
  const byExactText = page.getByText(groupName, { exact: true }).first();
  if (await byExactText.isVisible({ timeout: 3_000 }).catch(() => false)) return byExactText;

  return null;
}

// ── Step 2a: Full history extraction (first run) ──────────────────────────
//
// WhatsApp Web virtualises the message list — only ~50 messages live in the
// DOM at any time. Scrolling to the top loads older messages but removes
// newer ones; scrolling back down does the reverse.
//
// Two-phase strategy:
//   Phase 1 — Scroll to top repeatedly until no older messages appear.
//              Stability is measured by the data-pre-plain-text of the
//              FIRST (oldest) visible bubble, not by raw DOM count.
//              DOM count is useless here because WA keeps it near-constant
//              (~50 bubbles) regardless of history depth.
//
//   Phase 2 — Scroll DOWN in fixed 250 px steps, harvesting every visible
//              batch into a fingerprint-keyed Map before WA can virtualise
//              those messages away.

async function extractFullHistory(page, limit) {

  // ── Phase 1: drive the pane to the very top ───────────────────────────────

  console.log('[Scraper] Phase 1 — loading full message history (scroll to top)...');

  // How long to wait after each scroll-to-top for WA to fetch and render
  // older messages over the network.  2 500 ms is intentionally generous.
  const SCROLL_WAIT_MS    = 2500;
  // Number of consecutive rounds where the EARLIEST visible message does not
  // change before we declare "no more history available".
  const MAX_STABLE_ROUNDS = 6;

  let stableRounds        = 0;
  let previousEarliestKey = null;   // data-pre-plain-text of first bubble
  let round               = 0;

  while (stableRounds < MAX_STABLE_ROUNDS) {
    // ① Hard-scroll to the very top of the pane
    await page.evaluate(() => {
      const main = document.querySelector('#main');
      if (!main) return;
      const pane = main.querySelector('[data-testid="conversation-panel-messages"]')
        || Array.from(main.querySelectorAll('div')).find((el) => {
          const s = window.getComputedStyle(el);
          return s.overflowY === 'scroll' || s.overflowY === 'auto';
        });
      if (pane) pane.scrollTop = 0;
    });

    // ② Allow WA to issue a history-fetch XHR and render the result
    await page.waitForTimeout(SCROLL_WAIT_MS);

    // ③ Sample stability: grab the oldest bubble's metadata string.
    //    When WA loads an older batch it inserts NEW bubbles ABOVE the current
    //    first one — so the first bubble's data-pre-plain-text will change.
    //    When it stops changing we have reached the beginning of history.
    const { earliestKey, bubbleCount, atBeginning } = await page.evaluate(() => {
      const bubbles = Array.from(document.querySelectorAll('[data-pre-plain-text]'));
      const first   = bubbles[0];
      return {
        earliestKey:  first ? first.getAttribute('data-pre-plain-text') : null,
        bubbleCount:  bubbles.length,
        // WA renders an encryption notice or "group created" system element
        // at the very top once the oldest message is visible.
        atBeginning: !!(
          document.querySelector('[data-testid="intro-md-content"]') ||
          document.querySelector('[data-icon="ciphertext"]')
        ),
      };
    });

    round++;
    const stable = earliestKey === previousEarliestKey;
    stableRounds = stable ? stableRounds + 1 : 0;
    previousEarliestKey = earliestKey;

    console.log(
      `[Scraper] Phase 1 round ${round}: ${bubbleCount} bubbles in DOM` +
      ` | earliest="${(earliestKey || '').slice(0, 40)}"` +
      ` | stable ${stableRounds}/${MAX_STABLE_ROUNDS}` +
      (atBeginning ? ' | CHAT BEGINNING DETECTED' : '')
    );

    if (atBeginning) {
      console.log('[Scraper] Phase 1 — reached chat beginning marker, stopping early.');
      break;
    }
  }

  console.log('[Scraper] Phase 1 done. Starting Phase 2 (harvest scroll-down)...');

  // ── Phase 2: scroll down in small steps, harvest every visible batch ──────
  //
  // Fixed 250 px steps ensure we never skip a message even on very small
  // viewports or when WA virtualises aggressively.
  // Each step: scroll → wait for render → harvest.
  // A fingerprint Map deduplicates messages seen across multiple DOM snapshots.

  const STEP_PX    = 250;             // pixels per scroll increment
  const RENDER_MS  = 900;             // wait after each step for WA to render
  const MAX_ROUNDS = 800;             // safety cap — ~12 min at 900 ms/step

  const collected = new Map();        // fingerprint → message object

  const harvest = async () => {
    const rawItems = await page.evaluate(extractMessagesFromDOM, { sel: SELECTORS, limit: 9999 });
    let added = 0;
    for (const { rawPrePlain, textContent, imageData } of rawItems) {
      if (!textContent && !imageData) continue;          // system messages / dividers
      const parsed = parsePrePlainText(rawPrePlain);
      if (!parsed) continue;

      // Fingerprint includes an image-data slice so two different images
      // from the same sender in the same minute produce different keys.
      const imgTag = imageData ? `|img:${imageData.slice(22, 52)}` : '';
      const fp     = `${parsed.timestamp}|${parsed.sender}|${(textContent || '[Image]').slice(0, 80)}${imgTag}`;

      if (!collected.has(fp)) {
        collected.set(fp, {
          sender:    parsed.sender,
          message:   textContent,
          image_url: imageData || null,
          timestamp: parsed.timestamp,
        });
        added++;
      }
    }
    return added;
  };

  // Initial harvest at the top of history (Phase 1 left us there)
  const initialAdded = await harvest();
  console.log(`[Scraper] Phase 2 initial harvest: ${initialAdded} messages`);

  let atBottom    = false;
  let scrollRound = 0;

  while (!atBottom && scrollRound < MAX_ROUNDS) {
    // Scroll down by a fixed step; returns true when the pane cannot scroll further
    atBottom = await page.evaluate((stepPx) => {
      const main = document.querySelector('#main');
      if (!main) return true;
      const pane = main.querySelector('[data-testid="conversation-panel-messages"]')
        || Array.from(main.querySelectorAll('div')).find((el) => {
          const s = window.getComputedStyle(el);
          return s.overflowY === 'scroll' || s.overflowY === 'auto';
        });
      if (!pane) return true;
      pane.scrollTop += stepPx;
      return pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 20;
    }, STEP_PX);

    // Give WA time to render the newly revealed portion
    await page.waitForTimeout(RENDER_MS);

    const added = await harvest();
    scrollRound++;

    if (scrollRound % 20 === 0 || added > 0) {
      console.log(
        `[Scraper] Phase 2 step ${scrollRound}: +${added} new | total ${collected.size}` +
        (atBottom ? ' | BOTTOM' : '')
      );
    }

    if (collected.size >= limit) {
      console.log(`[Scraper] Message limit (${limit}) reached`);
      break;
    }
  }

  // Final safety harvest: after reaching the bottom WA may still be rendering
  // the last batch — wait a moment then harvest once more.
  await page.waitForTimeout(RENDER_MS * 2);
  const finalAdded = await harvest();
  if (finalAdded > 0) {
    console.log(`[Scraper] Phase 2 final pass: +${finalAdded} more messages`);
  }

  const messages = Array.from(collected.values())
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0))
    .slice(-limit);

  console.log(
    `[Scraper] Full history extracted: ${messages.length} messages` +
    ` (${scrollRound} scroll steps, ${round} Phase-1 rounds)`
  );
  return messages;
}

// ── Step 2b: Incremental extraction (subsequent runs) ────────────────────
//
// Strategy:
//   1. Scroll to the bottom (newest messages are visible).
//   2. Harvest all visible messages into a Map.
//   3. If ANY visible message has timestamp ≤ cursor → we have the full new
//      batch; stop.
//   4. Otherwise all visible messages are newer than the cursor (busy group),
//      so scroll UP to reveal older messages, harvest again, and repeat.
//
// This ensures we never silently miss messages even if hundreds arrived since
// the last run — we keep scrolling up until we find the cursor boundary.

async function extractSinceCursor(page, cursor, limit) {
  const RENDER_MS    = 900;   // wait for WA to render after each scroll
  const STEP_PX      = 300;   // pixels to scroll up per step when searching boundary
  const MAX_ROUNDS   = 300;   // safety cap

  await scrollToBottom(page);
  await page.waitForTimeout(RENDER_MS);

  const collected     = new Map();  // fingerprint → message object
  let   foundBoundary = false;
  let   round         = 0;

  const harvest = async () => {
    const rawItems = await page.evaluate(extractMessagesFromDOM, { sel: SELECTORS, limit: 9999 });
    let added = 0;

    for (const { rawPrePlain, textContent, imageData } of rawItems) {
      if (!textContent && !imageData) continue;
      const parsed = parsePrePlainText(rawPrePlain);
      if (!parsed) continue;

      // A message at or before the cursor means we've seen the boundary —
      // we've now captured everything that arrived after the last run.
      if (parsed.timestamp <= cursor) {
        foundBoundary = true;
        continue;   // don't store messages already in DB
      }

      const imgTag = imageData ? `|img:${imageData.slice(22, 52)}` : '';
      const fp     = `${parsed.timestamp}|${parsed.sender}|${(textContent || '[Image]').slice(0, 80)}${imgTag}`;

      if (!collected.has(fp)) {
        collected.set(fp, {
          sender:    parsed.sender,
          message:   textContent,
          image_url: imageData || null,
          timestamp: parsed.timestamp,
        });
        added++;
      }
    }
    return added;
  };

  // Initial harvest from the bottom
  await harvest();

  while (!foundBoundary && round < MAX_ROUNDS) {
    // Scroll UP — reveals older messages so we can find the cursor boundary
    const atTop = await page.evaluate((stepPx) => {
      const main = document.querySelector('#main');
      if (!main) return true;
      const pane = main.querySelector('[data-testid="conversation-panel-messages"]')
        || Array.from(main.querySelectorAll('div')).find((el) => {
          const s = window.getComputedStyle(el);
          return s.overflowY === 'scroll' || s.overflowY === 'auto';
        });
      if (!pane) return true;
      pane.scrollTop = Math.max(0, pane.scrollTop - stepPx);
      return pane.scrollTop === 0;
    }, STEP_PX);

    await page.waitForTimeout(RENDER_MS);

    const added = await harvest();
    round++;

    if (round % 20 === 0 || added > 0) {
      console.log(
        `[Scraper] Incremental round ${round}: +${added} new | total ${collected.size}` +
        (foundBoundary ? ' | BOUNDARY FOUND' : '') +
        (atTop ? ' | TOP REACHED' : '')
      );
    }

    // Reached the top of chat without finding cursor — give up scrolling
    if (atTop) {
      console.log(`[Scraper] Reached chat top without finding cursor — accepting all collected messages`);
      break;
    }

    if (collected.size >= limit) {
      console.log(`[Scraper] Message limit (${limit}) reached`);
      break;
    }
  }

  const messages = Array.from(collected.values())
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));

  console.log(
    `[Scraper] Incremental sync: ${messages.length} new message(s) since ${cursor}` +
    ` (${round} scroll rounds, boundary=${foundBoundary})`
  );
  return messages;
}

async function scrollToBottom(page) {
  await page.evaluate(() => {
    const main = document.querySelector('#main');
    if (!main) return;
    const pane = main.querySelector('[data-testid="conversation-panel-messages"]')
      || Array.from(main.querySelectorAll('div')).find(el => {
        const s = window.getComputedStyle(el);
        return s.overflowY === 'scroll' || s.overflowY === 'auto';
      });
    if (pane) pane.scrollTop = pane.scrollHeight;
  });

  await page.waitForTimeout(800);
}
