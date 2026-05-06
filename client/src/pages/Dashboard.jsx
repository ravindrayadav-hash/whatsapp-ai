import { useNavigate } from 'react-router-dom';
import useFetch from '../hooks/useFetch.js';
import { fetchGroups, fetchSummaries } from '../api/client.js';

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'Just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function GroupCard({ group, onClick }) {
  const { data } = useFetch(() => fetchSummaries(group, 1), [group]);
  const latest = data?.data?.[0];

  return (
    <div className="group-card" onClick={onClick}>
      <div className="group-card-header">
        <span className="group-name">{group}</span>
        <span className="badge green">Active</span>
      </div>
      <p className="group-meta">
        Last summary: {latest ? timeAgo(latest.createdAt) : 'Not yet summarised'}
      </p>
      {latest && (
        <>
          <p className="group-preview">{latest.summary_text}</p>
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            {latest.requirements?.length > 0 && (
              <span className="badge blue">{latest.requirements.length} requirements</span>
            )}
            {latest.issues?.length > 0 && (
              <span className="badge red">{latest.issues.length} issues</span>
            )}
            {latest.action_items?.length > 0 && (
              <span className="badge yellow">{latest.action_items.length} actions</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useFetch(fetchGroups);

  const groups = data?.data ?? [];

  const totalGroups   = groups.length;

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Monitor all WhatsApp group activity and AI summaries</p>
      </div>

      {error && <div className="error-banner">Failed to load groups: {error}</div>}

      <div className="stat-grid">
        <div className="stat-card green">
          <div className="label">Active Groups</div>
          <div className="value">{loading ? '—' : totalGroups}</div>
        </div>
        <div className="stat-card blue">
          <div className="label">Scraper</div>
          <div className="value" style={{ fontSize: 16, paddingTop: 4 }}>Every 5 min</div>
        </div>
        <div className="stat-card yellow">
          <div className="label">Summary Job</div>
          <div className="value" style={{ fontSize: 16, paddingTop: 4 }}>Every 15 min</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>Groups</h2>
        <button className="btn btn-ghost" onClick={refetch}>↻ Refresh</button>
      </div>

      {loading ? (
        <div className="spinner-wrap"><div className="spinner" /></div>
      ) : groups.length === 0 ? (
        <div className="empty-state">
          <p>No groups yet</p>
          <small>Messages will appear once the WhatsApp scraper runs</small>
        </div>
      ) : (
        <div className="groups-grid">
          {groups.map((g) => (
            <GroupCard
              key={g}
              group={g}
              onClick={() => navigate(`/summaries?group=${encodeURIComponent(g)}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
