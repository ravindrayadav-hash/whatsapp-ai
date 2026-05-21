import { AppDataSource } from "../../config/database.js";
import { Message } from "../../entities/Message.js";
import { Summary } from "../../entities/Summary.js";
import { ProcessingLog } from "../../entities/ProcessingLog.js";

const messageRepo = () => AppDataSource.getRepository(Message);
const summaryRepo = () => AppDataSource.getRepository(Summary);
const logRepo = () => AppDataSource.getRepository(ProcessingLog);

/**
 * Returns the cursor (last processed time) for a group.
 * Returns epoch start if the group has never been processed.
 * @param {string} group_name
 * @param {import('typeorm').EntityManager} [em] optional transaction manager
 * @returns {Promise<Date>}
 */
export async function getCursor(group_name, em) {
  const repo = em ? em.getRepository(ProcessingLog) : logRepo();
  const log = await repo.findOneBy({ group_name });
  return log ? log.last_processed_time : new Date(0);
}

/**
 * Fetches all messages for a group after the given cursor, ordered oldest-first.
 * @param {string} group_name
 * @param {Date} after
 * @returns {Promise<object[]>}
 */
export async function fetchUnprocessedMessages(group_name, after) {
  return messageRepo()
    .createQueryBuilder("m")
    .where("m.group_name = :group_name", { group_name })
    .andWhere("m.message_time > :after", { after })
    .orderBy("m.message_time", "ASC")
    .getMany();
}

/**
 * Atomically saves a summary row and upserts the processing cursor
 * inside a single transaction. Uses SELECT FOR UPDATE on ProcessingLog
 * to prevent two concurrent processes from writing the same group at once.
 *
 * @param {object} payload
 * @param {string} payload.group_name
 * @param {string} payload.summary_text
 * @param {string[]} payload.requirements
 * @param {string[]} payload.issues
 * @param {string[]} payload.action_items
 * @param {Date} payload.newCursor  latest message_time in the processed batch
 * @returns {Promise<object>} the saved Summary row
 */
export async function saveSummaryAndAdvanceCursor({
  group_name,
  summary_text,
  requirements,
  issues,
  action_items,
  newCursor,
}) {
  return AppDataSource.transaction(async (em) => {
    const plRepo = em.getRepository(ProcessingLog);
    const sumRepo = em.getRepository(Summary);

    // Guarantee the row exists before locking.
    // INSERT IGNORE is atomic — if two transactions race here, only one inserts;
    // the other silently skips. Both then proceed to SELECT FOR UPDATE, which
    // now always finds a row and serialises the rest of the transaction.
    await em.query(
      `INSERT IGNORE INTO processing_logs (group_name, last_processed_time, updatedAt)
       VALUES (?, ?, NOW())`,
      [group_name, new Date(0)],
    );

    // Lock the row so concurrent summary writes for the same group queue up.
    await em.query(
      `SELECT id FROM processing_logs WHERE group_name = ? FOR UPDATE`,
      [group_name],
    );

    // Save the summary
    const summary = sumRepo.create({
      group_name,
      summary_text,
      requirements,
      issues,
      action_items,
    });
    const saved = await sumRepo.save(summary);

    // Advance the cursor
    const existing = await plRepo.findOneBy({ group_name });
    existing.last_processed_time = newCursor;
    await plRepo.save(existing);

    return saved;
  });
}

/**
 * Atomically saves one Summary row per topic group and advances the cursor.
 *
 * Each element of `groups` becomes its own row so summaries are queryable
 * per topic. The cursor is advanced only after all rows are written,
 * giving all-or-nothing semantics for the whole processing batch.
 *
 * @param {object}   payload
 * @param {string}   payload.group_name
 * @param {Array<{
 *   topic:        string,
 *   requirements: object[],
 * }>} payload.groups
 * @param {Date}     payload.newCursor  latest message_time in the processed batch
 * @returns {Promise<object[]>} the saved Summary rows
 */
export async function saveGroupedSummaries({ group_name, groups, newCursor }) {
  return AppDataSource.transaction(async (em) => {
    const plRepo = em.getRepository(ProcessingLog);
    const sumRepo = em.getRepository(Summary);

    // Guarantee the row exists before locking (same fix as saveSummaryAndAdvanceCursor).
    await em.query(
      `INSERT IGNORE INTO processing_logs (group_name, last_processed_time, updatedAt)
       VALUES (?, ?, NOW())`,
      [group_name, new Date(0)],
    );

    // Prevent concurrent writes for the same group
    await em.query(
      `SELECT id FROM processing_logs WHERE group_name = ? FOR UPDATE`,
      [group_name],
    );

    const saved = [];

    for (const { topic, requirements } of groups) {
      const allReqs = Array.isArray(requirements) ? requirements : [];

      const summary_text =
        allReqs.length > 0
          ? allReqs.map((r, i) => `${i + 1}. ${r.title}`).join("; ")
          : "No requirements identified.";

      const row = sumRepo.create({
        group_name,
        topic,
        summary_text,
        requirements: allReqs,
        issues: allReqs.flatMap((r) => r.issues ?? []),
        action_items: allReqs.flatMap((r) => r.action_items ?? []),
      });

      saved.push(await sumRepo.save(row));
    }

    // Advance cursor — row is guaranteed to exist after INSERT IGNORE above.
    const existing = await plRepo.findOneBy({ group_name });
    existing.last_processed_time = newCursor;
    await plRepo.save(existing);

    return saved;
  });
}

/**
 * Returns distinct group names that have at least one message.
 * Used by the cron job to discover which groups to process.
 * @returns {Promise<string[]>}
 */
export async function getActiveGroups() {
  const rows = await messageRepo()
    .createQueryBuilder("m")
    .select("DISTINCT m.group_name", "group_name")
    .getRawMany();
  return rows.map((r) => r.group_name);
}

/**
 * Fetches stored summaries for a group, newest first.
 * @param {string} group_name
 * @param {object} opts
 * @param {number} [opts.limit]
 * @param {Date}   [opts.from]  inclusive lower bound on createdAt
 * @param {Date}   [opts.to]    inclusive upper bound on createdAt
 * @returns {Promise<object[]>}
 */
export async function getSummariesByGroup(
  group_name,
  { limit = 10, from, to } = {},
) {
  const qb = summaryRepo()
    .createQueryBuilder("s")
    .where("s.group_name = :group_name", { group_name })
    .orderBy("s.createdAt", "DESC")
    .limit(limit);

  if (from) qb.andWhere("s.createdAt >= :from", { from });
  if (to) qb.andWhere("s.createdAt <= :to", { to });

  return qb.getMany();
}
