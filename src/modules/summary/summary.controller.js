import { processGroupSummary, getGroupSummaries } from './summary.service.js';

/**
 * POST /api/summaries/process/:groupName
 * Triggers AI summarization for all unprocessed messages of a group.
 */
export async function triggerProcessing(req, res, next) {
  try {
    const group_name = req.params.groupName?.trim();

    if (!group_name) {
      return res.status(400).json({ success: false, message: 'groupName param is required' });
    }

    const result = await processGroupSummary(group_name);

    if (result.status === 'skipped') {
      return res.status(200).json({ success: true, status: 'skipped', reason: result.reason });
    }

    return res.status(201).json({
      success: true,
      status: 'processed',
      messageCount: result.messageCount,
      summary: result.summary,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/summaries/:groupName?limit=N
 * Returns stored summaries for a group, newest first.
 */
export async function fetchSummaries(req, res, next) {
  try {
    const group_name = req.params.groupName?.trim();

    if (!group_name) {
      return res.status(400).json({ success: false, message: 'groupName param is required' });
    }

    const limit = req.query.limit ? Number(req.query.limit) : 10;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ success: false, message: 'limit must be an integer between 1 and 100' });
    }

    const from = req.query.from ? new Date(req.query.from) : undefined;
    const to   = req.query.to   ? new Date(req.query.to)   : undefined;

    if (from && isNaN(from.getTime())) {
      return res.status(400).json({ success: false, message: 'from must be a valid date' });
    }
    if (to && isNaN(to.getTime())) {
      return res.status(400).json({ success: false, message: 'to must be a valid date' });
    }

    const summaries = await getGroupSummaries(group_name, { limit, from, to });

    return res.status(200).json({
      success: true,
      group_name,
      count: summaries.length,
      data: summaries,
    });
  } catch (err) {
    next(err);
  }
}
