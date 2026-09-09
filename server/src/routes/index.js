import { Router } from 'express';
import * as npcs from '../controllers/npcController.js';
import * as chat from '../controllers/chatController.js';

// Wraps async handlers so rejections reach the error middleware.
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const router = Router();

router.get('/options', npcs.options);

router.get('/npcs', wrap(npcs.list));
router.post('/npcs', wrap(npcs.create));
router.post('/npcs/generate', wrap(npcs.generate));
router.get('/npcs/:id', wrap(npcs.getOne));
router.put('/npcs/:id', wrap(npcs.update));
router.delete('/npcs/:id', wrap(npcs.remove));
router.post('/npcs/:id/reset', wrap(npcs.reset));

router.get('/npcs/:id/memories', wrap(npcs.memories));
router.get('/npcs/:id/conversations', wrap(chat.listConversations));
router.post('/npcs/:id/conversations', wrap(chat.createConversation));
router.get('/npcs/:id/conversations/:conversationId', wrap(chat.getConversation));
router.post('/npcs/:id/chat', wrap(chat.chat));

export default router;
