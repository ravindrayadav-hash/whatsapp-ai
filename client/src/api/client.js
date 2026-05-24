// API client — reads the JWT from localStorage (set by AuthContext) and sends
// it as a Bearer token on every request.  Falls back to VITE_API_TOKEN for
// backwards compatibility with the scraper / static token flow.

import { getToken } from "../context/AuthContext.jsx";

const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : "/api";

function authHeader() {
  // Prefer the JWT stored by the logged-in user; fall back to static env token
  const jwt = getToken();
  if (jwt) return { Authorization: `Bearer ${jwt}` };
  const staticToken = import.meta.env.VITE_API_TOKEN;
  return staticToken ? { Authorization: `Bearer ${staticToken}` } : {};
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...authHeader(), ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.message || body.error || `API error ${res.status}: ${path}`,
    );
  }
  return res.json();
}

function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export async function fetchGroups() {
  return request("/groups");
}

export async function fetchScraperStatus() {
  return request("/scraper/status");
}

export async function fetchMessages(
  group_name,
  { limit = 50, page, from, to, sender, order } = {},
) {
  return request(
    `/messages${qs({ group_name, limit, page, from, to, sender, order })}`,
  );
}

export async function fetchSenders(group_name) {
  return request(`/messages/senders${qs({ group_name })}`);
}

export async function fetchSummaries(
  group_name,
  { limit = 20, from, to } = {},
) {
  return request(
    `/summaries/${encodeURIComponent(group_name)}${qs({ limit, from, to })}`,
  );
}

export async function runAIAction({
  messages,
  action,
  extraInput,
  group_name,
}) {
  const res = await fetch(`${BASE}/ai/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ messages, action, extraInput, group_name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.error || body.errors?.[0] || `AI request failed (${res.status})`,
    );
  }
  return res.json();
}

export async function fetchAIHistory({
  group_name,
  action_type,
  from,
  to,
  page,
  limit,
} = {}) {
  return request(
    `/ai/history${qs({ group_name, action_type, from, to, page, limit })}`,
  );
}

export async function searchJiraIssues(q) {
  return request(`/jira/search${qs({ q })}`);
}

export async function fetchJiraIssue(issueKey) {
  return request(`/jira/issue/${encodeURIComponent(issueKey)}`);
}

export async function createJiraIssue({
  projectKey,
  summary,
  description,
  issueType,
  priority,
  status,
}) {
  const res = await fetch(`${BASE}/jira/issue`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({
      projectKey,
      summary,
      description,
      issueType,
      priority,
      status,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.error || body.message || `Jira create failed (${res.status})`,
    );
  }
  return res.json();
}

export async function triggerSummary(group_name) {
  const res = await fetch(
    `${BASE}/summaries/process/${encodeURIComponent(group_name)}`,
    { method: "POST", headers: authHeader() },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.message || body.error || `Trigger failed (${res.status})`,
    );
  }
  return res.json();
}
