import {
  SummarizeResult,
  ExplainResult,
  ReplyResult,
  JiraResult,
} from "./ResultCards.jsx";

const TABS = [
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

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Sticky right panel showing AI analysis for a selected message.
 * All props come directly from the useAIPanel hook return value.
 */
export default function MessagePanel({
  selectedMsg,
  activeTab,
  loadingTab,
  currentResult,
  contextMessages,
  switchTab,
  runTab,
  closePanel,
}) {
  if (!selectedMsg) return null;

  const tabCfg = TABS.find((t) => t.key === activeTab);
  const ResultComp = RENDERERS[activeTab];
  const isLoading = loadingTab === activeTab;

  return (
    <div
      style={{
        width: 420,
        flexShrink: 0,
        position: "sticky",
        top: 16,
        alignSelf: "flex-start",
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
        maxHeight: "calc(100vh - 48px)",
      }}
    >
      {/* ── Message header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          padding: "12px 14px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-alt)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            {selectedMsg.image_url && (
              <a
                href={selectedMsg.image_url}
                target="_blank"
                rel="noreferrer"
                style={{ flexShrink: 0 }}
              >
                <img
                  src={selectedMsg.image_url}
                  alt="attachment"
                  style={{
                    width: 36,
                    height: 36,
                    objectFit: "cover",
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                    display: "block",
                  }}
                />
              </a>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 2,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--accent)",
                    flexShrink: 0,
                  }}
                >
                  {selectedMsg.sender}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {formatDate(selectedMsg.message_time)}
                </span>
              </div>
              <p
                style={{
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: "var(--text-muted)",
                  margin: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {selectedMsg.message || "(image only)"}
              </p>
            </div>
          </div>
          <div
            style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}
          >
            Using {contextMessages.length} message
            {contextMessages.length !== 1 ? "s" : ""} as context
          </div>
        </div>
        <button
          onClick={closePanel}
          title="Close panel"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
            fontSize: 20,
            lineHeight: 1,
            padding: "2px 4px",
            flexShrink: 0,
            borderRadius: 4,
          }}
        >
          ×
        </button>
      </div>

      {/* ── Tabs ── */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg)",
        }}
      >
        {TABS.map((t) => {
          const active = activeTab === t.key;
          const loading = loadingTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => switchTab(t.key)}
              style={{
                flex: 1,
                padding: "10px 4px",
                background: "none",
                border: "none",
                borderBottom: `2px solid ${active ? t.color : "transparent"}`,
                color: active ? t.color : "var(--text-muted)",
                fontSize: 12,
                fontWeight: active ? 700 : 400,
                cursor: "pointer",
                transition: "all 0.15s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
              }}
            >
              {loading && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    border: "1.5px solid var(--border)",
                    borderTopColor: t.color,
                    display: "inline-block",
                    animation: "spin 0.7s linear infinite",
                  }}
                />
              )}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {/* Loading */}
        {isLoading && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: "48px 0",
            }}
          >
            <div className="spinner" />
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Running {tabCfg?.label}…
            </span>
          </div>
        )}

        {/* Error */}
        {!isLoading && currentResult?.error && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="error-banner">{currentResult.error}</div>
            <button
              className="btn btn-ghost"
              onClick={() => runTab(selectedMsg, activeTab)}
              style={{ alignSelf: "flex-start", fontSize: 12 }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Success */}
        {!isLoading && currentResult?.data && ResultComp && (
          <ResultComp data={currentResult.data} messages={contextMessages} />
        )}

        {/* Prompt to run */}
        {!isLoading && !currentResult && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              padding: "48px 0",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                maxWidth: 260,
                lineHeight: 1.6,
              }}
            >
              Analyze this message and surrounding context with{" "}
              <strong style={{ color: tabCfg?.color }}>{tabCfg?.label}</strong>
            </p>
            <button
              className="btn"
              style={{
                background: tabCfg?.color,
                borderColor: tabCfg?.color,
                color: "#fff",
              }}
              onClick={() => runTab(selectedMsg, activeTab)}
            >
              Run {tabCfg?.label}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
