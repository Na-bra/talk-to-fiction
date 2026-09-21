import { z } from 'zod';
import { CONTEXT } from '../../constants.js';
import { config } from '../../config/env.js';
import { generateObject } from './client.js';

const clamp = (value, low = 0, high = 100) => Math.max(low, Math.min(high, Math.round(value)));
const text = (value, max) => (value ?? '').toString().replace(/\s+/g, ' ').trim().slice(0, max);

const PlanSchema = z.object({
  goals: z.array(
    z.object({
      title: z.string(),
      currentObjective: z.string(),
      obstacle: z.string(),
      progress: z.number(),
    }),
  ),
});

const PLAN_SYSTEM = `You turn a character sheet into the things that character is actually pursuing, for an interactive fiction application.

Give each pursuit:
- title: what they are trying to achieve, in their own terms. Short, concrete, no more than a line.
- currentObjective: the next thing they would do about it. A single step, not the whole plan.
- obstacle: what is in the way right now. Specific, and drawn from their world.
- progress: 0 to 25. Most characters start near the beginning of what they want. Use a higher number only if the sheet says they have already made headway.

Rules:
- Between one and three pursuits. Fewer is better than padding.
- They must come from the sheet — the stated goals and motivations first, then what the background implies. Do not invent a new life for them.
- Never use a secret as a pursuit. Secrets are things they hide, not things they chase.
- Write in the third person, plainly. No flourish.`;

/** Turns the character sheet's prose into one to three tracked pursuits. */
export async function planGoals(npc) {
  const sheet = [
    `Name: ${npc.name}`,
    npc.occupation && `Occupation: ${npc.occupation}`,
    npc.setting && `Setting: ${npc.setting}`,
    npc.goals && `Stated goals: ${npc.goals}`,
    npc.motivations && `Motivations: ${npc.motivations}`,
    npc.background && `Background: ${npc.background}`,
    npc.fears && `Fears: ${npc.fears}`,
  ]
    .filter(Boolean)
    .join('\n');

  const draft = await generateObject({
    schema: PlanSchema,
    system: PLAN_SYSTEM,
    messages: [{ role: 'user', content: sheet }],
    maxTokens: 1200,
    temperature: 0.5,
    model: config.ai.fastModel,
  });

  return (draft.goals || [])
    .map((goal) => ({
      title: text(goal.title, 160),
      currentObjective: text(goal.currentObjective, 200),
      obstacle: text(goal.obstacle, 200),
      progress: Number.isFinite(Number(goal.progress)) ? clamp(Number(goal.progress), 0, 25) : 0,
    }))
    .filter((goal) => goal.title.length >= 4)
    .slice(0, CONTEXT.MAX_ACTIVE_GOALS);
}

/**
 * A proposed nudge to one goal, or null. The model names a goal by its number
 * in the prompt; anything that is not an active goal of this character, or
 * that moves nothing, is dropped. A conversation nudges progress — it cannot
 * hand a character their life's work in one turn.
 */
export function resolveGoalUpdate(candidate, goals = []) {
  const index = Number(candidate?.goal);
  if (!Number.isInteger(index) || index < 1 || index > goals.length) return null;

  const goal = goals[index - 1];
  if (!goal || goal.status !== 'active') return null;

  const raw = Number(candidate?.progressDelta);
  const delta = Number.isFinite(raw)
    ? clamp(raw, -CONTEXT.MAX_GOAL_PROGRESS_DELTA, CONTEXT.MAX_GOAL_PROGRESS_DELTA)
    : 0;
  const objective = text(candidate?.objective, 200);
  const note = text(candidate?.note, 300);
  if (delta === 0 && !objective) return null;

  const progress = clamp(goal.progress + delta);
  return {
    id: goal.id,
    title: goal.title,
    from: goal.progress,
    progress,
    applied: progress - goal.progress,
    currentObjective: objective || goal.currentObjective,
    note,
    achieved: progress >= 100,
  };
}
