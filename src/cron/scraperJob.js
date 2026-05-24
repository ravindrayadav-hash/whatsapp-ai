import cron from "node-cron";
import {
  openGroupPage,
  closeGroupPage,
} from "../scraper/whatsapp.session.js";
import {
  getSharedContext,
  destroySharedContext,
} from "../scraper/browser.manager.js";
import { scrapeGroupMessages } from "../scraper/whatsapp.scraper.js";
import { postMessage } from "../scraper/message.client.js";
import {
  initCursor,
  filterNew,
  markSent,
  getCursor,
} from "../scraper/scraper.dedup.js";
import {
  acquireBrowserLock,
  releaseBrowserLock,
} from "../scraper/browser.lock.js";
import { drainQueue, queueSize } from "../scraper/send.queue.js";
import { sendMessageToGroup } from "../scraper/whatsapp.sender.js";

const SCHEDULE = process.env.SCRAPER_SCHEDULE || "*/5 * * * *";
const MAX_RETRIES = Number(process.env.CRON_MAX_RETRIES) || 2;
const RETRY_DELAY = Number(process.env.CRON_RETRY_DELAY_MS) || 5000;
const MSG_LIMIT = Number(process.env.WA_MESSAGE_LIMIT) || 50;

// Optional skip window — scraper exits immediately if current time (in SCRAPER_SKIP_TZ)
// falls between SCRAPER_SKIP_FROM and SCRAPER_SKIP_TO (both "HH:MM", 24-hour).
// Used to free the browser lock for the ReadSend job without changing the cron expression.
const SKIP_FROM = (process.env.SCRAPER_SKIP_FROM || "").trim(); // e.g. "01:04"
const SKIP_TO = (process.env.SCRAPER_SKIP_TO || "").trim(); // e.g. "01:24"
const SKIP_TZ = (
  process.env.SCRAPER_SKIP_TZ ||
  process.env.READ_SEND_TIMEZONE ||
  "Asia/Kolkata"
).trim();

function isInSkipWindow() {
  if (!SKIP_FROM || !SKIP_TO) return false;
  const hhmm = new Date().toLocaleTimeString("en-GB", {
    timeZone: SKIP_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return hhmm >= SKIP_FROM && hhmm <= SKIP_TO;
}

// Groups to scrape — comma-separated in env
const CONFIGURED_GROUPS = (process.env.WA_GROUPS || "")
  .split(",")
  .map((g) => g.trim())
  .filter(Boolean);

// Tick overlap guard — also exposed via /api/scraper/status for the frontend banner
let isRunning = false;
let _startedAt = null;

export function isScraperRunning() {
  return isRunning;
}
export function scraperStartedAt() {
  return _startedAt;
}

// ── Main tick ─────────────────────────────────────────────────────────────────

async function runScraperJob() {
  if (isInSkipWindow()) {
    console.log(
      `[Scraper Cron] Skip window active (${SKIP_FROM}–${SKIP_TO} ${SKIP_TZ}) — pausing for ReadSend job`,
    );
    return;
  }

  if (isRunning) {
    console.warn("[Scraper Cron] Previous tick still running — skipping");
    return;
  }

  if (CONFIGURED_GROUPS.length === 0) {
    console.warn(
      "[Scraper Cron] No groups configured in WA_GROUPS — nothing to scrape",
    );
    return;
  }

  isRunning = true;
  _startedAt = new Date().toISOString();
  const tickStart = Date.now();
  console.log(`[Scraper Cron] Tick started at ${new Date().toISOString()}`);

  // Acquire the shared browser lock so the daily-status job cannot launch a
  // second Playwright context while this tick is running.
  await acquireBrowserLock("ScraperJob");

  let context;

  try {
    // ── Reuse the persistent browser context (launched once at startup) ──
    // getSharedContext() keeps Chrome open between ticks — the WA Web
    // WebSocket stays connected, preventing session expiry overnight.
    context = await getSharedContext();

    // ── Scrape groups sequentially — WA Web does not support multiple
    //    active tabs in the same browser profile (shows "open in another
    //    window" conflict dialog). One tab at a time, open → scrape → close.
    for (const group_name of CONFIGURED_GROUPS) {
      let page;
      try {
        page = await openGroupPage(context);
        await scrapeAndSend(page, group_name);
      } catch (firstErr) {
        console.error(
          `[Scraper Cron] ✗ "${group_name}" failed (attempt 1): ${firstErr.message}`,
        );

        // Per-group crash recovery: close the bad tab and try once more with a
        // fresh page before giving up. This keeps other groups unaffected when
        // one tab crashes mid-scrape (e.g. WA redirect, renderer crash).
        try {
          await closeGroupPage(page).catch(() => {});
          page = await openGroupPage(context);
          await scrapeAndSend(page, group_name);
          console.log(`[Scraper Cron] ✓ "${group_name}" recovered on retry`);
        } catch (retryErr) {
          console.error(
            `[Scraper Cron] ✗✗ "${group_name}" failed on retry — skipping: ${retryErr.message}`,
          );
        }
      } finally {
        if (page) await closeGroupPage(page);
      }
    }
    // ── Drain outbound message queue ─────────────────────────────────────
    // readAndSendJob queues messages here instead of launching its own Chrome.
    // We send them now using the session that is already open.
    if (queueSize() > 0) {
      const pending = drainQueue();
      console.log(
        `[Scraper Cron] Draining send queue — ${pending.length} message(s)`,
      );
      for (const { groupName, text } of pending) {
        let page;
        try {
          page = await openGroupPage(context);
          await sendMessageToGroup(page, groupName, text);
          console.log(`[Scraper Cron] ✓ Sent queued message to "${groupName}"`);
        } catch (sendErr) {
          console.error(
            `[Scraper Cron] ✗ Failed to send queued message to "${groupName}": ${sendErr.message}`,
          );
        } finally {
          if (page) await closeGroupPage(page).catch(() => {});
        }
      }
    }
  } catch (err) {
    // Catches session-level failures (WA login lost, browser crash)
    console.error(`[Scraper Cron] Fatal tick error: ${err.message}`, err.stack);

    // If the error indicates the browser process itself died or the WA session
    // is gone, destroy the shared context so the next tick relaunches Chrome
    // (and handles QR if the session expired).
    const isFatal =
      err.message?.includes("Target closed") ||
      err.message?.includes("Protocol error") ||
      err.message?.includes("Browser closed") ||
      err.message?.includes("crashed") ||
      err.message?.includes("Session closed");

    if (isFatal) {
      console.warn("[Scraper Cron] Destroying shared context — will relaunch on next tick");
      await destroySharedContext().catch(() => {});
    }
  } finally {
    // DO NOT close the context — it stays alive so the WA Web session
    // remains connected overnight and no QR re-scan is needed at 1 AM.
    releaseBrowserLock("ScraperJob");
    isRunning = false;
    _startedAt = null;
    console.log(`[Scraper Cron] Tick finished in ${Date.now() - tickStart}ms`);
  }
}

// ── Per-group scrape + send ────────────────────────────────────────────────────

async function scrapeAndSend(page, group_name) {
  try {
    // Refresh the dedup cursor from DB before every scrape tick.
    // Queries MAX(message_time) directly so the scraper never re-reads
    // messages that are already persisted, even across process restarts.
    await initCursor(group_name);

    const cursorTs = getCursor(group_name);

    // null cursor → full history scroll (Phase 1 + Phase 2)
    // epoch cursor → DB was empty or API unreachable → also treat as first run
    const cursor = cursorTs === new Date(0).toISOString() ? null : cursorTs;

    // Scrape — pass cursor so the scraper picks the right extraction strategy
    const scraped = await scrapeGroupMessages(
      page,
      group_name,
      cursor,
      MSG_LIMIT,
    );

    // Dedup filter
    const fresh = filterNew(group_name, scraped);

    if (fresh.length === 0) {
      console.log(`[Scraper Cron] — "${group_name}": no new messages`);
      return;
    }

    console.log(
      `[Scraper Cron] "${group_name}": ${fresh.length} new message(s) to send`,
    );

    // Send to API sequentially — preserve order, respect rate limits
    const sent = [];
    for (const msg of fresh) {
      const result = await sendWithRetry(group_name, msg);
      if (result) sent.push(msg);
    }

    // Advance cursor only after confirmed sends
    markSent(group_name, sent);

    console.log(
      `[Scraper Cron] ✓ "${group_name}": ${sent.length}/${fresh.length} messages saved`,
    );
  } catch (err) {
    console.error(`[Scraper Cron] ✗ "${group_name}" failed: ${err.message}`);
  }
}

// ── Per-message send with retry ───────────────────────────────────────────────

async function sendWithRetry(group_name, msg) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const result = await postMessage({ group_name, ...msg });

      if (result.duplicate) {
        // 409 means it's already in the DB — not a failure, just skip
        console.log(
          `[Scraper Cron] — duplicate skipped: [${msg.timestamp}] ${msg.sender}`,
        );
        return false;
      }

      if (!result.ok) {
        throw new Error(`API responded with status ${result.status}`);
      }

      return true; // successfully saved
    } catch (err) {
      lastError = err;

      if (attempt <= MAX_RETRIES) {
        const delay = RETRY_DELAY * attempt;
        console.warn(
          `[Scraper Cron] ✗ send failed for "${group_name}" (attempt ${attempt}/${MAX_RETRIES + 1}). ` +
            `Retrying in ${delay}ms. Error: ${err.message}`,
        );
        await sleep(delay);
      }
    }
  }

  console.error(
    `[Scraper Cron] ✗✗ giving up on message from ${msg.sender} at ${msg.timestamp}. ` +
      `Last error: ${lastError.message}`,
  );
  return false;
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

/**
 * Starts the WhatsApp scraper cron job.
 * Must be called after the DB connection is established (session.js needs env ready).
 * @returns {import('node-cron').ScheduledTask | null}
 */
export function startScraperJob() {
  if (process.env.SCRAPER_ENABLED !== "true") {
    console.log("[Scraper Cron] Disabled (SCRAPER_ENABLED != true)");
    return null;
  }

  if (!cron.validate(SCHEDULE)) {
    throw new Error(`[Scraper Cron] Invalid SCRAPER_SCHEDULE: "${SCHEDULE}"`);
  }

  const task = cron.schedule(SCHEDULE, runScraperJob, {
    scheduled: true,
    timezone: "UTC",
  });

  console.log(
    `[Scraper Cron] Scheduled — ${SCHEDULE} (UTC) | Groups: ${CONFIGURED_GROUPS.join(", ") || "none"}`,
  );
  return task;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Exported helper for daily-status forced pre-collection scrape ─────────────
//
// Runs a single-group scrape+save without acquiring the browser lock.
// The caller (dailyStatusJob) is responsible for holding the lock and for
// passing an already-open Playwright page.
//
// @param {import('playwright').Page} page   open WA Web tab
// @param {string} groupName                 exact WA group display name
export async function doGroupScrape(page, groupName) {
  return scrapeAndSend(page, groupName);
}
