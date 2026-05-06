/**
 * Shared AI result card components.
 * Used by both AIActionsView (bulk actions) and MessagePanel (per-message panel).
 */
import { useState } from 'react';

// ── Shared primitives ──────────────────────────────────────────────────────────

export function Dot({ color }) {
  return (
    <span style={{
      display: 'inline-block', width: 6, height: 6,
      borderRadius: '50%', background: color, flexShrink: 0, marginTop: 5,
    }} />
  );
}

export function SectionLabel({ title, color }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.07em', color: color || 'var(--text-muted)', marginBottom: 8,
    }}>
      {title}
    </div>
  );
}

export function MiniList({ items, color }) {
  if (!items?.length) return null;
  return (
    <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
      {items.map((item, i) => (
        <li key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          fontSize: 12, padding: '7px 10px',
          background: 'var(--surface)', borderRadius: 6, lineHeight: 1.5,
        }}>
          <Dot color={color} />
          {item}
        </li>
      ))}
    </ul>
  );
}

// ── Summarize ─────────────────────────────────────────────────────────────────

const PRIORITY_COLORS = {
  High:   'var(--danger)',
  Medium: 'var(--warning)',
  Low:    'var(--accent)',
};

function ReqCard({ req }) {
  const [open, setOpen] = useState(false);
  const pc = PRIORITY_COLORS[req.priority] || 'var(--text-muted)';
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 14px', cursor: 'pointer', background: 'var(--surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
            {open ? '▾' : '▸'}
          </span>
          <span style={{
            fontSize: 13, fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {req.title}
          </span>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
          flexShrink: 0, marginLeft: 8, background: `${pc}22`, color: pc,
        }}>
          {req.priority}
        </span>
      </div>

      {open && (
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
          {req.description && (
            <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>{req.description}</p>
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
    return <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No requirements identified.</p>;
  }
  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        {data.requirements.length} requirement{data.requirements.length !== 1 ? 's' : ''} found
      </p>
      {data.requirements.map((req, i) => <ReqCard key={i} req={req} />)}
    </div>
  );
}

// ── Explain ───────────────────────────────────────────────────────────────────

function ImageInsightCard({ insight, imageUrl }) {
  return (
    <div style={{ border: '2px solid #a855f7', borderRadius: 8, overflow: 'hidden', background: 'rgba(168,85,247,0.05)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', background: 'rgba(168,85,247,0.12)',
        borderBottom: '1px solid rgba(168,85,247,0.25)',
      }}>
        <span style={{ fontSize: 14 }}>🖼</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#a855f7' }}>{insight.sender}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>image insight</span>
      </div>
      <div style={{ padding: '10px 12px', display: 'flex', gap: 12 }}>
        {imageUrl && (
          <a href={imageUrl} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
            <img
              src={imageUrl}
              alt="attachment"
              style={{
                width: 72, height: 72, objectFit: 'cover',
                borderRadius: 6, border: '2px solid rgba(168,85,247,0.4)', display: 'block',
              }}
            />
          </a>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
          {insight.what_shown && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--info)', marginBottom: 4 }}>
                What is shown
              </div>
              <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text)' }}>{insight.what_shown}</p>
            </div>
          )}
          {insight.connection && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#a855f7', marginBottom: 4 }}>
                Connection to discussion
              </div>
              <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-muted)' }}>{insight.connection}</p>
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
    if (m.image_url && !imagesBySender[m.sender]) imagesBySender[m.sender] = m.image_url;
  }

  const hasImageInsights = data.image_insights?.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {data.explanation && (
        <div style={{
          fontSize: 14, lineHeight: 1.75, padding: '14px 16px',
          background: 'var(--surface-alt)', borderRadius: 8,
          borderLeft: '3px solid var(--accent)',
        }}>
          {data.explanation}
        </div>
      )}

      {hasImageInsights && (
        <div style={{
          border: '1px solid rgba(168,85,247,0.3)', borderRadius: 10,
          padding: '12px', background: 'rgba(168,85,247,0.04)',
        }}>
          <div style={{
            fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.07em', color: '#a855f7', marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span>🖼</span>
            Image Insights ({data.image_insights.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
          <p style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--text-muted)' }}>{data.context}</p>
        </div>
      )}

      {data.participants?.length > 0 && (
        <div>
          <SectionLabel title="Participants" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {data.participants.map((p, i) => (
              <span key={i} style={{
                fontSize: 12, padding: '3px 10px', borderRadius: 20,
                background: 'var(--surface-alt)', border: '1px solid var(--border)',
              }}>
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
  Formal:     'var(--info)',
  Friendly:   'var(--accent)',
  Direct:     'var(--warning)',
  Empathetic: '#a855f7',
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {data.context_summary && (
        <p style={{
          fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic',
          padding: '8px 12px', background: 'var(--surface-alt)', borderRadius: 6,
        }}>
          {data.context_summary}
        </p>
      )}
      {data.suggested_replies?.map((r, i) => {
        const tc = TONE_COLORS[r.tone] || 'var(--text-muted)';
        return (
          <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface)',
            }}>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                background: `${tc}22`, color: tc,
              }}>
                {r.tone}
              </span>
              <button
                onClick={() => copy(r.message, i)}
                style={{
                  fontSize: 12, background: 'none', border: 'none', cursor: 'pointer',
                  color: copied === i ? 'var(--accent)' : 'var(--text-muted)',
                  padding: '2px 8px', borderRadius: 4, transition: 'color 0.15s',
                }}
              >
                {copied === i ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.75, padding: '12px 14px' }}>{r.message}</p>
          </div>
        );
      })}
    </div>
  );
}

// ── Jira ──────────────────────────────────────────────────────────────────────

const TICKET_TYPE_COLORS = {
  Story:       'var(--info)',
  Bug:         'var(--danger)',
  Task:        'var(--accent)',
  Improvement: 'var(--warning)',
  Epic:        '#a855f7',
};

const JIRA_PRIORITY = {
  Highest: { color: '#ef4444', icon: '▲▲' },
  High:    { color: '#ef4444', icon: '▲'  },
  Medium:  { color: '#f59e0b', icon: '◆'  },
  Low:     { color: '#22c55e', icon: '▼'  },
  Lowest:  { color: '#9ca3af', icon: '▼▼' },
};

function ticketToMarkdown(ticket) {
  const lines = [];
  lines.push(`## [${ticket.type || 'Task'}] ${ticket.title}`);
  lines.push(`**Priority:** ${ticket.priority}`);
  if (ticket.description) {
    lines.push('');
    lines.push('### Description');
    lines.push(ticket.description);
  }
  if (ticket.acceptance_criteria?.length) {
    lines.push('');
    lines.push('### Acceptance Criteria');
    ticket.acceptance_criteria.forEach(c => lines.push(`- [ ] ${c}`));
  }
  if (ticket.labels?.length) {
    lines.push('');
    lines.push(`**Labels:** ${ticket.labels.join(', ')}`);
  }
  if (ticket.story_points) {
    lines.push(`**Story Points:** ${ticket.story_points}`);
  }
  return lines.join('\n');
}

function JiraTicketCard({ ticket, index }) {
  const [title,       setTitle]       = useState(ticket.title       || '');
  const [description, setDescription] = useState(ticket.description || '');
  const [copied,      setCopied]      = useState(false);

  const p  = JIRA_PRIORITY[ticket.priority] || { color: '#9ca3af', icon: '◆' };
  const tc = TICKET_TYPE_COLORS[ticket.type] || 'var(--text-muted)';

  function copy() {
    const text = ticketToMarkdown({ ...ticket, title, description });
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderLeft: `4px solid ${p.color}`,
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: '12px 14px',
        background: `color-mix(in srgb, ${p.color} 5%, var(--surface))`,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            background: `${tc}22`, color: tc, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {ticket.type || 'Task'}
          </span>

          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
            background: `${p.color}22`, color: p.color, letterSpacing: '0.04em',
          }}>
            <span style={{ fontSize: 9 }}>{p.icon}</span>
            {ticket.priority}
          </span>

          {ticket.story_points && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
              background: 'rgba(82,134,224,0.15)', color: 'var(--info)',
            }}>
              {ticket.story_points} SP
            </span>
          )}

          <span style={{ flex: 1 }} />

          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', userSelect: 'none' }}>
            #{index + 1}
          </span>

          <button
            onClick={copy}
            title="Copy as Markdown"
            style={{
              fontSize: 11, fontWeight: 600,
              padding: '3px 10px', borderRadius: 6,
              border: '1px solid var(--border)',
              background: copied ? `${p.color}22` : 'transparent',
              color: copied ? p.color : 'var(--text-muted)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>

        {/* Editable title */}
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          title="Click to edit title"
          style={{
            width: '100%', boxSizing: 'border-box',
            fontSize: 14, fontWeight: 600, lineHeight: 1.4,
            background: 'transparent',
            border: 'none',
            borderBottom: '1.5px solid transparent',
            borderRadius: 0,
            color: 'var(--text)',
            padding: '2px 0',
            outline: 'none',
            cursor: 'text',
            transition: 'border-color 0.15s',
          }}
          onFocus={e  => { e.target.style.borderBottomColor = p.color; }}
          onBlur={e   => { e.target.style.borderBottomColor = 'transparent'; }}
        />
      </div>

      {/* ── Body ── */}
      <div style={{ padding: '14px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>

        {/* Description */}
        <div style={{ marginBottom: ticket.acceptance_criteria?.length ? 14 : 0 }}>
          <SectionLabel title="Description" />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={description ? Math.min(8, description.split('\n').length + 1) : 2}
            placeholder="No description — click to add"
            title="Click to edit description"
            style={{
              width: '100%', boxSizing: 'border-box',
              fontSize: 13, lineHeight: 1.65, fontFamily: 'inherit',
              background: 'var(--surface)',
              border: '1.5px solid transparent',
              borderRadius: 6,
              color: description ? 'var(--text)' : 'var(--text-muted)',
              padding: '8px 10px',
              outline: 'none', resize: 'vertical',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => { e.target.style.borderColor = p.color; e.target.style.color = 'var(--text)'; }}
            onBlur={e  => { e.target.style.borderColor = 'transparent'; }}
          />
        </div>

        {/* Acceptance Criteria */}
        {ticket.acceptance_criteria?.length > 0 && (
          <div style={{ marginBottom: ticket.labels?.length ? 12 : 0 }}>
            <SectionLabel title="Acceptance Criteria" color="var(--info)" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {ticket.acceptance_criteria.map((c, j) => (
                <div key={j} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  fontSize: 12, padding: '7px 10px',
                  background: 'var(--surface)', borderRadius: 6, lineHeight: 1.55,
                }}>
                  <span style={{
                    flexShrink: 0, width: 15, height: 15, marginTop: 1,
                    border: '1.5px solid var(--info)', borderRadius: 3,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--info)', fontSize: 10, fontWeight: 700,
                  }}>✓</span>
                  {c}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Labels */}
        {ticket.labels?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 12 }}>
            {ticket.labels.map((l, j) => (
              <span key={j} style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 20,
                background: 'var(--surface-alt)', border: '1px solid var(--border)',
                color: 'var(--text-muted)',
              }}>
                {l}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function JiraResult({ data }) {
  if (!data?.tickets?.length) {
    return <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No tickets extracted.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {data.tickets.length} ticket{data.tickets.length !== 1 ? 's' : ''} extracted
      </p>
      {data.tickets.map((t, i) => (
        <JiraTicketCard key={i} ticket={t} index={i} />
      ))}
    </div>
  );
}
