// Core business logic for the daily status feature.
//
// Responsibilities:
//   1. collectAndFormat(session) — query the messages table for the collection
//      window, group by sender, merge multi-message blocks, return formatted text.
//   2. formatReminderText() — returns the configured reminder message.
//
// Message aggregation strategy:
//   Messages arrive in chronological order. All messages from the same sender
//   within the 10-minute window are joined with a single newline so that a user
//   who sends three separate messages ends up as one clean block. Each sender
//   block is separated from the next with a blank line.
//
// Sender filtering:
//   The bot account appears as BOT_SENDER ("You" by default) in the messages
//   table. The reminder message itself is also excluded so it does not appear
//   as "You" posting in its own summary.

import { AppDataSource } from "../../config/database.js";
import { Message } from "../../entities/Message.js";

const BOT_SENDER = process.env.DAILY_STATUS_BOT_SENDER || "You";

// The first line of the reminder text is used as a fingerprint to detect and
// exclude the reminder message from the collection window.
const REMINDER_FINGERPRINT = (
  process.env.DAILY_STATUS_REMINDER_TEXT ||
  "🔔 Daily Status Time!\nPlease share your updates for today. You have 10 minutes."
)
  .split("\n")[0]
  .trim();

const repo = () => AppDataSource.getRepository(Message);

/**
 * Queries the messages table for the session's collection window, groups
 * messages by sender, and formats them into a single consolidated text block.
 *
 * @param {{ group_name, collection_start, collection_end }} session
 * @returns {Promise<{ summaryText: string, participantCount: number, messageCount: number }>}
 */
export async function collectAndFormat(session) {
  const { group_name, collection_start, collection_end } = session;

  // Fetch all messages in the collection window, oldest first.
  // We fetch text messages only — image-only messages have no content to
  // summarise and are skipped in the filter step below.
  const messages = await repo()
    .createQueryBuilder("m")
    .where("m.group_name = :group_name", { group_name })
    .andWhere("m.message_time >= :start", { start: new Date(collection_start) })
    .andWhere("m.message_time <= :end", { end: new Date(collection_end) })
    .orderBy("m.message_time", "ASC")
    .getMany();

  console.log(
    `[DailyStatus] Collected ${messages.length} raw message(s) from "${group_name}" ` +
      `between ${collection_start} and ${collection_end}`,
  );

  // Filter: drop bot messages and the reminder text itself
  const userMessages = messages.filter((m) => {
    if (!m.sender || m.sender.trim() === "") return false;
    if (m.sender === BOT_SENDER) return false;
    // Skip messages whose text starts with the reminder fingerprint
    if (
      REMINDER_FINGERPRINT &&
      (m.message || "").trim().startsWith(REMINDER_FINGERPRINT)
    ) {
      return false;
    }
    // Skip messages with no text content (image-only)
    if (!m.message || m.message.trim() === "") return false;
    return true;
  });

  console.log(
    `[DailyStatus] ${userMessages.length} user message(s) after filtering`,
  );

  // Group messages by sender, preserving the order in which senders first appeared.
  // Map<senderName, string[]>
  const senderMap = new Map();
  for (const msg of userMessages) {
    const name = msg.sender.trim();
    if (!senderMap.has(name)) senderMap.set(name, []);
    senderMap.get(name).push(msg.message.trim());
  }

  const summaryText = buildSummaryText(senderMap, group_name);

  return {
    summaryText,
    participantCount: senderMap.size,
    messageCount: userMessages.length,
  };
}

/**
 * Formats the collected messages into the final WhatsApp message string.
 *
 * Output shape (mirrors the example in the requirements):
 *
 *   ANUP:-
 *   • AUT-2982 ...
 *   • AUT-2999 ...
 *
 *   SHIVANSH:-
 *   Today's Update:
 *   1. Verifying ...
 *
 * The user's original formatting is preserved — we only add the header line
 * and a blank line between sender blocks.
 *
 * @param {Map<string, string[]>} senderMap
 * @param {string} groupName
 * @returns {string}
 */
function buildSummaryText(senderMap, groupName) {
  if (senderMap.size === 0) {
    const today = new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    return `📊 Daily Status Update — ${today}\n\nNo updates received from the team today.`;
  }

  const blocks = [];

  for (const [sender, msgs] of senderMap) {
    // Header: "SENDER NAME:-"
    const header = `${sender.toUpperCase()}:-`;

    // Body: all messages from this sender joined with a single newline.
    // If the user sent their update as one message it appears as-is;
    // if they sent multiple short messages they are concatenated.
    const body = msgs.join("\n");

    blocks.push(`${header}\n${body}`);
  }

  return blocks.join("\n\n");
}

/**
 * Returns the configured reminder message text.
 * The text is read from env at call time so changes take effect without restart.
 *
 * @returns {string}
 */
export function getReminderText() {
  // dotenv stores \n from the .env file as a literal two-character sequence "\n".
  // Replace it with a real newline so the message is formatted correctly in WA.
  const raw =
    process.env.DAILY_STATUS_REMINDER_TEXT ||
    "🔔 Daily Status Time!\nPlease share your updates for today. You have 10 minutes.";
  return raw.replace(/\\n/g, "\n");
}
