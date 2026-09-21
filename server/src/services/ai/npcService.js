import { z } from 'zod';
import { EMOTIONS, CONTEXT, SUGGESTED_TRAITS } from '../../constants.js';
import { config } from '../../config/env.js';
import { generateText, generateObject } from './client.js';
import { buildSystemPrompt, buildCharacterBlock, toModelMessages } from './promptBuilder.js';
import { retrieveMemories, storeMemories, summariseIfNeeded } from './memoryService.js';
import { applyReflection, resolveMilestone } from './relationshipService.js';
import { stageFor } from '../../stages.js';
import { recordEvents } from '../../data/events.js';
import { activeGoals, updateGoal } from '../../data/goals.js';
import { resolveGoalUpdate } from './goalService.js';
import { saveNpcState } from '../../data/npcs.js';
import { appendMessage, updateConversation } from '../../data/conversations.js';

/* ------------------------------------------------------------------ *
 * Character generation
 * ------------------------------------------------------------------ */

const CharacterDraftSchema = z.object({
  name: z.string(),
  age: z.number().int(),
  occupation: z.string(),
  setting: z.string(),
  personality: z.array(z.string()),
  background: z.string(),
  motivations: z.string(),
  goals: z.string(),
  fears: z.string(),
  values: z.string(),
  speechStyle: z.string(),
  secrets: z.array(z.string()),
});

const GENERATOR_SYSTEM = `You design characters for interactive fiction. Given whatever partial details an author provides, produce a complete, coherent character.

- Honour every detail the author already supplied; fill in only what is missing.
- Prose fields are 1-3 sentences. Concrete and specific, never generic.
- "personality" is 3-5 single-word or short traits. Prefer these where they fit: ${SUGGESTED_TRAITS.join(', ')}.
- "speechStyle" describes how they talk — length, rhythm, habits, what they avoid.
- "secrets" is 1-2 things the character knows and would not casually admit. Each must connect to their background or goals.
- Write a person with friction: contradictions, a flaw, something unresolved.`;

export async function generateCharacterDraft(input = {}) {
  const provided = Object.entries(input)
    .filter(([, value]) => value !== undefined && value !== null && `${value}`.trim() !== '')
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
    .join('\n');

  const draft = await generateObject({
    schema: CharacterDraftSchema,
    system: GENERATOR_SYSTEM,
    messages: [
      {
        role: 'user',
        content: provided
          ? `Complete this character.\n\n${provided}`
          : 'Invent an original character suitable for a grounded, modern setting.',
      },
    ],
    maxTokens: 3000,
    temperature: 1.0, // character invention benefits from range
  });

  return {
    ...draft,
    secrets: (draft.secrets || []).map((content) => ({ content, knownByPlayer: false })),
  };
}

/* ------------------------------------------------------------------ *
 * Chat turn
 * ------------------------------------------------------------------ */

const ReflectionSchema = z.object({
  memories: z.array(
    z.object({
      content: z.string(),
      npcInterpretation: z.string(),
      importance: z.enum(['low', 'medium', 'high']),
    }),
  ),
  relationshipDelta: z.object({
    trust: z.number(),
    friendship: z.number(),
    suspicion: z.number(),
    fear: z.number(),
  }),
  emotion: z.object({
    label: z.enum(EMOTIONS),
    intensity: z.number(),
    reason: z.string(),
  }),
  revealedSecrets: z.array(z.number()),
  // 'none' rather than null: one flat shape is easier for the model to hit
  // than an optional object, and the backend drops anything unconvincing.
  milestone: z.object({
    kind: z.enum(['none', 'promise', 'disagreement', 'favour', 'milestone']),
    title: z.string(),
    detail: z.string(),
  }),
  // 0 means no goal moved, which is the usual answer.
  goalUpdate: z.object({
    goal: z.number(),
    progressDelta: z.number(),
    objective: z.string(),
    note: z.string(),
  }),
});

const REFLECTION_SYSTEM = `You are the state-tracking layer of a character simulation. You are given a character, their current state, and the exchange that just happened. Report what changed. You are not speaking as the character and you never write dialogue.

memories: only genuinely significant things — a claim, a commitment, a revelation, a lie, a threat, a named place or event, a shift in the relationship. Most exchanges produce none; return an empty array then. Never store small talk or a paraphrase of the character's own reply. Write each memory as a plain third-person fact, and put the character's reading of it in npcInterpretation.

relationshipDelta: whole numbers from -20 to 20, usually between -10 and 10. Return 0 for any axis nothing happened to. Most ordinary exchanges are all zeros.

emotion: what the character feels at the end of this exchange, with an intensity from 0 to 100 and a one-line reason.

revealedSecrets: the numbers of any listed secrets the character actually disclosed in this reply. Empty unless the reply genuinely gives one away. Hinting, deflecting or lying about a secret is not revealing it.

goalUpdate: whether this exchange moved one of the character's own pursuits. Use goal 0 for no change, which is the usual answer. A conversation nudges a pursuit — progressDelta is small, and negative when the character lost ground. Set objective only when the next step genuinely changed, and note to say in one line what happened.

milestone: a moment either of them would still remember in a month — a promise made, a real disagreement, a meaningful favour asked or given, or a turning point between them. Use kind "none" for ordinary conversation, which is most of the time. The title is one short line in the past tense, addressed to no one: "Promised to look into the warehouse".`;

async function reflect({ npc, playerMessage, npcReply, goals = [] }) {
  const secretList = npc.secrets?.length
    ? npc.secrets
        .map((secret, index) => `${index + 1}. ${secret.content} [${secret.knownByPlayer ? 'already known to player' : 'hidden'}]`)
        .join('\n')
    : 'None.';

  return generateObject({
    schema: ReflectionSchema,
    system: REFLECTION_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `${buildCharacterBlock(npc)}

# SECRETS BY NUMBER
${secretList}

# GOALS BY NUMBER
${goals.length ? goals.map((goal, index) => `${index + 1}. ${goal.title} — ${goal.progress}%. Next: ${goal.currentObjective || 'unset'}. In the way: ${goal.obstacle || 'unset'}`).join('\n') : 'None.'}

# CURRENT STATE
Emotion: ${npc.emotionalState?.label} (${npc.emotionalState?.intensity}/100)
Trust ${npc.relationship?.trust}, Friendship ${npc.relationship?.friendship}, Suspicion ${npc.relationship?.suspicion}, Fear ${npc.relationship?.fear}

# THE EXCHANGE
Player: ${playerMessage}
${npc.name}: ${npcReply}`,
      },
    ],
    maxTokens: 1500,
    temperature: 0.2, // state tracking should be steady, not creative
    model: config.ai.fastModel,
  });
}

/**
 * One chat turn: an in-character reply, then a separate reflection pass.
 * Keeping them apart means structured state can never leak into dialogue.
 * The reflection is best-effort — if it fails, the player still gets a reply.
 */
export async function respond({ db, npc, conversation, playerMessage }) {
  const memories = await retrieveMemories(db, npc.id, playerMessage);
  const goals = await activeGoals(db, npc.id);
  const recent = conversation.messages.slice(-CONTEXT.RECENT_MESSAGES);

  const reply = await generateText({
    system: buildSystemPrompt({ npc, memories, summary: conversation.summary, goals }),
    messages: [...toModelMessages(recent), { role: 'user', content: playerMessage }],
    maxTokens: 1000,
    temperature: 0.95, // voice needs some room
  });

  // Saved as soon as it exists: this is what the player saw, so it has to
  // survive even if everything after this point fails. Sequential on purpose —
  // the order of inserts is the order of the transcript.
  for (const message of [
    { role: 'user', content: playerMessage },
    { role: 'npc', content: reply },
  ]) {
    conversation.messages.push(await appendMessage(db, conversation.id, message));
  }

  let changes = null;
  let newMemories = [];
  let events = [];
  let changesGoal = null;
  const stageBefore = stageFor(npc.relationship);
  try {
    const reflection = await reflect({ npc, playerMessage, npcReply: reply, goals });
    // Applied to a copy and only adopted once saved, so a failed write never
    // leaves the response describing state the database does not hold.
    const next = structuredClone(npc);
    const applied = applyReflection(next, reflection);
    const stored = await storeMemories(db, npc.id, conversation.id, reflection.memories);
    await saveNpcState(db, next);
    Object.assign(npc, next);
    changes = applied;
    newMemories = stored;

    // The character's history. Everything here is decided from what actually
    // happened this turn; only the milestone comes from the model, and it is
    // validated first. Writing it is best-effort — see data/events.js.
    const stageAfter = stageFor(npc.relationship);
    const history = [];
    if (conversation.messages.length === 2) {
      history.push({ kind: 'met', title: `You met ${npc.name}` });
    }
    if (stageAfter.name !== stageBefore.name) {
      history.push({
        kind: 'stage_change',
        title: `${npc.name} now sees you as ${stageAfter.name.toLowerCase()}`,
        detail: `${stageBefore.name} → ${stageAfter.name}`,
        meta: { from: stageBefore.name, to: stageAfter.name, score: stageAfter.score },
      });
    }
    for (const secret of (applied.revealedSecrets || []).slice(0, 2)) {
      history.push({
        kind: 'secret_revealed',
        title: `${npc.name} let something slip`,
        detail: secret,
      });
    }
    const milestone = resolveMilestone(reflection.milestone);
    if (milestone) history.push(milestone);

    // A pursuit moves at most a little per exchange, and only one at a time.
    const goalUpdate = resolveGoalUpdate(reflection.goalUpdate, goals);
    if (goalUpdate) {
      try {
        await updateGoal(db, npc.id, goalUpdate.id, {
          progress: goalUpdate.progress,
          currentObjective: goalUpdate.currentObjective,
          status: goalUpdate.achieved ? 'achieved' : 'active',
        });
        history.push({
          kind: 'goal_progress',
          title: goalUpdate.note || `${goalUpdate.achieved ? 'Achieved' : 'Moved closer'}: ${goalUpdate.title}`,
          detail: `${goalUpdate.title} — ${goalUpdate.from}% → ${goalUpdate.progress}%`,
          meta: { goalId: goalUpdate.id, from: goalUpdate.from, to: goalUpdate.progress },
        });
        changesGoal = {
          title: goalUpdate.title,
          from: goalUpdate.from,
          to: goalUpdate.progress,
          achieved: goalUpdate.achieved,
        };
      } catch (error) {
        console.error('[goals] not updated:', error.message);
      }
    }

    events = await recordEvents(
      db,
      history.map((entry) => ({ ...entry, npcId: npc.id, conversationId: conversation.id })),
    );
    changes.stage = {
      from: stageBefore.name,
      to: stageAfter.name,
      changed: stageAfter.name !== stageBefore.name,
    };
    changes.goal = changesGoal;
  } catch (error) {
    console.error('[reflection] skipped:', error.message);
  }

  try {
    await summariseIfNeeded(conversation, npc);
  } catch (error) {
    console.error('[summary] skipped:', error.message);
  }

  if (conversation.messages.length === 2) {
    conversation.title = playerMessage.slice(0, 60);
  }
  await updateConversation(db, conversation.id, {
    title: conversation.title,
    summary: conversation.summary,
    summarisedUpTo: conversation.summarisedUpTo,
  });

  return { reply, changes, newMemories, events, usedMemories: memories.length };
}
