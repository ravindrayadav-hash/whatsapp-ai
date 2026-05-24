# Scraper Status + DB-First UI Plan

---

## Problem: Why DB messages don't appear on screen even though the data is there

### What the user sees

- Dashboard shows "No groups yet" even though groups exist in the DB
- MessagesView groups dropdown is empty, so no messages can be selected
- All pages show spinners or empty states during the cron window

The data IS in the DB. The frontend IS calling the API. The problem is the
**API cannot answer** while the scraper is running.

### Root cause

The WhatsApp scraper (Playwright / headless Chrome) runs **inside the same Node.js
process** as the Express API server.

When the cron tick fires and the scraper starts working — especially
`upgradeImageForBubble()` which clicks each image thumbnail and waits up to 6–8 seconds
per image for the media viewer — **the Node.js event loop is saturated**.

`GET /api/groups` is a trivially fast query (`DISTINCT group_name`), but it still
cannot be served because the event loop is occupied by Playwright. The frontend gets
a timeout or a very delayed response → empty groups list → user sees nothing.

### Sequence that triggers the blank screen

```
Cron tick fires
  └─ launchMainSession()  — Playwright opens Chrome
       └─ scrapeGroupMessages()
            ├─ extractFullHistory() or extractSinceCursor()
            │    └─ for each image message:
            │         └─ upgradeImageForBubble()
            │              ├─ thumb.click()              — DOM interaction
            │              ├─ waitForSelector(VIEWER, 6s) — 6 second wait
            │              ├─ waitForTimeout(1.5s)        — 1.5 second wait
            │              └─ page.keyboard.press(Esc)
            └─ GET /api/groups from frontend lands here
                 └─ Event loop busy → delayed / timeout → empty dropdown
```

A group with 50 image messages = up to **375 seconds** of blocking every 5 minutes.

### What the dedup cursor fix already solved (done in previous session)

**Before:** every 5-minute tick → `initCursor` made an HTTP call to the API from inside
the scraper process (calling itself) → that self-call also stalled on the blocked
event loop → returned null → cursor was set to epoch (1970) → `extractFullHistory()`
ran on EVERY tick → blocked for minutes at every tick, continuously.

**After:** every tick → reads `MAX(message_time)` directly from DB → cursor is the
real last message time → `extractSinceCursor()` runs → only reads a few new messages →
blocks for seconds instead of minutes on most ticks.

**The dedup fix eliminates the worst case.** The remaining blocking comes only from
image-heavy groups during incremental scans (one `upgradeImageForBubble` call per new
image message).

---

## What the user wants

| Behaviour | When |
|---|---|
| Show **existing DB messages immediately** on page load | Always, even while scan runs |
| New messages only appear when the **↻ Refresh button** is clicked | During and after scan |
| Show a **"Scanning…" banner** while the cron is active | During scan |
| Auto-trigger a **refresh once the scan finishes** | After scan completes |

---

## Solution overview (two-phase, no breaking changes to scraper)

### Phase 1 — Scraper Status API (backend, ~30 min)

Export the in-memory `isRunning` flag from `scraperJob.js` via a new lightweight
endpoint: `GET /api/scraper/status`.

```
Response:
{
  "running": true,
  "startedAt": "2026-05-23T10:00:00.000Z",
  "groups": ["Group A", "Group B"]
}
```

This does **not** touch the scraper logic at all — it just reads the flag that
already exists.

### Phase 2 — Frontend status-aware rendering (frontend, ~45 min)

Add a `useScraperStatus` hook that polls `GET /api/scraper/status` every 10 seconds.
Wire it into every view to:

1. Show a top banner: `"Scanning WhatsApp — new messages will appear after refresh"`
2. Pause auto-refresh while `running === true` (avoids hammering a busy server)
3. When `running` flips from `true → false`, trigger one automatic reload

---

## Detailed implementation steps

### Step 1 — Export `isRunning` from scraperJob.js

**File:** `src/cron/scraperJob.js`

Add a named export:
```js
export function isScraperRunning() {
  return isRunning;
}
export function scraperStartedAt() {
  return _startedAt; // new module-level variable, set when isRunning = true
}
```

### Step 2 — Create `GET /api/scraper/status` endpoint

**New file:** `src/modules/scraper/scraper.routes.js`

```js
import express from "express";
import { isScraperRunning, scraperStartedAt } from "../../cron/scraperJob.js";
import { requireAuth } from "../../middleware/auth.js";

const router = express.Router();

router.get("/status", requireAuth, (req, res) => {
  res.json({
    success: true,
    running: isScraperRunning(),
    startedAt: scraperStartedAt() ?? null,
  });
});

export default router;
```

**Wire it in** `src/app.js`:
```js
import scraperRoutes from "./modules/scraper/scraper.routes.js";
app.use("/api/scraper", scraperRoutes);
```

### Step 3 — `useScraperStatus` hook (frontend)

**New file:** `client/src/hooks/useScraperStatus.js`

```js
// Polls /api/scraper/status every 10 s.
// Returns { running, startedAt } and fires onScanComplete when running flips false.
import { useState, useEffect, useRef, useCallback } from "react";
import axios from "../utils/axios.js"; // project's custom Axios wrapper

export default function useScraperStatus({ onScanComplete } = {}) {
  const [status, setStatus] = useState({ running: false, startedAt: null });
  const prevRunning = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await axios.get("/api/scraper/status");
      const running = data.running ?? false;

      // Flip: was running, now stopped → trigger reload
      if (prevRunning.current && !running) {
        onScanComplete?.();
      }
      prevRunning.current = running;
      setStatus({ running, startedAt: data.startedAt ?? null });
    } catch {
      // Silently ignore — API may be mid-scan and slow
    }
  }, [onScanComplete]);

  useEffect(() => {
    fetchStatus(); // immediate check on mount
    const id = setInterval(fetchStatus, 10_000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  return status;
}
```

### Step 4 — Wire into MessagesView and Dashboard

**MessagesView.jsx** — replace the `useAutoRefresh` call:
```jsx
// Before:
useAutoRefresh(reload, 30_000, !!selectedGroup);

// After: pause auto-refresh while scan is running, auto-reload on complete
const { running } = useScraperStatus({ onScanComplete: reload });
useAutoRefresh(reload, 30_000, !!selectedGroup && !running);
```

Add scanning banner inside the JSX:
```jsx
{running && (
  <div className="alert alert-info text-sm py-2">
    Scanning WhatsApp — new messages will appear after refresh
  </div>
)}
```

**Dashboard.jsx** — same pattern with `refetch`:
```jsx
const { running } = useScraperStatus({ onScanComplete: refetch });
useAutoRefresh(refetch, 30_000, !running);
```

**AIHistoryView.jsx** — same with `setRefreshTick`:
```jsx
const triggerRefresh = useCallback(() => setRefreshTick((t) => t + 1), []);
const { running } = useScraperStatus({ onScanComplete: triggerRefresh });
useAutoRefresh(triggerRefresh, 30_000, !running);
```

### Step 5 — (Optional / future) Fix the root cause properly

Move the Playwright scraper into a **child process** using Node.js
`child_process.fork()`. The child process runs all Playwright work and writes results
directly to the DB. The main API process stays completely free during scans.

This is a bigger refactor and not required for the status/banner feature, but it
permanently solves the API-blocked problem.

---

## What does NOT change

- The WhatsApp scraping logic (`whatsapp.scraper.js`, `scraperJob.js`) — untouched
- The dedup cursor logic (`scraper.dedup.js`) — untouched
- All existing DB read/write paths — untouched
- The ↻ Refresh button on MessagesView and AIActionsView — still works the same

---

## Files to create / modify

| File | Action |
|---|---|
| `src/cron/scraperJob.js` | Export `isScraperRunning()` and `scraperStartedAt()` |
| `src/modules/scraper/scraper.routes.js` | **Create** — status endpoint |
| `src/app.js` | Mount `/api/scraper` router |
| `client/src/hooks/useScraperStatus.js` | **Create** — polling hook |
| `client/src/pages/MessagesView.jsx` | Use `useScraperStatus`, pause auto-refresh, add banner |
| `client/src/pages/Dashboard.jsx` | Same |
| `client/src/pages/AIHistoryView.jsx` | Same |
| `client/src/pages/AIActionsView.jsx` | Same |

---

## Expected UX after implementation

1. User opens Dashboard / MessagesView — DB data loads immediately (same as before,
   but now the API is not hit during scan, so it answers fast)
2. Cron tick fires — banner appears: `"Scanning WhatsApp — new messages will appear after refresh"`
3. Auto-refresh pauses while scan is running
4. Scan finishes — banner disappears, page auto-reloads once to show new messages
5. User can always click ↻ Refresh manually at any point
