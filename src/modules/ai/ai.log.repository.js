import { AppDataSource } from "../../config/database.js";
import { AiLog } from "../../entities/AiLog.js";

const repo = () => AppDataSource.getRepository(AiLog);

/**
 * Persists one AI interaction log row.
 */
export async function saveAiLog({
  action_type,
  messages,
  response,
  group_name,
}) {
  return repo().save(
    repo().create({
      action_type,
      messages,
      response,
      group_name: group_name || null,
    }),
  );
}

/**
 * Paginates AI logs with optional filters.
 *
 * @param {object} opts
 * @param {string} [opts.group_name]  Exact group name filter
 * @param {string} [opts.action_type] Exact action type filter
 * @param {string} [opts.from]        ISO date string — start of range (inclusive, date part only)
 * @param {string} [opts.to]          ISO date string — end of range (inclusive, date part only)
 * @param {number} [opts.page=1]
 * @param {number} [opts.limit=25]
 * @returns {Promise<{ data, total, page, limit, hasMore }>}
 */
export async function getAiLogs({
  group_name,
  action_type,
  from,
  to,
  page = 1,
  limit = 25,
} = {}) {
  const pageSize = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const pageNum = Math.max(Number(page) || 1, 1);
  const offset = (pageNum - 1) * pageSize;

  const qb = repo()
    .createQueryBuilder("l")
    .orderBy("l.created_at", "DESC")
    .limit(pageSize)
    .offset(offset);

  if (group_name) {
    qb.andWhere("l.group_name = :group_name", { group_name });
  }

  if (action_type) {
    qb.andWhere("l.action_type = :action_type", { action_type });
  }

  if (from) {
    qb.andWhere("DATE(l.created_at) >= :from", { from });
  }

  if (to) {
    qb.andWhere("DATE(l.created_at) <= :to", { to });
  }

  const [data, total] = await qb.getManyAndCount();

  return {
    data,
    total,
    page: pageNum,
    limit: pageSize,
    hasMore: offset + data.length < total,
  };
}
