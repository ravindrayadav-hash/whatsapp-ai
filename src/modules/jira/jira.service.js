/**
 * Jira REST API v3 proxy service.
 * Keeps credentials server-side — frontend never touches the Jira token directly.
 * All calls use Basic auth: base64(JIRA_USERNAME:JIRA_API_TOKEN).
 */

const BASE_URL = process.env.JIRA_BASE_URL;
const USERNAME = process.env.JIRA_USERNAME;
const API_TOKEN = process.env.JIRA_API_TOKEN;

function authHeader() {
  const creds = Buffer.from(`${USERNAME}:${API_TOKEN}`).toString("base64");
  return `Basic ${creds}`;
}

function assertConfigured() {
  if (!BASE_URL || !USERNAME || !API_TOKEN) {
    throw new Error(
      "Jira is not configured — set JIRA_BASE_URL, JIRA_USERNAME, JIRA_API_TOKEN in .env",
    );
  }
}

async function jiraFetch(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401)
      throw new Error(
        "Jira credentials are invalid — check JIRA_USERNAME and JIRA_API_TOKEN in .env",
      );
    if (res.status === 403)
      throw new Error(
        "Permission denied — the Jira account does not have access to this resource.",
      );
    if (res.status === 404)
      throw new Error(
        "Jira issue not found — check the issue key or project key.",
      );
    const msg =
      body.errorMessages?.[0] || body.message || `Jira API error ${res.status}`;
    throw new Error(msg);
  }

  return res.json();
}

async function jiraPost(path, payload) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Map HTTP status codes to plain English before falling back to Jira's raw message
    // (Jira may return error text in any language based on the account locale)
    if (res.status === 401)
      throw new Error(
        "Jira credentials are invalid — check JIRA_USERNAME and JIRA_API_TOKEN in .env",
      );
    if (res.status === 403)
      throw new Error(
        "Permission denied — the Jira account does not have Create Issues permission in this project. Ask a Jira admin to grant it.",
      );
    if (res.status === 404)
      throw new Error(
        "Jira project not found — check that JIRA_PROJECT_KEY is correct.",
      );
    const rawMsg =
      body.errorMessages?.[0] ||
      Object.values(body.errors || {})[0] ||
      body.message ||
      `Jira API error ${res.status}`;
    throw new Error(rawMsg);
  }

  // 204 No Content (e.g. transitions) has no body
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

/**
 * Convert plain text to Atlassian Document Format (ADF).
 * Jira API v3 requires ADF for description fields on create/update.
 */
function textToAdf(text) {
  const paragraphs = (text || "").split("\n").filter((l) => l.trim());
  return {
    type: "doc",
    version: 1,
    content: paragraphs.length
      ? paragraphs.map((line) => ({
          type: "paragraph",
          content: [{ type: "text", text: line }],
        }))
      : [{ type: "paragraph", content: [] }],
  };
}

/**
 * Extract plain text from Atlassian Document Format (ADF) nodes.
 * Jira API v3 returns descriptions as ADF JSON, not plain strings.
 */
function adfToText(node) {
  if (!node) return "";
  if (node.type === "text") return node.text || "";
  if (!node.content) return "";
  const sep = [
    "paragraph",
    "heading",
    "bulletList",
    "listItem",
    "blockquote",
  ].includes(node.type)
    ? "\n"
    : "";
  return node.content.map(adfToText).join("") + sep;
}

function formatIssue(issue) {
  const f = issue.fields || {};
  return {
    key: issue.key,
    url: `${BASE_URL}/browse/${issue.key}`,
    summary: f.summary || "",
    description: adfToText(f.description).trim(),
    status: {
      name: f.status?.name || "",
      categoryColor: f.status?.statusCategory?.colorName || "blue-grey",
      categoryName: f.status?.statusCategory?.name || "",
    },
    priority: f.priority?.name || "",
    issueType: f.issuetype?.name || "",
    storyPoints: f.story_points ?? f.customfield_10016 ?? null,
    assignee: f.assignee?.displayName || null,
    reporter: f.reporter?.displayName || null,
    labels: f.labels || [],
    created: f.created || null,
    updated: f.updated || null,
  };
}

/**
 * Search Jira issues by text using JQL.
 * Returns up to maxResults issues sorted by last-updated.
 */
export async function searchIssues(query, maxResults = 10) {
  assertConfigured();

  const jql = `text ~ "${query.replace(/"/g, '\\"')}" ORDER BY updated DESC`;
  const fields =
    "summary,status,priority,issuetype,customfield_10016,story_points";
  const path = `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=${fields}&maxResults=${maxResults}`;

  const body = await jiraFetch(path);
  return (body.issues || []).map(formatIssue);
}

/**
 * Create a new Jira issue and optionally transition it to a requested status.
 * Status transition is best-effort — a failed transition does not block issue creation.
 */
export async function createIssue({
  projectKey,
  summary,
  description,
  issueType = "Task",
  priority = "Medium",
  status,
}) {
  assertConfigured();

  const key = projectKey || process.env.JIRA_PROJECT_KEY;
  if (!key)
    throw new Error("Project key is required — set JIRA_PROJECT_KEY in .env");

  const fields = {
    project: { key },
    summary,
    issuetype: { name: issueType },
    priority: { name: priority },
  };
  if (description) fields.description = textToAdf(description);

  const created = await jiraPost("/rest/api/3/issue", { fields });

  // Transition to the requested status if it differs from the default "To Do"
  if (status && status.toLowerCase() !== "to do") {
    try {
      const { transitions = [] } = await jiraFetch(
        `/rest/api/3/issue/${created.key}/transitions`,
      );
      const match = transitions.find(
        (t) =>
          t.name.toLowerCase() === status.toLowerCase() ||
          t.to?.name?.toLowerCase() === status.toLowerCase(),
      );
      if (match) {
        await jiraPost(`/rest/api/3/issue/${created.key}/transitions`, {
          transition: { id: match.id },
        });
      }
    } catch (e) {
      console.warn(
        `[JiraService] Transition to "${status}" failed (non-fatal): ${e.message}`,
      );
    }
  }

  return {
    key: created.key,
    url: `${BASE_URL}/browse/${created.key}`,
  };
}

/**
 * Fetch full details of a single issue by key (e.g. "CP-123").
 */
export async function getIssue(issueKey) {
  assertConfigured();

  const fields =
    "summary,description,status,priority,issuetype,customfield_10016,story_points,labels,assignee,reporter,created,updated";
  const body = await jiraFetch(
    `/rest/api/3/issue/${issueKey}?fields=${fields}`,
  );
  return formatIssue(body);
}
