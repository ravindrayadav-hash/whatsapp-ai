import { generateAIResponse } from './gemini.service.js';
import { ACTIONS } from './prompt.builder.js';
import { saveAiLog } from './ai.log.repository.js';

export { ACTIONS };

/**
 * Normalises the incoming messages array.
 *
 * The endpoint accepts two formats:
 *   1. Plain strings  — e.g. "Fuad: please fix this"
 *      Wrapped into a minimal message object so the prompt builder can render them.
 *   2. Message objects — { sender, message, message_time, image_url? }
 *      Used as-is (already the shape the prompt builder expects).
 *
 * @param {Array<string|object>} messages
 * @returns {Array<{ sender, message, message_time, image_url? }>}
 */
function normaliseMessages(messages) {
  return messages.map((m, i) => {
    if (typeof m === 'string') {
      const text = m.trim();
      if (!text) throw new Error(`messages[${i}] is an empty string`);
      return {
        sender:       'Unknown',
        message:      text,
        message_time: new Date().toISOString(),
      };
    }

    if (typeof m === 'object' && m !== null) {
      // Allow image-only messages (message is empty but image_url is present)
      if (!m.message && !m.image_url) {
        throw new Error(`messages[${i}].message is required`);
      }
      const norm = {
        sender:       String(m.sender       ?? 'Unknown'),
        message:      m.message ? String(m.message).trim() : '',
        message_time: m.message_time ?? new Date().toISOString(),
      };
      if (m.image_url) norm.image_url = m.image_url;
      return norm;
    }

    throw new Error(`messages[${i}] must be a string or object`);
  });
}

/**
 * Executes an AI action against a set of messages.
 *
 * @param {object} params
 * @param {Array}   params.messages    Raw messages (strings or objects)
 * @param {string}  params.action      One of the ACTIONS keys
 * @param {string}  [params.extraInput] Optional context (question, reply intent…)
 * @param {string}  [params.group_name] Source group — stored in the log for history queries
 * @returns {Promise<{ action: string, result: object }>}
 */
export async function runAIAction({ messages, action, extraInput = '', group_name }) {
  const normalised = normaliseMessages(messages);
  const result     = await generateAIResponse(normalised, action, extraInput);

  // Fire-and-forget — a log write failure must never block or fail the response.
  // Tagged [CRITICAL] so log aggregators / grep can surface audit-trail gaps.
  saveAiLog({ action_type: action, messages: normalised, response: result, group_name })
    .catch((err) => {
      console.error(
        `[CRITICAL] [AiLog] Audit trail gap — failed to save log for action "${action}"` +
        (group_name ? ` (group: ${group_name})` : '') +
        `: ${err.message}`
      );
    });

  return { action, result };
}
