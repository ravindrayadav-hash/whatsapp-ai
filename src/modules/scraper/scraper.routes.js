import { Router } from "express";
import { isScraperRunning, scraperStartedAt } from "../../cron/scraperJob.js";

const router = Router();

/**
 * GET /api/scraper/status
 * Returns whether the WhatsApp scraper cron is currently running.
 * Used by the frontend to show a "Scanning..." banner and pause auto-refresh
 * while the Playwright process is active (which saturates the event loop).
 */
router.get("/status", (_req, res) => {
  res.json({
    success: true,
    running: isScraperRunning(),
    startedAt: scraperStartedAt() ?? null,
  });
});

export default router;
