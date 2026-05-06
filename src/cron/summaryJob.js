import cron from 'node-cron';
import { processGroupSummary } from '../modules/summary/summary.service.js';
import { getActiveGroups } from '../modules/summary/summary.repository.js';

const SCHEDULE    = process.env.CRON_SCHEDULE       || '*/15 * * * *';
const MAX_RETRIES = Number(process.env.CRON_MAX_RETRIES)    || 2;
const RETRY_DELAY = Number(process.env.CRON_RETRY_DELAY_MS) || 5000;

// ── Guard: prevent a slow tick from overlapping the next one ────────────────
let isRunning = false;

// ── Per-group retry helper ───────────────────────────────────────────────────
async function processWithRetry(group_name) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const result = await processGroupSummary(group_name);

      if (result.status === 'processed') {
        console.log(
          `[Cron] ✓ ${group_name} — ${result.messageCount} messages → ${result.groupCount} group(s)`
        );
      } else {
        console.log(`[Cron] — ${group_name} skipped: ${result.reason}`);
      }

      return; // success — exit retry loop
    } catch (err) {
      lastError = err;

      if (attempt <= MAX_RETRIES) {
        const delay = RETRY_DELAY * attempt; // linear backoff: 5s, 10s
        console.warn(
          `[Cron] ✗ ${group_name} failed (attempt ${attempt}/${MAX_RETRIES + 1}). ` +
          `Retrying in ${delay}ms. Error: ${err.message}`
        );
        await sleep(delay);
      }
    }
  }

  // All attempts exhausted — log and move on; do NOT crash the whole job
  console.error(
    `[Cron] ✗✗ ${group_name} — all ${MAX_RETRIES + 1} attempts failed. ` +
    `Last error: ${lastError.message}`
  );
}

// ── Main tick ────────────────────────────────────────────────────────────────
async function runSummaryJob() {
  if (isRunning) {
    console.warn('[Cron] Previous tick still running — skipping this tick');
    return;
  }

  isRunning = true;
  const tickStart = Date.now();
  console.log(`[Cron] Tick started at ${new Date().toISOString()}`);

  try {
    const groups = await getActiveGroups();

    if (groups.length === 0) {
      console.log('[Cron] No active groups found — nothing to process');
      return;
    }

    console.log(`[Cron] Processing ${groups.length} group(s): ${groups.join(', ')}`);

    // Process all groups concurrently; failures are isolated per group
    await Promise.allSettled(groups.map((g) => processWithRetry(g)));

  } catch (err) {
    // Catches errors in getActiveGroups() (e.g. DB down)
    console.error(`[Cron] Fatal tick error: ${err.message}`, err.stack);
  } finally {
    isRunning = false;
    console.log(`[Cron] Tick finished in ${Date.now() - tickStart}ms`);
  }
}

// ── Scheduler ────────────────────────────────────────────────────────────────

/**
 * Starts the summary cron job.
 * Called once from server.js after the DB connection is established.
 * @returns {import('node-cron').ScheduledTask}
 */
export function startSummaryJob() {
  if (process.env.CRON_ENABLED !== 'true') {
    console.log('[Cron] Summary job is disabled (CRON_ENABLED != true)');
    return null;
  }

  if (!cron.validate(SCHEDULE)) {
    throw new Error(`[Cron] Invalid CRON_SCHEDULE expression: "${SCHEDULE}"`);
  }

  const task = cron.schedule(SCHEDULE, runSummaryJob, {
    scheduled: true,
    timezone: 'UTC',
  });

  console.log(`[Cron] Summary job scheduled — ${SCHEDULE} (UTC)`);
  return task;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
