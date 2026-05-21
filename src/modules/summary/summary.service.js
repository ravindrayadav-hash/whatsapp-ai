import { generateAIResponse } from "../ai/gemini.service.js";
import { runAIAction } from "../ai/ai.service.js";
import {
  getCursor,
  fetchUnprocessedMessages,
  saveGroupedSummaries,
  getSummariesByGroup,
} from "./summary.repository.js";

/**
 * In-memory lock — prevents two concurrent calls from processing the same
 * group simultaneously within this process. The DB-level FOR UPDATE inside
 * saveGroupedSummaries handles multi-instance / multi-process scenarios.
 * @type {Set<string>}
 */
const processingLock = new Set();

const CHUNK_SIZE = () => Number(process.env.SUMMARY_CHUNK_SIZE) || 150;

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Calls the AI "group" action on one chunk and returns valid groups.
 * Returns [] if the AI finds no substantive groups.
 *
 * @param {object[]} chunk     Message objects for this chunk
 * @param {string}   chunkTag  Label for logging
 * @returns {Promise<Array<{ topic: string, message_indices: number[] }>>}
 */
async function groupChunk(chunk, chunkTag) {
  const result = await generateAIResponse(chunk, "group");
  const groups = result.groups ?? [];

  if (groups.length === 0) {
    console.log(`[Summary] ${chunkTag}: no groups found — skipping chunk`);
  } else {
    console.log(`[Summary] ${chunkTag}: ${groups.length} group(s) identified`);
  }

  return groups;
}

/**
 * Calls the AI "summarize" action on a group's messages.
 * Accepts string messages (as returned by the "group" action) — runAIAction
 * normalises them into message objects before calling Gemini.
 *
 * @param {string[]} messages  Message texts from one group
 * @returns {Promise<object[]>} requirements array
 */
async function summarizeGroup(messages) {
  const { result } = await runAIAction({ messages, action: "summarize" });
  return result.requirements ?? [];
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Two-phase summarization pipeline for one WhatsApp group:
 *
 *   Phase 1 — Group
 *     For each chunk of CHUNK_SIZE messages:
 *       Call AI with action "group" → topic clusters with message_indices
 *
 *   Phase 2 — Summarize per group
 *     For each topic cluster:
 *       Call AI with action "summarize" → requirements, issues, action_items
 *
 *   Phase 3 — Persist
 *     Save one Summary row per topic group + advance cursor atomically.
 *
 * @param {string} group_name
 * @returns {Promise<{
 *   status:        'processed' | 'skipped',
 *   messageCount?: number,
 *   groupCount?:   number,
 *   reason?:       string,
 * }>}
 */
export async function processGroupSummary(group_name) {
  // ── Duplicate-processing guard ────────────────────────────────────────────
  if (processingLock.has(group_name)) {
    return {
      status: "skipped",
      reason: "Processing already in progress for this group",
    };
  }
  processingLock.add(group_name);

  try {
    // ── 1. Read cursor ───────────────────────────────────────────────────────
    const cursor = await getCursor(group_name);
    const messages = await fetchUnprocessedMessages(group_name, cursor);

    if (messages.length === 0) {
      return { status: "skipped", reason: "No new messages to process" };
    }

    const chunkSize = CHUNK_SIZE();
    const totalChunks = Math.ceil(messages.length / chunkSize);

    console.log(
      `[Summary] ${group_name}: ${messages.length} messages → ` +
        `${totalChunks} chunk(s) of ${chunkSize}`,
    );

    // ── 2. Phase 1 + 2: group then summarize, chunk by chunk ─────────────────
    // All AI calls happen here, outside the DB transaction, to keep the
    // transaction short and avoid holding connections during long AI calls.

    const allGroupSummaries = [];

    for (let i = 0; i < messages.length; i += chunkSize) {
      const chunk = messages.slice(i, i + chunkSize);
      const chunkNum = Math.floor(i / chunkSize) + 1;
      const tag = `chunk ${chunkNum}/${totalChunks}`;

      // Phase 1: group
      const groups = await groupChunk(chunk, tag);

      // Phase 2: summarize each group
      for (const { title, messages: groupMessages } of groups) {
        if (groupMessages.length === 0) continue;

        console.log(`[Summary]   → "${title}" (${groupMessages.length} msgs)`);

        const requirements = await summarizeGroup(groupMessages);

        allGroupSummaries.push({ topic: title, requirements });
      }
    }

    if (allGroupSummaries.length === 0) {
      return {
        status: "skipped",
        reason: "No substantive content found after grouping",
      };
    }

    // ── 3. Persist all groups + advance cursor in one transaction ────────────
    const newCursor = messages[messages.length - 1].message_time;

    await saveGroupedSummaries({
      group_name,
      groups: allGroupSummaries,
      newCursor: new Date(newCursor),
    });

    console.log(
      `[Summary] ${group_name}: saved ${allGroupSummaries.length} group summary(ies)`,
    );

    return {
      status: "processed",
      messageCount: messages.length,
      groupCount: allGroupSummaries.length,
    };
  } finally {
    processingLock.delete(group_name);
  }
}

/**
 * Returns stored summaries for a group with optional filters.
 * @param {string} group_name
 * @param {object} opts
 * @param {number} [opts.limit]
 * @param {Date}   [opts.from]
 * @param {Date}   [opts.to]
 * @returns {Promise<object[]>}
 */
export async function getGroupSummaries(group_name, opts = {}) {
  return getSummariesByGroup(group_name, opts);
}
