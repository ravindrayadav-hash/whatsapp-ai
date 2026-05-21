import { createHash } from "crypto";
import { AppDataSource } from "../../config/database.js";
import { Message } from "../../entities/Message.js";
import {
  isBase64DataUrl,
  saveImageFromDataUrl,
} from "../image/image.storage.js";

/**
 * Returns the TypeORM repository for Message.
 * Deferred so the DataSource is always initialized before use.
 */
const repo = () => AppDataSource.getRepository(Message);

/**
 * Persists a single message row.
 * @param {{ group_name: string, sender: string, message: string, message_time: string }} data
 * @returns {Promise<object>} Saved message entity
 */
/**
 * Derives message_type from the content present.
 * @param {string} message   caption / body text
 * @param {string|null} imageUrl
 * @returns {'text' | 'image' | 'mixed'}
 */
function resolveMessageType(message, imageUrl) {
  const hasText = message.length > 0;
  const hasImage = !!imageUrl;
  if (hasText && hasImage) return "mixed";
  if (hasImage) return "image";
  return "text";
}

export async function saveMessage(data) {
  const messageText = (data.message || "").trim();
  let imageUrl = data.image_url || null;

  // Hash strategy — must be computed from the original content BEFORE the
  // base64 data URL is replaced with a local file path, so that dedup remains
  // consistent across process restarts (same image → same hash every time).
  //
  //   text / caption  → MD5(text)
  //   image-only      → MD5(first 4 KB of base64 data URL) — distinguishes images
  //   (edge case)     → MD5('[empty]')
  const hashInput =
    messageText || (imageUrl ? imageUrl.slice(0, 4096) : "[empty]");
  const message_hash = createHash("md5").update(hashInput).digest("hex");

  // Save base64 image to local storage and replace data URL with a file path.
  // Skip if the URL is already a local path (e.g. re-processed row).
  if (isBase64DataUrl(imageUrl)) {
    imageUrl = await saveImageFromDataUrl(imageUrl);
  }

  const message_type = resolveMessageType(messageText, imageUrl);

  const result = await repo()
    .createQueryBuilder()
    .insert()
    .into(Message)
    .values({
      group_name: data.group_name.trim(),
      sender: data.sender.trim(),
      message: messageText,
      image_url: imageUrl,
      message_type,
      message_time: new Date(data.message_time),
      message_hash,
    })
    .orIgnore()
    .execute();

  // orIgnore() on a duplicate returns identifiers: [] — treat as duplicate
  if (!result.identifiers?.length) {
    const err = new Error("Duplicate message");
    err.code = "ER_DUP_ENTRY";
    throw err;
  }

  return { id: result.identifiers[0].id, ...data };
}

/**
 * Applies shared WHERE filters (time range + sender) to a query builder.
 * Kept as a helper so cursor mode and offset mode each use their own qb instance.
 */
function applyFilters(qb, { from, to, sender }) {
  if (from) qb.andWhere("m.message_time >= :from", { from: new Date(from) });
  if (to) qb.andWhere("m.message_time <= :to", { to: new Date(to) });

  if (sender) {
    const s = sender.trim();
    const firstName = s.split(" ")[0];
    qb.andWhere("(m.sender = :sender OR m.message LIKE :mention)", {
      sender: s,
      mention: `%@${firstName}%`,
    });
  }
}

/**
 * Fetches messages for a group with optional time-range filtering and pagination.
 *
 * Supports two pagination modes:
 *  1. Cursor-based — pass cursor_id + cursor_time from the last row returned.
 *     MySQL seeks directly using the (group_name, message_time) index; no OFFSET scan.
 *  2. Offset-based (default) — pass page number. Compatible with all existing
 *     frontend hooks without any changes.
 *
 * Each mode uses its own independent query builder so there is no shared state
 * and getManyAndCount() is never affected by cursor-mode WHERE conditions.
 *
 * @param {{ group_name, from?, to?, limit?, page?, order?, sender?,
 *            cursor_id?, cursor_time? }} filters
 * @returns {Promise<{ data, total, page, limit, hasMore, nextCursorId?, nextCursorTime? }>}
 */
export async function getMessagesByGroup({
  group_name,
  from,
  to,
  limit = 50,
  page = 1,
  order = "DESC",
  sender,
  cursor_id,
  cursor_time,
}) {
  const direction = order.toUpperCase() === "DESC" ? "DESC" : "ASC";
  const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 500); // clamp 1–500
  const groupTrimmed = group_name.trim();

  // ── Cursor mode ──────────────────────────────────────────────────────────────
  // Own query builder — completely isolated from offset mode.
  if (cursor_id && cursor_time) {
    const cursorDate = new Date(cursor_time);
    const cursorQb = repo()
      .createQueryBuilder("m")
      .where("m.group_name = :group_name", { group_name: groupTrimmed })
      .orderBy("m.message_time", direction)
      .addOrderBy("m.id", direction);

    applyFilters(cursorQb, { from, to, sender });

    if (direction === "DESC") {
      cursorQb.andWhere(
        "(m.message_time < :ct OR (m.message_time = :ct AND m.id < :cid))",
        { ct: cursorDate, cid: Number(cursor_id) },
      );
    } else {
      cursorQb.andWhere(
        "(m.message_time > :ct OR (m.message_time = :ct AND m.id > :cid))",
        { ct: cursorDate, cid: Number(cursor_id) },
      );
    }

    cursorQb.limit(pageSize);
    const data = await cursorQb.getMany();
    const last = data[data.length - 1];

    return {
      data,
      total: null, // not calculated in cursor mode (avoids a count query)
      page: null,
      limit: pageSize,
      hasMore: data.length === pageSize,
      nextCursorId: last?.id ?? null,
      nextCursorTime: last?.message_time ?? null,
    };
  }

  // ── Offset mode (default) ─────────────────────────────────────────────────────
  // Own query builder — no addOrderBy, no cursor conditions.
  // Identical behaviour to the original implementation.
  const pageNum = Math.max(Number(page) || 1, 1);
  const offset = (pageNum - 1) * pageSize;

  const offsetQb = repo()
    .createQueryBuilder("m")
    .where("m.group_name = :group_name", { group_name: groupTrimmed })
    .orderBy("m.message_time", direction);

  applyFilters(offsetQb, { from, to, sender });

  offsetQb.limit(pageSize).offset(offset);
  const [data, total] = await offsetQb.getManyAndCount();

  return {
    data,
    total,
    page: pageNum,
    limit: pageSize,
    hasMore: offset + data.length < total,
  };
}

/**
 * Returns distinct sender names for a group.
 * Used to populate the user filter dropdown.
 */
export async function getSendersByGroup(group_name) {
  const rows = await repo()
    .createQueryBuilder("m")
    .select("DISTINCT m.sender", "sender")
    .where("m.group_name = :group_name", { group_name: group_name.trim() })
    .orderBy("m.sender", "ASC")
    .getRawMany();
  return rows.map((r) => r.sender);
}

/**
 * Returns the oldest unprocessed message time for a group after a given cursor.
 * Useful for the AI summarization pipeline to know what to process next.
 * @param {string} group_name
 * @param {Date} after
 * @returns {Promise<object|null>}
 */
export async function getUnprocessedMessages(group_name, after) {
  return repo()
    .createQueryBuilder("m")
    .where("m.group_name = :group_name", { group_name })
    .andWhere("m.message_time > :after", { after })
    .orderBy("m.message_time", "ASC")
    .getMany();
}
