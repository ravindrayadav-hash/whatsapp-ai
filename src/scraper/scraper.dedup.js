import { AppDataSource } from "../config/database.js";
import { Message } from "../entities/Message.js";

/**
 * Per-group deduplication tracker.
 *
 * Two-layer strategy:
 *  1. Cursor (timestamp) — queried directly from the DB at the start of each
 *     tick. This is the MAX(message_time) already persisted for the group.
 *     Bypasses the HTTP API so it works even before the API server is ready.
 *  2. Fingerprint Set — tracks messages sent in THIS process lifetime.
 *     Prevents re-sending within the same run if the scraper re-reads
 *     the same message before it's been reflected in the cursor.
 */

// group_name → ISO timestamp string (the latest message_time in DB for this group)
const cursors = new Map();

// Set of "group|timestamp|sender|message" fingerprints sent this session
const seen = new Set();

/**
 * Returns the current in-memory cursor for a group (undefined if not yet initialised).
 * @param {string} group_name
 * @returns {string | undefined}
 */
export function getCursor(group_name) {
  return cursors.get(group_name);
}

/**
 * Refreshes the cursor for a group by querying MAX(message_time) from the DB.
 * Called at the start of every scraper tick — no "once per process" guard —
 * so the cursor always reflects the latest persisted message before scraping.
 *
 * Falls back to epoch (new Date(0)) for new groups or if the DB is unreachable,
 * which causes the scraper to pull full history on the first successful tick.
 *
 * @param {string} group_name
 */
export async function initCursor(group_name) {
  try {
    const repo = AppDataSource.getRepository(Message);
    const row = await repo
      .createQueryBuilder("m")
      .select("MAX(m.message_time)", "latest")
      .where("m.group_name = :group_name", { group_name })
      .getRawOne();

    // row.latest is null for a new group (no rows yet) — fall back to epoch
    const latest = row?.latest
      ? new Date(row.latest).toISOString()
      : new Date(0).toISOString();
    cursors.set(group_name, latest);
    console.log(`[Dedup] Cursor refreshed for "${group_name}": ${latest}`);
  } catch (err) {
    // DB unreachable — keep existing cursor if we have one, else fall back to epoch
    if (!cursors.has(group_name)) {
      cursors.set(group_name, new Date(0).toISOString());
    }
    console.warn(
      `[Dedup] Could not refresh cursor for "${group_name}" (DB error): ${err.message}`,
    );
  }
}

/**
 * Returns only the messages that are new (not yet in the DB and not sent this session).
 * Also advances the in-memory cursor to the latest timestamp seen.
 *
 * @param {string} group_name
 * @param {Array<{ sender: string, message: string, timestamp: string }>} messages
 * @returns {Array<{ sender: string, message: string, timestamp: string }>}
 */
export function filterNew(group_name, messages) {
  const cursor = cursors.get(group_name) ?? new Date(0).toISOString();

  const fresh = messages.filter((msg) => {
    // 1. Timestamp must be strictly after the DB cursor
    if (msg.timestamp <= cursor) return false;

    // 2. Fingerprint must not have been sent this session
    const fp = fingerprint(group_name, msg);
    if (seen.has(fp)) return false;

    return true;
  });

  return fresh;
}

/**
 * Marks messages as sent — adds fingerprints to the seen set
 * and advances the cursor to the latest timestamp.
 * Call this AFTER successfully posting to the API.
 *
 * @param {string} group_name
 * @param {Array<{ sender: string, message: string, timestamp: string }>} messages
 */
export function markSent(group_name, messages) {
  if (messages.length === 0) return;

  let latest = "";

  for (const msg of messages) {
    // Guard: a missing or non-string timestamp would corrupt the cursor and
    // cause the next tick to re-scrape the entire group history.
    if (!msg.timestamp || typeof msg.timestamp !== "string") {
      console.warn(
        `[Dedup] markSent — message from "${msg.sender ?? "unknown"}" has no valid timestamp; skipping cursor update for this entry`,
      );
      seen.add(fingerprint(group_name, msg));
      continue;
    }

    seen.add(fingerprint(group_name, msg));
    if (msg.timestamp > latest) latest = msg.timestamp;
  }

  // Advance cursor only if we found at least one valid timestamp
  if (latest && latest > (cursors.get(group_name) ?? "")) {
    cursors.set(group_name, latest);
  }
}

function fingerprint(group_name, msg) {
  // For image-only messages msg.message is ''. Use a slice of base64 data
  // so two different images sent by the same person in the same minute
  // produce different fingerprints. If the blob expired (image null),
  // fall back to the '[Image]' sentinel — unlikely to cause collisions
  // in practice since same-person same-minute image dupes are rare.
  const textPart = (msg.message || "").slice(0, 80);
  const imgPart = msg.image_url ? msg.image_url.slice(22, 52) : ""; // skip "data:image/jpeg;base64,"
  const content = textPart || imgPart || "[Image]";
  return `${group_name}|${msg.timestamp}|${msg.sender}|${content}`;
}
