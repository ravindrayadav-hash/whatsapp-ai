/**
 * Parses the raw DOM data extracted from WhatsApp Web message bubbles
 * into clean, typed message objects.
 *
 * All parsing runs inside page.evaluate() — no Playwright APIs here,
 * only vanilla JS that executes in the browser context.
 */

/**
 * Parses the `data-pre-plain-text` attribute on each message bubble.
 * Format: "[HH:MM, DD/MM/YYYY] Sender: "   (locale may vary)
 * We also handle ISO-like variants WA sometimes uses.
 *
 * @param {string} attr  raw data-pre-plain-text value
 * @returns {{ sender: string, timestamp: string } | null}
 */
export function parsePrePlainText(attr) {
  if (!attr) return null;

  // Expected format: "[10:32, 5/4/2026] John Doe: "
  const match = attr.match(/^\[([^\]]+)\]\s+(.+?):\s*$/);
  if (!match) return null;

  const rawTime = match[1].trim(); // "10:32, 5/4/2026"
  const sender = match[2].trim(); // "John Doe"

  const timestamp = parseWhatsAppTime(rawTime);

  return { sender, timestamp };
}

/**
 * Converts WhatsApp time strings to ISO 8601.
 * Handles both 24-hour and 12-hour (am/pm) formats.
 * Handles "H:MM am/pm, D/M/YYYY" and "D/M/YYYY, H:MM am/pm" (locale varies).
 * @param {string} raw  e.g. "8:08 pm, 4/4/2026" or "4/4/2026, 20:08"
 * @returns {string} ISO 8601 string, or raw string if unparseable
 */
function parseWhatsAppTime(raw) {
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.length !== 2) return raw;

  let timePart, datePart;

  // Detect which part is the time (contains ':' but not '/')
  if (parts[0].includes(":") && !parts[0].includes("/")) {
    [timePart, datePart] = parts;
  } else {
    [datePart, timePart] = parts;
  }

  // datePart: "5/4/2026" or "04/05/2026"
  const datePieces = datePart.trim().split("/");
  if (datePieces.length !== 3) return raw;

  const [d, m, y] = datePieces.map(Number);
  if ([d, m, y].some(isNaN)) return raw;

  // timePart may be "8:08 pm", "20:08", "8:08 am"
  const timeStr = timePart.trim().toLowerCase();
  const isPm = timeStr.includes("pm");
  const isAm = timeStr.includes("am");
  const cleanTime = timeStr.replace(/\s*(am|pm)/i, "").trim();

  const timePieces = cleanTime.split(":").map(Number);
  if (timePieces.length < 2 || timePieces.some(isNaN)) return raw;

  let [h, min] = timePieces;

  // Convert 12-hour to 24-hour
  if (isPm && h < 12) h += 12;
  if (isAm && h === 12) h = 0;

  const dt = new Date(y, m - 1, d, h, min);
  return isNaN(dt.getTime()) ? raw : dt.toISOString();
}

// ── Main DOM extractor ─────────────────────────────────────────────────────

/**
 * Runs inside page.evaluate() — extracts raw fields from every message bubble,
 * including text, image data, and caption.
 *
 * Receives a SINGLE object argument (Playwright page.evaluate limitation).
 * Must be async to support blob→base64 conversion via fetch + FileReader.
 *
 * Handles three message types without breaking existing text extraction:
 *   • Text-only  → { rawPrePlain, textContent: "...", imageData: null }
 *   • Image-only → { rawPrePlain, textContent: "",    imageData: "data:image/..." }
 *   • Image+caption → { rawPrePlain, textContent: "caption", imageData: "data:image/..." }
 *
 * @param {{ sel: object, limit: number }} args
 * @returns {Promise<Array<{ rawPrePlain: string, textContent: string, imageData: string|null }>>}
 */
export async function extractMessagesFromDOM({ sel, limit }) {
  // ── Inline blob→base64 helper ─────────────────────────────────────────────
  //
  // MUST be defined inside this function.
  // page.evaluate() serialises only the function it receives — any reference
  // to an outer-scope function (like a module-level blobToBase64) becomes
  // undefined inside the browser context, causing ReferenceError.
  async function toBase64(src) {
    if (!src) return null;
    if (src.startsWith("data:image")) return src;
    if (!src.startsWith("blob:")) return null;
    try {
      const res = await fetch(src);
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob || blob.size === 0) return null;
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () =>
          resolve(
            typeof reader.result === "string" &&
              reader.result.startsWith("data:")
              ? reader.result
              : null,
          );
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  const bubbles = Array.from(document.querySelectorAll(sel.MSG_BUBBLE));
  const results = [];

  for (const bubble of bubbles.slice(-limit)) {
    const rawPrePlain = bubble.getAttribute("data-pre-plain-text") || "";

    // ── Image detection ───────────────────────────────────────────────────────
    let imgEl = bubble.querySelector(sel.MSG_IMAGE);

    if (!imgEl) {
      const fallback = bubble.querySelector(
        'img[src^="blob:"], img[src^="data:image/"]',
      );
      if (fallback) imgEl = fallback;
    }

    let imageData = null;

    if (imgEl) {
      const src = imgEl.getAttribute("src") || imgEl.src || "";
      imageData = await toBase64(src);
    }

    // ── Text / caption extraction ─────────────────────────────────────────────
    //
    // For image+caption messages the caption lives in the same span as regular
    // text — the existing selectors already cover it.
    const textEl =
      bubble.querySelector(sel.MSG_TEXT) ||
      bubble.querySelector(sel.MSG_TEXT_ALT);

    const textContent = textEl ? textEl.innerText.trim() : "";

    // Skip system messages / date dividers (no sender meta, no content)
    if (!rawPrePlain && !textContent && !imageData) continue;

    results.push({ rawPrePlain, textContent, imageData });
  }

  return results;
}
