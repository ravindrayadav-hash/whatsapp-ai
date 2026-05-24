# Daily Status Feature — Complete Implementation Guide

## What This Feature Does

At a scheduled time every night, the system automatically:
1. **Sends a reminder** to the WhatsApp group asking team members to share their daily updates
2. **Waits** for team members to reply (10 minutes)
3. **Reads all replies** from the database (already saved by the existing scraper)
4. **Combines all messages** per user into one formatted block
5. **Posts the combined summary** back to the group

### Expected Output Format

```
ANUP:-
• AUT-2982 Create & Enrich Data Models for Vehicle
• AUT-2999 Add Campaigned Vehicle Stats to Dashboard

SHIVANSH:-
Today's Update:
1. Verifying AUT-37,53,50 edge cases
2. Verifying AUT-3000
```

---

## Current Schedule (in .env)

| Time (IST) | Phase | Action |
|---|---|---|
| 1:05 AM | Reminder | Send reminder message to group |
| 1:15 AM | Read | Read all messages from DB |
| 1:20 AM | Send | Post combined summary to group |
| 1:04–1:24 AM | Skip window | Scraper pauses so it doesn't block |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        server.js                            │
│  Starts all cron jobs after DB connects                     │
└────────┬──────────────┬──────────────┬──────────────────────┘
         │              │              │
         ▼              ▼              ▼
   scraperJob.js  summaryJob.js  readAndSendJob.js  ← NEW
   (every 5 min)  (every 15 min) (3 tasks at fixed times)
         │                              │
         ▼                              ▼
   Reads WA Web              Phase 1: Send reminder via WA Web
   saves to DB               Phase 2: Read DB (no browser needed)
                              Phase 3: Send summary via WA Web
         │                              │
         └──────────────┬───────────────┘
                        ▼
                  browser.lock.js
                  (mutex — only one job
                   can open Chrome at a time)
```

### Key Rule
The scraper and the sender **cannot both have Chrome open at the same time**. `browser.lock.js` is a shared mutex that makes them take turns. The skip window (`01:04–01:24`) prevents the scraper from starting new ticks during the send window.

---

## Files Created / Modified

### New Files

| File | Purpose |
|---|---|
| `src/cron/readAndSendJob.js` | The 3-phase daily status cron |
| `src/scraper/whatsapp.sender.js` | Opens WA group and types a message |
| `src/scraper/browser.lock.js` | Shared mutex for Chrome access |
| `src/entities/DailyStatusSession.js` | DB table for tracking sessions |
| `src/modules/daily-status/` | REST API: GET session history, POST trigger |

### Modified Files

| File | What Changed |
|---|---|
| `src/cron/scraperJob.js` | Added skip window check + browser lock |
| `src/config/database.js` | Registered new entity |
| `src/app.js` | Registered `/api/daily-status` routes |
| `server.js` | Starts `readAndSendJob` |

---

## Why It Is Not Working — Root Cause Analysis

### The Core Problem

The sender (`whatsapp.sender.js`) needs to **launch a NEW Chrome window** to send messages. But Chrome has a hard rule: **only one process can use a profile directory at a time**.

The existing scraper ALSO uses `WA_SESSION_DIR` (the same Chrome profile). So there are TWO scenarios where the send fails:

#### Scenario A — Scraper is still running when sender fires
```
01:00 AM  Scraper starts → Chrome opens with WA_SESSION_DIR
01:05 AM  Sender fires → tries to open Chrome with SAME WA_SESSION_DIR
          → Chrome REFUSES (profile already locked by scraper)
          → Error: "Could not create user data directory"
```
**Fix applied:** browser.lock.js (mutex) + skip window (01:04–01:24)
**Status:** ✅ Fixed in code, needs server restart to take effect

#### Scenario B — WA Web Session Expired
```
Sender launches Chrome → Chrome opens → navigates to web.whatsapp.com
→ Shows QR code (session expired)
→ No one scans it → times out → no message sent
```
**How to check:** Run `node server.js` and watch for `[WA] QR code detected`
**Fix:** Scan the QR code from the Playwright browser window (WA_HEADLESS=false so you can see it)

#### Scenario C — Group Not Found in Search
```
Sender searches for "whatsapp ai" → WA returns no results
→ throws "Group not found" error
→ message never sent
```
**How to check:** Server logs show `[Sender] Group not found in WA search: "whatsapp ai"`
**Fix:** Check the exact group name — open WhatsApp Web manually, search for the group, copy the EXACT name into `READ_SEND_GROUP` in `.env`

#### Scenario D — Compose Box Selector Changed
```
Sender opens group → chat is visible → can't find the text input box
→ throws "Compose box not found"
→ message never sent
```
WhatsApp Web updates its HTML structure frequently.
**How to check:** Logs show `[Sender] Compose box not found (page: "WhatsApp")`
**Fix:** See "How to find the correct compose box selector" below

---

## How to Test RIGHT NOW (Without Waiting for 1:05 AM)

### Step 1 — Use the manual trigger endpoint

```bash
curl -X POST http://localhost:3002/api/daily-status/trigger-send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"message": "test hello from API"}'
```

Watch the server logs. You will see one of these:

**Success:**
```
[BrowserLock] Acquired by "TriggerSend"
[Sender] Searching for group: "whatsapp ai"
[Sender] Compose box: div[contenteditable="true"][data-tab="10"]
[Sender] ✓ Delivered to "whatsapp ai"
```

**Group not found:**
```
[Sender] Group not found in WA search: "whatsapp ai"
```
→ Fix: check the exact group name spelling in .env

**Compose box not found:**
```
[Sender] Compose box not found (page: "WhatsApp")
```
→ Fix: update COMPOSE_BOX selector (see below)

**QR code:**
```
[WA] QR code detected — scan with your phone to log in...
```
→ Fix: scan QR in the browser window that pops up

---

## How to Find the Correct Compose Box Selector

1. Open Chrome and go to `web.whatsapp.com`
2. Open any group chat
3. Right-click the text input box → **Inspect**
4. In DevTools, look at the element. It will be something like:
   ```html
   <div contenteditable="true" data-tab="10" ...>
   ```
5. Copy the unique attribute (e.g. `data-tab="10"` or `data-testid="conversation-compose-box-input"`)
6. Add it to the `candidates` array at the top of `src/scraper/whatsapp.sender.js`

---

## Environment Variables Reference

```ini
# ── Read-and-Send Job ──────────────────────────────────────────────────────────
READ_SEND_ENABLED=true

# EXACT group name as shown in WhatsApp Web sidebar
READ_SEND_GROUP=whatsapp ai

READ_SEND_TIMEZONE=Asia/Kolkata

# Cron times (24-hour, in READ_SEND_TIMEZONE)
READ_SEND_REMINDER_CRON=5 1 * * *    # 1:05 AM — send reminder
READ_SEND_READ_CRON=15 1 * * *       # 1:15 AM — read DB
READ_SEND_SEND_CRON=20 1 * * *       # 1:20 AM — post summary

# How many hours back to collect messages (covers the full working day)
READ_SEND_WINDOW_HOURS=15

# The reminder message sent to the group at 1:05 AM
READ_SEND_REMINDER_TEXT=🔔 Daily Status Time! Please share your updates for today.

# ── Scraper skip window ────────────────────────────────────────────────────────
# Scraper pauses during this window so it doesn't block the sender
SCRAPER_SKIP_FROM=01:04
SCRAPER_SKIP_TO=01:24
SCRAPER_SKIP_TZ=Asia/Kolkata
```

---

## What Still Needs to Happen for This to Work

### Must Do — Before Tonight

1. **Restart the server**
   All fixes (5-min lock timeout, skip window, group name from env) are in the code but the old version is still running in memory.
   ```bash
   # Stop current process (Ctrl+C) then:
   node server.js
   ```

2. **Verify the group name**
   Open Chrome → `web.whatsapp.com` → search for your group → copy the **exact name** shown in the sidebar → paste into `READ_SEND_GROUP` in `.env`.
   Currently set to: `whatsapp ai`

3. **Test with the trigger endpoint** (Step 1 in testing section above)
   Do this BEFORE tonight so you know it works.

4. **Check WA session is active**
   The scraper is already running and reading messages → session is active.
   If you see a QR code in the logs or browser, scan it.

### Nice to Have

- [ ] Add a frontend page showing daily status session history (`GET /api/daily-status`)
- [ ] Add retry logic if the summary send fails (currently logs error but doesn't retry)
- [ ] Store the combined summary in DB so it can be re-sent if Chrome crashes at 1:20 AM

---

## Complete Flow Diagram

```
10:00 PM onwards
  Team members send their daily updates to "whatsapp ai" group in WhatsApp
        ↓
Every 5 min (pauses 01:04–01:24)
  Scraper reads WA Web → saves all messages to `messages` table in MySQL
        ↓
1:05 AM  [readAndSendJob — Phase 1: REMINDER]
  Playwright opens Chrome → navigates to "whatsapp ai" group
  Types reminder message → presses Send button
  Chrome closes
        ↓
  Team has 10 minutes to send their updates
        ↓
1:15 AM  [readAndSendJob — Phase 2: READ]
  No Chrome needed — just a database query
  SELECT messages WHERE group_name='whatsapp ai' AND message_time >= (now - 15h)
  Groups messages by sender → merges into one block per person
  Stores formatted text in memory
        ↓
1:20 AM  [readAndSendJob — Phase 3: SEND]
  Playwright opens Chrome → navigates to "whatsapp ai" group
  Types the formatted combined summary → presses Send button
  Chrome closes
        ↓
Group sees the combined summary message
```
