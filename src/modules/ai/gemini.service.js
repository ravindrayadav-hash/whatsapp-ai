import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildPrompt, buildSummaryPrompt, ACTIONS } from "./prompt.builder.js";
import { parseAIResponse, parseSummaryResponse } from "./json.parser.js";
import { withRetry } from "./retry.js";

// ── Model registry ─────────────────────────────────────────────────────────
//
// Lazily created singletons, invalidated when GEMINI_MODEL env changes.
// Only JSON mode is used — all actions return structured JSON.

const _registry = { instance: null, modelName: null };

function getModel() {
  const currentModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  if (_registry.instance && _registry.modelName === currentModel) {
    return _registry.instance;
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in environment variables");
  }

  const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  _registry.instance = client.getGenerativeModel({
    model: currentModel,
    generationConfig: {
      temperature: 0.2,
      topP: 0.8,
      topK: 40,
      maxOutputTokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS) || 65536,
      responseMimeType: "application/json",
    },
  });
  _registry.modelName = currentModel;

  return _registry.instance;
}

// ── Retry policy ───────────────────────────────────────────────────────────
//
// Retry on:
//   • Transient API errors  (429 quota, 500/503 server errors)
//   • Empty response        (Gemini occasionally returns blank text)
//   • Invalid JSON          (Gemini occasionally wraps output in prose)

function isRetryable(err) {
  const statusCode =
    err.status ?? err.statusCode ?? err?.errorDetails?.[0]?.status;
  return (
    [429, 500, 503].includes(statusCode) ||
    !!err.message?.includes("quota") ||
    !!err.message?.includes("overloaded") ||
    !!err.message?.includes("rate limit") ||
    !!err.message?.includes("empty response") ||
    !!err.message?.includes("not valid JSON")
  );
}

// ── Multimodal helpers ─────────────────────────────────────────────────────

/**
 * Returns true if the value is a base64 data URL (e.g. "data:image/jpeg;base64,...").
 * @param {unknown} url
 * @returns {boolean}
 */
function isBase64DataUrl(url) {
  return (
    typeof url === "string" &&
    url.startsWith("data:image") &&
    url.includes(";base64,")
  );
}

/**
 * Converts a base64 data URL to a Gemini inlineData part.
 * @param {string} dataUrl
 * @returns {{ inlineData: { mimeType: string, data: string } }}
 */
function dataUrlToPart(dataUrl) {
  const commaIdx = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, commaIdx);
  const data = dataUrl.slice(commaIdx + 1);
  const mimeMatch = header.match(/data:([^;]+);base64/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
  return { inlineData: { mimeType, data } };
}

/**
 * Builds the content argument for model.generateContent().
 *
 * - No images → returns the plain text prompt string (Gemini string shorthand).
 * - Images present → returns a parts array:
 *     [{ text: textPrompt }, { text: banner }, { text: label }, { inlineData }, ...]
 *
 * Only inline base64 data URLs are forwarded to the LLM.
 * Locally-stored images (file paths) are intentionally excluded — they are
 * kept on disk for the UI only and must not be sent to external APIs.
 *
 * @param {Array<{ image_url?: string }>} messages
 * @param {string} textPrompt
 * @returns {string | Array<object>}
 */
function buildMultimodalContent(messages, textPrompt) {
  const imageMsgs = messages.filter((m) => isBase64DataUrl(m.image_url));
  if (imageMsgs.length === 0) return textPrompt;

  const parts = [{ text: textPrompt }];
  parts.push({
    text: [
      "",
      `=== INLINE IMAGES (${imageMsgs.length}) ===`,
      `Each block below corresponds to one [IMAGE ATTACHED] entry in the transcript above.`,
      `Analyse the image carefully — extract all visible text, UI details, and errors.`,
      `Combine the image with its caption and surrounding messages for full understanding.`,
    ].join("\n"),
  });

  for (const msg of imageMsgs) {
    const ts = msg.message_time
      ? new Date(msg.message_time).toISOString().replace("T", " ").slice(0, 19)
      : "unknown time";
    const sender = msg.sender || "unknown";
    const caption = msg.message || null;

    // Label mirrors the transcript line so Gemini can correlate transcript ↔ image
    parts.push({ text: `--- [${ts}] ${sender} ---` });
    if (caption) parts.push({ text: `Caption: ${caption}` });
    parts.push(dataUrlToPart(msg.image_url));
    parts.push({ text: `(end of image from ${sender} at ${ts})` });
  }

  return parts;
}

// ── Core call ──────────────────────────────────────────────────────────────

/**
 * @param {string | Array<object>} content  Plain text prompt OR multimodal parts array.
 */
async function callModel(content) {
  const model = getModel();
  const result = await model.generateContent(content);
  const text = result.response.text();

  if (!text?.trim()) throw new Error("Gemini returned an empty response");

  return text;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Generates a structured AI response for the given action.
 *
 * Supports multimodal input — if any message contains a base64 image_url,
 * it is forwarded to Gemini as an inlineData part alongside the text prompt.
 * Actions with no images fall back to plain-text mode automatically.
 *
 * Flow:
 *   1. Build text prompt  (prompt.builder.js)
 *   2. Build multimodal content (text + optional image parts)
 *   3. Call Gemini API
 *   4. Parse JSON safely  (json.parser.js)
 *   5. Retry on API errors or parse failures (retry.js)
 *
 * @param {Array<{ sender: string, message: string, message_time: string, image_url?: string }>} messages
 * @param {string} action   One of: summarize | explain | reply | jira | chat | group
 * @param {string} [extraInput]
 *   Optional context — required for 'chat' (user question),
 *   optional for 'reply' (reply intent).
 *
 * @returns {Promise<object>} Parsed, validated response — shape varies by action:
 *   - summarize → { requirements: [...] }
 *   - explain   → { explanation, key_points, context, participants, outcome }
 *   - reply     → { context_summary, suggested_replies: [...] }
 *   - jira      → { tickets: [...] }
 *   - chat      → { answer, references, confidence, note }
 *   - group     → { groups: [{ title, messages }] }
 *
 * @throws {Error} On invalid input, unsupported action, or API failure after all retries.
 */
export async function generateAIResponse(messages, action, extraInput = "") {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages must be a non-empty array");
  }
  if (!action || !Object.values(ACTIONS).includes(action)) {
    throw new Error(
      `Invalid action: "${action}". Supported: ${Object.values(ACTIONS).join(", ")}`,
    );
  }

  const textPrompt = buildPrompt(action, messages, extraInput);
  const content = buildMultimodalContent(messages, textPrompt);
  const imageCount = messages.filter((m) =>
    isBase64DataUrl(m.image_url),
  ).length;
  const maxRetries = Number(process.env.GEMINI_MAX_RETRIES) || 3;
  const baseDelayMs = Number(process.env.GEMINI_RETRY_DELAY_MS) || 1000;

  return withRetry(
    async () => {
      const rawText = await callModel(content);
      return parseAIResponse(rawText, action);
    },
    {
      maxRetries,
      baseDelayMs,
      label: `generateAIResponse(${action}, images=${imageCount})`,
      isRetryable,
    },
  );
}

// ── Backward-compat export ─────────────────────────────────────────────────

/**
 * Legacy wrapper used by summary.service.js.
 * Calls generateAIResponse with action='summarize'.
 */
export async function generateSummary(groupName, messages) {
  if (!groupName || typeof groupName !== "string") {
    throw new Error("groupName must be a non-empty string");
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages must be a non-empty array");
  }

  const prompt = buildSummaryPrompt(groupName, messages);
  const maxRetries = Number(process.env.GEMINI_MAX_RETRIES) || 3;
  const baseDelayMs = Number(process.env.GEMINI_RETRY_DELAY_MS) || 1000;

  return withRetry(
    async () => {
      const rawText = await callModel(prompt);
      return parseSummaryResponse(rawText);
    },
    {
      maxRetries,
      baseDelayMs,
      label: `generateSummary(${groupName})`,
      isRetryable,
    },
  );
}
