import { Router } from 'express';
import * as npcs from '../controllers/npcController.js';
import * as chat from '../controllers/chatController.js';
import * as auth from '../controllers/authController.js';
import { requireUser } from '../middleware/auth.js';
import { isUuid } from '../data/db.js';

// Wraps async handlers so rejections reach the error middleware.
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const router = Router();

// A malformed id cannot match any row, so turn it away before Postgres answers
// with a type error instead of a clean 400.
for (const name of ['id', 'conversationId']) {
  router.param(name, (req, res, next, value) =>
    isUuid(value) ? next() : res.status(400).json({ error: 'Malformed id' }),
  );
}

// Public.
router.get('/options', npcs.options);
router.post('/auth/token', wrap(auth.token));

// Everything below belongs to the signed-in user, and only to them.
router.use(requireUser);

router.get('/me', auth.me);

router.get('/npcs', wrap(npcs.list));
router.post('/npcs', wrap(npcs.create));
router.post('/npcs/sample', wrap(npcs.createSample));
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
