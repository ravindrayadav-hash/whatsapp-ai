import { Router } from 'express';
import { triggerProcessing, fetchSummaries } from './summary.controller.js';

const router = Router();

router.post('/process/:groupName', triggerProcessing);
router.get('/:groupName', fetchSummaries);

export default router;
