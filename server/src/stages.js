import { RELATIONSHIP_STAGES } from './constants.js';

const clamp = (value) => Math.max(0, Math.min(100, Number(value) || 0));

/**
 * Where a character stands with the player, from the four axes they already
 * keep. Warmth carries it, wariness cuts it: someone who likes you but
 * suspects you is not close. Derived on every read, never stored, so it can
 * never disagree with the numbers it comes from.
 */
export function stageFor(relationship = {}) {
  const warmth = (clamp(relationship.trust) + clamp(relationship.friendship)) / 2;
  const wariness = clamp(relationship.suspicion) * 0.35 + clamp(relationship.fear) * 0.2;
  const score = Math.round(warmth - wariness);
  const stage =
    [...RELATIONSHIP_STAGES].reverse().find((candidate) => score >= candidate.min) ??
    RELATIONSHIP_STAGES[0];
  return { name: stage.name, behaviour: stage.behaviour, score: clamp(score) };
}
