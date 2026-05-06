import { Router } from 'express';
import { handleAIAction, handleAIHistory } from './ai.controller.js';

const router = Router();

// POST /api/ai/action
router.post('/action', handleAIAction);

// GET /api/ai/history
router.get('/history', handleAIHistory);

export default router;
