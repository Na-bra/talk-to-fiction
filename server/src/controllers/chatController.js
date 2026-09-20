import { getNpc } from '../data/npcs.js';
import { stageFor } from '../stages.js';
import {
  listConversations as listForNpc,
  getConversation as findConversation,
  createConversation as startConversation,
} from '../data/conversations.js';
import { isUuid } from '../data/db.js';
import { respond } from '../services/ai/npcService.js';

export async function listConversations(req, res) {
  res.json(await listForNpc(req.db, req.params.id));
}

export async function getConversation(req, res) {
  const conversation = await findConversation(req.db, req.params.id, req.params.conversationId);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  res.json(conversation);
}

export async function createConversation(req, res) {
  const npc = await getNpc(req.db, req.params.id);
  if (!npc) return res.status(404).json({ error: 'NPC not found' });
  res.status(201).json(await startConversation(req.db, npc.id));
}

export async function chat(req, res) {
  const message = (req.body?.message || '').toString().trim();
  if (!message) return res.status(400).json({ error: 'A message is required' });

  const npc = await getNpc(req.db, req.params.id);
  if (!npc) return res.status(404).json({ error: 'NPC not found' });

  const requestedId = req.body.conversationId;
  let conversation;
  if (requestedId) {
    conversation = isUuid(requestedId) ? await findConversation(req.db, npc.id, requestedId) : null;
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  } else {
    conversation = await startConversation(req.db, npc.id);
  }

  const result = await respond({ db: req.db, npc, conversation, playerMessage: message });

  res.json({
    conversationId: conversation.id,
    reply: result.reply,
    npc: {
      relationship: npc.relationship,
      relationshipStage: stageFor(npc.relationship),
      emotionalState: npc.emotionalState,
      secrets: npc.secrets,
    },
    changes: result.changes,
    newMemories: result.newMemories,
    events: result.events,
  });
}
