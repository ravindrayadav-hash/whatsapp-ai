/**
 * HTTP client for the backend API.
 * Uses Node 18+ built-in fetch — no extra dependency needed.
 */

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3001";

// Internal auth header — same token the UI uses.
// Empty string when ADMIN_TOKEN is not set (local dev without auth).
function authHeaders() {
  const token = process.env.ADMIN_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * POSTs a single message to POST /api/messages.
 *
 * @param {{ group_name: string, sender: string, message: string, timestamp: string }} msg
 * @returns {Promise<{ ok: boolean, status: number, duplicate: boolean }>}
 */
export async function postMessage(msg) {
  const res = await fetch(`${BASE_URL}/api/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      group_name: msg.group_name,
      sender: msg.sender,
      message: msg.message,
      image_url: msg.image_url ?? null,
      message_time: msg.timestamp,
    }),
  });

  return {
    ok: res.ok,
    status: res.status,
    duplicate: res.status === 409,
  };
}

/**
 * Fetches the most recent message timestamp for a group.
 * Used to bootstrap the dedup cursor after a process restart.
 *
 * @param {string} group_name
 * @returns {Promise<string | null>} ISO timestamp of the latest known message, or null
 */
export async function fetchLatestMessageTime(group_name) {
  // order=DESC + limit=1 → the single row returned is the newest message
  const url = `${BASE_URL}/api/messages?group_name=${encodeURIComponent(group_name)}&limit=1&order=DESC`;

  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) return null;

  const body = await res.json();
  const messages = body.data ?? [];

  if (messages.length === 0) return null;

  return messages[0].message_time ?? null;
}
