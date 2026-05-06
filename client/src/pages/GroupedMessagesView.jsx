import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import useFetch from '../hooks/useFetch.js';
import { fetchGroups, fetchMessages, runAIAction } from '../api/client.js';
import { SummarizeResult, ExplainResult, ReplyResult, JiraResult } from '../components/ai/ResultCards.jsx';

// ── Config ─────────────────────────────────────────────────────────────────────

const ACTION_CONFIG = [
  { key: 'summarize', label: 'Summarize', color: 'var(--accent)'  },
  { key: 'explain',   label: 'Explain',   color: 'var(--info)'    },
  { key: 'reply',     label: 'Reply',     color: 'var(--warning)' },
  { key: 'jira',      label: 'Jira',      color: '#a855f7'        },
];

const RENDERERS = {
  summarize: SummarizeResult,
  explain:   ExplainResult,
  reply:     ReplyResult,
  jira:      JiraResult,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Match AI group results (verbatim message strings) back to Message objects.
 * Strategy: exact match first, then 50-char prefix match.
 * Unmatched messages (filler words filtered by AI, or long truncations) are
 * collected into an "Other" card so no message is ever silently dropped.
 */
function mapGroupsToMessages(aiGroups, allMessages) {
  const usedIdx = new Set();

  function findMsg(text) {
    const t = text.trim();
    for (let i = 0; i < allMessages.length; i++) {
      if (usedIdx.has(i)) continue;
      if ((allMessages[i].message || '').trim() === t) { usedIdx.add(i); return allMessages[i]; }
    }
    // Prefix fallback — AI sometimes truncates long messages
    const prefix = t.slice(0, 50);
    if (prefix.length > 8) {
      for (let i = 0; i < allMessages.length; i++) {
        if (usedIdx.has(i)) continue;
        if ((allMessages[i].message || '').startsWith(prefix)) { usedIdx.add(i); return allMessages[i]; }
      }
    }
    return null;
  }

  const mapped = aiGroups
    .map(g => ({ title: g.title, messages: g.messages.map(findMsg).filter(Boolean) }))
    .filter(g => g.messages.length > 0);

  const other = allMessages.filter((_, i) => !usedIdx.has(i));
  if (other.length > 0) mapped.push({ title: 'Other / Uncategorized', messages: other });

  return mapped;
}

// ── MessageRow ─────────────────────────────────────────────────────────────────

function MessageRow({ msg }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '8px 16px', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, width: 40, paddingTop: 2 }}>
        {formatTime(msg.message_time)}
      </span>
      <span style={{
        fontSize: 12, fontWeight: 700, color: 'var(--accent)',
        flexShrink: 0, width: 130, paddingTop: 2,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {msg.sender}
      </span>
      {msg.image_url && (
        <a href={msg.image_url} target="_blank" rel="noreferrer"
          onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
          <img
            src={msg.image_url} alt="attachment"
            style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 5, display: 'block', border: '1px solid var(--border)' }}
          />
        </a>
      )}
      <span style={{ fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word', flex: 1 }}>
        {msg.message || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>image only</span>}
      </span>
    </div>
  );
}

// ── RequirementCard ────────────────────────────────────────────────────────────

/**
 * groupState shape: { loading: actionKey|null, results: {key: {data,error}}, active: key|null }
 */
function RequirementCard({ group, index, isExpanded, onToggle, groupState, onRun }) {
  const { loading, results, active } = groupState;
  const activeCfg  = active ? ACTION_CONFIG.find(a => a.key === active) : null;
  const ResultComp = active ? RENDERERS[active] : null;
  const activeResult = active ? (results[active] ?? null) : null;

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 10,
      overflow: 'hidden', marginBottom: 10,
    }}>

      {/* ── Header ── */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '13px 16px', cursor: 'pointer',
          background: isExpanded ? 'var(--surface-alt)' : 'var(--surface)',
          borderBottom: isExpanded ? '1px solid var(--border)' : 'none',
          transition: 'background 0.12s',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, width: 12 }}>
          {isExpanded ? '▾' : '▸'}
        </span>

        <span style={{ flex: 1, fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>
          {group.title}
        </span>

        {/* Active result badge */}
        {activeCfg && activeResult?.data && !loading && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            background: `${activeCfg.color}22`, color: activeCfg.color,
            textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0,
          }}>
            {activeCfg.label}
          </span>
        )}

        {/* In-progress indicator */}
        {loading && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              border: '2px solid var(--border)',
              borderTopColor: ACTION_CONFIG.find(a => a.key === loading)?.color,
              display: 'inline-block', animation: 'spin 0.7s linear infinite',
            }} />
            {ACTION_CONFIG.find(a => a.key === loading)?.label}…
          </span>
        )}

        <span style={{
          fontSize: 11, color: 'var(--text-muted)', flexShrink: 0,
          background: 'var(--bg)', padding: '2px 9px', borderRadius: 10,
          border: '1px solid var(--border)',
        }}>
          {group.messages.length} msg{group.messages.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Expanded body ── */}
      {isExpanded && (
        <>
          {/* Message list */}
          <div style={{ background: 'var(--bg)' }}>
            {group.messages.map((msg, i) => (
              <MessageRow key={msg.id ?? i} msg={msg} />
            ))}
          </div>

          {/* Action bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
            padding: '10px 16px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
          }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 6,
            }}>
              Run:
            </span>
            {ACTION_CONFIG.map(a => {
              const isRunning   = loading === a.key;
              const hasResult   = !!results[a.key]?.data;
              const isActive    = active === a.key;
              return (
                <button
                  key={a.key}
                  onClick={() => onRun(index, a.key)}
                  disabled={!!loading}
                  title={hasResult ? `View ${a.label} result` : `Run ${a.label} on these messages`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    border: `1px solid ${isActive && hasResult ? a.color : 'var(--border)'}`,
                    background: isActive && hasResult ? `${a.color}14` : 'var(--surface-alt)',
                    color: isActive && hasResult ? a.color : 'var(--text)',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading && !isRunning ? 0.45 : 1,
                    transition: 'all 0.12s',
                  }}
                >
                  {isRunning && (
                    <span style={{
                      width: 9, height: 9, borderRadius: '50%',
                      border: `1.5px solid ${a.color}44`, borderTopColor: a.color,
                      display: 'inline-block', animation: 'spin 0.7s linear infinite',
                    }} />
                  )}
                  {a.label}
                  {hasResult && !isRunning && (
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: a.color, display: 'inline-block' }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Result area */}
          {(activeResult || (loading && !active)) && (
            <>
              {/* Result header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 16px', borderTop: '1px solid var(--border)',
                background: activeCfg ? `${activeCfg.color}08` : 'var(--surface-alt)',
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.07em', color: activeCfg?.color ?? 'var(--text-muted)',
                }}>
                  {activeCfg?.label ?? loading ? `${ACTION_CONFIG.find(a => a.key === loading)?.label} Result` : 'Result'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {group.messages.length} msg{group.messages.length !== 1 ? 's' : ''} analyzed
                </span>
              </div>

              {/* Result content */}
              <div style={{ padding: '16px', background: 'var(--bg)' }}>
                {loading && !activeResult && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 13, padding: '8px 0' }}>
                    <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                    Running {ACTION_CONFIG.find(a => a.key === loading)?.label}…
                  </div>
                )}
                {activeResult?.error && (
                  <div className="error-banner" style={{ margin: 0 }}>{activeResult.error}</div>
                )}
                {activeResult?.data && ResultComp && (
                  <ResultComp data={activeResult.data} messages={group.messages} />
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

function initGroupState() {
  return { loading: null, results: {}, active: null };
}

export default function GroupedMessagesView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedGroup = searchParams.get('group') || '';

  // Grouping state
  const [topics,     setTopics]     = useState(null);   // null = not grouped yet
  const [grouping,   setGrouping]   = useState(false);
  const [groupError, setGroupError] = useState(null);

  // Card UI state
  const [expanded,     setExpanded]     = useState(new Set());
  const [groupStates,  setGroupStates]  = useState({});

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: chatGroupsData } = useFetch(fetchGroups);
  const chatGroups = chatGroupsData?.data ?? [];

  const { data: msgsData, loading: msgsLoading, error: msgsError } = useFetch(
    useCallback(
      () => selectedGroup
        ? fetchMessages(selectedGroup, { limit: 300 })
        : Promise.resolve({ data: [] }),
      [selectedGroup]
    )
  );
  const messages = msgsData?.data ?? [];
  const hasMore  = msgsData?.hasMore ?? false;

  // ── Group-by-topic ─────────────────────────────────────────────────────────
  async function handleGroup() {
    if (!messages.length || grouping) return;

    setGrouping(true);
    setGroupError(null);
    setTopics(null);
    setGroupStates({});
    setExpanded(new Set());

    try {
      const payload = messages.map(m => ({
        sender:       m.sender,
        message:      m.message,
        message_time: m.message_time,
        image_url:    m.image_url || undefined,
      }));

      const res = await runAIAction({
        messages:   payload,
        action:     'group',
        group_name: selectedGroup || undefined,
      });

      const mapped = mapGroupsToMessages(res.data?.groups ?? [], messages);
      setTopics(mapped);
      setExpanded(new Set([0]));          // open first card
    } catch (err) {
      setGroupError(err.message);
    } finally {
      setGrouping(false);
    }
  }

  // ── Per-group action runner ────────────────────────────────────────────────
  function getState(idx) { return groupStates[idx] ?? initGroupState(); }

  async function runGroupAction(topicIdx, actionKey) {
    const group = topics?.[topicIdx];
    if (!group || getState(topicIdx).loading) return;

    // If cached, just activate (no re-fetch)
    if (getState(topicIdx).results[actionKey]?.data) {
      setGroupStates(prev => ({
        ...prev,
        [topicIdx]: { ...getState(topicIdx), active: actionKey },
      }));
      return;
    }

    // Mark loading + ensure card is open
    setGroupStates(prev => ({
      ...prev,
      [topicIdx]: { ...getState(topicIdx), loading: actionKey },
    }));
    setExpanded(prev => new Set([...prev, topicIdx]));

    try {
      const payload = group.messages.map(m => ({
        sender:       m.sender,
        message:      m.message,
        message_time: m.message_time,
        image_url:    m.image_url || undefined,
      }));

      const res = await runAIAction({
        messages:   payload,
        action:     actionKey,
        group_name: selectedGroup || undefined,
      });

      setGroupStates(prev => {
        const cur = prev[topicIdx] ?? initGroupState();
        return {
          ...prev,
          [topicIdx]: {
            loading: null,
            active:  actionKey,
            results: { ...cur.results, [actionKey]: { data: res.data, error: null } },
          },
        };
      });
    } catch (err) {
      setGroupStates(prev => {
        const cur = prev[topicIdx] ?? initGroupState();
        return {
          ...prev,
          [topicIdx]: {
            loading: null,
            active:  actionKey,
            results: { ...cur.results, [actionKey]: { data: null, error: err.message } },
          },
        };
      });
    }
  }

  // ── Expand / collapse ──────────────────────────────────────────────────────
  function toggle(idx) {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(idx) ? n.delete(idx) : n.add(idx);
      return n;
    });
  }

  function expandAll()   { if (topics) setExpanded(new Set(topics.map((_, i) => i))); }
  function collapseAll() { setExpanded(new Set()); }

  // ── Derived ────────────────────────────────────────────────────────────────
  const hasTopics   = !!(topics && topics.length > 0);
  const hasMessages = messages.length > 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="page-header">
        <h1>Requirement Groups</h1>
        <p>AI clusters messages by topic — run actions per group</p>
      </div>

      {/* ── Toolbar ── */}
      <div className="toolbar">
        <select
          value={selectedGroup}
          onChange={e => {
            const p = new URLSearchParams();
            if (e.target.value) p.set('group', e.target.value);
            setSearchParams(p);
            setTopics(null);
            setGroupStates({});
            setGroupError(null);
            setExpanded(new Set());
          }}
        >
          <option value="">Select a group…</option>
          {chatGroups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        {hasMessages && !grouping && (
          <button
            className="btn"
            onClick={handleGroup}
            style={{ display: 'flex', alignItems: 'center', gap: 7 }}
          >
            {hasTopics ? '↺ Re-group' : 'Group by Topic'}
          </button>
        )}

        {hasTopics && !grouping && (
          <>
            <button className="btn btn-ghost" onClick={expandAll}>Expand All</button>
            <button className="btn btn-ghost" onClick={collapseAll}>Collapse All</button>
          </>
        )}

        <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {hasTopics
            ? `${topics.length} group${topics.length !== 1 ? 's' : ''} · ${messages.length} messages`
            : hasMessages
            ? `${messages.length} messages loaded${hasMore ? ' (partial)' : ''}`
            : ''}
        </span>
      </div>

      {/* ── Truncation warning ── */}
      {hasMore && hasMessages && (
        <div className="error-banner" style={{ background: 'rgba(224,160,80,0.12)', borderColor: 'var(--warning)', color: 'var(--warning)' }}>
          Only the first {messages.length} messages are loaded. Results may not cover the full conversation.
        </div>
      )}

      {/* ── Errors ── */}
      {msgsError  && <div className="error-banner">{msgsError}</div>}
      {groupError && <div className="error-banner">{groupError}</div>}

      {/* ── No group ── */}
      {!selectedGroup && (
        <div className="empty-state">
          <p>Select a group to get started</p>
          <small>Choose a WhatsApp group from the dropdown above</small>
        </div>
      )}

      {/* ── Loading messages ── */}
      {msgsLoading && (
        <div className="spinner-wrap"><div className="spinner" /></div>
      )}

      {/* ── Grouping in progress ── */}
      {grouping && (
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 14, padding: '64px 0',
        }}>
          <div className="spinner" />
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
            Analyzing {messages.length} messages…
          </p>
          <small style={{ color: 'var(--text-muted)' }}>
            AI is clustering messages into requirement groups
          </small>
        </div>
      )}

      {/* ── Ready prompt (messages loaded, not yet grouped) ── */}
      {selectedGroup && hasMessages && !msgsLoading && !grouping && !hasTopics && (
        <div className="empty-state">
          <p>{messages.length} messages ready</p>
          <small>Click "Group by Topic" to let AI organize them by requirement</small>
          <button className="btn" onClick={handleGroup} style={{ marginTop: 16 }}>
            Group by Topic
          </button>
        </div>
      )}

      {/* ── No messages ── */}
      {selectedGroup && !msgsLoading && !hasMessages && (
        <div className="empty-state">
          <p>No messages found</p>
          <small>This group has no messages yet</small>
        </div>
      )}

      {/* ── Requirement cards ── */}
      {hasTopics && !grouping && (
        <div>
          {topics.map((group, idx) => (
            <RequirementCard
              key={idx}
              group={group}
              index={idx}
              isExpanded={expanded.has(idx)}
              onToggle={() => toggle(idx)}
              groupState={getState(idx)}
              onRun={runGroupAction}
            />
          ))}
        </div>
      )}
    </div>
  );
}
