/**
 * All WhatsApp Web DOM selectors in one place.
 * When WA updates its UI, only this file needs changing.
 *
 * Verified against WhatsApp Web 2025 builds.
 * WA uses hashed class names that change — prefer data-testid and
 * aria attributes where available; fall back to structural selectors.
 */
export const SELECTORS = {
  // ── Landing / QR screen ────────────────────────────────────────
  QR_CODE: 'canvas[aria-label="Scan this QR code to link a device"]',
  // MAIN_APP: multiple fallbacks cover WA Web builds from 2023–2026.
  //   #app .two          — long-standing WA Web class (may vary by build)
  //   #side              — left sidebar; present as soon as WA is logged in
  //   #pane-side         — alternate sidebar id used in some WA builds
  //   [data-testid="default-user"] — WA 2025+ stable test id
  MAIN_APP: '#app .two, #side, #pane-side, [data-testid="default-user"]',
  LOADING_SPINNER: '[data-testid="startup-loading"]',

  // ── Left pane (chat list) ─────────────────────────────────────
  // Stable WA ids for the sidebar — used to return to search state
  LEFT_PANE: "#pane-side",

  // ── Search ────────────────────────────────────────────────────
  // WA 2025: plain <input role="textbox" aria-label="Search or start a new chat">
  SEARCH_INPUT:
    'input[aria-label="Search or start a new chat"], input[placeholder="Search or start a new chat"], [data-testid="chat-list-search"]',
  SEARCH_CLEAR: '[data-testid="search-clear-btn"], [aria-label="Clear search"]',

  // ── Chat list (search results) ────────────────────────────────
  // WA 2025: confirmed role="row" from DevTools (not listitem)
  CHAT_LIST_ITEM: 'div[role="row"], [data-testid="cell-frame-container"]',
  CHAT_TITLE: 'span[title], [data-testid="cell-frame-title"]',

  // ── Message pane ─────────────────────────────────────────────
  // Confirmed from DevTools: conversation lives in div#main.
  // id="main" is stable — WA has used it for years.
  MSG_LIST: '#main, [data-testid="conversation-panel-messages"]',

  MSG_ROW: '[data-testid="msg-container"]',

  // Sender name (absent on own messages)
  MSG_SENDER: '[data-testid="msg-meta"] [aria-label]',
  MSG_SENDER_ALT: "span[aria-label].copyable-text",

  // Message text body — WA 2025: data-testid gone, use stable span[dir] attributes
  MSG_TEXT: 'span[dir="ltr"].selectable-text, span[dir="ltr"].copyable-text',
  MSG_TEXT_ALT: 'span[dir="ltr"], span.selectable-text, span.copyable-text',

  // Timestamp — stored in data-pre-plain-text on bubble wrapper (stable)
  MSG_BUBBLE: "[data-pre-plain-text]",

  // ── "WhatsApp is open in another window" conflict dialog ─────────
  // WA shows this when the same session is active in multiple tabs.
  // We handle it by clicking "Use here" automatically.
  USE_HERE_BTN:
    'button[aria-label="Use here"], div[role="button"]:has-text("Use here")',

  // ── Image messages ────────────────────────────────────────────
  //
  // WA renders media inside message bubbles with stable data-testid attributes.
  // Three selectors cover the known WA builds:
  //   image-thumb       — standard photo message thumbnail
  //   media-url-provider — external media preview
  //   msg-image          — alternate WA build variant
  // The parser also falls back to img[src^="blob:"] as a last resort.
  MSG_IMAGE:
    '[data-testid="image-thumb"] img, [data-testid="media-url-provider"] img, [data-testid="msg-image"] img',

  // ── Conversation header ────────────────────────────────────────
  // id="main" header contains a span[title] with the chat name
  // The group name span inside the header — exclude the "click here for group info" aria spans
  CONV_HEADER:
    '#main header span[title]:not([aria-label]), [data-testid="conversation-info-header-chat-title"]',

  // ── Scroll pane ────────────────────────────────────────────────
  // WA renders the message list inside a scrollable div.
  // Primary: stable data-testid. Fallback: first overflow:scroll div inside #main.
  SCROLL_PANE: '[data-testid="conversation-panel-messages"]',

  // ── Media viewer (full-res photo) ────────────────────────────────
  //
  // Opened when the user clicks an image thumbnail.
  // WA builds vary — these three cover known 2024/2025 variants.
  // upgradeImageForBubble() uses this to confirm the viewer is open
  // before trying to capture the full-resolution blob.
  MEDIA_VIEWER:
    '[data-testid="media-viewer"], [data-testid="image-viewer"], [data-testid="photo-viewer-section"]',

  // ── Chat beginning marker ──────────────────────────────────────
  // WA shows an end-to-end encryption notice or "group created" system message
  // at the very top of a conversation once all history is loaded.
  CHAT_BEGINNING: '[data-testid="intro-md-content"], [data-icon="ciphertext"]',

  // ── Loading spinner (history fetch in progress) ────────────────
  // Appears at the top of the message list while WA fetches older messages.
  HISTORY_LOADING:
    '[data-testid="media-upload-progress"], [aria-label="Loading"], [data-testid="tail"]',

  // ── Message compose box ────────────────────────────────────────
  //
  // WA renders the reply input as a contenteditable <div>. Three selectors
  // cover known WA Web builds across 2024–2025:
  //   data-tab="10"     — long-standing stable attribute on the compose div
  //   data-testid       — more recent builds expose this test id
  //   aria-label        — falls back to the accessible label
  //
  // Order matters: try the most specific first, fall back to broader ones.
  COMPOSE_BOX:
    'div[contenteditable="true"][data-tab="10"], ' +
    'div[data-testid="conversation-compose-box-input"], ' +
    'div[contenteditable="true"][aria-label="Type a message"], ' +
    'div[contenteditable="true"][aria-label="Message"]',

  // ── Send button ────────────────────────────────────────────────
  // Used as a fallback when pressing Enter does not trigger send
  // (e.g. if WA detects Shift+Enter and treats it as a newline).
  SEND_BTN:
    'button[data-testid="send"], span[data-testid="send"], ' +
    '[aria-label="Send"], [data-icon="send"]',
};
