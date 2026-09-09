import { Npc } from '../models/Npc.js';
import { Conversation } from '../models/Conversation.js';
import { respond } from '../services/ai/npcService.js';

export async function listConversations(req, res) {
  const conversations = await Conversation.find({ npcId: req.params.id })
    .sort({ updatedAt: -1 })
    .select('title summary updatedAt createdAt messages')
    .lean();
  res.json(
    conversations.map(({ messages, ...rest }) => ({ ...rest, messageCount: messages.length })),
  );
}

export async function getConversation(req, res) {
  const conversation = await Conversation.findById(req.params.conversationId).lean();
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  res.json(conversation);
}

export async function createConversation(req, res) {
  const npc = await Npc.findById(req.params.id).lean();
  if (!npc) return res.status(404).json({ error: 'NPC not found' });
  const conversation = await Conversation.create({ npcId: npc._id });
  res.status(201).json(conversation);
}

export async function chat(req, res) {
  const message = (req.body?.message || '').toString().trim();
  if (!message) return res.status(400).json({ error: 'A message is required' });

  const npc = await Npc.findById(req.params.id);
  if (!npc) return res.status(404).json({ error: 'NPC not found' });

  const conversation = req.body.conversationId
    ? await Conversation.findOne({ _id: req.body.conversationId, npcId: npc._id })
    : await Conversation.create({ npcId: npc._id });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

  const result = await respond({ npc, conversation, playerMessage: message });

  res.json({
    conversationId: conversation._id,
    reply: result.reply,
    npc: {
      relationship: npc.relationship,
      emotionalState: npc.emotionalState,
      secrets: npc.secrets,
    },
    changes: result.changes,
    newMemories: result.newMemories,
  });
}
