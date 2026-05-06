// ── System prompt ──────────────────────────────────────────────────────────
//
// Injected at the top of every action prompt. Sets the global persona,
// output contract, and non-negotiable rules that apply to all actions.

export const SYSTEM_PROMPT = `You are a senior business analyst and software engineer.
You analyze client discussions and convert them into structured outputs.

GLOBAL RULES (apply to every action):
- Return ONLY a raw JSON object — no markdown, no code fences, no prose before or after.
- Be clear, be structured, avoid unnecessary assumptions.
- Never invent or hallucinate information not present in the conversation.
- All string values must be plain text — no markdown formatting inside JSON strings.
- If the conversation has insufficient data for a field, use null or [].

IMAGE RULES (apply when images are attached):
- Images are attached as inline parts immediately after their sender label.
- Carefully read every image — extract visible text, UI elements, error messages, diagrams, or data tables.
- Combine image content with the message caption (if any) and surrounding conversation context.
- Treat the image as primary evidence; it may contain the most important information in the message.
- Never ignore an attached image — always include insights from it in your response.`;

// ── Action-specific prompts ────────────────────────────────────────────────
//
// Each entry defines:
//   role         — the persona adopted for this specific action
//   task         — what the model must do
//   schema       — the exact JSON shape to return (shown as a comment template)
//   rules        — action-specific constraints
//   injectExtra  — (optional) how extraInput is used in this action

export const ACTION_PROMPTS = {

  summarize: {
    role: 'Act as a senior business analyst.',
    task: `Group messages into logical requirement topics and produce structured output.
Step 1 — Group messages by topic: each group = ONE requirement or discussion thread.
Step 2 — For each group produce a structured entry.
Step 3 — If a message has an attached image, extract its content and include visual details in "description" and "issues".`,
    schema: `{
  "requirements": [
    {
      "title":        "Short requirement title (max 10 words)",
      "description":  "Detailed explanation in plain English — include visual details from screenshots if present",
      "messages":     ["verbatim or paraphrased source message"],
      "issues":       ["problem or blocker mentioned — describe UI issues or errors visible in screenshots"],
      "action_items": ["specific task that needs to be done"],
      "priority":     "High | Medium | Low"
    }
  ]
}`,
    rules: [
      'Do NOT merge unrelated discussions into one requirement.',
      'Ignore filler messages: "ok", "thanks", "noted", "👍".',
      '"priority" must be exactly one of: High, Medium, Low.',
      'Empty arrays [] are allowed when a field has no data.',
      'For image messages: describe what is visible in the screenshot inside "description" and list UI issues in "issues".',
    ],
  },

  explain: {
    role: 'Act as a technical analyst who explains team conversations in plain English.',
    task: `Read the conversation and produce a clear, structured explanation of what was discussed.

If any message contains an image:
  Step A — Describe what is shown in the image: visible text, UI elements, error messages, data, layout.
  Step B — Connect the image to the discussion: explain why it was shared, what problem or topic it illustrates, and how it relates to the surrounding messages.
  Step C — Include the image insights in "image_insights" and weave relevant details into "explanation" and "key_points".`,
    schema: `{
  "explanation":    "2–4 sentence overview of the full conversation including what any images show",
  "key_points":     ["concrete takeaway — include image-based findings where relevant"],
  "context":        "Background context that helps understand the discussion and any shared visuals",
  "image_insights": [
    {
      "sender":      "Who sent the image",
      "what_shown":  "Describe exactly what is visible in the image (UI, error, diagram, data, etc.)",
      "connection":  "How this image relates to the discussion — what point it illustrates or supports"
    }
  ],
  "participants":   ["Sender Name"],
  "outcome":        "What was decided or concluded — null if no clear outcome"
}`,
    rules: [
      'Use plain, jargon-free language.',
      '"key_points" must be concrete facts from the conversation, not vague observations.',
      '"outcome" is null when no decision or conclusion was reached.',
      '"image_insights" must be an empty array [] when no images are present.',
      'For every image message: populate one "image_insights" entry with "what_shown" and "connection".',
      '"what_shown" must be specific — name visible elements, error codes, labels, colours, layout issues.',
      '"connection" must explain the image\'s role in the discussion — never leave it generic.',
    ],
  },

  reply: {
    role: 'Act as a professional communication assistant.',
    task: 'Analyse the latest messages and suggest ready-to-send WhatsApp replies.',
    injectExtra: (extra) => extra
      ? `REPLY INTENT: The user wants to reply with this goal: "${extra.trim()}"`
      : 'Suggest general professional reply options for the latest messages.',
    schema: `{
  "context_summary":   "One sentence: what the latest messages are about",
  "suggested_replies": [
    {
      "tone":    "Formal | Friendly | Direct | Empathetic",
      "message": "The full reply text — ready to send as-is"
    }
  ]
}`,
    rules: [
      'Provide exactly 3 suggested replies, each with a different tone.',
      'Every reply must be complete and sendable — no [placeholder] tokens.',
      'Keep replies concise and appropriate for WhatsApp (under 3 sentences).',
    ],
  },

  jira: {
    role: 'Act as a senior project manager who extracts Jira tickets from team conversations.',
    task: `Extract every actionable task, bug, or feature request and format as Jira tickets.
If a message contains an image (screenshot, UI capture, error screen):
- Describe the visible UI, layout, error message, or data in the ticket "description".
- Mention specific visual details: button labels, field names, error codes, affected screen/page.
- List observable UI issues or defects as part of "acceptance_criteria" so they can be verified after a fix.`,
    schema: `{
  "tickets": [
    {
      "title":               "Verb-first title under 80 chars (Fix / Add / Update / Investigate…)",
      "type":                "Story | Bug | Task | Improvement",
      "priority":            "Highest | High | Medium | Low | Lowest",
      "description":         "Full description including visual details from any screenshot if present",
      "acceptance_criteria": ["Completion condition — include visual verification steps for UI bugs"],
      "labels":              ["relevant-label"],
      "source_messages":     ["Original message that triggered this ticket"]
    }
  ]
}`,
    rules: [
      'Only create tickets for actionable items — skip small talk.',
      '"title" must start with a verb.',
      'Each ticket must be fully self-contained.',
      '"acceptance_criteria" requires at least one entry per ticket.',
      '"type" must be exactly one of: Story, Bug, Task, Improvement.',
      '"priority" must be exactly one of: Highest, High, Medium, Low, Lowest.',
      'For image messages: describe the screenshot content in "description" and reference visible UI issues in "acceptance_criteria".',
    ],
  },

  group: {
    role: 'Act as an expert conversation analyst.',
    task: 'Cluster the conversation messages into discrete groups by requirement or topic. Each group must represent ONE coherent discussion thread, feature request, bug report, or decision.',
    schema: `{
  "groups": [
    {
      "title":    "Short topic title (max 10 words)",
      "messages": ["verbatim message text from the conversation"]
    }
  ]
}`,
    rules: [
      'Every substantive message must appear in exactly one group.',
      'Ignore filler messages — "ok", "thanks", "noted", "👍" — omit them from all groups.',
      '"messages" must contain the exact message text as it appears in the transcript.',
      '"messages" must be a non-empty array of strings.',
      'Produce at least one group if there is any substantive content.',
      '"title" must be a concise noun phrase — no verbs, no punctuation at the end.',
    ],
  },

  chat: {
    role: 'Act as an expert analyst who has read this conversation thoroughly.',
    task: 'Answer the user\'s question using only information present in the conversation.',
    injectExtra: (extra) => {
      if (!extra || !extra.trim()) {
        throw new Error('"chat" action requires extraInput — the user\'s question');
      }
      return `USER QUESTION: ${extra.trim()}`;
    },
    schema: `{
  "answer":     "Direct answer to the user's question",
  "references": ["Relevant message from the conversation that supports the answer"],
  "confidence": "High | Medium | Low",
  "note":       "Caveat or limitation about this answer — null if none"
}`,
    rules: [
      'Answer using ONLY information from the conversation — do not invent facts.',
      'If the conversation lacks enough data, set confidence to Low and explain in note.',
      '"references" must quote or paraphrase actual messages.',
      '"confidence" must be exactly one of: High, Medium, Low.',
    ],
  },

};

// ── Supported action names ─────────────────────────────────────────────────

export const ACTIONS = Object.freeze(
  Object.fromEntries(Object.keys(ACTION_PROMPTS).map((k) => [k, k]))
);

// ── Transcript builder ─────────────────────────────────────────────────────

function hasImage(m) {
  return typeof m.image_url === 'string' && m.image_url.startsWith('data:image') && m.image_url.includes(';base64,');
}

function buildTranscript(messages) {
  return messages
    .map((m) => {
      const time    = new Date(m.message_time).toISOString().replace('T', ' ').slice(0, 19);
      const caption = m.message ? m.message : '';
      const imgTag  = hasImage(m) ? ' [IMAGE ATTACHED — see inline part below]' : '';
      const text    = caption || (hasImage(m) ? '(image only — no caption)' : '(no content)');
      return `[${time}] ${m.sender}: ${text}${imgTag}`;
    })
    .join('\n');
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Builds a fully assembled prompt by combining:
 *   1. SYSTEM_PROMPT  — global persona + output contract
 *   2. Action role    — persona for this specific task
 *   3. Conversation   — formatted transcript with metadata
 *   4. Extra input    — optional user-provided context (question, intent…)
 *   5. Task + schema  — what to do and the exact JSON shape to return
 *   6. Rules          — action-specific constraints
 *
 * @param {string} action      One of the ACTIONS keys
 * @param {Array}  messages    Message objects with sender, message, message_time
 * @param {string} [extraInput] Optional — user question (chat), reply intent (reply), etc.
 * @returns {string}  Fully built prompt ready for Gemini
 */
export function buildPrompt(action, messages, extraInput = '') {
  const def = ACTION_PROMPTS[action];
  if (!def) {
    throw new Error(
      `Unknown action: "${action}". Supported: ${Object.keys(ACTION_PROMPTS).join(', ')}`
    );
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('messages must be a non-empty array');
  }

  const from      = new Date(messages[0].message_time).toISOString();
  const to        = new Date(messages[messages.length - 1].message_time).toISOString();
  const transcript = buildTranscript(messages);

  // Resolve dynamic extra-input injection (may throw for required fields)
  const extraSection = def.injectExtra
    ? def.injectExtra(extraInput)
    : extraInput?.trim()
      ? `ADDITIONAL CONTEXT: ${extraInput.trim()}`
      : null;

  const imageMsgs  = messages.filter(hasImage);
  const imageCount = imageMsgs.length;

  const parts = [
    SYSTEM_PROMPT,
    '',
    `--- ROLE ---`,
    def.role,
    '',
    `--- CONVERSATION (${messages.length} messages, ${from} → ${to}) ---`,
    transcript,
    '',
  ];

  if (imageCount > 0) {
    parts.push(
      `--- IMAGES (${imageCount} attached) ---`,
      `${imageCount} message(s) in this conversation contain images.`,
      `Each image is attached as an inline part immediately after its sender label in the multimodal input.`,
      ``,
      `When processing image messages you MUST:`,
      `1. Read the image carefully — extract all visible text, error messages, UI elements, diagrams, or data.`,
      `2. Describe any visible UI issues, layout problems, or anomalies in the "description" field.`,
      `3. Include specific visual details (button labels, field names, error codes, colours, layout) where relevant.`,
      `4. Combine the image content with the caption text and surrounding conversation for full context.`,
      `5. Never skip an image — treat it as the primary evidence for that message.`,
      '',
    );
  }

  if (extraSection) {
    parts.push(`--- INPUT ---`, extraSection, '');
  }

  parts.push(
    `--- TASK ---`,
    def.task,
    '',
    `--- RESPONSE SCHEMA ---`,
    `Return ONLY this JSON structure (no markdown, no prose):`,
    def.schema,
    '',
    `--- RULES ---`,
    def.rules.map((r, i) => `${i + 1}. ${r}`).join('\n'),
  );

  return parts.join('\n');
}

// ── Backward-compat export ─────────────────────────────────────────────────
export function buildSummaryPrompt(_groupName, messages) {
  return buildPrompt('summarize', messages);
}

export function actionUsesJson() {
  return true;
}
