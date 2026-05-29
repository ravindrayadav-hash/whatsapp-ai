import { useState, useEffect, useRef, useCallback } from "react";
import { fetchScraperStatus } from "../api/client.js";

/**
 * Polls GET /api/scraper/status every 10 seconds.
 * When the scraper flips from running → stopped, fires onScanComplete
 * so the caller can trigger a data reload.
 *
 * @param {{ onScanComplete?: () => void }} [opts]
 * @returns {{ running: boolean, startedAt: string | null }}
 */
export default function useScraperStatus({ onScanComplete } = {}) {
  const [status, setStatus] = useState({ running: false, startedAt: null });
  const prevRunning = useRef(false);
  const onCompleteRef = useRef(onScanComplete);
  onCompleteRef.current = onScanComplete;

  const fetchStatus = useCallback(async () => {
    try {
      const data = await fetchScraperStatus();
      const running = data.running ?? false;

      // Flip: was running, now stopped → trigger caller's reload
      if (prevRunning.current && !running) {
        onCompleteRef.current?.();
      }
      prevRunning.current = running;
      setStatus({ running, startedAt: data.startedAt ?? null });
    } catch {
      // API may be slow mid-scan — silently ignore, keep last known state
    }
  }, []);

  useEffect(() => {
    fetchStatus(); // immediate check on mount
    // 30s is precise enough to detect cron completion without burning rate-limit quota
    const id = setInterval(fetchStatus, 30_000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  return status;
}
