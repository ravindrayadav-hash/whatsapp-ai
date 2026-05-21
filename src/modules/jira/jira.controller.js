/**
 * Jira controller — thin HTTP layer over jira.service.
 * GET /api/jira/search?q=<text>      → search issues by text
 * GET /api/jira/issue/:issueKey      → get full issue details
 */

import { searchIssues, getIssue, createIssue } from "./jira.service.js";

export async function handleJiraSearch(req, res, next) {
  try {
    const { q } = req.query;

    if (!q || typeof q !== "string" || !q.trim()) {
      return res
        .status(400)
        .json({ success: false, error: '"q" query param is required' });
    }

    const issues = await searchIssues(q.trim());
    return res.json({ success: true, issues });
  } catch (err) {
    if (err.message?.includes("not configured")) {
      return res.status(503).json({ success: false, error: err.message });
    }
    next(err);
  }
}

export async function handleCreateJiraIssue(req, res, next) {
  try {
    const { projectKey, summary, description, issueType, priority, status } =
      req.body;

    if (!summary?.trim()) {
      return res
        .status(400)
        .json({ success: false, error: '"summary" is required' });
    }

    const result = await createIssue({
      projectKey,
      summary: summary.trim(),
      description,
      issueType,
      priority,
      status,
    });
    return res.status(201).json({ success: true, ...result });
  } catch (err) {
    if (
      err.message?.includes("not configured") ||
      err.message?.includes("Project key")
    ) {
      return res.status(503).json({ success: false, error: err.message });
    }
    // Surface Jira API errors (permission denied, invalid fields, etc.) directly
    // rather than letting them fall through to the generic 500 handler
    return res.status(422).json({ success: false, error: err.message });
  }
}

export async function handleJiraIssue(req, res, next) {
  try {
    const { issueKey } = req.params;

    if (!issueKey?.trim()) {
      return res
        .status(400)
        .json({ success: false, error: "issueKey param is required" });
    }

    const issue = await getIssue(issueKey.trim().toUpperCase());
    return res.json({ success: true, issue });
  } catch (err) {
    if (err.message?.includes("not configured")) {
      return res.status(503).json({ success: false, error: err.message });
    }
    // Jira returns 404 text for unknown issue keys
    if (err.message?.toLowerCase().includes("issue does not exist")) {
      return res.status(404).json({
        success: false,
        error: `Issue "${req.params.issueKey}" not found in Jira`,
      });
    }
    next(err);
  }
}
