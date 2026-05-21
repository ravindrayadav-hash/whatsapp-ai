import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import useFetch from "../hooks/useFetch.js";
import { fetchGroups, runAIAction } from "../api/client.js";
import { useInfiniteMessages } from "../hooks/useInfiniteMessages.js";
import {
  SummarizeResult,
  ExplainResult,
  ReplyResult,
  JiraResult,
  ManualTicketModal,
} from "../components/ai/ResultCards.jsx";

// ── Config ─────────────────────────────────────────────────────────────────────

const ACTION_CONFIG = [
  {
    key: "summarize",
    label: "Summarize",
    desc: "Requirements & topics",
    color: "var(--accent)",
  },
  {
    key: "explain",
    label: "Explain",
    desc: "Plain English overview",
    color: "var(--info)",
  },
  {
    key: "reply",
    label: "Reply",
    desc: "Suggested responses",
    color: "var(--warning)",
  },
  { key: "jira", label: "Jira", desc: "Extract tickets", color: "#a855f7" },
];

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

// ── Result dispatcher ──────────────────────────────────────────────────────────

const RENDERERS = {
  summarize: SummarizeResult,
  explain: ExplainResult,
  reply: ReplyResult,
  jira: JiraResult,
};

// ── History helpers ────────────────────────────────────────────────────────────

function getPreview(action, data) {
  if (action === "summarize") {
    const first = data.requirements?.[0];
    return first ? first.title : "No requirements identified";
  }
  if (action === "explain") {
    const t = data.explanation || "";
    return t.length > 90 ? t.slice(0, 90) + "…" : t || "No explanation";
  }
  if (action === "reply") {
    const t =
      data.context_summary || data.suggested_replies?.[0]?.message || "";
    return t.length > 90 ? t.slice(0, 90) + "…" : t || "No replies";
  }
  if (action === "jira") {
    return data.tickets?.[0]?.title || "No tickets extracted";
  }
  return "—";
}

function HistoryItem({ entry, isExpanded, onToggle }) {
  const cfg = ACTION_CONFIG.find((a) => a.key === entry.action);
  const ResultComp = RENDERERS[entry.action];
  const preview = getPreview(entry.action, entry.data);

  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      {/* ── Row header ── */}
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "11px 14px",
          cursor: "pointer",
          background: isExpanded ? `${cfg?.color}0a` : "transparent",
          transition: "background 0.12s",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "3px 7px",
            borderRadius: 4,
            background: `${cfg?.color}22`,
            color: cfg?.color,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          {cfg?.label}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.4,
              color: "var(--text)",
              margin: "0 0 3px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {preview}
          </p>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {formatDate(entry.timestamp)}
            {" · "}
            {entry.messages.length} msg{entry.messages.length !== 1 ? "s" : ""}
          </span>
        </div>
        <span
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          {isExpanded ? "▾" : "▸"}
        </span>
      </div>

      {/* ── Expanded result ── */}
      {isExpanded && (
        <div
          style={{
            padding: "0 14px 14px",
            borderTop: "1px solid var(--border)",
            background: "var(--bg)",
          }}
        >
          <ResultComp data={entry.data} messages={entry.messages} />
        </div>
      )}
    </div>
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

export default function AIActionsView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const selectedGroup = searchParams.get("group") || "";
  const [modalImage, setModalImage] = useState(null);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [extraInput, setExtraInput] = useState("");
  const [running, setRunning] = useState(null); // action key | null
  const [result, setResult] = useState(null); // { action, data, messages } | null
  const [resultError, setResultError] = useState(null);
  const [panelTab, setPanelTab] = useState("new"); // 'new' | 'history'
  const [history, setHistory] = useState([]); // past results
  const [historyFilter, setHistoryFilter] = useState("all"); // 'all' | action key
  const [expandedId, setExpandedId] = useState(null); // expanded history item id
  // Jira manual ticket creation — opened when AI extracts no tickets
  const [jiraManualOpen, setJiraManualOpen] = useState(false);
  const [jiraSelected, setJiraSelected] = useState([]);

  // Reset live result + selection when group changes (history is kept across groups)
  useEffect(() => {
    setSelectedIds(new Set());
    setResult(null);
    setResultError(null);
    setExtraInput("");
  }, [selectedGroup]);

  // ── Data ────────────────────────────────────────────────────────────────────
  const { data: groupsData } = useFetch(fetchGroups);
  const groups = groupsData?.data ?? [];

  const {
    messages,
    loading: msgsLoading,
    error: msgsError,
    hasMore,
    total,
    sentinelRef,
    reload: reloadMessages,
  } = useInfiniteMessages(selectedGroup, { order: "DESC" });

  // ── Selection helpers ────────────────────────────────────────────────────────
  const selectedCount = selectedIds.size;
  const allSelected =
    messages.length > 0 && selectedIds.size === messages.length;

  function toggleMessage(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(
      allSelected ? new Set() : new Set(messages.map((m) => m.id)),
    );
  }

  // ── AI action handler ────────────────────────────────────────────────────────
  async function handleAction(actionKey) {
    const selected = messages.filter((m) => selectedIds.has(m.id));
    if (selected.length === 0 || running) return;

    setRunning(actionKey);
    setResult(null);
    setResultError(null);

    try {
      const payload = selected.map((m) => ({
        sender: m.sender,
        message: m.message,
        message_time: m.message_time,
        image_url: m.image_url || undefined,
      }));

      const res = await runAIAction({
        messages: payload,
        action: actionKey,
        extraInput: extraInput.trim() || undefined,
        group_name: selectedGroup || undefined,
      });

      const entry = {
        id: Date.now(),
        action: actionKey,
        data: res.data,
        messages: selected,
        timestamp: new Date().toISOString(),
      };
      setResult({ action: actionKey, data: res.data, messages: selected });

      // Jira with no tickets — auto-open the manual creation popup so the user
      // can immediately fill in title, description and status.
      if (actionKey === "jira" && !res.data?.tickets?.length) {
        setJiraSelected(selected);
        setJiraManualOpen(true);
      } else {
        setHistory((prev) => [entry, ...prev]);
      }
    } catch (err) {
      // If the Jira AI call fails, still open the manual popup so the user
      // can create a ticket without needing a working AI response.
      if (actionKey === "jira") {
        setJiraSelected(selected);
        setJiraManualOpen(true);
      } else {
        setResultError(err.message);
      }
    } finally {
      setRunning(null);
    }
  }

  // Called when user fills the manual ticket form after AI extracts nothing
  function handleManualJiraTicket(ticket) {
    const syntheticData = { tickets: [ticket] };
    const entry = {
      id: Date.now(),
      action: "jira",
      data: syntheticData,
      messages: jiraSelected,
      timestamp: new Date().toISOString(),
    };
    setResult({ action: "jira", data: syntheticData, messages: jiraSelected });
    setHistory((prev) => [entry, ...prev]);
    setJiraManualOpen(false);
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const activeActionCfg = ACTION_CONFIG.find((a) => a.key === result?.action);
  const ResultComponent = result ? RENDERERS[result.action] : null;
  const isDisabled = selectedCount === 0 || !!running;

  return (
    <div>
      <span className="back-btn" onClick={() => navigate("/")}>
        ← Dashboard
      </span>

      <div className="page-header">
        <h1>AI Actions</h1>
        <p>
          Select messages from a group, then run an AI action to get structured
          analysis
        </p>
      </div>

      {/* ── Toolbar ── */}
      <div className="toolbar">
        <select
          value={selectedGroup}
          onChange={(e) => {
            const next = new URLSearchParams();
            if (e.target.value) next.set("group", e.target.value);
            setSearchParams(next);
          }}
        >
          <option value="">Select a group…</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        {selectedGroup && (
          <button
            className="btn btn-ghost"
            onClick={reloadMessages}
            disabled={msgsLoading}
            title="Reload messages from the server"
          >
            ↻ Refresh
          </button>
        )}

        {(messages.length > 0 || msgsLoading) && (
          <>
            <button
              className="btn btn-ghost"
              onClick={toggleAll}
              disabled={messages.length === 0}
            >
              {allSelected ? "Deselect All" : "Select All"}
            </button>
            <span
              style={{
                fontSize: 13,
                color:
                  selectedCount > 0 ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              {selectedCount > 0
                ? `${selectedCount} of ${messages.length} selected`
                : `${messages.length.toLocaleString()}${total > messages.length ? ` / ${total.toLocaleString()}` : ""} messages`}
            </span>
          </>
        )}
      </div>

      {/* ── Empty state ── */}
      {!selectedGroup && (
        <div className="empty-state">
          <p>Select a group to get started</p>
          <small>Choose from the dropdown above</small>
        </div>
      )}

      {/* ── Two-column layout ── */}
      {selectedGroup && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 360px",
            gap: 16,
            alignItems: "start",
          }}
        >
          {/* ── Left: messages ── */}
          <div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {msgsLoading && messages.length === 0 && (
                <div className="spinner-wrap">
                  <div className="spinner" />
                </div>
              )}
              {msgsError && (
                <div className="error-banner" style={{ margin: 16 }}>
                  {msgsError}
                </div>
              )}
              {!msgsLoading && !msgsError && messages.length === 0 && (
                <div className="empty-state">
                  <p>No messages found</p>
                </div>
              )}
              {messages.length > 0 && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 36, paddingLeft: 16 }}>
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleAll}
                            title="Toggle all"
                          />
                        </th>
                        <th>Time</th>
                        <th>Sender</th>
                        <th>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {messages.map((m) => {
                        const sel = selectedIds.has(m.id);
                        return (
                          <tr
                            key={m.id}
                            onClick={() => toggleMessage(m.id)}
                            style={{
                              cursor: "pointer",
                              background: sel
                                ? m.image_url
                                  ? "rgba(168,85,247,0.08)"
                                  : "rgba(37,211,102,0.07)"
                                : undefined,
                              boxShadow:
                                sel && m.image_url
                                  ? "inset 3px 0 0 #a855f7"
                                  : undefined,
                            }}
                          >
                            <td
                              style={{ paddingLeft: 16 }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={sel}
                                onChange={() => toggleMessage(m.id)}
                              />
                            </td>
                            <td
                              style={{
                                whiteSpace: "nowrap",
                                color: "var(--text-muted)",
                                fontSize: 12,
                              }}
                            >
                              {formatDate(m.message_time)}
                            </td>
                            <td
                              style={{
                                whiteSpace: "nowrap",
                                color: "var(--accent)",
                                fontWeight: 500,
                              }}
                            >
                              {m.sender}
                            </td>
                            <td style={{ maxWidth: 440 }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  gap: 8,
                                }}
                              >
                                {m.image_url && (
                                  <img
                                    src={m.image_url}
                                    alt="attachment"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setModalImage(m.image_url);
                                    }}
                                    style={{
                                      width: 48,
                                      height: 48,
                                      objectFit: "cover",
                                      borderRadius: 6,
                                      border: "1px solid var(--border)",
                                      display: "block",
                                      flexShrink: 0,
                                      cursor: "pointer",
                                    }}
                                  />
                                )}
                                <span
                                  style={{
                                    wordBreak: "break-word",
                                    lineHeight: 1.5,
                                  }}
                                >
                                  {m.message || (
                                    <span
                                      style={{
                                        color: "var(--text-muted)",
                                        fontStyle: "italic",
                                      }}
                                    >
                                      image only
                                    </span>
                                  )}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />

            {msgsLoading && messages.length > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  padding: "16px 0",
                  color: "var(--text-muted)",
                  fontSize: 13,
                }}
              >
                <div
                  className="spinner"
                  style={{ width: 20, height: 20, borderWidth: 2 }}
                />
                Loading more messages…
              </div>
            )}

            {!msgsLoading && !hasMore && messages.length > 0 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "12px 0",
                  color: "var(--text-muted)",
                  fontSize: 12,
                }}
              >
                All {total.toLocaleString()} messages loaded
              </div>
            )}
          </div>

          {/* ── Right: action panel ── */}
          <div
            style={{
              position: "sticky",
              top: 32,
              alignSelf: "flex-start",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {/* ── Panel tab bar ── */}
            <div
              style={{
                display: "flex",
                borderBottom: "1px solid var(--border)",
                background: "var(--bg)",
              }}
            >
              {[
                { key: "new", label: "New Action" },
                {
                  key: "history",
                  label: `History${history.length ? ` (${history.length})` : ""}`,
                },
              ].map((t) => {
                const active = panelTab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setPanelTab(t.key)}
                    style={{
                      flex: 1,
                      padding: "13px 8px",
                      background: "none",
                      border: "none",
                      borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
                      color: active ? "var(--accent)" : "var(--text-muted)",
                      fontSize: 13,
                      fontWeight: active ? 700 : 400,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* ── New Action tab ── */}
            {panelTab === "new" && (
              <div style={{ padding: 14 }}>
                {/* Action buttons grid */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                    marginBottom: 14,
                  }}
                >
                  {ACTION_CONFIG.map((a) => {
                    const isRunning = running === a.key;
                    const isActive = result?.action === a.key && !running;
                    return (
                      <button
                        key={a.key}
                        onClick={() => handleAction(a.key)}
                        disabled={isDisabled}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                          padding: "12px 14px",
                          borderRadius: 8,
                          textAlign: "left",
                          border: `1px solid ${isActive ? a.color : "var(--border)"}`,
                          background: isActive
                            ? `${a.color}18`
                            : "var(--surface-alt)",
                          cursor: isDisabled ? "not-allowed" : "pointer",
                          opacity: isDisabled && !isRunning ? 0.5 : 1,
                          transition: "all 0.15s",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: isActive ? a.color : "var(--text)",
                            marginBottom: 3,
                          }}
                        >
                          {isRunning ? (
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <span
                                style={{
                                  width: 10,
                                  height: 10,
                                  border: "2px solid var(--border)",
                                  borderTopColor: a.color,
                                  borderRadius: "50%",
                                  display: "inline-block",
                                  animation: "spin 0.7s linear infinite",
                                }}
                              />
                              {a.label}
                            </span>
                          ) : (
                            a.label
                          )}
                        </span>
                        <span
                          style={{ fontSize: 11, color: "var(--text-muted)" }}
                        >
                          {a.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Extra input */}
                <input
                  type="text"
                  placeholder="Reply intent / extra context (optional)"
                  value={extraInput}
                  onChange={(e) => setExtraInput(e.target.value)}
                  style={{
                    width: "100%",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "8px 12px",
                    color: "var(--text)",
                    fontSize: 13,
                    outline: "none",
                  }}
                  onFocus={(e) =>
                    (e.target.style.borderColor = "var(--accent)")
                  }
                  onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                />

                {/* Selection hint */}
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    color: "var(--text-muted)",
                    textAlign: "center",
                  }}
                >
                  {selectedCount === 0 && "Select messages to enable actions"}
                  {selectedCount > 0 &&
                    !running &&
                    !result &&
                    `${selectedCount} message${selectedCount !== 1 ? "s" : ""} ready — click an action`}
                  {selectedCount > 0 &&
                    !running &&
                    result &&
                    `${selectedCount} message${selectedCount !== 1 ? "s" : ""} selected`}
                </div>

                {/* Live result area */}
                {(running || result || resultError) && (
                  <div
                    style={{
                      marginTop: 14,
                      paddingTop: 14,
                      borderTop: "1px solid var(--border)",
                      maxHeight: 460,
                      overflowY: "auto",
                    }}
                  >
                    {running && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 10,
                          padding: "28px 0",
                        }}
                      >
                        <div className="spinner" />
                        <span
                          style={{ fontSize: 12, color: "var(--text-muted)" }}
                        >
                          Running{" "}
                          {ACTION_CONFIG.find((a) => a.key === running)?.label}…
                        </span>
                      </div>
                    )}
                    {resultError && !running && (
                      <div className="error-banner" style={{ margin: 0 }}>
                        {resultError}
                      </div>
                    )}
                    {result && !running && ResultComponent && (
                      <>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 14,
                          }}
                        >
                          <span style={{ fontSize: 13, fontWeight: 700 }}>
                            {activeActionCfg?.label} Result
                          </span>
                          {activeActionCfg && (
                            <span
                              style={{
                                fontSize: 11,
                                padding: "2px 8px",
                                borderRadius: 20,
                                background: `${activeActionCfg.color}22`,
                                color: activeActionCfg.color,
                              }}
                            >
                              {result.messages?.length ?? selectedCount} msg
                              {(result.messages?.length ?? selectedCount) !== 1
                                ? "s"
                                : ""}
                            </span>
                          )}
                        </div>
                        <ResultComponent
                          data={result.data}
                          messages={result.messages ?? []}
                          onCreateManual={
                            result.action === "jira"
                              ? () => setJiraManualOpen(true)
                              : undefined
                          }
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── History tab ── */}
            {panelTab === "history" && (
              <div>
                {history.length === 0 ? (
                  <div className="empty-state" style={{ padding: "36px 16px" }}>
                    <p>No history yet</p>
                    <small>Run an action to see results here</small>
                  </div>
                ) : (
                  <>
                    {/* Filter pills */}
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        flexWrap: "wrap",
                        padding: "10px 14px",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {["all", ...ACTION_CONFIG.map((a) => a.key)].map((f) => {
                        const cfg = ACTION_CONFIG.find((a) => a.key === f);
                        const count =
                          f === "all"
                            ? history.length
                            : history.filter((h) => h.action === f).length;
                        const active = historyFilter === f;
                        if (f !== "all" && count === 0) return null;
                        return (
                          <button
                            key={f}
                            onClick={() => setHistoryFilter(f)}
                            style={{
                              padding: "4px 10px",
                              borderRadius: 20,
                              fontSize: 11,
                              fontWeight: active ? 700 : 400,
                              border: `1px solid ${active ? cfg?.color || "var(--accent)" : "var(--border)"}`,
                              background: active
                                ? `${cfg?.color || "var(--accent)"}18`
                                : "transparent",
                              color: active
                                ? cfg?.color || "var(--accent)"
                                : "var(--text-muted)",
                              cursor: "pointer",
                              transition: "all 0.12s",
                            }}
                          >
                            {f === "all" ? "All" : cfg?.label} {count}
                          </button>
                        );
                      })}
                    </div>

                    {/* History items */}
                    <div style={{ maxHeight: 600, overflowY: "auto" }}>
                      {history
                        .filter(
                          (h) =>
                            historyFilter === "all" ||
                            h.action === historyFilter,
                        )
                        .map((entry) => (
                          <HistoryItem
                            key={entry.id}
                            entry={entry}
                            isExpanded={expandedId === entry.id}
                            onToggle={() =>
                              setExpandedId((prev) =>
                                prev === entry.id ? null : entry.id,
                              )
                            }
                          />
                        ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {modalImage && (
        <ImageModal url={modalImage} onClose={() => setModalImage(null)} />
      )}

      {jiraManualOpen && (
        <ManualTicketModal
          messages={jiraSelected}
          onConfirm={handleManualJiraTicket}
          onClose={() => setJiraManualOpen(false)}
        />
      )}
    </div>
  );
}
