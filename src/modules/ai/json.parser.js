import { ACTIONS } from './prompt.builder.js';

// ── Shared utilities ───────────────────────────────────────────────────────

const VALID_PRIORITIES     = new Set(['High', 'Medium', 'Low']);
const VALID_JIRA_TYPES     = new Set(['Story', 'Bug', 'Task', 'Improvement']);
const VALID_JIRA_PRIORITIES = new Set(['Highest', 'High', 'Medium', 'Low', 'Lowest']);
const VALID_TONES          = new Set(['Formal', 'Friendly', 'Direct', 'Empathetic']);
const VALID_CONFIDENCE     = new Set(['High', 'Medium', 'Low']);

function stripCodeFences(text) {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === 'string' ? item : JSON.stringify(item)));
}

/**
 * Robustly parses JSON from a string that may contain preamble/trailing text.
 * @param {string} rawText
 * @returns {object}
 */
const MAX_RESPONSE_BYTES = 512 * 1024; // 512 KB

function parseJSON(rawText) {
  // Reject oversized responses before attempting any parsing.
  // A legitimate Gemini JSON response is never this large; anything bigger
  // is a hallucination or a model error that shouldn't block the event loop.
  if (Buffer.byteLength(rawText, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new Error(
      `AI response too large (${Math.round(Buffer.byteLength(rawText, 'utf8') / 1024)} KB > ${MAX_RESPONSE_BYTES / 1024} KB limit)`
    );
  }

  let cleaned = stripCodeFences(rawText);

  try {
    return JSON.parse(cleaned);
  } catch {
    // Fallback: extract first complete JSON object
    const start = cleaned.indexOf('{');
    const end   = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch { /* fall through */ }
    }
    throw new Error(
      `AI response is not valid JSON.\nRaw (first 500 chars):\n${rawText.slice(0, 500)}`
    );
  }
}

function assertObject(parsed) {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('AI response JSON is not an object');
  }
}

// ── Action-specific parsers ────────────────────────────────────────────────

function parseSummarize(rawText) {
  const parsed = parseJSON(rawText);
  assertObject(parsed);

  if (!Array.isArray(parsed.requirements)) {
    throw new Error('summarize response missing "requirements" array');
  }

  const requirements = parsed.requirements.map((req, i) => {
    if (typeof req !== 'object' || req === null) {
      throw new Error(`requirements[${i}] must be an object`);
    }
    const rawPriority = typeof req.priority === 'string' ? req.priority.trim() : 'Medium';
    return {
      title:        typeof req.title === 'string'       ? req.title.trim()       : `Requirement ${i + 1}`,
      description:  typeof req.description === 'string' ? req.description.trim() : '',
      messages:     toStringArray(req.messages),
      issues:       toStringArray(req.issues),
      action_items: toStringArray(req.action_items),
      priority:     VALID_PRIORITIES.has(rawPriority) ? rawPriority : 'Medium',
    };
  });

  return { requirements };
}

function parseExplain(rawText) {
  const parsed = parseJSON(rawText);
  assertObject(parsed);

  // Normalise image_insights — each entry must have what_shown + connection
  const image_insights = Array.isArray(parsed.image_insights)
    ? parsed.image_insights
        .map((entry) => ({
          sender:     typeof entry?.sender     === 'string' ? entry.sender.trim()     : 'unknown',
          what_shown: typeof entry?.what_shown === 'string' ? entry.what_shown.trim() : '',
          connection: typeof entry?.connection === 'string' ? entry.connection.trim() : '',
        }))
        .filter((e) => e.what_shown || e.connection)
    : [];

  return {
    explanation:    typeof parsed.explanation === 'string' ? parsed.explanation.trim() : '',
    key_points:     toStringArray(parsed.key_points),
    context:        typeof parsed.context     === 'string' ? parsed.context.trim()     : '',
    image_insights,
    participants:   toStringArray(parsed.participants),
    outcome:        typeof parsed.outcome     === 'string' ? parsed.outcome.trim()     : null,
  };
}

function parseReply(rawText) {
  const parsed = parseJSON(rawText);
  assertObject(parsed);

  const replies = Array.isArray(parsed.suggested_replies)
    ? parsed.suggested_replies.map((r) => ({
        tone:    VALID_TONES.has(r?.tone) ? r.tone : 'Friendly',
        message: typeof r?.message === 'string' ? r.message.trim() : '',
      })).filter((r) => r.message)
    : [];

  return {
    context_summary:   typeof parsed.context_summary === 'string' ? parsed.context_summary.trim() : '',
    suggested_replies: replies,
  };
}

function parseJira(rawText) {
  const parsed = parseJSON(rawText);
  assertObject(parsed);

  if (!Array.isArray(parsed.tickets)) {
    throw new Error('jira response missing "tickets" array');
  }

  const tickets = parsed.tickets.map((t, i) => {
    const rawType     = typeof t?.type === 'string'     ? t.type.trim()     : 'Task';
    const rawPriority = typeof t?.priority === 'string' ? t.priority.trim() : 'Medium';
    return {
      title:               typeof t?.title === 'string'       ? t.title.trim()       : `Ticket ${i + 1}`,
      type:                VALID_JIRA_TYPES.has(rawType)       ? rawType              : 'Task',
      priority:            VALID_JIRA_PRIORITIES.has(rawPriority) ? rawPriority       : 'Medium',
      description:         typeof t?.description === 'string'  ? t.description.trim() : '',
      acceptance_criteria: toStringArray(t?.acceptance_criteria),
      labels:              toStringArray(t?.labels),
      source_messages:     toStringArray(t?.source_messages),
    };
  });

  return { tickets };
}

function parseGroup(rawText) {
  const parsed = parseJSON(rawText);
  assertObject(parsed);

  if (!Array.isArray(parsed.groups)) {
    throw new Error('group response missing "groups" array');
  }

  const groups = parsed.groups
    .map((g, i) => ({
      title:    typeof g?.title === 'string' ? g.title.trim() : `Group ${i + 1}`,
      messages: toStringArray(g?.messages),
    }))
    .filter((g) => g.messages.length > 0);

  return { groups };
}

function parseChat(rawText) {
  const parsed = parseJSON(rawText);
  assertObject(parsed);

  const rawConf = typeof parsed.confidence === 'string' ? parsed.confidence.trim() : 'Medium';
  return {
    answer:     typeof parsed.answer === 'string' ? parsed.answer.trim() : '',
    references: toStringArray(parsed.references),
    confidence: VALID_CONFIDENCE.has(rawConf) ? rawConf : 'Medium',
    note:       typeof parsed.note === 'string' ? parsed.note.trim() : null,
  };
}

// ── Dispatcher ─────────────────────────────────────────────────────────────

const PARSERS = {
  [ACTIONS.summarize]: parseSummarize,
  [ACTIONS.explain]:   parseExplain,
  [ACTIONS.reply]:     parseReply,
  [ACTIONS.jira]:      parseJira,
  [ACTIONS.group]:     parseGroup,
  [ACTIONS.chat]:      parseChat,
};

/**
 * Parses the raw Gemini response for the given action.
 *
 * @param {string} rawText
 * @param {string} action  One of ACTIONS values
 * @returns {object}  Parsed, validated, coerced response object
 * @throws {Error}    If JSON is invalid or required fields are missing
 */
export function parseAIResponse(rawText, action) {
  const parser = PARSERS[action];
  if (!parser) {
    throw new Error(`No parser registered for action: "${action}"`);
  }
  return parser(rawText);
}

// ── Backward-compat export ─────────────────────────────────────────────────
export function parseSummaryResponse(rawText) {
  return parseSummarize(rawText);
}
