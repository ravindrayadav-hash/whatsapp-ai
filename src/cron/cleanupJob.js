import cron from 'node-cron';
import { AppDataSource } from '../config/database.js';

// Retain AI logs for this many days before deleting.
// Configurable via AI_LOG_RETENTION_DAYS env — default 90 days.
const RETENTION_DAYS = Math.max(Number(process.env.AI_LOG_RETENTION_DAYS) || 90, 1);

// Run every Sunday at 02:00 UTC — low-traffic window.
const CLEANUP_SCHEDULE = '0 2 * * 0';

async function runCleanup() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  try {
    const result = await AppDataSource.query(
      `DELETE FROM ai_logs WHERE created_at < ?`,
      [cutoff]
    );
    const deleted = result.affectedRows ?? result[0]?.affectedRows ?? 0;
    console.log(`[Cleanup] Deleted ${deleted} ai_log rows older than ${RETENTION_DAYS} days (cutoff: ${cutoff.toISOString()})`);
  } catch (err) {
    console.error(`[Cleanup] Failed to prune ai_logs: ${err.message}`);
  }
}

/**
 * Starts the weekly AI-log cleanup job.
 * Must be called after the DB connection is established.
 * @returns {import('node-cron').ScheduledTask}
 */
export function startCleanupJob() {
  const task = cron.schedule(CLEANUP_SCHEDULE, runCleanup, {
    scheduled: true,
    timezone: 'UTC',
  });

  console.log(`[Cleanup] Weekly ai_logs cleanup scheduled (${CLEANUP_SCHEDULE} UTC, retention: ${RETENTION_DAYS} days)`);
  return task;
}
