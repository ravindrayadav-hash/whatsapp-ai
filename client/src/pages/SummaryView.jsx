import { useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import useFetch from "../hooks/useFetch.js";
import useAutoRefresh from "../hooks/useAutoRefresh.js";
import { useInfiniteMessages } from "../hooks/useInfiniteMessages.js";
import ItemList from "../components/ItemList.jsx";
import {
  fetchGroups,
  fetchSummaries,
  fetchSenders,
  triggerSummary,
} from "../api/client.js";

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

// datetime-local inputs store "YYYY-MM-DDTHH:MM" in LOCAL time.
// We keep this raw string in URL params and only convert to ISO for API calls.
function localToISO(localStr) {
  if (!localStr) return "";
  // new Date("YYYY-MM-DDTHH:MM") parses as local time correctly
  return new Date(localStr).toISOString();
}

const REFRESH_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "30 sec", value: 30_000 },
  { label: "1 min", value: 60_000 },
  { label: "5 min", value: 300_000 },
];

// ── Priority badge ─────────────────────────────────────────────────────────────

const PRIORITY_CLASS = {
  High: "badge red",
  Medium: "badge yellow",
  Low: "badge green",
};

function PriorityBadge({ priority }) {
  return (
    <span className={PRIORITY_CLASS[priority] || "badge"}>
      {priority || "Medium"}
    </span>
  );
}

// ── Requirement card ───────────────────────────────────────────────────────────

function RequirementCard({ req }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        marginBottom: 8,
        overflow: "hidden",
      }}
    >
      {/* Header row */}
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 14px",
          cursor: "pointer",
          background: "var(--surface)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flex: 1,
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text)",
              flexShrink: 0,
            }}
          >
            {open ? "▾" : "▸"}
          </span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {req.title}
          </span>
        </div>
        <PriorityBadge priority={req.priority} />
      </div>

      {/* Expanded body */}
      {open && (
        <div
          style={{
            padding: "12px 14px",
            borderTop: "1px solid var(--border)",
            background: "var(--bg)",
          }}
        >
          {req.description && (
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.7,
                marginBottom: 12,
                color: "var(--text)",
              }}
            >
              {req.description}
            </p>
          )}

          {req.issues?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--danger)",
                  marginBottom: 5,
                }}
              >
                Issues
              </div>
              <ItemList
                items={req.issues}
                dotClass="dot-red"
                emptyText="None"
              />
            </div>
          )}

          {req.action_items?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--warning)",
                  marginBottom: 5,
                }}
              >
                Action Items
              </div>
              <ItemList
                items={req.action_items}
                dotClass="dot-yellow"
                emptyText="None"
              />
            </div>
          )}

          {req.messages?.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--text-muted)",
                  marginBottom: 5,
                }}
              >
                Source Messages
              </div>
              <ul className="item-list">
                {req.messages.map((m, i) => (
                  <li
                    key={i}
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      fontStyle: "italic",
                    }}
                  >
                    <span className="dot dot-grey" />
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Requirements list ──────────────────────────────────────────────────────────

function RequirementsList({ requirements }) {
  if (!requirements || requirements.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 0" }}>
        None identified
      </p>
    );
  }
  // Support both old format (string[]) and new format (object[])
  if (typeof requirements[0] === "string") {
    return (
      <ItemList
        items={requirements}
        dotClass="dot-blue"
        emptyText="None identified"
      />
    );
  }
  return requirements.map((req, i) => <RequirementCard key={i} req={req} />);
}

// ── Summary card (history rows) ────────────────────────────────────────────────

function SummaryCard({ summary }) {
  const [tab, setTab] = useState("requirements");
  const reqs = summary.requirements ?? [];
  const totalIssues =
    Array.isArray(reqs) && typeof reqs[0] === "object"
      ? reqs.reduce((n, r) => n + (r.issues?.length ?? 0), 0)
      : (summary.issues?.length ?? 0);
  const totalActions =
    Array.isArray(reqs) && typeof reqs[0] === "object"
      ? reqs.reduce((n, r) => n + (r.action_items?.length ?? 0), 0)
      : (summary.action_items?.length ?? 0);

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {formatDate(summary.createdAt)}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {reqs.length > 0 && (
            <span className="badge blue">{reqs.length} req</span>
          )}
          {totalIssues > 0 && (
            <span className="badge red">{totalIssues} issues</span>
          )}
          {totalActions > 0 && (
            <span className="badge yellow">{totalActions} actions</span>
          )}
        </div>
      </div>
      <div className="tabs">
        {["requirements", "overview"].map((t) => (
          <span
            key={t}
            className={`tab ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </span>
        ))}
      </div>
      {tab === "requirements" && (
        <RequirementsList requirements={summary.requirements} />
      )}
      {tab === "overview" && (
        <p className="summary-text">{summary.summary_text}</p>
      )}
    </div>
  );
}

// ── Messages table ─────────────────────────────────────────────────────────────

function MessagesTable({ group, from, to, sender }) {
  const { messages, loading, error, hasMore, total, sentinelRef } =
    useInfiniteMessages(group, {
      from: from ? localToISO(from) : "",
      to: to ? localToISO(to) : "",
      sender: sender || "",
      order: "DESC",
    });

  return (
    <>
      {loading && messages.length === 0 && (
        <div className="spinner-wrap">
          <div className="spinner" />
        </div>
      )}
      {error && <div className="error-banner">{error}</div>}
      {!loading && !error && messages.length === 0 && (
        <div className="empty-state">
          <p>No messages found</p>
        </div>
      )}

      {messages.length > 0 && (
        <div className="table-wrap">
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginBottom: 8,
            }}
          >
            {total} message{total !== 1 ? "s" : ""}
            {sender && (
              <span className="badge blue" style={{ marginLeft: 8 }}>
                User: {sender}
              </span>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Sender</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => {
                const isSender = sender && m.sender === sender;
                const firstName = sender ? sender.split(" ")[0] : "";
                const isMention = sender && m.message.includes(`@${firstName}`);
                const rowStyle = isSender
                  ? { background: "rgba(0,200,100,0.07)" }
                  : isMention
                    ? { background: "rgba(59,130,246,0.07)" }
                    : {};
                return (
                  <tr key={m.id} style={rowStyle}>
                    <td
                      style={{
                        whiteSpace: "nowrap",
                        color: "var(--text-muted)",
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
                    <td style={{ maxWidth: 480, wordBreak: "break-word" }}>
                      {isMention
                        ? highlightMention(m.message, firstName)
                        : m.message}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* sentinel always rendered so IntersectionObserver attaches on mount */}
      <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />

      {loading && messages.length > 0 && (
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

      {!loading && !hasMore && messages.length > 0 && (
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
    </>
  );
}

function highlightMention(text, name) {
  const parts = text.split(new RegExp(`(@${name})`, "gi"));
  return parts.map((p, i) =>
    p.toLowerCase() === `@${name.toLowerCase()}` ? (
      <mark
        key={i}
        style={{
          background: "rgba(59,130,246,0.3)",
          borderRadius: 3,
          padding: "0 2px",
        }}
      >
        {p}
      </mark>
    ) : (
      p
    ),
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SummaryView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // ── Filter state (synced to URL) ──────────────────────────────
  // from/to are stored as raw "YYYY-MM-DDTHH:MM" local strings (not ISO)
  const selectedGroup = searchParams.get("group") || "";
  const fromParam = searchParams.get("from") || "";
  const toParam = searchParams.get("to") || "";
  const selectedSender = searchParams.get("sender") || "";

  function setParam(key, value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  function clearFilters() {
    const next = new URLSearchParams();
    if (selectedGroup) next.set("group", selectedGroup);
    setSearchParams(next);
  }

  // ── UI state ──────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("summaries");
  const [refreshMs, setRefreshMs] = useState(0);
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // ── Data ──────────────────────────────────────────────────────
  const { data: groupsData } = useFetch(fetchGroups);
  const groups = groupsData?.data ?? [];

  // Senders for the selected group (for user filter dropdown)
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

  const fetchArgs = useCallback(
    () =>
      selectedGroup
        ? fetchSummaries(selectedGroup, {
            limit: 50,
            from: fromParam ? localToISO(fromParam) : undefined,
            to: toParam ? localToISO(toParam) : undefined,
          })
        : Promise.resolve({ data: [] }),
    [selectedGroup, fromParam, toParam],
  );

  const { data: summaryData, loading, error, refetch } = useFetch(fetchArgs);

  const summaries = summaryData?.data ?? [];

  // ── Auto-refresh ──────────────────────────────────────────────
  useAutoRefresh(
    useCallback(() => {
      refetch();
      setLastRefreshed(new Date());
    }, [refetch]),
    refreshMs,
    refreshMs > 0,
  );

  // ── Trigger handler ───────────────────────────────────────────
  async function handleTrigger() {
    if (!selectedGroup) return;
    setTriggering(true);
    setTriggerMsg("");
    try {
      const res = await triggerSummary(selectedGroup);
      setTriggerMsg(
        res.status === "processed"
          ? `✓ Summarised ${res.messageCount} messages`
          : `— ${res.reason}`,
      );
      refetch();
      setLastRefreshed(new Date());
    } catch (err) {
      setTriggerMsg(`Error: ${err.message}`);
    } finally {
      setTriggering(false);
    }
  }

  const hasDateFilter = fromParam || toParam;
  const hasActiveFilter = fromParam || toParam || selectedSender;

  return (
    <div>
      <span className="back-btn" onClick={() => navigate("/")}>
        ← Dashboard
      </span>

      <div className="page-header">
        <h1>Summary View</h1>
        <p>
          AI-generated summaries, requirements, issues, and action items per
          group
        </p>
      </div>

      {/* ── Toolbar ── */}
      <div className="toolbar" style={{ flexWrap: "wrap", rowGap: 10 }}>
        {/* Group selector */}
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

        {/* Date range — store raw local datetime string, convert to ISO on API call */}
        <label
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          From
          <input
            type="datetime-local"
            value={fromParam}
            onChange={(e) => setParam("from", e.target.value)}
          />
        </label>
        <label
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          To
          <input
            type="datetime-local"
            value={toParam}
            onChange={(e) => setParam("to", e.target.value)}
          />
        </label>

        {/* Sender / user filter */}
        {selectedGroup && senders.length > 0 && (
          <select
            value={selectedSender}
            onChange={(e) => setParam("sender", e.target.value)}
            title="Filter by user"
          >
            <option value="">All users</option>
            {senders.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}

        {hasActiveFilter && (
          <button
            className="btn btn-ghost"
            onClick={clearFilters}
            title="Clear all filters"
          >
            ✕ Clear filters
          </button>
        )}

        {/* Auto-refresh */}
        <select
          value={refreshMs}
          onChange={(e) => setRefreshMs(Number(e.target.value))}
          title="Auto-refresh interval"
        >
          {REFRESH_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {selectedGroup && (
          <>
            <button
              className="btn btn-primary"
              onClick={handleTrigger}
              disabled={triggering}
            >
              {triggering ? "Processing…" : "⚡ Generate Summary"}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                refetch();
                setLastRefreshed(new Date());
              }}
            >
              ↻ Refresh
            </button>
          </>
        )}

        {triggerMsg && (
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {triggerMsg}
          </span>
        )}
      </div>

      {/* ── Refresh status bar ── */}
      {selectedGroup && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          {refreshMs > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  display: "inline-block",
                  animation: "pulse 2s infinite",
                }}
              />
              Auto-refreshing every{" "}
              {REFRESH_OPTIONS.find((o) => o.value === refreshMs)?.label}
            </span>
          )}
          {lastRefreshed && (
            <span>
              Last refreshed: {formatDate(lastRefreshed.toISOString())}
            </span>
          )}
          {hasDateFilter && (
            <span className="badge yellow">Date filter active</span>
          )}
          {selectedSender && (
            <span className="badge blue">User: {selectedSender}</span>
          )}
        </div>
      )}

      {/* ── Empty state ── */}
      {!selectedGroup && (
        <div className="empty-state">
          <p>Select a group to view summaries</p>
          <small>Choose from the dropdown above</small>
        </div>
      )}

      {/* ── Content ── */}
      {selectedGroup && (
        <>
          <div className="tabs">
            <span
              className={`tab ${activeTab === "summaries" ? "active" : ""}`}
              onClick={() => setActiveTab("summaries")}
            >
              Summaries{" "}
              {!loading && summaries.length > 0 && `(${summaries.length})`}
            </span>
            <span
              className={`tab ${activeTab === "messages" ? "active" : ""}`}
              onClick={() => setActiveTab("messages")}
            >
              Messages
            </span>
          </div>

          {error && <div className="error-banner">{error}</div>}

          {/* ── Summaries tab ── */}
          {activeTab === "summaries" && (
            <>
              {loading ? (
                <div className="spinner-wrap">
                  <div className="spinner" />
                </div>
              ) : summaries.length === 0 ? (
                <div className="empty-state">
                  <p>
                    No summaries{" "}
                    {hasDateFilter
                      ? "in this date range"
                      : `yet for "${selectedGroup}"`}
                  </p>
                  <small>
                    {hasDateFilter
                      ? "Try widening the date range"
                      : 'Click "Generate Summary" to create one'}
                  </small>
                </div>
              ) : (
                <>
                  {/* Latest summary — full card layout */}
                  <div
                    style={{
                      marginBottom: 8,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span className="badge green">Latest</span>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {formatDate(summaries[0].createdAt)}
                    </span>
                  </div>

                  <div className="card" style={{ marginBottom: 20 }}>
                    <div className="card-title">Overview</div>
                    <p style={{ fontSize: 14, lineHeight: 1.75 }}>
                      {summaries[0].summary_text}
                    </p>
                  </div>

                  <div className="card" style={{ marginBottom: 32 }}>
                    <div
                      className="card-title"
                      style={{ color: "var(--info)", marginBottom: 12 }}
                    >
                      Requirements
                      {summaries[0].requirements?.length > 0 && (
                        <span className="badge blue" style={{ marginLeft: 8 }}>
                          {summaries[0].requirements.length}
                        </span>
                      )}
                    </div>
                    <RequirementsList
                      requirements={summaries[0].requirements}
                    />
                  </div>

                  {/* History */}
                  {summaries.length > 1 && (
                    <>
                      <h3
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          marginBottom: 14,
                          color: "var(--text-muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        History — {summaries.length - 1} older{" "}
                        {summaries.length === 2 ? "summary" : "summaries"}
                      </h3>
                      {summaries.slice(1).map((s) => (
                        <SummaryCard key={s.id} summary={s} />
                      ))}
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Messages tab ── */}
          {activeTab === "messages" && (
            <div className="card scrollable">
              <MessagesTable
                group={selectedGroup}
                from={fromParam || undefined}
                to={toParam || undefined}
                sender={selectedSender || undefined}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
