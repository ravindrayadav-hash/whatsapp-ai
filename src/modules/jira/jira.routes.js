import { Router } from "express";
import {
  handleJiraSearch,
  handleJiraIssue,
  handleCreateJiraIssue,
} from "./jira.controller.js";

const router = Router();

// GET /api/jira/search?q=<text>
router.get("/search", handleJiraSearch);

// POST /api/jira/issue  — create a new Jira issue
router.post("/issue", handleCreateJiraIssue);

// GET /api/jira/issue/:issueKey  (e.g. CP-123)
router.get("/issue/:issueKey", handleJiraIssue);

export default router;
