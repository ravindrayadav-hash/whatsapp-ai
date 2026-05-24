// Shared in-process mutex that prevents the scraper cron and the daily-status
// cron from launching two Playwright browser contexts simultaneously.
//
// Node.js is single-threaded so a boolean flag is safe — there is no true
// race between the await-boundary checks and the flag set.
//
// Both callers follow the same protocol:
//   await acquireBrowserLock('CallerName');
//   try { ... } finally { releaseBrowserLock('CallerName'); }

// 5 minutes — the scraper can take 1–2 min per tick across multiple groups.
// Cron senders must wait for the scraper to release before launching WA Web.
const MAX_WAIT_MS = 300_000;
const POLL_MS = 500; // check every 500 ms

let _locked = false;
let _lockedBy = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits until the browser lock is free, then acquires it.
 * Throws if the lock is not released within MAX_WAIT_MS.
 *
 * @param {string} callerName - human-readable label for logs
 */
export async function acquireBrowserLock(callerName) {
  const deadline = Date.now() + MAX_WAIT_MS;

  while (_locked) {
    if (Date.now() >= deadline) {
      throw new Error(
        `[BrowserLock] Timeout after ${MAX_WAIT_MS}ms waiting for lock held by "${_lockedBy}" (caller: "${callerName}")`,
      );
    }
    console.log(
      `[BrowserLock] "${callerName}" waiting — lock held by "${_lockedBy}"`,
    );
    await sleep(POLL_MS);
  }

  _locked = true;
  _lockedBy = callerName;
  console.log(`[BrowserLock] Acquired by "${callerName}"`);
}

/**
 * Releases the browser lock so the next waiter can proceed.
 *
 * @param {string} callerName - must match the name passed to acquireBrowserLock
 */
export function releaseBrowserLock(callerName) {
  _locked = false;
  _lockedBy = null;
  console.log(`[BrowserLock] Released by "${callerName}"`);
}

/** Returns true if the browser is currently in use. */
export function isBrowserLocked() {
  return _locked;
}
