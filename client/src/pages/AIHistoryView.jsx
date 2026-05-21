import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import useFetch from "../hooks/useFetch.js";
import useAutoRefresh from "../hooks/useAutoRefresh.js";
import { fetchGroups, fetchAIHistory, runAIAction } from "../api/client.js";
import {
  SummarizeResult,
  ExplainResult,
  ReplyResult,
  JiraResult,
} from "../components/ai/ResultCards.jsx";

// ── Config ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

const ACTION_TYPES = [
  { key: "summarize", label: "Summarize", color: "var(--accent)" },
  { key: "explain", label: "Explain", color: "var(--info)" },
  { key: "reply", label: "Reply", color: "var(--warning)" },
  { key: "jira", label: "Jira", color: "#a855f7" },
];

const RENDERERS = {
  summarize: SummarizeResult,
  explain: ExplainResult,
  reply: ReplyResult,
  jira: JiraResult,
};

// ── Pure helpers ───────────────────────────────────────────────────────────────

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

function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPreview(action, response) {
  if (!response) return "—";
  if (action === "summarize") {
    const first = response.requirements?.[0];
    return first ? first.title : "No requirements identified";
  }
  if (action === "explain") {
    const t = response.explanation || "";
    return t.length > 100 ? t.slice(0, 100) + "…" : t || "No explanation";
  }
  if (action === "reply") {
    const t =
      response.context_summary ||
      response.suggested_replies?.[0]?.message ||
      "";
    return t.length > 100 ? t.slice(0, 100) + "…" : t || "No replies";
  }
  if (action === "jira") {
    return response.tickets?.[0]?.title || "No tickets extracted";
  }
  return "—";
}

/**
 * Returns a Set of indices that are considered "key" messages.
 * Key = image present, or sender name appears in the AI result, or last message.
 */
function computeKeyIndices(messages, response) {
  const keySet = new Set();
  const resultText = response ? JSON.stringify(response).toLowerCase() : "";

  messages.forEach((m, i) => {
    if (m.image_url) {
      keySet.add(i);
      return;
    }
    // Sender name (>2 chars to avoid false matches) appears in the result
    if (
      m.sender &&
      m.sender.length > 2 &&
      resultText.includes(m.sender.toLowerCase())
    ) {
      keySet.add(i);
    }
  });

  // Last message is always relevant (the trigger)
  if (messages.length > 0) keySet.add(messages.length - 1);

  return keySet;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ActionBadge({ type }) {
  const cfg = ACTION_TYPES.find((a) => a.key === type) || {
    label: type,
    color: "var(--text-muted)",
  };
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "3px 8px",
        borderRadius: 4,
        background: `${cfg.color}22`,
        color: cfg.color,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}

function MessageItem({ msg, index, isSelected, isKey, onToggle }) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 9,
        padding: "8px 10px",
        borderRadius: 7,
        marginBottom: 3,
        cursor: "pointer",
        border: `1px solid ${isKey ? "var(--accent)" : "transparent"}`,
        background: isKey
          ? isSelected
            ? "rgba(37,211,102,0.08)"
            : "rgba(37,211,102,0.03)"
          : isSelected
            ? "var(--surface)"
            : "transparent",
        opacity: isSelected ? 1 : 0.45,
        transition: "all 0.1s",
      }}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        style={{ flexShrink: 0, marginTop: 3, cursor: "pointer" }}
      />

      {msg.image_url && (
        <a
          href={msg.image_url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{ flexShrink: 0 }}
        >
          <img
            src={msg.image_url}
            alt="attachment"
            style={{
              width: 38,
              height: 38,
              objectFit: "cover",
              borderRadius: 5,
              display: "block",
              border: "1px solid var(--border)",
            }}
          />
        </a>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            marginBottom: 2,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--accent)",
              flexShrink: 0,
            }}
          >
            {msg.sender}
          </span>
          {isKey && (
            <span
              style={{
                fontSize: 9,
                padding: "1px 5px",
                borderRadius: 3,
                background: "var(--accent)22",
                color: "var(--accent)",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                flexShrink: 0,
              }}
            >
              key
            </span>
          )}
          <span
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              marginLeft: "auto",
              flexShrink: 0,
            }}
          >
            {formatTime(msg.message_time)}
          </span>
        </div>
        <p
          style={{
            fontSize: 12,
            lineHeight: 1.45,
            color: "var(--text-muted)",
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {msg.message || "(image only)"}
        </p>
      </div>
    </div>
  );
}

// ── Detail Drawer ──────────────────────────────────────────────────────────────

function DetailDrawer({ entry, onClose }) {
  const messages = entry?.messages ?? [];
  const allIndices = useCallback(
    () => new Set(messages.map((_, i) => i)),
    [entry?.id],
  ); // eslint-disable-line

  const [selectedIds, setSelectedIds] = useState(allIndices);
  const [rerunResult, setRerunResult] = useState(null); // { data, messages }
  const [rerunLoading, setRerunLoading] = useState(false);
  const [rerunError, setRerunError] = useState(null);
  const [resultView, setResultView] = useState("original"); // 'original' | 'rerun'

  // Reset all drawer state when the selected entry changes
  useEffect(() => {
    setSelectedIds(new Set(messages.map((_, i) => i)));
    setRerunResult(null);
    setRerunError(null);
    setResultView("original");
  }, [entry?.id]); // eslint-disable-line

  if (!entry) return null;

  const cfg = ACTION_TYPES.find((a) => a.key === entry.action_type);
  const keySet = computeKeyIndices(messages, entry.response);
  const selCount = selectedIds.size;
  const hasRerun = !!rerunResult;

  // ── Quick-select helpers ───────────────────────────────────────────────────
  function selectAll() {
    setSelectedIds(new Set(messages.map((_, i) => i)));
  }
  function selectNone() {
    setSelectedIds(new Set());
  }
  function selectKeyOnly() {
    setSelectedIds(new Set(keySet));
  }

  function toggleMsg(i) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  // ── Re-run ─────────────────────────────────────────────────────────────────
  async function handleRerun() {
    if (rerunLoading || selCount === 0) return;
    const selected = messages.filter((_, i) => selectedIds.has(i));

    setRerunLoading(true);
    setRerunError(null);

    try {
      const res = await runAIAction({
        messages: selected,
        action: entry.action_type,
        group_name: entry.group_name || undefined,
      });
      setRerunResult({ data: res.data, messages: selected });
      setResultView("rerun");
    } catch (err) {
      setRerunError(err.message);
    } finally {
      setRerunLoading(false);
    }
  }

  // ── Active result data ─────────────────────────────────────────────────────
  const activeData =
    resultView === "rerun" && rerunResult ? rerunResult.data : entry.response;
  const activeMessages =
    resultView === "rerun" && rerunResult ? rerunResult.messages : messages;
  const ResultComp = RENDERERS[entry.action_type];

  return (
    <>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          zIndex: 200,
        }}
      />

      {/* Drawer — wide enough for split view */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(920px, calc(100vw - 48px))",
          zIndex: 201,
          background: "var(--bg)",
          borderLeft: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-8px 0 40px rgba(0,0,0,0.3)",
          animation: "slideInRight 0.22s ease-out",
        }}
      >
        {/* ── Drawer header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 20px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minWidth: 0,
            }}
          >
            <ActionBadge type={entry.action_type} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--accent)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {entry.group_name || "Unknown group"}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginTop: 1,
                }}
              >
                {formatDate(entry.created_at)}
                {" · "}
                {messages.length} message{messages.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Close"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: 22,
              lineHeight: 1,
              padding: "2px 6px",
              borderRadius: 4,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* ── Split body ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* ── LEFT: Messages panel ── */}
          <div
            style={{
              width: 320,
              flexShrink: 0,
              borderRight: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              background: "var(--surface)",
            }}
          >
            {/* Messages header + quick-select */}
            <div
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--text)",
                  marginRight: 2,
                }}
              >
                Messages
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: selCount > 0 ? cfg?.color : "var(--text-muted)",
                  fontWeight: 600,
                }}
              >
                {selCount} / {messages.length}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                {[
                  { label: "All", fn: selectAll },
                  { label: "Key", fn: selectKeyOnly },
                  { label: "None", fn: selectNone },
                ].map(({ label, fn }) => (
                  <button
                    key={label}
                    onClick={fn}
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "2px 7px",
                      borderRadius: 4,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Message list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
              {messages.length === 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    padding: "12px 4px",
                  }}
                >
                  No messages stored for this log.
                </p>
              ) : (
                messages.map((msg, i) => (
                  <MessageItem
                    key={i}
                    msg={msg}
                    index={i}
                    isSelected={selectedIds.has(i)}
                    isKey={keySet.has(i)}
                    onToggle={() => toggleMsg(i)}
                  />
                ))
              )}
            </div>

            {/* Re-run footer */}
            <div
              style={{
                padding: "10px 12px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                flexShrink: 0,
              }}
            >
              {rerunError && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--danger)",
                    lineHeight: 1.4,
                  }}
                >
                  {rerunError}
                </div>
              )}
              <button
                onClick={handleRerun}
                disabled={selCount === 0 || rerunLoading}
                style={{
                  padding: "9px 14px",
                  borderRadius: 8,
                  border: "none",
                  background:
                    selCount === 0 ? "var(--surface-alt)" : cfg?.color,
                  color: selCount === 0 ? "var(--text-muted)" : "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: selCount === 0 ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  transition: "opacity 0.15s",
                  opacity: rerunLoading ? 0.7 : 1,
                }}
              >
                {rerunLoading ? (
                  <>
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderTopColor: "#fff",
                        display: "inline-block",
                        animation: "spin 0.7s linear infinite",
                      }}
                    />
                    Running…
                  </>
                ) : (
                  <>
                    Re-run {cfg?.label}
                    {selCount > 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 10,
                          background: "rgba(255,255,255,0.25)",
                        }}
                      >
                        {selCount} msg{selCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ── RIGHT: Result panel ── */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
            }}
          >
            {/* Result view toggle (only when re-run result exists) */}
            <div
              style={{
                display: "flex",
                borderBottom: "1px solid var(--border)",
                background: "var(--bg)",
                flexShrink: 0,
              }}
            >
              {[
                { key: "original", label: "Original result" },
                ...(hasRerun ? [{ key: "rerun", label: "Re-run result" }] : []),
              ].map((tab) => {
                const active = resultView === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setResultView(tab.key)}
                    style={{
                      padding: "11px 18px",
                      background: "none",
                      border: "none",
                      borderBottom: `2px solid ${active ? (cfg?.color ?? "var(--accent)") : "transparent"}`,
                      color: active
                        ? (cfg?.color ?? "var(--accent)")
                        : "var(--text-muted)",
                      fontSize: 12,
                      fontWeight: active ? 700 : 400,
                      cursor: "pointer",
                      transition: "all 0.15s",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {tab.label}
                    {tab.key === "rerun" && (
                      <span
                        style={{
                          fontSize: 9,
                          padding: "1px 5px",
                          borderRadius: 3,
                          background: `${cfg?.color}22`,
                          color: cfg?.color,
                          fontWeight: 800,
                        }}
                      >
                        NEW
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Re-run summary in header when viewing re-run */}
              {resultView === "rerun" && rerunResult && (
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginLeft: "auto",
                    paddingRight: 16,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {rerunResult.messages.length} msg
                  {rerunResult.messages.length !== 1 ? "s" : ""} used
                </span>
              )}
            </div>

            {/* Result content */}
            <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
              {rerunLoading ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 14,
                    paddingTop: 60,
                  }}
                >
                  <div className="spinner" />
                  <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    Running {cfg?.label}…
                  </span>
                </div>
              ) : ResultComp ? (
                <ResultComp data={activeData} messages={activeMessages} />
              ) : (
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  No renderer for "{entry.action_type}".
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AIHistoryView() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filterGroup = searchParams.get("group") || "";
  const filterAction = searchParams.get("action") || "";
  const filterFrom = searchParams.get("from") || "";
  const filterTo = searchParams.get("to") || "";

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

  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [selectedEntry, setSelectedEntry] = useState(null);

  // refreshTick is incremented by auto-refresh; adding it to filterKey causes
  // the existing reset effect to run, clearing logs and resetting to page 1.
  const [refreshTick, setRefreshTick] = useState(0);
  useAutoRefresh(
    useCallback(() => setRefreshTick((t) => t + 1), []),
    30_000,
    true,
  );

  const filterKey = [filterGroup, filterAction, filterFrom, filterTo, refreshTick].join("|");

  useEffect(() => {
    setPage(1);
    setLogs([]);
  }, [filterKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchAIHistory({
      group_name: filterGroup || undefined,
      action_type: filterAction || undefined,
      from: filterFrom || undefined,
      to: filterTo || undefined,
      page,
      limit: PAGE_SIZE,
    })
      .then((res) => {
        if (cancelled) return;
        const batch = res.data ?? [];
        setLogs((prev) => (page === 1 ? batch : [...prev, ...batch]));
        setTotal(res.total ?? 0);
        setHasMore(res.hasMore ?? false);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page]);

  function loadMore() {
    if (!hasMore || loading) return;
    setPage((p) => p + 1);
  }

  function clearFilters() {
    setSearchParams({});
  }
  const hasFilters = filterGroup || filterAction || filterFrom || filterTo;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="page-header">
        <h1>AI History</h1>
        <p>
          {total > 0
            ? `${total.toLocaleString()} action${total !== 1 ? "s" : ""} recorded`
            : "All AI analysis runs across all groups"}
        </p>
      </div>

      {/* ── Filters ── */}
      <div className="toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
        <select
          value={filterGroup}
          onChange={(e) => setFilter("group", e.target.value)}
        >
          <option value="">All groups</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        <select
          value={filterAction}
          onChange={(e) => setFilter("action", e.target.value)}
        >
          <option value="">All actions</option>
          {ACTION_TYPES.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={filterFrom}
          onChange={(e) => setFilter("from", e.target.value)}
          title="From date"
          style={{ width: 148 }}
        />
        <input
          type="date"
          value={filterTo}
          onChange={(e) => setFilter("to", e.target.value)}
          title="To date"
          style={{ width: 148 }}
        />

        {hasFilters && (
          <button
            className="btn btn-ghost"
            onClick={clearFilters}
            style={{ fontSize: 12 }}
          >
            Clear filters
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
            {logs.length.toLocaleString()} / {total.toLocaleString()}
          </span>
        )}
      </div>

      {/* ── Error ── */}
      {error && <div className="error-banner">{error}</div>}

      {/* ── Initial load ── */}
      {loading && logs.length === 0 && (
        <div className="spinner-wrap">
          <div className="spinner" />
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && !error && logs.length === 0 && (
        <div className="empty-state">
          <p>No AI actions found</p>
          <small>
            {hasFilters
              ? "Try adjusting your filters"
              : "Run AI actions on the Messages or AI Actions pages to see history here"}
          </small>
        </div>
      )}

      {/* ── Table ── */}
      {logs.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th
                    style={{ width: 40, textAlign: "right", paddingRight: 8 }}
                  >
                    #
                  </th>
                  <th style={{ width: 170 }}>Time</th>
                  <th style={{ width: 155 }}>Group</th>
                  <th style={{ width: 100 }}>Action</th>
                  <th>Preview</th>
                  <th style={{ width: 55, textAlign: "center" }}>Msgs</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((entry, i) => {
                  const isSelected = selectedEntry?.id === entry.id;
                  return (
                    <tr
                      key={entry.id}
                      onClick={() => setSelectedEntry(entry)}
                      style={{
                        cursor: "pointer",
                        background: isSelected
                          ? "rgba(37,211,102,0.07)"
                          : undefined,
                        boxShadow: isSelected
                          ? "inset 3px 0 0 var(--accent)"
                          : undefined,
                        transition: "background 0.1s",
                      }}
                    >
                      <td
                        style={{
                          color: "var(--text-muted)",
                          fontSize: 11,
                          textAlign: "right",
                          paddingRight: 8,
                        }}
                      >
                        {i + 1}
                      </td>
                      <td
                        style={{
                          whiteSpace: "nowrap",
                          color: "var(--text-muted)",
                          fontSize: 12,
                        }}
                      >
                        {formatDate(entry.created_at)}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {entry.group_name ? (
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: "var(--accent)",
                            }}
                          >
                            {entry.group_name}
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: 12,
                              color: "var(--text-muted)",
                              fontStyle: "italic",
                            }}
                          >
                            —
                          </span>
                        )}
                      </td>
                      <td>
                        <ActionBadge type={entry.action_type} />
                      </td>
                      <td>
                        <p
                          style={{
                            fontSize: 13,
                            lineHeight: 1.4,
                            margin: 0,
                            maxWidth: 360,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: "var(--text)",
                          }}
                        >
                          {getPreview(entry.action_type, entry.response)}
                        </p>
                      </td>
                      <td
                        style={{
                          textAlign: "center",
                          fontSize: 12,
                          color: "var(--text-muted)",
                        }}
                      >
                        {entry.messages?.length ?? 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Load more ── */}
      {logs.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "16px 0",
          }}
        >
          {loading && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              <div
                className="spinner"
                style={{ width: 18, height: 18, borderWidth: 2 }}
              />
              Loading…
            </div>
          )}
          {!loading && hasMore && (
            <button
              className="btn btn-ghost"
              onClick={loadMore}
              style={{ fontSize: 13 }}
            >
              Load more — {(total - logs.length).toLocaleString()} remaining
            </button>
          )}
          {!loading && !hasMore && total > 0 && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              All {total.toLocaleString()} entries loaded
            </span>
          )}
        </div>
      )}

      {/* ── Detail drawer ── */}
      <DetailDrawer
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </div>
  );
}
