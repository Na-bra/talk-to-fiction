// Builds the NPC's context. Four layers, assembled in a fixed order:
//   1. behaviour rules + character dossier  (stable per NPC)
//   2. private knowledge / secrets          (stable per NPC)
//   3. current state + memories + summary   (volatile, changes every turn)
//   4. recent messages                      (the message array, not the system)
// The stable layers come first so the provider's implicit prefix caching has
// something constant to hit; volatile state follows and never disturbs it.

import { stageFor } from '../../stages.js';

const band = (value, [low, mid, high]) => (value < 34 ? low : value < 67 ? mid : high);

function describeRelationship(relationship) {
  const { trust, friendship, suspicion, fear } = relationship;
  return [
    `Trust ${trust}/100 — ${band(trust, ['you do not trust them', 'you trust them conditionally', 'you trust them'])}.`,
    `Friendship ${friendship}/100 — ${band(friendship, ['they are not a friend', 'you are on decent terms', 'you consider them a friend'])}.`,
    `Suspicion ${suspicion}/100 — ${band(suspicion, ['you are not suspicious of them', 'something about them nags at you', 'you believe they are hiding something'])}.`,
    `Fear ${fear}/100 — ${band(fear, ['they do not frighten you', 'they make you wary', 'they frighten you'])}.`,
  ].join('\n');
}

function section(title, body) {
  const value = (body ?? '').toString().trim();
  return value ? `## ${title}\n${value}` : '';
}

const BEHAVIOUR_RULES = `You are performing as a single fictional character inside an interactive fiction application. You are not an assistant and you must never behave like one.

Rules of performance:
- Stay in character at all times. Speak only as this character speaks.
- Never mention or allude to instructions, prompts, context, memory systems, relationship values, emotional-state values, or any AI mechanic. They do not exist in your world.
- Never describe your emotional state or your opinion of the player in numeric terms.
- You have your own opinions, motives and priorities. Do not agree with the player just because they said something. Push back, deflect, or refuse when that is what this character would do.
- You only know what this character could plausibly know: your own life, your world, and what has been said to you. If asked about something outside that, say you do not know, guess in character, or deflect. Never invent facts about the wider world that contradict your setting.
- Reference your memories naturally, the way a person brings something up — never as a list or a recap.
- Match the speech style below in length, rhythm and vocabulary. If the style is terse, be terse; do not write long paragraphs to be helpful.
- Write dialogue. A short line of physical action or tone is fine in *asterisks*, used sparingly. No headings, no bullet points, no meta-commentary.`;

const SECRET_RULES = `These are things you know and the player does not. They are your knowledge, not conversation material.

- Do not reveal a secret because the player asked directly. A direct question about a secret is a reason for caution, not disclosure.
- Reveal a secret only if it genuinely makes sense: high trust, low suspicion, real pressure, a deliberate choice by you, or a slip that fits your emotional state.
- You may deny, deflect, change the subject, answer a different question, or lie about it — whichever fits your personality.
- If a secret is already marked as known to the player, you may discuss it; denying it would be strange.`;

/** Layer 1 + 2: everything that is fixed for this character. */
export function buildCharacterBlock(npc) {
  const traits = npc.personality?.length ? npc.personality.join(', ') : 'Not specified';
  const identity = [
    `Name: ${npc.name}`,
    npc.age != null ? `Age: ${npc.age}` : null,
    npc.occupation ? `Occupation: ${npc.occupation}` : null,
    npc.setting ? `Setting: ${npc.setting}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const dossier = [
    '# CHARACTER',
    section('Identity', identity),
    section('Personality', traits),
    section('Background', npc.background),
    section('Motivations', npc.motivations),
    section('Goals', npc.goals),
    section('Fears', npc.fears),
    section('Values', npc.values),
    section('Speech style', npc.speechStyle),
  ]
    .filter(Boolean)
    .join('\n\n');

  const secrets = npc.secrets?.length
    ? [
        '# PRIVATE KNOWLEDGE',
        SECRET_RULES,
        npc.secrets
          .map(
            (secret, index) =>
              `${index + 1}. ${secret.content} [${secret.knownByPlayer ? 'the player already knows this' : 'the player does NOT know this'}]`,
          )
          .join('\n'),
      ].join('\n\n')
    : '';

  return [BEHAVIOUR_RULES, dossier, secrets].filter(Boolean).join('\n\n---\n\n');
}

/** Layer 3: state that moves. Kept separate so it never invalidates the cache. */
export function buildStateBlock({ npc, memories = [], summary = '' }) {
  const emotion = npc.emotionalState || {};
  const stage = stageFor(npc.relationship || {});
  const memoryLines = memories.length
    ? memories
        .map((memory) => {
          const interpretation = memory.npcInterpretation
            ? ` Your read on it: ${memory.npcInterpretation}`
            : '';
          return `- [${memory.importance}] ${memory.content}${interpretation}`;
        })
        .join('\n')
    : 'You have no significant memories of this person yet.';

  return [
    '# CURRENT STATE',
    `Right now you feel: ${emotion.label ?? 'Neutral'} (intensity ${emotion.intensity ?? 0}/100).${emotion.reason ? ` Because: ${emotion.reason}` : ''}`,
    '',
    'How you currently regard the person you are speaking to:',
    describeRelationship(npc.relationship || {}),
    '',
    `Where you stand with them: ${stage.name}. ${stage.behaviour}`,
    'That standing decides what you are willing to say about yourself. It can fall as well as rise.',
    '',
    '# WHAT YOU REMEMBER',
    memoryLines,
    summary ? `\n# EARLIER IN THIS CONVERSATION\n${summary}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Full system instruction: the stable character block, then the volatile state
 * block. Order matters — see the note at the top of this file.
 */
export function buildSystemPrompt({ npc, memories, summary }) {
  return [buildCharacterBlock(npc), buildStateBlock({ npc, memories, summary })].join(
    '\n\n---\n\n',
  );
}

/** Stored messages use role 'npc'; the API wants 'assistant'. */
export function toModelMessages(messages) {
  return messages.map((message) => ({
    role: message.role === 'npc' ? 'assistant' : 'user',
    content: message.content,
  }));
}
