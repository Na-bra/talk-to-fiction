import { randomUUID } from 'node:crypto';
import { listNpcs, getNpc, createNpc, updateNpc, deleteNpc } from '../data/npcs.js';
import { listMemories, deleteMemoriesForNpc } from '../data/memories.js';
import { deleteConversationsForNpc } from '../data/conversations.js';
import { generateCharacterDraft } from '../services/ai/npcService.js';
import {
  EMOTIONS,
  SUGGESTED_TRAITS,
  RELATIONSHIP_KEYS,
  DEFAULT_RELATIONSHIP,
  DEFAULT_EMOTION,
} from '../constants.js';
import { KEVIN_CROSS } from '../samples.js';

const TEXT_FIELDS = [
  'name', 'occupation', 'setting', 'background',
  'goals', 'fears', 'motivations', 'values', 'speechStyle',
];

const clamp = (value) => Math.max(0, Math.min(100, Math.round(value)));

/**
 * Accepts secrets as plain strings or objects. A secret that matches one the
 * character already has — by id, or failing that by its text — keeps its id
 * and its revealed state, so editing a character never silently un-reveals
 * something. New secrets always start hidden; only a conversation reveals one.
 */
function normaliseSecrets(secrets, existing = []) {
  if (!Array.isArray(secrets)) return undefined;
  return secrets
    .map((secret) => (typeof secret === 'string' ? { content: secret } : secret))
    .filter((secret) => secret?.content?.toString().trim())
    .map((secret) => {
      const content = secret.content.toString().trim();
      const prior =
        (secret.id && existing.find((known) => known.id === secret.id)) ||
        existing.find((known) => known.content === content);
      return {
        id: prior?.id || randomUUID(),
        content,
        knownByPlayer: Boolean(prior?.knownByPlayer),
        revealedAt: prior?.revealedAt ?? null,
      };
    });
}

function pickNpcFields(body = {}, existingSecrets) {
  const data = {};
  for (const field of TEXT_FIELDS) {
    if (typeof body[field] === 'string') data[field] = body[field].trim();
  }
  if (body.age !== undefined && body.age !== '' && body.age !== null) data.age = Number(body.age);
  if (Array.isArray(body.personality)) {
    data.personality = body.personality.map((trait) => `${trait}`.trim()).filter(Boolean);
  }
  const secrets = normaliseSecrets(body.secrets, existingSecrets);
  if (secrets) data.secrets = secrets;
  if (body.relationship && typeof body.relationship === 'object') {
    data.relationship = {};
    for (const key of RELATIONSHIP_KEYS) {
      const value = Number(body.relationship[key]);
      data.relationship[key] = Number.isFinite(value) ? clamp(value) : DEFAULT_RELATIONSHIP[key];
    }
  }
  return data;
}

export const options = (req, res) => res.json({ emotions: EMOTIONS, traits: SUGGESTED_TRAITS });

export async function list(req, res) {
  res.json(await listNpcs(req.db));
}

export async function getOne(req, res) {
  const npc = await getNpc(req.db, req.params.id);
  if (!npc) return res.status(404).json({ error: 'NPC not found' });
  res.json(npc);
}

export async function create(req, res) {
  const data = pickNpcFields(req.body);
  if (!data.name) return res.status(400).json({ error: 'A name is required' });
  res.status(201).json(await createNpc(req.db, data));
}

/** Adds a fresh copy of Kevin Cross to the caller's registry. */
export async function createSample(req, res) {
  res.status(201).json(await createNpc(req.db, pickNpcFields(KEVIN_CROSS)));
}

export async function update(req, res) {
  const existing = await getNpc(req.db, req.params.id);
  if (!existing) return res.status(404).json({ error: 'NPC not found' });
  const data = pickNpcFields(req.body, existing.secrets);
  if ('name' in data && !data.name) return res.status(400).json({ error: 'A name is required' });
  res.json(await updateNpc(req.db, existing.id, data));
}

export async function remove(req, res) {
  const deleted = await deleteNpc(req.db, req.params.id);
  if (!deleted) return res.status(404).json({ error: 'NPC not found' });
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
  res.json(await listMemories(req.db, req.params.id));
}

/** Resets relationship, emotion, memories and secret disclosure — a test helper. */
export async function reset(req, res) {
  const npc = await getNpc(req.db, req.params.id);
  if (!npc) return res.status(404).json({ error: 'NPC not found' });
  await Promise.all([deleteMemoriesForNpc(req.db, npc.id), deleteConversationsForNpc(req.db, npc.id)]);
  const updated = await updateNpc(req.db, npc.id, {
    relationship: { ...DEFAULT_RELATIONSHIP },
    emotionalState: { ...DEFAULT_EMOTION, reason: '' },
    secrets: npc.secrets.map((secret) => ({ ...secret, knownByPlayer: false, revealedAt: null })),
  });
  res.json(updated);
}
