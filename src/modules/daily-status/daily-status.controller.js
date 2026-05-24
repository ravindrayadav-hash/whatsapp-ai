// HTTP controller for the daily-status REST endpoints.
//
// Routes:
//   GET  /api/daily-status          — list all sessions
//   GET  /api/daily-status/:group   — sessions for one group
//   POST /api/daily-status/trigger-send  — queue a test message immediately

import { listAllSessions, listSessions } from "./daily-status.repository.js";
import { queueMessage, queueSize } from "../../scraper/send.queue.js";

// Always read from READ_SEND_GROUP — that is the active group config
const GROUP = (process.env.READ_SEND_GROUP || "").trim();

/**
 * GET /api/daily-status
 */
export async function getAllSessions(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const sessions = await listAllSessions(limit);
    res.json({ success: true, data: sessions, count: sessions.length });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/daily-status/:group
 */
export async function getSessionsByGroup(req, res, next) {
  try {
    const group = decodeURIComponent(req.params.group);
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const sessions = await listSessions(group, limit);
    res.json({ success: true, data: sessions, count: sessions.length });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/daily-status/trigger-send
 * Body (optional): { "message": "custom text" }
 *
 * Queues the message into send.queue.js.
 * The scraper picks it up on its next tick (within 5 min) and sends it
 * using its already-open Chrome session — no separate browser launch.
 */
export async function triggerSend(req, res, next) {
  if (!GROUP) {
    return res.status(400).json({
      success: false,
      message: "READ_SEND_GROUP is not set in .env",
    });
  }

  const text =
    (req.body && req.body.message) ||
    `🔔 Test message — ${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}`;

  queueMessage(GROUP, text);

  res.json({
    success: true,
    message: `Message queued for "${GROUP}". Scraper will send it on its next tick (within 5 min). Watch server logs for [Scraper Cron] Draining send queue.`,
    group: GROUP,
    text,
    queueSizeNow: queueSize(),
  });
}
