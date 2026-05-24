// Database access layer for daily_status_sessions.
//
// All DB operations for this feature go through here so the service and cron
// never touch AppDataSource or raw SQL directly.

import { AppDataSource } from "../../config/database.js";
import { DailyStatusSession } from "../../entities/DailyStatusSession.js";

const repo = () => AppDataSource.getRepository(DailyStatusSession);

/**
 * Creates a new session row for today.
 * Throws a duplicate-key error if a session for this group+date already exists —
 * the caller is responsible for catching and skipping in that case.
 *
 * @param {{ group_name, session_date, collection_start, collection_end }} data
 * @returns {Promise<DailyStatusSession>}
 */
export async function createSession(data) {
  const session = repo().create({
    group_name: data.group_name,
    session_date: data.session_date,
    status: "collecting",
    collection_start: data.collection_start,
    collection_end: data.collection_end,
  });
  return repo().save(session);
}

/**
 * Applies a partial update to a session by id.
 * Used to advance status, record timestamps, and store the summary text.
 *
 * @param {number} id
 * @param {Partial<DailyStatusSession>} patch
 */
export async function updateSession(id, patch) {
  await repo().update(id, patch);
}

/**
 * Finds the session for a specific group and date (YYYY-MM-DD string).
 * Returns null if none exists.
 *
 * @param {string} groupName
 * @param {string} date  - e.g. "2026-05-23"
 * @returns {Promise<DailyStatusSession|null>}
 */
export async function findSessionByDate(groupName, date) {
  return repo().findOne({
    where: { group_name: groupName, session_date: date },
  });
}

/**
 * Returns recent sessions for a group, newest first.
 * Used by the REST history endpoint.
 *
 * @param {string} groupName
 * @param {number} limit
 * @returns {Promise<DailyStatusSession[]>}
 */
export async function listSessions(groupName, limit = 30) {
  return repo()
    .createQueryBuilder("s")
    .where("s.group_name = :group_name", { group_name: groupName })
    .orderBy("s.session_date", "DESC")
    .limit(limit)
    .getMany();
}

/**
 * Returns all sessions regardless of group, ordered by date descending.
 * Used by the admin REST endpoint without a group filter.
 *
 * @param {number} limit
 * @returns {Promise<DailyStatusSession[]>}
 */
export async function listAllSessions(limit = 50) {
  return repo()
    .createQueryBuilder("s")
    .orderBy("s.session_date", "DESC")
    .limit(limit)
    .getMany();
}
