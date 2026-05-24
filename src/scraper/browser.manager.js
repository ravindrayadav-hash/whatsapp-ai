// Persistent browser context manager.
//
// ROOT CAUSE THIS FIXES:
//   The old pattern opened and closed Chrome on every 5-minute scraper tick.
//   WhatsApp Web maintains login through a WebSocket connection to WA servers.
//   Killing Chrome every 5 minutes tears down that connection, and WA
//   periodically de-authenticates sessions it considers idle or bot-like.
//   At 1 AM — when nobody is watching — the session expires, Chrome opens to
//   a QR code, no one scans it, the tick times out, and the send queue is
//   NEVER drained. Reminder and summary messages are silently lost.
//
// THE FIX:
//   Keep ONE Chrome context alive for the lifetime of the server process.
//   QR scan is only required once (on first startup or after WA logout).
//   The live WebSocket connection tells WA Web we are still present, so the
//   session stays valid through the night.
//
// USAGE:
//   import { getSharedContext, destroySharedContext } from './browser.manager.js';
//
//   const ctx = await getSharedContext();   // open-or-reuse
//   const page = await openGroupPage(ctx);  // create a tab
//   // ... do work ...
//   await closeGroupPage(page);             // close the tab — keep context alive
//   // DO NOT call closeSession(ctx)

import { launchMainSession, closeSession } from "./whatsapp.session.js";

let _context = null;
let _launchPromise = null; // guards against concurrent launch calls

/**
 * Returns the shared, live BrowserContext.
 *
 * • First call  → launches Chrome + handles QR scan if session expired.
 * • Later calls → returns the already-open context immediately.
 * • If Chrome has crashed  → detects the dead context and relaunches.
 *
 * @returns {Promise<import('playwright').BrowserContext>}
 */
export async function getSharedContext() {
  // If a launch is already in progress (e.g. two crons fire simultaneously),
  // wait for it instead of starting a second Chrome.
  if (_launchPromise) {
    console.log("[BrowserManager] Launch in progress — waiting");
    return _launchPromise;
  }

  if (_context) {
    // Synchronous health check: context.pages() throws if the browser died.
    try {
      _context.pages();
      return _context; // still alive
    } catch {
      console.warn("[BrowserManager] Existing context is dead — relaunching");
      _context = null;
    }
  }

  // Launch (blocks until QR scanned if session has expired)
  console.log("[BrowserManager] Launching browser context...");
  _launchPromise = launchMainSession()
    .then((ctx) => {
      _context = ctx;
      _launchPromise = null;
      console.log("[BrowserManager] ✓ Browser context ready — will be reused across ticks");
      return ctx;
    })
    .catch((err) => {
      _context = null;
      _launchPromise = null;
      throw err;
    });

  return _launchPromise;
}

/**
 * Force-closes the current context and marks it as gone.
 *
 * Call this when you detect the session has become definitively invalid
 * (e.g. a "Target closed" or "Protocol error" that can't recover).
 * The next call to getSharedContext() will launch a fresh Chrome.
 */
export async function destroySharedContext() {
  const ctx = _context;
  _context = null;
  _launchPromise = null;

  if (ctx) {
    await closeSession(ctx).catch(() => {});
    console.log("[BrowserManager] Context destroyed — will reopen on next getSharedContext() call");
  }
}

/** Returns true if a live context is currently held. */
export function hasLiveContext() {
  if (!_context) return false;
  try {
    _context.pages();
    return true;
  } catch {
    return false;
  }
}
