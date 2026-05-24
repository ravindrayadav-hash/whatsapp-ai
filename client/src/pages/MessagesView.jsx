import { useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useInfiniteMessages } from "../hooks/useInfiniteMessages.js";
import { useAIPanel } from "../hooks/useAIPanel.js";
import useFetch from "../hooks/useFetch.js";
import useAutoRefresh from "../hooks/useAutoRefresh.js";
import useScraperStatus from "../hooks/useScraperStatus.js";
import { fetchGroups, fetchSenders } from "../api/client.js";
import MessagePanel from "../components/ai/MessagePanel.jsx";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TYPE_STYLES = {
  image: { bg: "rgba(168,85,247,0.15)", color: "#a855f7" },
  mixed: { bg: "rgba(224,160,80,0.15)", color: "var(--warning)" },
  text: { bg: "rgba(82,134,224,0.15)", color: "var(--info)" },
};

function TypeBadge({ type }) {
  const s = TYPE_STYLES[type] || TYPE_STYLES.text;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 6px",
        borderRadius: 4,
        background: s.bg,
        color: s.color,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {type || "text"}
    </span>
  );
}

// ── Quick action buttons ───────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { key: "summarize", label: "Sum", color: "var(--info)" },
  { key: "explain", label: "Exp", color: "#a855f7" },
  { key: "reply", label: "Rep", color: "var(--accent)" },
];

// ── Message row ────────────────────────────────────────────────────────────────

function MessageRow({
  msg,
  index,
  isSelected,
  onClick,
  onAction,
  onImageClick,
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        cursor: "pointer",
        background: isSelected ? "rgba(37,211,102,0.07)" : undefined,
        boxShadow: isSelected ? "inset 3px 0 0 var(--accent)" : undefined,
        transition: "background 0.1s",
      }}
    >
      <td
        style={{
          color: "var(--text-muted)",
          fontSize: 11,
          textAlign: "right",
          paddingRight: 8,
          userSelect: "none",
        }}
      >
        {index + 1}
      </td>
      <td
        style={{
          whiteSpace: "nowrap",
          color: "var(--text-muted)",
          fontSize: 12,
        }}
      >
        {formatDate(msg.message_time)}
      </td>
      <td style={{ whiteSpace: "nowrap" }}>
        <span style={{ fontWeight: 600, color: "var(--accent)", fontSize: 13 }}>
          {msg.sender}
        </span>
      </td>
      <td>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          {msg.image_url && (
            <img
              src={msg.image_url}
              alt="attachment"
              loading="lazy"
              onClick={(e) => {
                e.stopPropagation();
                onImageClick(msg.image_url);
              }}
              style={{
                width: 44,
                height: 44,
                objectFit: "cover",
                borderRadius: 6,
                border: "1px solid var(--border)",
                display: "block",
                cursor: "pointer",
              }}
            />
          )}
          <span
            style={{ fontSize: 13, lineHeight: 1.55, wordBreak: "break-word" }}
          >
            {msg.message || (
              <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                image only
              </span>
            )}
          </span>
        </div>
      </td>
      <td style={{ textAlign: "center" }}>
        <TypeBadge type={msg.message_type} />
      </td>
      <td style={{ paddingRight: 8 }}>
        <div
          style={{
            display: "flex",
            gap: 4,
            justifyContent: "flex-end",
            opacity: hovered ? 1 : 0,
            transition: "opacity 0.15s",
            pointerEvents: hovered ? "auto" : "none",
          }}
        >
          {QUICK_ACTIONS.map(({ key, label, color }) => (
            <button
              key={key}
              title={key.charAt(0).toUpperCase() + key.slice(1)}
              onClick={(e) => {
                e.stopPropagation();
                onAction(msg, key);
              }}
              style={{
                padding: "2px 7px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.04em",
                borderRadius: 4,
                border: `1px solid ${color}`,
                background: "transparent",
                color,
                cursor: "pointer",
                lineHeight: 1.6,
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = color + "22";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </td>
    </tr>
  );
}

// ── Image modal ────────────────────────────────────────────────────────────────

function ImageModal({ url, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      {/* Toolbar — floated top-right of the viewport, always visible */}
      <div
        style={{
          position: "fixed",
          top: 14,
          right: 16,
          zIndex: 1001,
          display: "flex",
          gap: 6,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <a
          href={url}
          download="whatsapp-image"
          onClick={(e) => e.stopPropagation()}
          title="Download original image"
          style={{
            background: "rgba(0,0,0,0.65)",
            border: "1px solid rgba(255,255,255,0.18)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            borderRadius: 5,
            padding: "5px 12px",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            backdropFilter: "blur(4px)",
          }}
        >
          ↓ Download
        </a>
        <button
          onClick={onClose}
          title="Close (Esc)"
          style={{
            background: "rgba(0,0,0,0.65)",
            border: "1px solid rgba(255,255,255,0.18)",
            color: "#fff",
            fontSize: 20,
            lineHeight: 1,
            cursor: "pointer",
            borderRadius: 5,
            padding: "2px 10px",
            backdropFilter: "blur(4px)",
          }}
        >
          ×
        </button>
      </div>

      {/* Image — rendered at natural size, capped to 95% of the viewport */}
      <img
        src={url}
        alt="preview"
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "block",
          maxWidth: "95vw",
          maxHeight: "95vh",
          width: "auto",
          height: "auto",
          borderRadius: 8,
          boxShadow: "0 8px 48px rgba(0,0,0,0.7)",
          imageRendering: "auto",
        }}
      />
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function MessagesView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalImage, setModalImage] = useState(null);

  const selectedGroup = searchParams.get("group") || "";
  const selectedSender = searchParams.get("sender") || "";
  const selectedOrder = searchParams.get("order") || "DESC";

  function setFilter(key, value) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: groupsData } = useFetch(fetchGroups);
  const groups = groupsData?.data ?? [];

  const { data: sendersData } = useFetch(
    useCallback(
      () =>
        selectedGroup
          ? fetchSenders(selectedGroup)
          : Promise.resolve({ data: [] }),
      [selectedGroup],
    ),
  );
  const senders = sendersData?.data ?? [];

  const { messages, loading, error, hasMore, total, sentinelRef, reload } =
    useInfiniteMessages(selectedGroup, {
      sender: selectedSender,
      order: selectedOrder,
    });

  // Pause auto-refresh while scraper is running; auto-reload once scan completes.
  const { running: scraperRunning } = useScraperStatus({
    onScanComplete: reload,
  });
  useAutoRefresh(reload, 30_000, !!selectedGroup && !scraperRunning);

  // ── AI panel ───────────────────────────────────────────────────────────────
  const panel = useAIPanel(messages, selectedGroup);

  // ── Render ─────────────────────────────────────────────────────────────────
  const showTable = messages.length > 0;
  const showEmpty =
    !loading && !error && selectedGroup && messages.length === 0;
  const showNoGroup = !selectedGroup;

  return (
    <div>
      <div className="page-header">
        <h1>Messages</h1>
        <p>Browse all scraped messages — click a message to analyze with AI</p>
      </div>

      {/* ── Toolbar ── */}
      <div className="toolbar">
        <select
          value={selectedGroup}
          onChange={(e) => setFilter("group", e.target.value)}
        >
          <option value="">Select a group…</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        {senders.length > 0 && (
          <select
            value={selectedSender}
            onChange={(e) => setFilter("sender", e.target.value)}
          >
            <option value="">All senders</option>
            {senders.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}

        {selectedGroup && (
          <select
            value={selectedOrder}
            onChange={(e) => setFilter("order", e.target.value)}
            style={{ width: 140 }}
          >
            <option value="ASC">Oldest first</option>
            <option value="DESC">Newest first</option>
          </select>
        )}

        {selectedGroup && (
          <button className="btn btn-ghost" onClick={reload} disabled={loading}>
            ↻ Refresh
          </button>
        )}

        {total > 0 && (
          <span
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              marginLeft: "auto",
            }}
          >
            {messages.length.toLocaleString()} / {total.toLocaleString()}{" "}
            messages
          </span>
        )}
      </div>

      {/* ── Scanning banner ── */}
      {scraperRunning && (
        <div
          style={{
            background: "rgba(96,165,250,0.1)",
            border: "1px solid rgba(96,165,250,0.25)",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 12,
            fontSize: 13,
            color: "var(--info)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--info)",
              flexShrink: 0,
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
          Scanning WhatsApp — new messages will appear automatically when the
          scan completes
        </div>
      )}

      {/* ── Error ── */}
      {error && <div className="error-banner">{error}</div>}

      {/* ── No group selected ── */}
      {showNoGroup && (
        <div className="empty-state">
          <p>Select a group to browse messages</p>
          <small>Choose from the dropdown above</small>
        </div>
      )}

      {/* ── Content: table + AI panel ── */}
      {selectedGroup && (
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          {/* Left: table + scroll sentinel */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {showEmpty && (
              <div className="empty-state">
                <p>No messages found</p>
                <small>
                  {selectedSender
                    ? `No messages from ${selectedSender} in this group`
                    : "This group has no messages yet"}
                </small>
              </div>
            )}

            {showTable && (
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th
                          style={{
                            width: 40,
                            textAlign: "right",
                            paddingRight: 8,
                          }}
                        >
                          #
                        </th>
                        <th style={{ width: 160 }}>Time</th>
                        <th style={{ width: 160 }}>Sender</th>
                        <th>Message</th>
                        <th style={{ width: 70, textAlign: "center" }}>Type</th>
                        <th style={{ width: 110 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {messages.map((msg, i) => (
                        <MessageRow
                          key={msg.id}
                          msg={msg}
                          index={i}
                          isSelected={panel.selectedMsg?.id === msg.id}
                          onClick={() => panel.openPanel(msg)}
                          onAction={panel.openPanelWithAction}
                          onImageClick={setModalImage}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* IntersectionObserver sentinel */}
            <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />

            {loading && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  padding: "20px 0",
                  color: "var(--text-muted)",
                  fontSize: 13,
                }}
              >
                <div
                  className="spinner"
                  style={{ width: 20, height: 20, borderWidth: 2 }}
                />
                Loading messages…
              </div>
            )}

            {!loading && !hasMore && messages.length > 0 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "20px 0",
                  color: "var(--text-muted)",
                  fontSize: 12,
                }}
              >
                All {total.toLocaleString()} messages loaded
              </div>
            )}
          </div>

          {/* Right: AI panel */}
          {panel.isOpen && (
            <MessagePanel
              selectedMsg={panel.selectedMsg}
              activeTab={panel.activeTab}
              loadingTab={panel.loadingTab}
              currentResult={panel.currentResult}
              contextMessages={panel.contextMessages}
              switchTab={panel.switchTab}
              runTab={panel.runTab}
              closePanel={panel.closePanel}
            />
          )}
        </div>
      )}

      {modalImage && (
        <ImageModal url={modalImage} onClose={() => setModalImage(null)} />
      )}
    </div>
  );
}
