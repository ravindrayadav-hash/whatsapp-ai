import { saveMessage, getMessagesByGroup, getSendersByGroup } from './message.service.js';
import { validateCreateMessage, validateGetMessages } from './message.validator.js';

/**
 * POST /api/messages
 * Body: { group_name, sender, message, message_time }
 */
export async function createMessage(req, res, next) {
  try {
    const errors = validateCreateMessage(req.body);
    if (errors.length) {
      return res.status(400).json({ success: false, errors });
    }

    const saved = await saveMessage(req.body);

    return res.status(201).json({
      success: true,
      data: saved,
    });
  } catch (err) {
    // Duplicate key — unique constraint violation (ER_DUP_ENTRY)
    if (err.code === 'ER_DUP_ENTRY' || err.message?.includes('UQ_MESSAGE')) {
      return res.status(409).json({ success: false, duplicate: true });
    }
    next(err);
  }
}

/**
 * GET /api/senders?group_name=X
 */
export async function fetchSenders(req, res, next) {
  try {
    const { group_name } = req.query;
    if (!group_name) return res.status(400).json({ success: false, error: 'group_name required' });
    const senders = await getSendersByGroup(group_name);
    return res.status(200).json({ success: true, data: senders });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/messages?group_name=X&from=ISO&to=ISO&limit=N&sender=X
 */
export async function fetchMessages(req, res, next) {
  try {
    const errors = validateGetMessages(req.query);
    if (errors.length) {
      return res.status(400).json({ success: false, errors });
    }

    const { group_name, from, to, limit, page, order, sender, cursor_id, cursor_time } = req.query;
    const result = await getMessagesByGroup({ group_name, from, to, limit, page, order, sender, cursor_id, cursor_time });

    return res.status(200).json({
      success:    true,
      group_name,
      total:      result.total,
      page:       result.page,
      limit:      result.limit,
      hasMore:    result.hasMore,
      count:      result.data.length,
      data:       result.data,
      // Cursor for next page — undefined in offset mode, null in cursor mode
      ...(result.nextCursorId   != null && { nextCursorId:   result.nextCursorId   }),
      ...(result.nextCursorTime != null && { nextCursorTime: result.nextCursorTime }),
    });
  } catch (err) {
    next(err);
  }
}
