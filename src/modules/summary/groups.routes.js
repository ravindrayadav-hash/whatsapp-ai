import { Router } from "express";
import { getActiveGroups } from "./summary.repository.js";

const router = Router();

/**
 * GET /api/groups
 * Returns all distinct group names that have messages.
 */
router.get("/", async (_req, res, next) => {
  try {
    const groups = await getActiveGroups();
    res.json({ success: true, data: groups });
  } catch (err) {
    next(err);
  }
});

export default router;
