import { runAIAction, ACTIONS } from './ai.service.js';
import { getAiLogs } from './ai.log.repository.js';

const VALID_ACTIONS = new Set(Object.values(ACTIONS));

/**
 * POST /api/ai/action
 * Body: { messages, action, extraInput?, group_name? }
 */
export async function handleAIAction(req, res, next) {
  try {
    const { messages, action, extraInput = '', group_name } = req.body;

    // ── Validation ─────────────────────────────────────────────────────────
    const errors = [];

    if (!Array.isArray(messages) || messages.length === 0) {
      errors.push('"messages" must be a non-empty array');
    }

    if (!action || typeof action !== 'string') {
      errors.push('"action" is required and must be a string');
    } else if (!VALID_ACTIONS.has(action)) {
      errors.push(`"action" must be one of: ${[...VALID_ACTIONS].join(', ')}`);
    }

    if (extraInput !== undefined && typeof extraInput !== 'string') {
      errors.push('"extraInput" must be a string');
    }

    if (errors.length) {
      return res.status(400).json({ success: false, errors });
    }

    // ── Execute ────────────────────────────────────────────────────────────
    const output = await runAIAction({ messages, action, extraInput, group_name });

    return res.status(200).json({
      success: true,
      action:  output.action,
      data:    output.result,
    });

  } catch (err) {
    if (err.message?.startsWith('messages[') || err.message?.includes('action requires extraInput')) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (
      err.message?.includes('GEMINI_API_KEY') ||
      err.message?.includes('Gemini') ||
      err.message?.includes('AI response')
    ) {
      return res.status(503).json({ success: false, error: 'AI service unavailable', detail: err.message });
    }
    next(err);
  }
}

/**
 * GET /api/ai/history
 * Query: group_name?, action_type?, from?, to?, page?, limit?
 */
export async function handleAIHistory(req, res, next) {
  try {
    const { group_name, action_type, from, to, page, limit } = req.query;
    const result = await getAiLogs({ group_name, action_type, from, to, page, limit });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}
