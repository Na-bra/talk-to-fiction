import { EMOTIONS, RELATIONSHIP_KEYS, CONTEXT } from '../../constants.js';

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

/**
 * Applies a proposed relationship delta. The model's numbers are advisory:
 * non-numeric values are dropped, each axis is capped per turn, and the result
 * is clamped to 0-100. A model that returns { trust: -900 } moves trust by -20.
 */
export function applyRelationshipDelta(relationship, delta = {}) {
  const next = {};
  const applied = {};
  for (const key of RELATIONSHIP_KEYS) {
    const current = clamp(Number(relationship?.[key]) || 0);
    const raw = Number(delta?.[key]);
    const change = Number.isFinite(raw)
      ? clamp(Math.round(raw), -CONTEXT.MAX_RELATIONSHIP_DELTA, CONTEXT.MAX_RELATIONSHIP_DELTA)
      : 0;
    next[key] = clamp(current + change);
    applied[key] = next[key] - current; // what actually landed, after clamping
  }
  return { relationship: next, applied };
}

/** Emotion label must come from the known list, otherwise state is left alone. */
export function resolveEmotion(candidate, current) {
  const label = EMOTIONS.includes(candidate?.label) ? candidate.label : current?.label || 'Neutral';
  const rawIntensity = Number(candidate?.intensity);
  const intensity = Number.isFinite(rawIntensity)
    ? clamp(Math.round(rawIntensity))
    : clamp(Number(current?.intensity) || 0);
  const reason = (candidate?.reason || '').toString().trim().slice(0, 200);
  return { label, intensity, reason };
}

/**
 * Flips secrets to known only when the model names a secret that exists and is
 * still hidden. Indexes are 1-based to match how they are numbered in the prompt.
 */
export function applySecretReveals(npc, revealed = []) {
  const flipped = [];
  for (const raw of revealed) {
    const index = Number(raw) - 1;
    const secret = npc.secrets?.[index];
    if (!secret || secret.knownByPlayer) continue;
    secret.knownByPlayer = true;
    secret.revealedAt = new Date().toISOString();
    flipped.push(secret.content);
  }
  return flipped;
}

/** Applies a whole reflection payload to a plain NPC object. Does not persist. */
export function applyReflection(npc, reflection = {}) {
  const { relationship, applied } = applyRelationshipDelta(
    npc.relationship,
    reflection.relationshipDelta,
  );
  npc.relationship = relationship;

  const previousEmotion = npc.emotionalState;
  npc.emotionalState = resolveEmotion(reflection.emotion, previousEmotion);

  const revealedSecrets = applySecretReveals(npc, reflection.revealedSecrets);

  return {
    relationship,
    relationshipChange: applied,
    emotionalState: npc.emotionalState,
    emotionChanged: previousEmotion?.label !== npc.emotionalState.label,
    revealedSecrets,
  };
}
