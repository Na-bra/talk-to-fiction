import { Npc } from '../models/Npc.js';
import { Conversation } from '../models/Conversation.js';
import { Memory } from '../models/Memory.js';
import { generateCharacterDraft } from '../services/ai/npcService.js';
import { EMOTIONS, SUGGESTED_TRAITS, DEFAULT_RELATIONSHIP } from '../constants.js';

const TEXT_FIELDS = [
  'name', 'occupation', 'setting', 'background',
  'goals', 'fears', 'motivations', 'values', 'speechStyle',
];

/** Accepts secrets as plain strings or as objects, and preserves reveal state. */
function normaliseSecrets(secrets) {
  if (!Array.isArray(secrets)) return undefined;
  return secrets
    .map((secret) => (typeof secret === 'string' ? { content: secret } : secret))
    .filter((secret) => secret?.content?.trim())
    .map((secret) => ({
      content: secret.content.trim(),
      knownByPlayer: Boolean(secret.knownByPlayer),
      revealedAt: secret.revealedAt || null,
    }));
}

function pickNpcFields(body = {}) {
  const data = {};
  for (const field of TEXT_FIELDS) {
    if (typeof body[field] === 'string') data[field] = body[field].trim();
  }
  if (body.age !== undefined && body.age !== '') data.age = Number(body.age);
  if (Array.isArray(body.personality)) {
    data.personality = body.personality.map((trait) => `${trait}`.trim()).filter(Boolean);
  }
  const secrets = normaliseSecrets(body.secrets);
  if (secrets) data.secrets = secrets;
  if (body.relationship) {
    data.relationship = { ...DEFAULT_RELATIONSHIP, ...body.relationship };
  }
  return data;
}

export const options = (req, res) => res.json({ emotions: EMOTIONS, traits: SUGGESTED_TRAITS });

export async function list(req, res) {
  const npcs = await Npc.find().sort({ createdAt: -1 }).lean();
  res.json(npcs);
}

export async function getOne(req, res) {
  const npc = await Npc.findById(req.params.id).lean();
  if (!npc) return res.status(404).json({ error: 'NPC not found' });
  res.json(npc);
}

export async function create(req, res) {
  const data = pickNpcFields(req.body);
  if (!data.name) return res.status(400).json({ error: 'A name is required' });
  const npc = await Npc.create(data);
  res.status(201).json(npc);
}

export async function update(req, res) {
  const npc = await Npc.findByIdAndUpdate(req.params.id, pickNpcFields(req.body), {
    new: true,
    runValidators: true,
  });
  if (!npc) return res.status(404).json({ error: 'NPC not found' });
  res.json(npc);
}

export async function remove(req, res) {
  const npc = await Npc.findByIdAndDelete(req.params.id);
  if (!npc) return res.status(404).json({ error: 'NPC not found' });
  await Promise.all([
    Conversation.deleteMany({ npcId: npc._id }),
    Memory.deleteMany({ npcId: npc._id }),
  ]);
  res.json({ ok: true });
}

/**
 * Drafts character fields from whatever the author has typed so far. Deliberately
 * has no :id — the Creator uses it before the NPC exists, which is the useful
 * direction. Nothing is persisted here.
 */
export async function generate(req, res) {
  const draft = await generateCharacterDraft(pickNpcFields(req.body));
  res.json(draft);
}

export async function memories(req, res) {
  const items = await Memory.find({ npcId: req.params.id }).sort({ createdAt: -1 }).lean();
  res.json(items);
}

/** Resets relationship, emotion, memories and secret disclosure — a test helper. */
export async function reset(req, res) {
  const npc = await Npc.findById(req.params.id);
  if (!npc) return res.status(404).json({ error: 'NPC not found' });
  npc.relationship = { ...DEFAULT_RELATIONSHIP };
  npc.emotionalState = { label: 'Neutral', intensity: 20, reason: '' };
  npc.secrets.forEach((secret) => {
    secret.knownByPlayer = false;
    secret.revealedAt = null;
  });
  await npc.save();
  await Promise.all([
    Memory.deleteMany({ npcId: npc._id }),
    Conversation.deleteMany({ npcId: npc._id }),
  ]);
  res.json(npc);
}
