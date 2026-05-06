import cron from 'node-cron';
import { launchMainSession, openGroupPage, closeGroupPage, closeSession } from '../scraper/whatsapp.session.js';
import { scrapeGroupMessages } from '../scraper/whatsapp.scraper.js';
import { postMessage } from '../scraper/message.client.js';
import { initCursor, filterNew, markSent, getCursor } from '../scraper/scraper.dedup.js';

const SCHEDULE    = process.env.SCRAPER_SCHEDULE    || '*/5 * * * *';
const MAX_RETRIES = Number(process.env.CRON_MAX_RETRIES)    || 2;
const RETRY_DELAY = Number(process.env.CRON_RETRY_DELAY_MS) || 5000;
const MSG_LIMIT   = Number(process.env.WA_MESSAGE_LIMIT)    || 50;

// Groups to scrape — comma-separated in env
const CONFIGURED_GROUPS = (process.env.WA_GROUPS || '')
  .split(',')
  .map((g) => g.trim())
  .filter(Boolean);

// Tick overlap guard
let isRunning = false;

// ── Main tick ─────────────────────────────────────────────────────────────────

async function runScraperJob() {
  if (isRunning) {
    console.warn('[Scraper Cron] Previous tick still running — skipping');
    return;
  }

  if (CONFIGURED_GROUPS.length === 0) {
    console.warn('[Scraper Cron] No groups configured in WA_GROUPS — nothing to scrape');
    return;
  }

  isRunning = true;
  const tickStart = Date.now();
  console.log(`[Scraper Cron] Tick started at ${new Date().toISOString()}`);

  let context;

  try {
    // ── Launch shared persistent context (login once) ────────────────────
    context = await launchMainSession();

    // ── Scrape groups sequentially — WA Web does not support multiple
    //    active tabs in the same browser profile (shows "open in another
    //    window" conflict dialog). One tab at a time, open → scrape → close.
    for (const group_name of CONFIGURED_GROUPS) {
      let page;
      try {
        page = await openGroupPage(context);
        await scrapeAndSend(page, group_name);
      } catch (firstErr) {
        console.error(`[Scraper Cron] ✗ "${group_name}" failed (attempt 1): ${firstErr.message}`);

        // Per-group crash recovery: close the bad tab and try once more with a
        // fresh page before giving up. This keeps other groups unaffected when
        // one tab crashes mid-scrape (e.g. WA redirect, renderer crash).
        try {
          await closeGroupPage(page).catch(() => {});
          page = await openGroupPage(context);
          await scrapeAndSend(page, group_name);
          console.log(`[Scraper Cron] ✓ "${group_name}" recovered on retry`);
        } catch (retryErr) {
          console.error(`[Scraper Cron] ✗✗ "${group_name}" failed on retry — skipping: ${retryErr.message}`);
        }
      } finally {
        if (page) await closeGroupPage(page);
      }
    }

  } catch (err) {
    // Catches session-level failures (WA login lost, browser crash)
    console.error(`[Scraper Cron] Fatal tick error: ${err.message}`, err.stack);
  } finally {
    if (context) await closeSession(context).catch(() => {});
    isRunning = false;
    console.log(`[Scraper Cron] Tick finished in ${Date.now() - tickStart}ms`);
  }
}

// ── Per-group scrape + send ────────────────────────────────────────────────────

async function scrapeAndSend(page, group_name) {
  try {
    // Bootstrap dedup cursor from DB on first run for this group.
    // initCursor fetches the latest message_time from the API; if nothing
    // exists yet it falls back to epoch (new Date(0).toISOString()).
    await initCursor(group_name);

    const cursorTs = getCursor(group_name);

    // null cursor → full history scroll (Phase 1 + Phase 2)
    // epoch cursor → DB was empty or API unreachable → also treat as first run
    const cursor = cursorTs === new Date(0).toISOString() ? null : cursorTs;

    // Scrape — pass cursor so the scraper picks the right extraction strategy
    const scraped = await scrapeGroupMessages(page, group_name, cursor, MSG_LIMIT);

    // Dedup filter
    const fresh = filterNew(group_name, scraped);

    if (fresh.length === 0) {
      console.log(`[Scraper Cron] — "${group_name}": no new messages`);
      return;
    }

    console.log(`[Scraper Cron] "${group_name}": ${fresh.length} new message(s) to send`);

    // Send to API sequentially — preserve order, respect rate limits
    const sent = [];
    for (const msg of fresh) {
      const result = await sendWithRetry(group_name, msg);
      if (result) sent.push(msg);
    }

    // Advance cursor only after confirmed sends
    markSent(group_name, sent);

    console.log(`[Scraper Cron] ✓ "${group_name}": ${sent.length}/${fresh.length} messages saved`);

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
        console.log(`[Scraper Cron] — duplicate skipped: [${msg.timestamp}] ${msg.sender}`);
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
          `Retrying in ${delay}ms. Error: ${err.message}`
        );
        await sleep(delay);
      }
    }
  }

  console.error(
    `[Scraper Cron] ✗✗ giving up on message from ${msg.sender} at ${msg.timestamp}. ` +
    `Last error: ${lastError.message}`
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
  if (process.env.SCRAPER_ENABLED !== 'true') {
    console.log('[Scraper Cron] Disabled (SCRAPER_ENABLED != true)');
    return null;
  }

  if (!cron.validate(SCHEDULE)) {
    throw new Error(`[Scraper Cron] Invalid SCRAPER_SCHEDULE: "${SCHEDULE}"`);
  }

  const task = cron.schedule(SCHEDULE, runScraperJob, {
    scheduled: true,
    timezone: 'UTC',
  });

  console.log(`[Scraper Cron] Scheduled — ${SCHEDULE} (UTC) | Groups: ${CONFIGURED_GROUPS.join(', ') || 'none'}`);
  return task;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
