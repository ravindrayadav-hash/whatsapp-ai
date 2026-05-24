// Daily status consolidation cron — 3 phases:
//
//   PHASE 1 — 2:20 AM  Send reminder to "whatsapp ai" group via WA Web
//   PHASE 2 — 2:30 AM  Scrape group from WA Web, read last 15 min of updates, combine
//   PHASE 3 — 2:35 AM  Queue combined summary → scraper sends it back to same group
//
// Team flow:
//   → Team sees reminder → sends daily updates in "whatsapp ai"
//   → 2:30 AM: cron reads WA Web, combines updates by sender
//   → 2:35 AM: combined block is posted back to "whatsapp ai"
//   → Team copies it and pastes to client (no auto-send to client)

import cron from "node-cron";
import { AppDataSource } from "../config/database.js";
import { Message } from "../entities/Message.js";
import { queueMessage } from "../scraper/send.queue.js";
import {
  getSharedContext,
  destroySharedContext,
} from "../scraper/browser.manager.js";
import {
  openGroupPage,
  closeGroupPage,
} from "../scraper/whatsapp.session.js";
import {
  acquireBrowserLock,
  releaseBrowserLock,
} from "../scraper/browser.lock.js";
import { sendMessageToGroup } from "../scraper/whatsapp.sender.js";
import { doGroupScrape } from "./scraperJob.js";

// ── Config ────────────────────────────────────────────────────────────────────

const ENABLED = process.env.READ_SEND_ENABLED === "true";
const GROUP = (process.env.READ_SEND_GROUP || "").trim();
const TIMEZONE = process.env.READ_SEND_TIMEZONE || "Asia/Kolkata";
const REMINDER_CRON = process.env.READ_SEND_REMINDER_CRON || "20 2 * * *"; // 2:20 AM
const READ_CRON = process.env.READ_SEND_READ_CRON    || "30 2 * * *"; // 2:30 AM
const SEND_CRON = process.env.READ_SEND_SEND_CRON    || "35 2 * * *"; // 2:35 AM

// How many minutes back the read window looks — default 15 min (covers 2:20–2:30)
const WINDOW_MINUTES = Number(process.env.READ_SEND_WINDOW_MINUTES) || 15;

// Reminder text — \n in .env is a literal backslash-n; replace with real newline
const REMINDER_TEXT = (
  process.env.READ_SEND_REMINDER_TEXT ||
  "🔔 Daily Status Time!\nPlease share your updates for today. You have 10 minutes."
).replace(/\\n/g, "\n");

// Combined summary stored between Phase 2 and Phase 3
let _pending = null;

// ── Phase 1 — REMINDER (2:20 AM) ─────────────────────────────────────────────
// Directly opens WA Web and sends the reminder — no queue needed here so the
// message arrives at exactly 2:20 AM without waiting for the next scraper tick.

async function runReminderJob() {
  if (!GROUP) {
    console.warn("[ReadSend] READ_SEND_GROUP not set — skipping reminder");
    return;
  }

  console.log(`[ReadSend] Phase 1 — sending reminder to "${GROUP}" via WA Web`);

  await acquireBrowserLock("ReadSendReminder");
  let page;
  try {
    const context = await getSharedContext();
    page = await openGroupPage(context);
    await sendMessageToGroup(page, GROUP, REMINDER_TEXT);
    console.log(`[ReadSend] ✓ Reminder sent to "${GROUP}"`);
  } catch (err) {
    console.error(`[ReadSend] ✗ Reminder failed: ${err.message}`, err.stack);
    if (
      err.message?.includes("Target closed") ||
      err.message?.includes("Protocol error") ||
      err.message?.includes("crashed")
    ) {
      await destroySharedContext().catch(() => {});
    }
  } finally {
    if (page) await closeGroupPage(page).catch(() => {});
    releaseBrowserLock("ReadSendReminder");
  }
}

// ── Phase 2 — READ (2:30 AM) ──────────────────────────────────────────────────
// 1. Open WA Web → scrape "whatsapp ai" → save latest messages to DB
// 2. Query DB for the last WINDOW_MINUTES of messages (team replies to the reminder)
// 3. Group by sender, merge messages, store combined text in memory

async function runReadJob() {
  if (!GROUP) {
    console.warn("[ReadSend] READ_SEND_GROUP not set — skipping read");
    return;
  }
  console.log(`[ReadSend] Phase 2 — scraping "${GROUP}" from WA Web then combining updates`);

  // Step A: Scrape directly from WA Web to capture every message up to now
  await acquireBrowserLock("ReadSendRead");
  let page;
  try {
    const context = await getSharedContext();
    page = await openGroupPage(context);
    console.log(`[ReadSend] Scraping WA Web for "${GROUP}"...`);
    await doGroupScrape(page, GROUP);
    console.log("[ReadSend] ✓ WA Web scrape complete — DB is up to date");
  } catch (scrapeErr) {
    console.error(
      `[ReadSend] Scrape failed (using existing DB data): ${scrapeErr.message}`,
    );
    if (
      scrapeErr.message?.includes("Target closed") ||
      scrapeErr.message?.includes("Protocol error") ||
      scrapeErr.message?.includes("crashed")
    ) {
      await destroySharedContext().catch(() => {});
    }
  } finally {
    if (page) await closeGroupPage(page).catch(() => {});
    releaseBrowserLock("ReadSendRead");
  }

  // Step B: Read last WINDOW_MINUTES of messages from DB
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
  console.log(
    `[ReadSend] Reading DB — last ${WINDOW_MINUTES} min (since ${windowStart.toISOString()})`,
  );

  const messages = await AppDataSource.getRepository(Message)
    .createQueryBuilder("m")
    .where("m.group_name = :group", { group: GROUP })
    .andWhere("m.message_time >= :start", { start: windowStart })
    .andWhere("m.message_type IN (:...types)", { types: ["text", "mixed"] })
    .orderBy("m.message_time", "ASC")
    .getMany();

  console.log(`[ReadSend] ${messages.length} raw message(s) in ${WINDOW_MINUTES}-min window`);

  // Filter out blank messages AND the reminder message itself.
  // The reminder is sent by the bot account — its first line matches REMINDER_TEXT.
  const reminderFirstLine = REMINDER_TEXT.split("\n")[0].trim();

  const valid = messages.filter((m) => {
    if (!m.sender || !m.sender.trim()) return false;
    if (!m.message || !m.message.trim()) return false;
    // Drop the reminder message so it doesn't appear in the combined summary
    if (reminderFirstLine && m.message.trim().startsWith(reminderFirstLine)) return false;
    return true;
  });

  if (valid.length === 0) {
    console.warn("[ReadSend] No updates received — Phase 3 will be skipped");
    _pending = null;
    return;
  }

  // Step C: Group by sender
  const senderMap = new Map();
  for (const msg of valid) {
    const name = msg.sender.trim();
    if (!senderMap.has(name)) senderMap.set(name, []);
    senderMap.get(name).push(msg.message.trim());
  }

  // Step D: Format one block per sender
  const blocks = [];
  for (const [sender, msgs] of senderMap) {
    blocks.push(`${sender.toUpperCase()}:-\n${msgs.join("\n")}`);
  }

  _pending = {
    text: blocks.join("\n\n"),
    participantCount: senderMap.size,
    messageCount: valid.length,
  };

  console.log(
    `[ReadSend] ✓ Combined summary ready — ${senderMap.size} participant(s), ${valid.length} message(s)`,
  );
  console.log(
    `[ReadSend] Preview:\n${_pending.text.slice(0, 400)}${_pending.text.length > 400 ? "…" : ""}`,
  );
}

// ── Phase 3 — SEND (2:35 AM) ──────────────────────────────────────────────────
// Queues the combined block. The scraper (skip window ends at 2:37) picks it up
// on its next tick and posts it back to the same "whatsapp ai" group.

async function runSendJob() {
  if (!GROUP) {
    console.warn("[ReadSend] READ_SEND_GROUP not set — skipping send");
    return;
  }
  if (!_pending) {
    console.warn("[ReadSend] No pending summary — no updates were received or Phase 2 failed");
    return;
  }

  console.log(
    `[ReadSend] Phase 3 — queueing combined summary for "${GROUP}" ` +
      `(${_pending.participantCount} participant(s), ${_pending.messageCount} message(s))`,
  );

  queueMessage(GROUP, _pending.text);
  _pending = null;
  console.log("[ReadSend] ✓ Summary queued — scraper will post it to the group shortly");
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

export function startReadAndSendJob() {
  if (!ENABLED) {
    console.log("[ReadSend] Disabled (READ_SEND_ENABLED != true)");
    return null;
  }
  if (!GROUP) {
    console.warn("[ReadSend] READ_SEND_GROUP not set — job will not run");
    return null;
  }

  for (const [name, expr] of [
    ["READ_SEND_REMINDER_CRON", REMINDER_CRON],
    ["READ_SEND_READ_CRON", READ_CRON],
    ["READ_SEND_SEND_CRON", SEND_CRON],
  ]) {
    if (!cron.validate(expr)) {
      throw new Error(`[ReadSend] Invalid ${name}: "${expr}"`);
    }
  }

  cron.schedule(REMINDER_CRON, runReminderJob, { scheduled: true, timezone: TIMEZONE });
  cron.schedule(READ_CRON,     runReadJob,     { scheduled: true, timezone: TIMEZONE });
  cron.schedule(SEND_CRON,     runSendJob,     { scheduled: true, timezone: TIMEZONE });

  console.log(`[ReadSend] Phase 1 Reminder — ${REMINDER_CRON} (${TIMEZONE}) → "${GROUP}"`);
  console.log(`[ReadSend] Phase 2 Read     — ${READ_CRON} (${TIMEZONE}) → scrapes WA Web + combines`);
  console.log(`[ReadSend] Phase 3 Send     — ${SEND_CRON} (${TIMEZONE}) → posts to "${GROUP}"`);

  return true;
}
