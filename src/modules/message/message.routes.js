import { Router } from 'express';
import { createMessage, fetchMessages, fetchSenders } from './message.controller.js';

const router = Router();

router.post('/', createMessage);
router.get('/', fetchMessages);
router.get('/senders', fetchSenders);

export default router;
