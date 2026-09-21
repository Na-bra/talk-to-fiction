/**
 * Checks the rules that decide character state, without a network or a
 * database. These are the guardrails on model output, so they are worth
 * testing directly rather than only through a conversation.
 *
 *   npm run test:units
 */
import { stageFor } from '../src/stages.js';
import {
  applyRelationshipDelta,
  resolveEmotion,
  applySecretReveals,
  resolveMilestone,
} from '../src/services/ai/relationshipService.js';
import { resolveGoalUpdate } from '../src/services/ai/goalService.js';
import { DEFAULT_RELATIONSHIP, RELATIONSHIP_STAGES, CONTEXT } from '../src/constants.js';

let failed = 0;
const check = (label, pass, detail = '') => {
  if (!pass) failed += 1;
  console.log(`  ${pass ? '✓' : '✗'} ${label}${detail ? `  (${detail})` : ''}`);
};
const rel = (trust, friendship, suspicion = 0, fear = 0) => ({ trust, friendship, suspicion, fear });

console.log('\nrelationship stages');
check('a new character starts as an acquaintance', stageFor(DEFAULT_RELATIONSHIP).name === 'Acquaintance', stageFor(DEFAULT_RELATIONSHIP).name);
check('nobody starts as a stranger by accident', stageFor(rel(0, 0)).name === 'Stranger');
check('warmth alone can reach a deep bond', stageFor(rel(95, 95)).name === 'Deep Bond', `score ${stageFor(rel(95, 95)).score}`);
check('suspicion holds warmth back', stageFor(rel(90, 90, 80)).name !== 'Deep Bond', stageFor(rel(90, 90, 80)).name);
check('fear holds warmth back', stageFor(rel(85, 85, 0, 90)).name !== 'Deep Bond', stageFor(rel(85, 85, 0, 90)).name);
check('a hostile character falls back to stranger', stageFor(rel(23, 10, 87)).name === 'Stranger', stageFor(rel(23, 10, 87)).name);
check('the score never leaves 0–100', [stageFor(rel(0, 0, 100, 100)).score, stageFor(rel(100, 100)).score].every((s) => s >= 0 && s <= 100));
check('every stage is reachable', RELATIONSHIP_STAGES.every((stage) => stageFor(rel(stage.min + 6, stage.min + 6)).score >= 0));
check('garbage in does not throw', stageFor({ trust: 'x', friendship: null }).name === 'Stranger');
check('no argument does not throw', stageFor().name === 'Stranger');

console.log('\nrelationship deltas (the model proposes, the backend decides)');
const big = applyRelationshipDelta(DEFAULT_RELATIONSHIP, { trust: -900, friendship: 900, suspicion: 'x', fear: 5 });
check(`a wild delta is capped at ±${CONTEXT.MAX_RELATIONSHIP_DELTA}`, big.applied.trust === -CONTEXT.MAX_RELATIONSHIP_DELTA && big.applied.friendship === CONTEXT.MAX_RELATIONSHIP_DELTA, JSON.stringify(big.applied));
check('a non-numeric delta is ignored', big.applied.suspicion === 0);
check('values stay within 0–100', Object.values(big.relationship).every((v) => v >= 0 && v <= 100), JSON.stringify(big.relationship));
check('what is reported is what landed', applyRelationshipDelta(rel(5, 0), { trust: -50, friendship: 0, suspicion: 0, fear: 0 }).applied.trust === -5);

console.log('\nemotion');
check('an unknown emotion keeps the current one', resolveEmotion({ label: 'Smug' }, { label: 'Calm', intensity: 10 }).label === 'Calm');
check('a known emotion is taken', resolveEmotion({ label: 'Angry', intensity: 150 }, { label: 'Calm' }).label === 'Angry');
check('intensity is clamped', resolveEmotion({ label: 'Angry', intensity: 150 }, {}).intensity === 100);

console.log('\nsecrets');
const npc = { secrets: [{ content: 'a', knownByPlayer: false }, { content: 'b', knownByPlayer: true }] };
check('a hidden secret can be revealed once', applySecretReveals(npc, [1]).length === 1);
check('it cannot be revealed twice', applySecretReveals(npc, [1]).length === 0);
check('a secret that does not exist is ignored', applySecretReveals(npc, [99]).length === 0);

console.log('\nmilestones');
check('"none" means no milestone', resolveMilestone({ kind: 'none', title: 'Talked' }) === null);
check('an unknown kind is dropped', resolveMilestone({ kind: 'betrayal', title: 'Something happened' }) === null);
check('a thin title is dropped', resolveMilestone({ kind: 'promise', title: 'ok' }) === null);
check('a real milestone survives', resolveMilestone({ kind: 'promise', title: 'Promised to look into the warehouse' })?.kind === 'promise');
check('a long title is trimmed', resolveMilestone({ kind: 'favour', title: 'x'.repeat(400) }).title.length === 160);
check('missing input does not throw', resolveMilestone(undefined) === null && resolveMilestone({}) === null);

console.log('\ngoals (a conversation nudges a pursuit, it does not finish one)');
const goals = [
  { id: 'g1', title: 'Find out what happened to his brother', progress: 20, status: 'active', currentObjective: 'Get the witness to talk' },
  { id: 'g2', title: 'Something abandoned', progress: 40, status: 'abandoned', currentObjective: '' },
];
check('goal 0 means nothing moved', resolveGoalUpdate({ goal: 0, progressDelta: 10 }, goals) === null);
check('an unknown goal number is ignored', resolveGoalUpdate({ goal: 9, progressDelta: 10 }, goals) === null);
check('a goal that is not active cannot move', resolveGoalUpdate({ goal: 2, progressDelta: 10 }, goals) === null);
check(`progress is capped at ±${CONTEXT.MAX_GOAL_PROGRESS_DELTA} a turn`, resolveGoalUpdate({ goal: 1, progressDelta: 90 }, goals).applied === CONTEXT.MAX_GOAL_PROGRESS_DELTA);
check('a character can lose ground', resolveGoalUpdate({ goal: 1, progressDelta: -90 }, goals).progress === 20 - CONTEXT.MAX_GOAL_PROGRESS_DELTA);
check('progress stays within 0–100', resolveGoalUpdate({ goal: 1, progressDelta: -500 }, goals).progress >= 0);
check('an update that changes nothing is dropped', resolveGoalUpdate({ goal: 1, progressDelta: 0, objective: '' }, goals) === null);
check('a new next step alone counts', resolveGoalUpdate({ goal: 1, progressDelta: 0, objective: 'Stake out the docks' }, goals)?.currentObjective === 'Stake out the docks');
check('the old next step is kept when not changed', resolveGoalUpdate({ goal: 1, progressDelta: 5 }, goals).currentObjective === 'Get the witness to talk');
check('reaching 100 marks it achieved', resolveGoalUpdate({ goal: 1, progressDelta: 15 }, [{ ...goals[0], progress: 95 }]).achieved === true);
check('garbage does not throw', resolveGoalUpdate(undefined, goals) === null && resolveGoalUpdate({ goal: 'x' }, goals) === null);

console.log(failed ? `\n${failed} check(s) failed\n` : '\nall checks passed\n');
process.exitCode = failed ? 1 : 0;
