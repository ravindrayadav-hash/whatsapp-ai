# WhatsApp AI — Project Analysis & Roadmap

> **Project:** WhatsApp message scraping, AI summarization, and group analytics platform  
> **Stack:** Node.js + Express + TypeORM + MySQL + Playwright + Gemini AI + React (Vite)  
> **Analysis Date:** 2026-04-14

---

## PART 1: NEW FEATURES TO ADD (User-Friendly Improvements)

These features are designed to make WhatsApp group management easier, help teams track tasks and requirements, and give users more control over how AI processes their data.

---

### 1.1 Task & Requirement Tracker

**Problem:** Summaries currently output requirements, issues, and action items as JSON blobs with no way to track their lifecycle.

**What to Add:**

- A dedicated **Tasks Board** (Kanban-style: `Pending → In Progress → Done`) where each action item from a summary becomes a trackable card.
- Each task card should show:
  - Source group and originating message(s)
  - Who it was assigned to (sender name from WhatsApp)
  - AI-generated due date (if mentioned in conversation)
  - Current status with one-click status change
  - Link back to the original messages it came from
- Filter tasks by group, assignee, status, and date range.
- Export tasks as CSV or copy to clipboard as a formatted list.

**Why This Matters:**  
Right now you get AI output but have no way to act on it. This converts passive summaries into actionable project management.

---

### 1.2 Group Health Dashboard

**Problem:** No way to see at a glance which groups are active, which have unresolved issues, or which are overdue for a summary.

**What to Add:**

- A single-page **Group Dashboard** showing each WhatsApp group as a card with:
  - Last message time and message count (last 24h / 7d)
  - Last summary time and whether there are unprocessed messages
  - Count of open vs. closed tasks extracted from that group
  - "Process Now" button to trigger an on-demand AI summary without waiting for cron
  - Color-coded health indicator: green (up to date), yellow (messages pending), red (scraper failing or no activity)
- Clickable group cards that deep-link to filtered views of messages, summaries, and tasks for that group.

**Why This Matters:**  
Currently users have to navigate to multiple pages to understand a group's status. This consolidates everything into one view.

---

### 1.3 Requirement Tracker with Status & Ownership

**Problem:** Requirements extracted by AI are stored but never tracked for completion.

**What to Add:**

- A **Requirements Register** page listing all AI-extracted requirements across groups.
- Each requirement row should support:
  - Status: `Open | In Review | Approved | Closed`
  - Owner: text field (or linked to sender)
  - Priority: `High / Medium / Low` (user-assignable)
  - Notes field for additional context
  - Source group + date it was extracted
- Inline editing — click a cell to edit without opening a modal.
- Bulk actions: mark multiple requirements as closed, export filtered view.

**Why This Matters:**  
Converts AI-extracted requirements into a living requirements document your team can actually manage.

---

### 1.4 Live Activity Feed

**Problem:** Users don't know when new messages arrive or when a summary is ready without manually refreshing.

**What to Add:**

- A **live notification strip** at the top of the UI that shows:
  - "X new messages in [Group Name] — Summarize Now"
  - "Summary ready for [Group Name]"
  - "Scraper failed for [Group Name] at HH:MM"
- Badge counts on the sidebar for each group showing unread/unsummarized message counts.
- Optional browser desktop notifications (permission-based).
- Backend: a lightweight `/api/events` SSE (Server-Sent Events) endpoint that pushes updates when cron jobs finish.

**Why This Matters:**  
Currently users have to manually poll. SSE is cheap to implement and eliminates the need for manual refresh.

---

### 1.5 Conversation Search & Filter Upgrade

**Problem:** Current message filter only supports group, sender, and time range. Can't search by keyword.

**What to Add:**

- **Full-text keyword search** across messages with highlighted matches in results.
- **Message type filter**: text only, image only, mixed.
- **Sender multi-select**: filter by multiple senders at once.
- **Date presets**: Today, Yesterday, Last 7 days, Last 30 days — instead of only custom date pickers.
- **Save filters**: let users bookmark a filter combination and recall it by name.
- Search results show surrounding context (3 messages before/after match).

**Why This Matters:**  
Power users need to find specific discussions fast. Keyword search is the most requested feature for chat analytics tools.

---

### 1.6 AI Chat with Group Context

**Problem:** Current AI actions work on a fixed 15-message window with no conversation-style interface.

**What to Add:**

- A **Chat with Group** page where the user can type free-form questions and the AI responds using the group's full message history as context:
  - "What did the team decide about the API deadline?"
  - "List all issues raised this week"
  - "Who has not responded to the deployment task?"
- The chat persists in session (not saved to DB by default, opt-in to save).
- Show which messages the AI referenced (source citations with timestamps).
- Support follow-up questions that reference prior AI answers within the same session.

**Why This Matters:**  
Makes the AI useful for ad-hoc queries, not just scheduled summaries. This is the highest-value UX upgrade.

---

### 1.7 Scheduled Report Delivery

**Problem:** Summaries exist only inside the app. Teams want to receive them via email or WhatsApp itself.

**What to Add:**

- **Report Scheduler** — configure per-group daily/weekly digests:
  - Email delivery (SMTP): formatted HTML email with summary, tasks, requirements
  - WhatsApp reply (via WA Web automation): post the AI summary back into the same group as a formatted text
  - Slack webhook (optional): post to a configured channel
- Each report shows: topic groups, new requirements, open tasks, unresolved issues.
- One-click "Send Report Now" from the Group Dashboard for ad-hoc delivery.

**Why This Matters:**  
Closes the loop — teams that generate a summary in this tool shouldn't need to copy-paste it elsewhere.

---

### 1.8 Participant Contribution Analytics

**Problem:** No way to see who is contributing to discussions vs. who is silent.

**What to Add:**

- A **Participant Analytics** tab per group showing:
  - Message count per sender (bar chart)
  - Most active hours of the day (heatmap by hour)
  - Topics each sender discussed most (AI-labeled)
  - Response time: average delay between someone's message and a reply
  - Image vs. text ratio per sender
- Time-range selector (last 7/30/90 days).
- Export chart data as CSV.

**Why This Matters:**  
Project managers often need to know who is engaged in a group vs. who needs follow-up.

---

### 1.9 Summary Comparison View

**Problem:** Users can't see how a group's topics have evolved between two summary periods.

**What to Add:**

- **Summary Diff** — select two summaries for the same group and see:
  - Topics that appeared in both (ongoing)
  - New topics since the last summary
  - Topics that disappeared (resolved or dropped)
  - Requirements added vs. closed between the two periods
- Side-by-side layout with color-coded diff (green = new, red = removed, yellow = changed).

**Why This Matters:**  
Helps PMs track progress week-over-week without reading every message.

---

### 1.10 User Preferences & Settings Page

**Problem:** No way for users to customize behavior without editing `.env` files.

**What to Add:**

- A **Settings page** in the UI with:
  - Toggle cron jobs on/off (scraper and summary jobs)
  - Configure scrape interval (every 5/10/15/30 minutes)
  - Set summary chunk size (default 150 messages)
  - Choose AI model (if multiple are configured)
  - Configure notification preferences (email, browser)
  - Per-group enable/disable scraping
  - Theme toggle (light/dark mode)
- Changes persist to a `settings` DB table so they survive server restarts.
- No server restart needed — settings applied on next cron tick.

**Why This Matters:**  
Non-technical users can't edit `.env` files. A settings UI makes the tool self-service.

---

## PART 2: BUGS & ISSUES TO FIX IN EXISTING PROJECT

Issues are ranked by severity: Critical → High → Medium → Low.

---

### 2.1 CRITICAL

#### [C1] No Authentication — All API Routes Are Public
- **Files:** `src/app.js`, all route files
- **Problem:** Any client with the server URL can read all messages, trigger AI, and query AI history. There is zero authentication.
- **Fix:** Add JWT middleware. Protect all `/api/*` routes. Add a login endpoint (`POST /api/auth/login`) with a single admin token stored in env. Apply `authMiddleware` globally in `app.js`.

#### [C2] No Rate Limiting
- **Files:** `src/app.js`
- **Problem:** A single client can spam `/api/ai/action` and exhaust the entire Gemini API quota in seconds.
- **Fix:** Add `express-rate-limit`. Apply a global limit (e.g. 100 req/15min) and a stricter limit on AI endpoints (e.g. 10 req/min per IP).

#### [C3] Race Condition in Processing Lock
- **File:** `src/modules/summary/summary.repository.js`
- **Problem:** `SELECT ... FOR UPDATE` on `processing_logs` only works if a row already exists. On first call for a new group, two concurrent processes both pass the lock check simultaneously.
- **Fix:** Use `INSERT INTO processing_logs ... ON DUPLICATE KEY UPDATE` to ensure the row exists before attempting `FOR UPDATE`.

#### [C4] Unvalidated Image Size in Scraper
- **File:** `src/scraper/whatsapp.parser.js`
- **Problem:** Images are converted to base64 with no size check. A large image message could cause the Node.js process to run out of memory.
- **Fix:** Add a size check on the blob before `readAsDataURL`. Reject images larger than a configurable limit (e.g. 5MB).

---

### 2.2 HIGH PRIORITY

#### [H1] Gemini Infinite Retry on Permanent Quota Exhaustion
- **File:** `src/modules/ai/gemini.service.js`
- **Problem:** Retry logic retries on every 429 response. If the API key is permanently over quota, the retry loop hangs the request indefinitely.
- **Fix:** Track total time elapsed. After `maxRetries` attempts with a combined wait exceeding `maxRetryMs`, throw a permanent error instead of retrying.

#### [H2] No Input Validation on Message Body Size
- **File:** `src/modules/message/message.validator.js`
- **Problem:** The `message` field and `image_url` (longtext) have no server-side size limits. Requests with huge payloads bypass Express body size limits if the content is pre-encoded.
- **Fix:** Add a Joi/zod rule capping `message` at 10KB and `image_url` base64 at 50MB.

#### [H3] Silent saveAiLog Failures
- **File:** `src/modules/ai/ai.service.js`
- **Problem:** `saveAiLog()` failures are caught and silently logged. If the DB is down, the audit trail has gaps with no alert.
- **Fix:** At minimum, emit a structured error log with a `CRITICAL` tag. Ideally, queue failed log writes and retry.

#### [H4] Large Offset Queries (Slow Pagination)
- **File:** `src/modules/message/message.service.js`
- **Problem:** `(page - 1) * limit` can produce very large MySQL offsets (e.g. page 1000 × limit 500 = offset 499,500). MySQL full-scans to that row.
- **Fix:** Switch to cursor-based pagination using `message_time` and `id` as cursors instead of page/offset.

#### [H5] Browser Crash Does Not Recover Per-Group
- **File:** `src/scraper/whatsapp.session.js`
- **Problem:** If Playwright crashes mid-scrape, the entire session fails and all remaining groups in that tick are skipped.
- **Fix:** Wrap each group's scrape in a try/catch that attempts to relaunch just the browser page (not the entire session) before giving up.

---

### 2.3 MEDIUM PRIORITY

#### [M1] Scraper Dedup Cursor Silently Fails on Missing Timestamp
- **File:** `src/scraper/scraper.dedup.js`
- **Problem:** `markSent()` reads `message.timestamp` to advance the cursor. If `timestamp` is undefined (malformed message), the cursor silently stays at the old value, causing all messages to be re-scraped next tick.
- **Fix:** Add an explicit assertion. Log a warning and skip the message rather than silently corrupting the cursor.

#### [M2] Image Storage Race Condition (Flag `wx`)
- **File:** `src/modules/image/image.storage.js`
- **Problem:** Two simultaneous requests for the same image MD5 both try `fs.writeFile` with `wx` flag. One fails silently. The image may not be saved.
- **Fix:** After catching the `EEXIST` error, verify the file actually exists and is readable before continuing. Log a warning if it is not.

#### [M3] Frontend Displays Generic Error Messages
- **File:** `client/src/api/client.js`
- **Problem:** When an API call fails, the UI shows `'AI request failed'` with no detail. Users can't tell if the server is down, the AI failed, or their input was invalid.
- **Fix:** Parse the `error` and `message` fields from the JSON response body and surface them in the UI. Add an error toast component.

#### [M4] Message Type Derived AND Accepted from Request (Inconsistency)
- **File:** `src/modules/message/message.service.js`
- **Problem:** `message_type` is auto-derived from `message` + `image_url` presence, but the validator also allows the client to submit it explicitly. This can cause DB inconsistency.
- **Fix:** Always derive `message_type` server-side. Remove it from the accepted POST body fields.

#### [M5] Gemini JSON Parser Runs on Unbounded Response Size
- **File:** `src/modules/ai/json.parser.js`
- **Problem:** Fallback JSON extraction (`slice(start, end+1)`) runs on whatever size string the model returns. A 1MB response causes noticeable lag.
- **Fix:** Add a size guard — if the response is above a limit (e.g. 512KB), reject it immediately rather than parsing.

#### [M6] Unused Code — userController and userService
- **Files:** `src/controllers/userController.js`, `src/services/userService.js`
- **Problem:** Both files are defined but no routes expose them. Dead code that adds confusion.
- **Fix:** Either wire them up to real routes (e.g. manage scraper group configs) or delete them.

#### [M7] No Cleanup Job for Old Processing Logs and AI Logs
- **Files:** Database — `processing_logs`, `ai_logs` tables
- **Problem:** Both tables grow unbounded. `ai_logs` in particular can grow very large since every AI call is logged with full message content.
- **Fix:** Add a weekly cleanup cron job that deletes `ai_logs` older than 90 days and archives `processing_logs` for inactive groups.

---

### 2.4 LOW PRIORITY / CODE QUALITY

#### [L1] Magic Numbers Not Configurable
- **Files:** `src/scraper/whatsapp.scraper.js` and others
- **Problem:** `250px`, `900ms`, `5 stable rounds`, `15 context window` are hard-coded constants scattered through the code.
- **Fix:** Move all tuning parameters to `.env` with descriptive names and documented defaults.

#### [L2] No Structured Logging
- **Files:** All backend files
- **Problem:** All logging uses `console.log/error`. No log levels, no JSON format, no way to filter by severity.
- **Fix:** Replace `console.*` with `winston` or `pino`. Add log levels (`info`, `warn`, `error`, `debug`). Use JSON format in production.

#### [L3] Inconsistent Error Handling Across Controllers
- **Files:** All `*.controller.js` files
- **Problem:** Some controllers return `res.status(400).json(...)` inline, others call `next(err)`. Error shapes differ (some have `error:`, some have `message:`).
- **Fix:** Create a central `ApiError` class and a global error handler middleware in `app.js`. All controllers throw `ApiError` instances.

#### [L4] No Dark Mode
- **Files:** `client/src/styles/global.css`
- **Problem:** UI is light-mode only. Users working at night or in dark IDEs will find it jarring.
- **Fix:** Add a CSS `prefers-color-scheme` media query with dark variables. Add a manual toggle that persists to `localStorage`.

#### [L5] No Loading Skeletons on Initial Page Load
- **Files:** All `client/src/pages/*.jsx`
- **Problem:** Pages show a blank white area while data loads. No visual feedback.
- **Fix:** Add skeleton placeholder components (grey shimmer blocks) that display while `useFetch` is in loading state.

#### [L6] No Favicon or App Title
- **Files:** `client/index.html`
- **Problem:** Browser tab shows default Vite icon and title.
- **Fix:** Add a favicon and set a meaningful `<title>` like "WhatsApp AI Dashboard".

#### [L7] Hard-Coded API Base URL in Frontend
- **File:** `client/src/api/client.js`
- **Problem:** API base URL defaults to `localhost:3001`. In a deployed environment this breaks.
- **Fix:** Use Vite's `import.meta.env.VITE_API_URL` with a proper `.env` file for the client build.

#### [L8] Missing Pagination on AI History Page
- **File:** `client/src/pages/AIHistoryView.jsx`
- **Problem:** The AI History page fetches all records. As `ai_logs` grows this becomes a very large response.
- **Fix:** Implement the same infinite scroll pattern used in `MessagesView.jsx` using `useInfiniteMessages` or a similar hook.

#### [L9] Summary View Has No Empty State
- **File:** `client/src/pages/SummaryView.jsx`
- **Problem:** If no summaries exist for a group yet, the page renders nothing with no explanation.
- **Fix:** Add an empty state illustration/message: "No summaries yet. Click 'Process Now' to generate the first summary for this group."

#### [L10] No Mobile Responsive Layout
- **Files:** `client/src/styles/global.css`, all page components
- **Problem:** The layout uses fixed widths and is unusable on phones or tablets.
- **Fix:** Add a responsive breakpoint at 768px. Collapse the sidebar into a hamburger menu. Stack table columns on small screens.

---

## PART 3: QUICK WIN PRIORITY LIST

If you want to tackle the highest-impact improvements in order:

| Priority | Item | Type | Effort |
|----------|------|------|--------|
| 1 | Add JWT authentication to all routes | Fix | 1 day |
| 2 | Add rate limiting (express-rate-limit) | Fix | 2 hours |
| 3 | Task Tracker board from AI action items | Feature | 3 days |
| 4 | Group Health Dashboard with "Process Now" | Feature | 2 days |
| 5 | AI Chat with group context | Feature | 2 days |
| 6 | Full-text keyword search in messages | Feature | 1 day |
| 7 | Fix race condition in processing lock | Fix | 2 hours |
| 8 | Structured logging (winston/pino) | Fix | 4 hours |
| 9 | Live Activity Feed via SSE | Feature | 1 day |
| 10 | Fix generic error messages in frontend | Fix | 2 hours |
| 11 | Cursor-based pagination (replace offset) | Fix | 1 day |
| 12 | Settings page (control crons from UI) | Feature | 2 days |
| 13 | Scheduled Report Delivery (email/WA) | Feature | 3 days |
| 14 | Dark mode + responsive layout | Fix | 1 day |
| 15 | DB cleanup cron for ai_logs/processing_logs | Fix | 2 hours |

---

## PART 4: ARCHITECTURE NOTES

- The scraper and API server run in the same Node.js process. Under high load, a slow Playwright operation will block the event loop. **Consider moving the scraper to a separate worker process** communicating via the existing REST API.
- Gemini responses are stored in full in `ai_logs` (including all input messages). This is good for audit but will cause the table to grow very quickly. **Consider storing only metadata and a hash of the input**, storing full content in object storage (S3/GCS) separately.
- TypeORM `synchronize: true` is enabled in development. This is dangerous if connected to a production DB by accident. **Always gate `synchronize` behind `NODE_ENV === 'development'`** and use migrations for production.
- The frontend has no state management library (no Redux, Zustand, or Context). As features grow, prop drilling will become a problem. **Consider adding Zustand** for shared state (selected group, filter state, task board) before the codebase grows further.

---

*Generated by code analysis — 2026-04-14*
