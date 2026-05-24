// Daily status cron — two scheduled tasks that together implement the full
// collect-and-summarise workflow:
//
//   Task 1 — REMINDER  (default 23:45 in configured TZ)
//     • Acquire browser lock
//     • Send the reminder message to the target group via Playwright
//     • Create a DB session row with status='collecting' and a 10-min window
//     • Release lock
//
//   Task 2 — COLLECTION  (default 23:55 in configured TZ)
//     • Acquire browser lock
//     • PHASE A: Force-scrape the target group so the last ~5 min of messages
//       are definitely in the DB before we query them
//     • PHASE B: Query messages from the DB for the collection window
//     • Aggregate by sender, format the consolidated summary text
//     • Send the summary to the group via Playwright
//     • Update the DB session to status='summarized'
//     • Release lock
//
// The browser lock (browser.lock.js) prevents this job and the regular scraper
// cron from running Playwright simultaneously.
//
// The UNIQUE KEY on (group_name, session_date) in daily_status_sessions is the
// idempotency guard — if the server restarts and the reminder fires twice, the
// second attempt fails with a duplicate-key error and is skipped gracefully.

import cron from "node-cron";
import {
  launchMainSession,
  openGroupPage,
  closeGroupPage,
  closeSession,
} from "../scraper/whatsapp.session.js";
import { sendMessageToGroup } from "../scraper/whatsapp.sender.js";
import {
  acquireBrowserLock,
  releaseBrowserLock,
} from "../scraper/browser.lock.js";
import {
  createSession,
  updateSession,
  findSessionByDate,
} from "../modules/daily-status/daily-status.repository.js";
import {
  collectAndFormat,
  getReminderText,
} from "../modules/daily-status/daily-status.service.js";
import { doGroupScrape } from "./scraperJob.js";

// ── Config ────────────────────────────────────────────────────────────────────

const ENABLED = process.env.DAILY_STATUS_ENABLED === "true";
const GROUP = (process.env.DAILY_STATUS_GROUP || "").trim();
const TIMEZONE = process.env.DAILY_STATUS_TIMEZONE || "UTC";
const REMINDER_CRON = process.env.DAILY_STATUS_REMINDER_CRON || "45 23 * * *";
const COLLECTION_CRON =
  process.env.DAILY_STATUS_COLLECTION_CRON || "55 23 * * *";
const WINDOW_MINUTES = Number(process.env.DAILY_STATUS_WINDOW_MINUTES) || 10;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a date string (YYYY-MM-DD) for a given Date in the configured timezone.
 * "en-CA" locale produces YYYY-MM-DD format natively.
 */
function getDateInTZ(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

/**
 * Returns today's date string in the configured timezone (for the reminder job).
 */
function getTodayInTZ() {
  return getDateInTZ(new Date());
}

/**
 * Returns yesterday's date string in the configured timezone.
 * Used by the collection job when it fires after midnight — the session was
 * created at 11:45 PM under yesterday's date but we're now in a new calendar day.
 */
function getYesterdayInTZ() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getDateInTZ(d);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000);
}

// ── Task 1: Reminder ──────────────────────────────────────────────────────────

async function runReminderJob() {
  if (!GROUP) {
    console.warn(
      "[DailyStatus] DAILY_STATUS_GROUP is not set — skipping reminder",
    );
    return;
  }

  const today = getTodayInTZ();
  console.log(`[DailyStatus] Reminder tick for "${GROUP}" on ${today}`);

  // Idempotency: skip if we already have a session for today
  const existing = await findSessionByDate(GROUP, today);
  if (existing) {
    console.warn(
      `[DailyStatus] Session already exists for ${today} (status: ${existing.status}) — skipping reminder`,
    );
    return;
  }

  // Create session record first so a crash after sending still leaves a trace
  const collectionStart = new Date();
  const collectionEnd = addMinutes(collectionStart, WINDOW_MINUTES);

  let session;
  try {
    session = await createSession({
      group_name: GROUP,
      session_date: today,
      collection_start: collectionStart,
      collection_end: collectionEnd,
    });
    console.log(
      `[DailyStatus] Session #${session.id} created — window: ${collectionStart.toISOString()} → ${collectionEnd.toISOString()}`,
    );
  } catch (err) {
    // Duplicate key means a session snuck in between the findOne and the insert
    if (err.code === "ER_DUP_ENTRY") {
      console.warn("[DailyStatus] Duplicate session — another process beat us");
      return;
    }
    throw err;
  }

  // Send the reminder to WhatsApp
  await acquireBrowserLock("DailyStatusReminder");
  let context;
  let page;
  try {
    context = await launchMainSession();
    page = await openGroupPage(context);
    await sendMessageToGroup(page, GROUP, getReminderText());

    await updateSession(session.id, { reminder_sent_at: new Date() });
    console.log("[DailyStatus] ✓ Reminder sent successfully");
  } catch (err) {
    console.error(`[DailyStatus] ✗ Reminder failed: ${err.message}`, err.stack);
    await updateSession(session.id, {
      status: "failed",
      error_message: `Reminder failed: ${err.message}`,
    });
  } finally {
    if (page) await closeGroupPage(page).catch(() => {});
    if (context) await closeSession(context).catch(() => {});
    releaseBrowserLock("DailyStatusReminder");
  }
}

// ── Task 2: Collection ────────────────────────────────────────────────────────

async function runCollectionJob() {
  if (!GROUP) {
    console.warn(
      "[DailyStatus] DAILY_STATUS_GROUP is not set — skipping collection",
    );
    return;
  }

  // When the collection fires after midnight (e.g. 12:05 AM), the calendar
  // day has rolled over but the session was created at 11:45 PM under
  // yesterday's date. Check both today and yesterday so the lookup works
  // regardless of whether the collection cron is before or after midnight.
  const today = getTodayInTZ();
  const yesterday = getYesterdayInTZ();
  console.log(
    `[DailyStatus] Collection tick — checking sessions for ${yesterday} and ${today}`,
  );

  const session =
    (await findSessionByDate(GROUP, today)) ||
    (await findSessionByDate(GROUP, yesterday));

  if (!session) {
    console.warn(
      `[DailyStatus] No session found for ${today} or ${yesterday} — was the reminder sent?`,
    );
    return;
  }

  if (session.status !== "collecting") {
    console.warn(
      `[DailyStatus] Session is in status="${session.status}" — skipping collection`,
    );
    return;
  }

  // Mark as processing so a restart doesn't re-run collection
  await updateSession(session.id, { status: "processing" });

  await acquireBrowserLock("DailyStatusCollection");
  let context;
  let page;

  try {
    context = await launchMainSession();

    // ── PHASE A: Force-scrape to pull in the last few minutes of messages ──
    // The regular 5-min scraper may not have run since 23:50, leaving a gap
    // of up to 5 minutes before the collection window closes. Scraping here
    // guarantees those messages are in the DB before we query them.
    console.log(
      `[DailyStatus] Phase A — force-scraping "${GROUP}" before collection`,
    );
    try {
      page = await openGroupPage(context);
      await doGroupScrape(page, GROUP);
    } catch (scrapeErr) {
      // Non-fatal — we still try to collect from whatever is already in DB
      console.warn(
        `[DailyStatus] Phase A scrape failed (will proceed with existing DB data): ${scrapeErr.message}`,
      );
    } finally {
      if (page) await closeGroupPage(page).catch(() => {});
      page = null;
    }

    // ── PHASE B: Aggregate messages from DB ──────────────────────────────
    console.log("[DailyStatus] Phase B — aggregating messages from DB");
    const { summaryText, participantCount, messageCount } =
      await collectAndFormat(session);

    console.log(
      `[DailyStatus] Formatted summary: ${participantCount} participant(s), ${messageCount} message(s)`,
    );

    // ── PHASE C: Send the consolidated summary to the group ──────────────
    console.log("[DailyStatus] Phase C — sending summary to group");
    page = await openGroupPage(context);
    await sendMessageToGroup(page, GROUP, summaryText);

    await updateSession(session.id, {
      status: "summarized",
      summary_text: summaryText,
      summary_sent_at: new Date(),
      participant_count: participantCount,
      message_count: messageCount,
    });

    console.log(
      `[DailyStatus] ✓ Summary sent — ${participantCount} participant(s), ${messageCount} message(s)`,
    );
  } catch (err) {
    console.error(
      `[DailyStatus] ✗ Collection failed: ${err.message}`,
      err.stack,
    );
    await updateSession(session.id, {
      status: "failed",
      error_message: `Collection failed: ${err.message}`,
    });
  } finally {
    if (page) await closeGroupPage(page).catch(() => {});
    if (context) await closeSession(context).catch(() => {});
    releaseBrowserLock("DailyStatusCollection");
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

/**
 * Registers both cron tasks.
 * Called from server.js after the DB connection is established.
 *
 * @returns {{ reminderTask, collectionTask } | null}
 */
export function startDailyStatusJob() {
  if (!ENABLED) {
    console.log("[DailyStatus] Disabled (DAILY_STATUS_ENABLED != true)");
    return null;
  }

  if (!GROUP) {
    console.warn(
      "[DailyStatus] DAILY_STATUS_GROUP is not set — job will not run",
    );
    return null;
  }

  if (!cron.validate(REMINDER_CRON)) {
    throw new Error(
      `[DailyStatus] Invalid DAILY_STATUS_REMINDER_CRON: "${REMINDER_CRON}"`,
    );
  }
  if (!cron.validate(COLLECTION_CRON)) {
    throw new Error(
      `[DailyStatus] Invalid DAILY_STATUS_COLLECTION_CRON: "${COLLECTION_CRON}"`,
    );
  }

  const reminderTask = cron.schedule(REMINDER_CRON, runReminderJob, {
    scheduled: true,
    timezone: TIMEZONE,
  });

  const collectionTask = cron.schedule(COLLECTION_CRON, runCollectionJob, {
    scheduled: true,
    timezone: TIMEZONE,
  });

  console.log(
    `[DailyStatus] Reminder scheduled  — ${REMINDER_CRON} (${TIMEZONE}) → "${GROUP}"`,
  );
  console.log(
    `[DailyStatus] Collection scheduled — ${COLLECTION_CRON} (${TIMEZONE}) → "${GROUP}"`,
  );

  return { reminderTask, collectionTask };
}
