/**
 * Shared AI result card components.
 * Used by both AIActionsView (bulk actions) and MessagePanel (per-message panel).
 */
import { useState, useEffect, useRef } from "react";
import { searchJiraIssues, fetchJiraIssue } from "../../api/client.js";

// ── Shared primitives ──────────────────────────────────────────────────────────

export function Dot({ color }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        marginTop: 5,
      }}
    />
  );
}

export function SectionLabel({ title, color }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.07em",
        color: color || "var(--text-muted)",
        marginBottom: 8,
      }}
    >
      {title}
    </div>
  );
}

export function MiniList({ items, color }) {
  if (!items?.length) return null;
  return (
    <ul
      style={{
        listStyle: "none",
        display: "flex",
        flexDirection: "column",
        gap: 5,
      }}
    >
      {items.map((item, i) => (
        <li
          key={i}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            fontSize: 12,
            padding: "7px 10px",
            background: "var(--surface)",
            borderRadius: 6,
            lineHeight: 1.5,
          }}
        >
          <Dot color={color} />
          {item}
        </li>
      ))}
    </ul>
  );
}

// ── Summarize ─────────────────────────────────────────────────────────────────

const PRIORITY_COLORS = {
  High: "var(--danger)",
  Medium: "var(--warning)",
  Low: "var(--accent)",
};

function ReqCard({ req }) {
  const [open, setOpen] = useState(false);
  const pc = PRIORITY_COLORS[req.priority] || "var(--text-muted)";
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        marginBottom: 8,
        overflow: "hidden",
      }}
    >
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
            gap: 8,
            flex: 1,
            minWidth: 0,
          }}
        >
          <span
            style={{ fontSize: 12, color: "var(--text-muted)", flexShrink: 0 }}
          >
            {open ? "▾" : "▸"}
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {req.title}
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 20,
            flexShrink: 0,
            marginLeft: 8,
            background: `${pc}22`,
            color: pc,
          }}
        >
          {req.priority}
        </span>
      </div>

      {open && (
        <div
          style={{
            padding: "12px 14px",
            borderTop: "1px solid var(--border)",
            background: "var(--bg)",
          }}
        >
          {req.description && (
            <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>
              {req.description}
            </p>
          )}
          {req.issues?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <SectionLabel title="Issues" color="var(--danger)" />
              <MiniList items={req.issues} color="var(--danger)" />
            </div>
          )}
          {req.action_items?.length > 0 && (
            <div>
              <SectionLabel title="Action Items" color="var(--warning)" />
              <MiniList items={req.action_items} color="var(--warning)" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SummarizeResult({ data }) {
  if (!data?.requirements?.length) {
    return (
      <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
        No requirements identified.
      </p>
    );
  }
  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
        {data.requirements.length} requirement
        {data.requirements.length !== 1 ? "s" : ""} found
      </p>
      {data.requirements.map((req, i) => (
        <ReqCard key={i} req={req} />
      ))}
    </div>
  );
}

// ── Explain ───────────────────────────────────────────────────────────────────

function ImageInsightCard({ insight, imageUrl }) {
  return (
    <div
      style={{
        border: "2px solid #a855f7",
        borderRadius: 8,
        overflow: "hidden",
        background: "rgba(168,85,247,0.05)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "rgba(168,85,247,0.12)",
          borderBottom: "1px solid rgba(168,85,247,0.25)",
        }}
      >
        <span style={{ fontSize: 14 }}>🖼</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#a855f7" }}>
          {insight.sender}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            marginLeft: "auto",
          }}
        >
          image insight
        </span>
      </div>
      <div style={{ padding: "10px 12px", display: "flex", gap: 12 }}>
        {imageUrl && (
          <a
            href={imageUrl}
            target="_blank"
            rel="noreferrer"
            style={{ flexShrink: 0 }}
          >
            <img
              src={imageUrl}
              alt="attachment"
              style={{
                width: 72,
                height: 72,
                objectFit: "cover",
                borderRadius: 6,
                border: "2px solid rgba(168,85,247,0.4)",
                display: "block",
              }}
            />
          </a>
        )}
        <div
          style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}
        >
          {insight.what_shown && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--info)",
                  marginBottom: 4,
                }}
              >
                What is shown
              </div>
              <p
                style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text)" }}
              >
                {insight.what_shown}
              </p>
            </div>
          )}
          {insight.connection && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "#a855f7",
                  marginBottom: 4,
                }}
              >
                Connection to discussion
              </div>
              <p
                style={{
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: "var(--text-muted)",
                }}
              >
                {insight.connection}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * @param {{ data: object, messages?: Array }} props
 *   messages — the source messages; used to resolve image URLs by sender for inline thumbnails.
 */
export function ExplainResult({ data, messages = [] }) {
  if (!data) return null;

  const imagesBySender = {};
  for (const m of messages) {
    if (m.image_url && !imagesBySender[m.sender])
      imagesBySender[m.sender] = m.image_url;
  }

  const hasImageInsights = data.image_insights?.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {data.explanation && (
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.75,
            padding: "14px 16px",
            background: "var(--surface-alt)",
            borderRadius: 8,
            borderLeft: "3px solid var(--accent)",
          }}
        >
          {data.explanation}
        </div>
      )}

      {hasImageInsights && (
        <div
          style={{
            border: "1px solid rgba(168,85,247,0.3)",
            borderRadius: 10,
            padding: "12px",
            background: "rgba(168,85,247,0.04)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              color: "#a855f7",
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>🖼</span>
            Image Insights ({data.image_insights.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.image_insights.map((insight, i) => (
              <ImageInsightCard
                key={i}
                insight={insight}
                imageUrl={imagesBySender[insight.sender] ?? null}
              />
            ))}
          </div>
        </div>
      )}

      {data.key_points?.length > 0 && (
        <div>
          <SectionLabel title="Key Points" color="var(--info)" />
          <MiniList items={data.key_points} color="var(--info)" />
        </div>
      )}

      {data.context && (
        <div>
          <SectionLabel title="Context" />
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.65,
              color: "var(--text-muted)",
            }}
          >
            {data.context}
          </p>
        </div>
      )}

      {data.participants?.length > 0 && (
        <div>
          <SectionLabel title="Participants" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {data.participants.map((p, i) => (
              <span
                key={i}
                style={{
                  fontSize: 12,
                  padding: "3px 10px",
                  borderRadius: 20,
                  background: "var(--surface-alt)",
                  border: "1px solid var(--border)",
                }}
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {data.outcome && (
        <div>
          <SectionLabel title="Outcome" color="var(--accent)" />
          <p style={{ fontSize: 13, lineHeight: 1.65 }}>{data.outcome}</p>
        </div>
      )}
    </div>
  );
}

// ── Reply ─────────────────────────────────────────────────────────────────────

const TONE_COLORS = {
  Formal: "var(--info)",
  Friendly: "var(--accent)",
  Direct: "var(--warning)",
  Empathetic: "#a855f7",
};

export function ReplyResult({ data }) {
  const [copied, setCopied] = useState(null);
  if (!data) return null;

  function copy(text, idx) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(idx);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {data.context_summary && (
        <p
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            fontStyle: "italic",
            padding: "8px 12px",
            background: "var(--surface-alt)",
            borderRadius: 6,
          }}
        >
          {data.context_summary}
        </p>
      )}
      {data.suggested_replies?.map((r, i) => {
        const tc = TONE_COLORS[r.tone] || "var(--text-muted)";
        return (
          <div
            key={i}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                borderBottom: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 20,
                  background: `${tc}22`,
                  color: tc,
                }}
              >
                {r.tone}
              </span>
              <button
                onClick={() => copy(r.message, i)}
                style={{
                  fontSize: 12,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: copied === i ? "var(--accent)" : "var(--text-muted)",
                  padding: "2px 8px",
                  borderRadius: 4,
                  transition: "color 0.15s",
                }}
              >
                {copied === i ? "✓ Copied" : "Copy"}
              </button>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.75, padding: "12px 14px" }}>
              {r.message}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── Jira Connect Modal ────────────────────────────────────────────────────────

// Declared here so JiraIssueDetail (below) and JiraTicketCard (further down) both share the same map
const JIRA_PRIORITY_MAP = {
  Highest: { color: "#ef4444", icon: "▲▲" },
  High: { color: "#ef4444", icon: "▲" },
  Medium: { color: "#f59e0b", icon: "◆" },
  Low: { color: "#22c55e", icon: "▼" },
  Lowest: { color: "#9ca3af", icon: "▼▼" },
};

/**
 * Map Jira status category color names → CSS colors.
 * Jira sends one of: blue-grey, yellow, green, blue-grey (To Do), yellow (In Progress), green (Done).
 * Custom statuses like "To Do Testing" / "Cp Testing" may also appear under these categories.
 */
const STATUS_CAT_STYLE = {
  "blue-grey": { bg: "#DFE1E6", color: "#42526E" },
  yellow: { bg: "#FFF0B3", color: "#974F0C" },
  green: { bg: "#E3FCEF", color: "#006644" },
  blue: { bg: "#DEEBFF", color: "#0052CC" },
};

function StatusBadge({ status }) {
  const style =
    STATUS_CAT_STYLE[status?.categoryColor] || STATUS_CAT_STYLE["blue-grey"];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        background: style.bg,
        color: style.color,
        letterSpacing: "0.03em",
      }}
    >
      {status?.name || "—"}
    </span>
  );
}

function JiraIssueDetail({ issue }) {
  const p = JIRA_PRIORITY_MAP[issue.priority] || {
    color: "#9ca3af",
    icon: "◆",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Key + link */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <a
          href={issue.url}
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#0052CC",
            textDecoration: "none",
          }}
        >
          {issue.key} ↗
        </a>
        <StatusBadge status={issue.status} />
        {issue.priority && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 4,
              background: `${p.color}22`,
              color: p.color,
            }}
          >
            {p.icon} {issue.priority}
          </span>
        )}
        {issue.storyPoints != null && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "2px 7px",
              borderRadius: 4,
              background: "rgba(82,134,224,0.15)",
              color: "var(--info)",
            }}
          >
            {issue.storyPoints} SP (Est.)
          </span>
        )}
      </div>

      {/* Summary */}
      <p style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4, margin: 0 }}>
        {issue.summary}
      </p>

      {/* Meta row */}
      <div
        style={{
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          fontSize: 12,
          color: "var(--text-muted)",
        }}
      >
        {issue.issueType && (
          <span>
            Type:{" "}
            <strong style={{ color: "var(--text)" }}>{issue.issueType}</strong>
          </span>
        )}
        {issue.assignee && (
          <span>
            Assignee:{" "}
            <strong style={{ color: "var(--text)" }}>{issue.assignee}</strong>
          </span>
        )}
        {issue.reporter && (
          <span>
            Reporter:{" "}
            <strong style={{ color: "var(--text)" }}>{issue.reporter}</strong>
          </span>
        )}
      </div>

      {/* Description */}
      {issue.description ? (
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.7,
            background: "var(--surface)",
            borderRadius: 6,
            padding: "10px 12px",
            color: "var(--text)",
            maxHeight: 180,
            overflowY: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {issue.description}
        </div>
      ) : (
        <p
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            fontStyle: "italic",
          }}
        >
          No description
        </p>
      )}

      {/* Labels */}
      {issue.labels?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {issue.labels.map((l, i) => (
            <span
              key={i}
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 20,
                background: "var(--surface-alt)",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
              }}
            >
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Modal that searches Jira and shows full ticket details.
 * Opens with the AI-extracted ticket title pre-loaded as the search query.
 */
function JiraConnectModal({ initialQuery, onClose }) {
  const [query, setQuery] = useState(initialQuery || "");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState(null);
  const [selected, setSelected] = useState(null); // issue key
  const [detail, setDetail] = useState(null); // full issue object
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Auto-focus and run initial search when modal opens
  useEffect(() => {
    inputRef.current?.focus();
    if (initialQuery?.trim()) runSearch(initialQuery.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on Escape key
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function runSearch(q) {
    if (!q?.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    setSearchErr(null);
    setResults([]);
    setSelected(null);
    setDetail(null);
    try {
      const res = await searchJiraIssues(q.trim());
      setResults(res.issues || []);
    } catch (err) {
      setSearchErr(err.message);
    } finally {
      setSearching(false);
    }
  }

  function handleQueryChange(e) {
    const val = e.target.value;
    setQuery(val);
    // Debounce search by 400 ms while user types
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(val), 400);
  }

  async function handleSelectIssue(issueKey) {
    if (selected === issueKey) return;
    setSelected(issueKey);
    setDetail(null);
    setDetailErr(null);
    setDetailLoading(true);
    try {
      const res = await fetchJiraIssue(issueKey);
      setDetail(res.issue);
    } catch (err) {
      setDetailErr(err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 600,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 12px 48px rgba(0,0,0,0.35)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg)",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700 }}>Connect to Jira</span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              color: "var(--text-muted)",
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            ×
          </button>
        </div>

        {/* ── Search box ── */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={handleQueryChange}
            onKeyDown={(e) => e.key === "Enter" && runSearch(query)}
            placeholder="Search Jira issues…"
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "9px 12px",
              color: "var(--text)",
              fontSize: 13,
              outline: "none",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#0052CC")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
          />
        </div>

        {/* ── Body: results + detail ── */}
        <div
          style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}
        >
          {/* Results list */}
          <div
            style={{
              width: 220,
              flexShrink: 0,
              borderRight: "1px solid var(--border)",
              overflowY: "auto",
            }}
          >
            {searching && (
              <div style={{ padding: "20px", textAlign: "center" }}>
                <div
                  className="spinner"
                  style={{
                    width: 20,
                    height: 20,
                    borderWidth: 2,
                    margin: "0 auto",
                  }}
                />
              </div>
            )}
            {searchErr && !searching && (
              <div
                style={{
                  padding: "12px 14px",
                  fontSize: 12,
                  color: "var(--danger)",
                }}
              >
                {searchErr}
              </div>
            )}
            {!searching &&
              !searchErr &&
              results.length === 0 &&
              query.trim() && (
                <div
                  style={{
                    padding: "12px 14px",
                    fontSize: 12,
                    color: "var(--text-muted)",
                  }}
                >
                  No issues found
                </div>
              )}
            {!searching &&
              !searchErr &&
              results.length === 0 &&
              !query.trim() && (
                <div
                  style={{
                    padding: "12px 14px",
                    fontSize: 12,
                    color: "var(--text-muted)",
                  }}
                >
                  Type to search Jira
                </div>
              )}
            {results.map((issue) => {
              const isActive = selected === issue.key;
              const sc =
                STATUS_CAT_STYLE[issue.status?.categoryColor] ||
                STATUS_CAT_STYLE["blue-grey"];
              return (
                <div
                  key={issue.key}
                  onClick={() => handleSelectIssue(issue.key)}
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid var(--border)",
                    cursor: "pointer",
                    background: isActive
                      ? "rgba(0,82,204,0.08)"
                      : "transparent",
                    borderLeft: isActive
                      ? "3px solid #0052CC"
                      : "3px solid transparent",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#0052CC",
                      marginBottom: 4,
                    }}
                  >
                    {issue.key}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      lineHeight: 1.4,
                      color: "var(--text)",
                      marginBottom: 5,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {issue.summary}
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      padding: "1px 7px",
                      borderRadius: 20,
                      background: sc.bg,
                      color: sc.color,
                      fontWeight: 600,
                    }}
                  >
                    {issue.status?.name}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Issue detail pane */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
            {!selected && (
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  marginTop: 8,
                }}
              >
                Select an issue from the list to view details
              </p>
            )}
            {detailLoading && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  padding: 24,
                }}
              >
                <div className="spinner" />
              </div>
            )}
            {detailErr && !detailLoading && (
              <div className="error-banner" style={{ margin: 0 }}>
                {detailErr}
              </div>
            )}
            {detail && !detailLoading && <JiraIssueDetail issue={detail} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Jira ──────────────────────────────────────────────────────────────────────

const TICKET_TYPE_COLORS = {
  Story: "var(--info)",
  Bug: "var(--danger)",
  Task: "var(--accent)",
  Improvement: "var(--warning)",
  Epic: "#a855f7",
};

function ticketToMarkdown(ticket) {
  const lines = [];
  lines.push(`## [${ticket.type || "Task"}] ${ticket.title}`);
  lines.push(`**Priority:** ${ticket.priority}`);
  if (ticket.description) {
    lines.push("");
    lines.push("### Description");
    lines.push(ticket.description);
  }
  if (ticket.acceptance_criteria?.length) {
    lines.push("");
    lines.push("### Acceptance Criteria");
    ticket.acceptance_criteria.forEach((c) => lines.push(`- [ ] ${c}`));
  }
  if (ticket.labels?.length) {
    lines.push("");
    lines.push(`**Labels:** ${ticket.labels.join(", ")}`);
  }
  if (ticket.story_points) {
    lines.push(`**Story Points:** ${ticket.story_points}`);
  }
  return lines.join("\n");
}

function JiraTicketCard({ ticket, index }) {
  const [title, setTitle] = useState(ticket.title || "");
  const [description, setDescription] = useState(ticket.description || "");
  const [copied, setCopied] = useState(false);
  // Controls the Connect-to-Jira modal; null = closed, string = initial search query
  const [jiraModalQuery, setJiraModalQuery] = useState(null);

  const p = JIRA_PRIORITY_MAP[ticket.priority] || {
    color: "#9ca3af",
    icon: "◆",
  };
  const tc = TICKET_TYPE_COLORS[ticket.type] || "var(--text-muted)";

  function copy() {
    const text = ticketToMarkdown({ ...ticket, title, description });
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderLeft: `4px solid ${p.color}`,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          padding: "12px 14px",
          background: `color-mix(in srgb, ${p.color} 5%, var(--surface))`,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* Meta row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 7px",
              borderRadius: 4,
              background: `${tc}22`,
              color: tc,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {ticket.type || "Task"}
          </span>

          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 4,
              background: `${p.color}22`,
              color: p.color,
              letterSpacing: "0.04em",
            }}
          >
            <span style={{ fontSize: 9 }}>{p.icon}</span>
            {ticket.priority}
          </span>

          {ticket.story_points && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 4,
                background: "rgba(82,134,224,0.15)",
                color: "var(--info)",
              }}
            >
              {ticket.story_points} SP
            </span>
          )}

          <span style={{ flex: 1 }} />

          <span
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              fontFamily: "monospace",
              userSelect: "none",
            }}
          >
            #{index + 1}
          </span>

          <button
            onClick={() => setJiraModalQuery(title)}
            title="Search and link a real Jira ticket"
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 10px",
              borderRadius: 6,
              border: "1px solid #0052CC",
              background: "rgba(0,82,204,0.08)",
              color: "#0052CC",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            Connect Jira
          </button>

          <button
            onClick={copy}
            title="Copy as Markdown"
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 10px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: copied ? `${p.color}22` : "transparent",
              color: copied ? p.color : "var(--text-muted)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>

        {/* Editable title */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          title="Click to edit title"
          style={{
            width: "100%",
            boxSizing: "border-box",
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.4,
            background: "transparent",
            border: "none",
            borderBottom: "1.5px solid transparent",
            borderRadius: 0,
            color: "var(--text)",
            padding: "2px 0",
            outline: "none",
            cursor: "text",
            transition: "border-color 0.15s",
          }}
          onFocus={(e) => {
            e.target.style.borderBottomColor = p.color;
          }}
          onBlur={(e) => {
            e.target.style.borderBottomColor = "transparent";
          }}
        />
      </div>

      {/* ── Body ── */}
      <div
        style={{
          padding: "14px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg)",
        }}
      >
        {/* Description */}
        <div
          style={{ marginBottom: ticket.acceptance_criteria?.length ? 14 : 0 }}
        >
          <SectionLabel title="Description" />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={
              description ? Math.min(8, description.split("\n").length + 1) : 2
            }
            placeholder="No description — click to add"
            title="Click to edit description"
            style={{
              width: "100%",
              boxSizing: "border-box",
              fontSize: 13,
              lineHeight: 1.65,
              fontFamily: "inherit",
              background: "var(--surface)",
              border: "1.5px solid transparent",
              borderRadius: 6,
              color: description ? "var(--text)" : "var(--text-muted)",
              padding: "8px 10px",
              outline: "none",
              resize: "vertical",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = p.color;
              e.target.style.color = "var(--text)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "transparent";
            }}
          />
        </div>

        {/* Acceptance Criteria */}
        {ticket.acceptance_criteria?.length > 0 && (
          <div style={{ marginBottom: ticket.labels?.length ? 12 : 0 }}>
            <SectionLabel title="Acceptance Criteria" color="var(--info)" />
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {ticket.acceptance_criteria.map((c, j) => (
                <div
                  key={j}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    fontSize: 12,
                    padding: "7px 10px",
                    background: "var(--surface)",
                    borderRadius: 6,
                    lineHeight: 1.55,
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: 15,
                      height: 15,
                      marginTop: 1,
                      border: "1.5px solid var(--info)",
                      borderRadius: 3,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--info)",
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    ✓
                  </span>
                  {c}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Labels */}
        {ticket.labels?.length > 0 && (
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 12 }}
          >
            {ticket.labels.map((l, j) => (
              <span
                key={j}
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 20,
                  background: "var(--surface-alt)",
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                }}
              >
                {l}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Jira connect modal — portal-less; renders on top via fixed positioning */}
      {jiraModalQuery !== null && (
        <JiraConnectModal
          initialQuery={jiraModalQuery}
          onClose={() => setJiraModalQuery(null)}
        />
      )}
    </div>
  );
}

// Workflow statuses specific to this project's Jira board
const MANUAL_STATUSES = ["Estimated", "To Do Testing", "Cp Testing", "Done"];

/**
 * Modal shown when AI extracts no tickets.
 * Pre-fills title + description from messages; user picks a status and confirms.
 * onConfirm receives the completed ticket object.
 */
export function ManualTicketModal({ messages, onConfirm, onClose }) {
  const first = messages[0];
  const defaultTitle = first?.message
    ? first.message.length > 100
      ? first.message.slice(0, 100) + "…"
      : first.message
    : "";
  const defaultDesc = messages
    .map((m) => `[${m.sender}]: ${m.message || "(image)"}`)
    .join("\n");

  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDesc);
  const [status, setStatus] = useState(MANUAL_STATUSES[0]);
  // Jira creation state
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null); // { key, url }
  const [createErr, setCreateErr] = useState(null);

  // Close on Escape
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && !creating) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, creating]);

  // Create the ticket locally AND in Jira simultaneously
  async function handleConfirm() {
    if (!title.trim() || creating) return;
    setCreating(true);
    setCreateErr(null);

    const ticket = {
      title: title.trim(),
      description: description.trim(),
      status,
      type: "Task",
      priority: "Medium",
      story_points: null,
      acceptance_criteria: [],
      labels: [],
    };

    try {
      const { createJiraIssue } = await import("../../api/client.js");
      const res = await createJiraIssue({
        summary: ticket.title,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        issueType: ticket.type,
      });
      setCreated(res);
      // Also call onConfirm so the local card appears with the real Jira key
      onConfirm({ ...ticket, jiraKey: res.key, jiraUrl: res.url });
    } catch (err) {
      setCreateErr(err.message);
      setCreating(false);
    }
  }

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "9px 12px",
    color: "var(--text)",
    fontSize: 13,
    outline: "none",
    fontFamily: "inherit",
  };
  const labelStyle = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: "var(--text-muted)",
    marginBottom: 6,
    display: "block",
  };

  return (
    <div
      onClick={creating ? undefined : onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 500,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 12px 48px rgba(0,0,0,0.35)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg)",
          }}
        >
          <div>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Create Ticket</span>
            {!created && (
              <span
                style={{
                  fontSize: 11,
                  marginLeft: 10,
                  padding: "2px 8px",
                  borderRadius: 20,
                  background: "rgba(245,158,11,0.15)",
                  color: "var(--warning)",
                  fontWeight: 600,
                }}
              >
                AI could not extract — fill manually
              </span>
            )}
          </div>
          <button
            onClick={creating ? undefined : onClose}
            style={{
              background: "none",
              border: "none",
              cursor: creating ? "not-allowed" : "pointer",
              fontSize: 20,
              lineHeight: 1,
              color: creating ? "var(--border)" : "var(--text-muted)",
              padding: "2px 6px",
            }}
          >
            ×
          </button>
        </div>

        {/* Success banner — shown after ticket is created */}
        {created && (
          <div
            style={{
              margin: "16px 16px 0",
              padding: "14px 16px",
              borderRadius: 8,
              background: "rgba(0,100,68,0.08)",
              border: "1.5px solid #006644",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>✓</span>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#006644",
                  marginBottom: 4,
                }}
              >
                Ticket created successfully!
              </div>
              <a
                href={created.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#0052CC",
                  textDecoration: "none",
                }}
              >
                {created.key} — View in Jira ↗
              </a>
            </div>
          </div>
        )}

        {/* Error banner — shown if Jira create failed */}
        {createErr && !created && (
          <div
            style={{
              margin: "16px 16px 0",
              padding: "12px 14px",
              borderRadius: 8,
              background: "rgba(239,68,68,0.08)",
              border: "1.5px solid var(--danger)",
              fontSize: 13,
              color: "var(--danger)",
            }}
          >
            <strong>Jira error:</strong> {createErr}
          </div>
        )}

        {/* Form body — hidden after successful creation */}
        {!created && (
          <div
            style={{
              padding: "18px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {/* Status */}
            <div>
              <label style={labelStyle}>Status</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {MANUAL_STATUSES.map((s) => {
                  const active = status === s;
                  return (
                    <button
                      key={s}
                      onClick={() => !creating && setStatus(s)}
                      disabled={creating}
                      style={{
                        padding: "5px 14px",
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: creating ? "not-allowed" : "pointer",
                        border: "1.5px solid",
                        borderColor: active ? "#0052CC" : "var(--border)",
                        background: active
                          ? "rgba(0,82,204,0.12)"
                          : "transparent",
                        color: active ? "#0052CC" : "var(--text-muted)",
                        opacity: creating ? 0.6 : 1,
                        transition: "all 0.12s",
                      }}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Title */}
            <div>
              <label style={labelStyle}>Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ticket title…"
                disabled={creating}
                style={{ ...inputStyle, opacity: creating ? 0.6 : 1 }}
                onFocus={(e) => (e.target.style.borderColor = "#0052CC")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              />
            </div>

            {/* Description */}
            <div>
              <label style={labelStyle}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                placeholder="Ticket description…"
                disabled={creating}
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  lineHeight: 1.6,
                  opacity: creating ? 0.6 : 1,
                }}
                onFocus={(e) => (e.target.style.borderColor = "#0052CC")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 8,
            padding: "12px 16px",
            borderTop: "1px solid var(--border)",
            background: "var(--bg)",
          }}
        >
          {/* After success: just a Close button */}
          {created ? (
            <button
              onClick={onClose}
              style={{
                padding: "8px 24px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                border: "none",
                background: "#0052CC",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={creating}
                style={{
                  padding: "8px 18px",
                  borderRadius: 6,
                  fontSize: 13,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-muted)",
                  cursor: creating ? "not-allowed" : "pointer",
                  opacity: creating ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={createErr ? handleConfirm : handleConfirm}
                disabled={!title.trim() || creating}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 18px",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  border: "none",
                  background:
                    !title.trim() || creating
                      ? "#93c5fd"
                      : createErr
                        ? "#dc2626"
                        : "#0052CC",
                  color: "#fff",
                  cursor: !title.trim() || creating ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                  minWidth: 130,
                  justifyContent: "center",
                }}
              >
                {creating ? (
                  <>
                    <div
                      style={{
                        width: 13,
                        height: 13,
                        border: "2px solid rgba(255,255,255,0.4)",
                        borderTopColor: "#fff",
                        borderRadius: "50%",
                        animation: "spin 0.7s linear infinite",
                        flexShrink: 0,
                      }}
                    />
                    Creating…
                  </>
                ) : createErr ? (
                  "Retry"
                ) : (
                  "Create Ticket"
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function JiraResult({ data, onCreateManual }) {
  if (!data?.tickets?.length) {
    return (
      <div style={{ textAlign: "center", padding: "10px 0" }}>
        <p
          style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10 }}
        >
          AI could not extract tickets from these messages.
        </p>
        {onCreateManual && (
          <button
            onClick={onCreateManual}
            style={{
              padding: "7px 16px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              border: "1px solid #0052CC",
              background: "rgba(0,82,204,0.08)",
              color: "#0052CC",
              cursor: "pointer",
            }}
          >
            + Create Ticket Manually
          </button>
        )}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {data.tickets.length} ticket{data.tickets.length !== 1 ? "s" : ""}{" "}
        extracted
      </p>
      {data.tickets.map((t, i) => (
        <JiraTicketCard key={i} ticket={t} index={i} />
      ))}
    </div>
  );
}
