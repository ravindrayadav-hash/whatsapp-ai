# WhatsApp AI — Bug Fixes Applied

> Date: 2026-04-14  
> All fixes from PROJECT_ANALYSIS.md Part 2 are complete.

---

## PHASE 1 — CRITICAL (4 fixes)

### [C1] Bearer-Token Authentication on All API Routes
**Files changed:** `src/middleware/auth.js` (new), `src/app.js`, `src/scraper/message.client.js`, `client/src/api/client.js`, `.env.example`, `client/.env.example` (new)

**Why:** Every `/api/*` route was publicly accessible — anyone with the server URL could read all WhatsApp messages and exhaust the Gemini quota.

**What was done:**
- Created `src/middleware/auth.js` — checks `Authorization: Bearer <ADMIN_TOKEN>` header. Passes through if `ADMIN_TOKEN` is not set (local dev mode).
- Mounted middleware in `app.js` before all `/api/*` routes.
- Scraper's `message.client.js` now sends the token on internal HTTP calls via `authHeaders()`.
- Frontend `client.js` reads `VITE_API_TOKEN` env and attaches it on every fetch.
- `.env.example` — added `ADMIN_TOKEN` placeholder, replaced real Gemini API key with `AIzaSy_REPLACE_WITH_YOUR_KEY`.
- `client/.env.example` created with `VITE_API_URL` and `VITE_API_TOKEN` docs.

**How to enable:** Set `ADMIN_TOKEN=<random-string>` in server `.env` and `VITE_API_TOKEN=<same-string>` in `client/.env`.

---

### [C2] Rate Limiting on All API Endpoints
**Files changed:** `src/app.js`, `package.json`

**Why:** No rate limiting meant a single client could spam `/api/ai/action` and drain the entire Gemini quota in seconds.

**What was done:**
- Installed `express-rate-limit@8.3.2`.
- Global limiter: 200 requests / 15 minutes per IP on all `/api/*` routes.
- AI limiter: 15 requests / 1 minute per IP on `/api/ai/*` routes only.
- Both limiters return `{ success: false, message: "..." }` on limit hit.

---

### [C3] Processing Lock Race Condition Fixed
**Files changed:** `src/modules/summary/summary.repository.js`

**Why:** `SELECT ... FOR UPDATE` only locks an existing row. On first run for a new group, the row doesn't exist — two concurrent transactions both passed the lock and raced to write.

**What was done:**
- Added `INSERT IGNORE INTO processing_logs ... VALUES (?)` before the `SELECT FOR UPDATE` in both `saveSummaryAndAdvanceCursor` and `saveGroupedSummaries`.
- `INSERT IGNORE` is atomic — only one transaction inserts; the other silently skips. Both then hit the `FOR UPDATE` on a guaranteed-existing row.
- Removed the post-transaction `findOneBy` + if/else branch — after `INSERT IGNORE` the row always exists, so just update it directly.

---

### [C4] Image Size Guard Before Base64 Decode
**Files changed:** `src/modules/image/image.storage.js`

**Why:** `saveImageFromDataUrl` decoded any base64 blob into a `Buffer` with no size check. A 20 MB image = 27 MB base64 string = memory spike on every message with a large attachment.

**What was done:**
- Added `IMAGE_MAX_BYTES` constant (default 10 MB, configurable via `IMAGE_MAX_BYTES` env).
- Approximates decoded size as `base64.length * 0.75` — fast, no Buffer allocation needed.
- Throws a descriptive error before any disk I/O if the limit is exceeded.

---

## PHASE 2 — HIGH PRIORITY (5 fixes)

### [H1] Gemini Retry Wall-Clock Cap
**Files changed:** `src/modules/ai/retry.js`

**Why:** With exponential backoff, setting `GEMINI_MAX_RETRIES=10` by mistake produces a 511-second wait. A hard deadline prevents runaway retry loops regardless of the env var value.

**What was done:**
- Added `maxTotalMs` parameter to `withRetry()` (default 30 seconds).
- Before each retry, checks `deadline - Date.now()`. If ≤ 0, logs a clear deadline-exceeded warning and breaks.
- Caps each individual sleep to the remaining time so the last retry doesn't overshoot the deadline.

---

### [H2] Message Body Size Validation
**Files changed:** `src/modules/message/message.validator.js`

**Why:** The validator checked field presence but not size. An unbounded `message` or `image_url` field could write arbitrary-size data to the DB `longtext` column.

**What was done:**
- Added: `message` field must be ≤ 10,000 characters.
- Added: `image_url` field must be ≤ 50 MB (matches Express body-parser limit).
- Both checks run only when the field is present and non-empty.

---

### [H3] Structured Critical Log for AI Audit Trail Gaps
**Files changed:** `src/modules/ai/ai.service.js`

**Why:** `saveAiLog` failure was caught and logged with a bare `console.error`. If the DB went down, the audit trail had silent gaps with no way to detect them via log search.

**What was done:**
- Tagged the error line with `[CRITICAL] [AiLog] Audit trail gap —` prefix.
- Includes action type and group name in the message.
- Any log aggregator or `grep CRITICAL` search will now surface these gaps immediately.

---

### [H4] Cursor-Based Pagination (replaces OFFSET)
**Files changed:** `src/modules/message/message.service.js`

**Why:** `OFFSET`-based pagination causes MySQL to scan and discard all rows before the offset. At page 1000 × limit 50 = 49,950 rows discarded per request.

**What was done:**
- Added cursor mode: pass `cursor_id` + `cursor_time` from the last row returned.
- Uses `WHERE (message_time < :ct OR (message_time = :ct AND id < :cid))` — MySQL hits the `(group_name, message_time)` index directly.
- Old `page`-based mode kept as fallback for backward compatibility with existing frontend hooks.
- Both modes now return `nextCursorId` + `nextCursorTime` so callers can upgrade to cursor mode.

---

### [H5] Per-Group Browser Crash Recovery in Scraper
**Files changed:** `src/cron/scraperJob.js`

**Why:** If `openGroupPage()` or `scrapeAndSend()` threw for one group, the exception propagated to the outer `finally`, closing the entire session and skipping all remaining groups for that tick.

**What was done:**
- Wrapped each group iteration in a two-attempt pattern: on first failure, close the bad tab, open a fresh one, and retry once.
- Only the failing group's second attempt can fail — other groups continue unaffected.
- Logs clearly distinguish first-attempt failure, successful recovery, and unrecoverable skip.

---

## PHASE 3 — MEDIUM PRIORITY (7 fixes)

### [M1] Dedup Cursor Timestamp Validation
**Files changed:** `src/scraper/scraper.dedup.js`

**Why:** `markSent()` used `m.timestamp` without checking if it existed. A missing timestamp corrupted the cursor to `""`, causing the next tick to re-scrape the entire group history.

**What was done:**
- `markSent()` now checks each message's `timestamp` before using it.
- Missing/non-string timestamps: logs a `[Dedup]` warning, adds the fingerprint to `seen`, but skips that entry for cursor advancement.
- Cursor only advances if at least one valid timestamp was found in the batch.

---

### [M2] Image Storage EEXIST Race Condition Fix
**Files changed:** `src/modules/image/image.storage.js`

**Why:** Two simultaneous requests for the same image MD5 could race on `writeFile`. One catches `EEXIST` and silently continues — but if the winner had a partial write (process crash mid-write), the file could be unreadable.

**What was done:**
- Imported `access` and `constants` from `fs/promises` and `fs`.
- After catching `EEXIST`, calls `access(filepath, constants.R_OK)` to verify the file is actually readable.
- If not readable, re-throws with a descriptive error so the caller knows to retry.

---

### [M3] Real Error Messages in Frontend API Client
**Files changed:** `client/src/api/client.js`

**Why:** All failed API calls showed a generic `"API error 404: /messages"` message. Users couldn't tell if the server was down, the request was invalid, or auth failed.

**What was done:**
- `request()` now parses the response JSON on error and surfaces `body.message || body.error` first.
- `triggerSummary()` same fix — parses body before falling back to `"Trigger failed (status)"`.
- All POST calls now also include the auth header consistently.

---

### [M4] Remove `message_type` from Accepted POST Body
**Files changed:** `src/modules/message/message.validator.js`

**Why:** The service always derives `message_type` server-side, but the validator also accepted it from the client. A caller could POST `message_type: "image"` with only text and store an inconsistent row.

**What was done:**
- Removed the `message_type` validation block entirely.
- Added a comment explaining that `message_type` is intentionally server-derived only.

---

### [M5] JSON Parser 512 KB Size Guard
**Files changed:** `src/modules/ai/json.parser.js`

**Why:** The fallback `slice(start, end+1)` path ran synchronously on whatever string the model returned. A multi-MB hallucinated response blocked the event loop during parsing.

**What was done:**
- Added `MAX_RESPONSE_BYTES = 512 KB` constant at the top of `parseJSON()`.
- Uses `Buffer.byteLength(rawText, 'utf8')` — accurate for multi-byte characters, no string copy.
- Throws immediately with a clear size-exceeded message before any `JSON.parse` attempt.

---

### [M6] Deleted Dead Code
**Files deleted:** `src/controllers/userController.js`, `src/services/userService.js`, `src/routes/userRoutes.js`  
**Files changed:** `src/app.js`

**Why:** All three files were defined but never wired to an active endpoint. Dead code misleads future developers and adds unused import surface.

**What was done:**
- Deleted `userController.js`, `userService.js`, `userRoutes.js`.
- Removed the `userRoutes` import and `app.use('/api/users', userRoutes)` mount from `app.js`.

---

### [M7] Weekly ai_logs Cleanup Cron
**Files changed:** `src/cron/cleanupJob.js` (new), `server.js`

**Why:** `ai_logs` stores full message content + full AI response for every action call. No cleanup meant unbounded table growth and eventual query slowdown.

**What was done:**
- Created `src/cron/cleanupJob.js` — runs every Sunday at 02:00 UTC.
- Deletes all `ai_logs` rows where `created_at < NOW() - RETENTION_DAYS`.
- `AI_LOG_RETENTION_DAYS` env var controls retention (default 90 days, minimum 1).
- Wired into `server.js` alongside the existing summary and scraper jobs.

---

## PHASE 4 — CODE QUALITY (2 fixes)

### [L3] Central ApiError Class
**Files changed:** `src/errors/ApiError.js` (new), `src/app.js`

**Why:** Controllers returned inconsistent error shapes — some `{ error: ... }`, some `{ message: ... }`, some called `next(err)`, others returned inline. No single pattern.

**What was done:**
- Created `src/errors/ApiError.js` with `new ApiError(status, message, extraFields)`.
- Global handler in `app.js` checks `err instanceof ApiError` first and returns a consistent `{ success: false, message, ...extra }` shape.
- All future controllers can `throw new ApiError(400, 'reason')` instead of building inline responses.

---

### [L7] Frontend API Base URL from Environment
**Files changed:** `client/src/api/client.js`, `client/.env.example` (new)

**Why:** The API base was hardcoded to `"/api"` (relative). When the frontend is deployed separately from the backend, this breaks silently.

**What was done:**
- `BASE` is now `${VITE_API_URL}/api` when `VITE_API_URL` is set, falling back to `"/api"` for the Vite dev-proxy case.
- `client/.env.example` documents both `VITE_API_URL` and `VITE_API_TOKEN`.

---

## FILES CHANGED SUMMARY

| File | Change type |
|------|-------------|
| `src/middleware/auth.js` | **New** — Bearer-token auth middleware |
| `src/errors/ApiError.js` | **New** — Central structured error class |
| `src/cron/cleanupJob.js` | **New** — Weekly ai_logs cleanup cron |
| `client/.env.example` | **New** — Frontend env documentation |
| `src/app.js` | Modified — rate limiter, auth, ApiError handler, removed userRoutes |
| `src/modules/ai/retry.js` | Modified — wall-clock deadline cap |
| `src/modules/ai/ai.service.js` | Modified — CRITICAL-tagged log on audit gap |
| `src/modules/ai/json.parser.js` | Modified — 512 KB size guard |
| `src/modules/image/image.storage.js` | Modified — size guard + EEXIST readability check |
| `src/modules/message/message.service.js` | Modified — cursor-based pagination |
| `src/modules/message/message.validator.js` | Modified — size limits, removed message_type |
| `src/modules/summary/summary.repository.js` | Modified — INSERT IGNORE before FOR UPDATE |
| `src/scraper/message.client.js` | Modified — sends auth header on internal calls |
| `src/scraper/scraper.dedup.js` | Modified — timestamp guard in markSent |
| `src/cron/scraperJob.js` | Modified — per-group crash recovery retry |
| `server.js` | Modified — wires cleanupJob |
| `.env.example` | Modified — ADMIN_TOKEN added, real API key scrubbed |
| `src/controllers/userController.js` | **Deleted** — dead code |
| `src/services/userService.js` | **Deleted** — dead code |
| `src/routes/userRoutes.js` | **Deleted** — dead code |

---

## ENVIRONMENT VARIABLES ADDED

Add these to your `.env` to enable the new features:

```env
# Auth (leave empty to disable in local dev)
ADMIN_TOKEN=your-strong-random-token

# Image size limit in bytes (default: 10 MB)
IMAGE_MAX_BYTES=10485760

# AI log retention in days (default: 90)
AI_LOG_RETENTION_DAYS=90
```

Add these to `client/.env`:

```env
# Leave blank when using Vite dev proxy
VITE_API_URL=

# Must match ADMIN_TOKEN on the server
VITE_API_TOKEN=your-strong-random-token
```

---

*Generated 2026-04-14*
