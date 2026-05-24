import { Router } from "express";
import {
  getAllSessions,
  getSessionsByGroup,
  triggerSend,
} from "./daily-status.controller.js";

const router = Router();

// POST /api/daily-status/trigger-send
// Immediately sends a test message to the configured group.
// Body (optional): { "message": "custom text" }
router.post("/trigger-send", triggerSend);

// GET /api/daily-status
router.get("/", getAllSessions);

// GET /api/daily-status/:group
router.get("/:group", getSessionsByGroup);

export default router;
