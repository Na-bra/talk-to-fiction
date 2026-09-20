// Shared vocabulary. The server validates AI output against these lists rather
// than trusting whatever the model decides to return.

export const EMOTIONS = [
  'Happy',
  'Sad',
  'Angry',
  'Afraid',
  'Suspicious',
  'Excited',
  'Calm',
  'Nervous',
  'Frustrated',
  'Neutral',
];

export const SUGGESTED_TRAITS = [
  'Sarcastic',
  'Friendly',
  'Paranoid',
  'Aggressive',
  'Intelligent',
  'Reserved',
  'Confident',
  'Nervous',
  'Manipulative',
  'Curious',
];

export const RELATIONSHIP_KEYS = ['trust', 'friendship', 'suspicion', 'fear'];

export const DEFAULT_RELATIONSHIP = {
  trust: 50,
  friendship: 20,
  suspicion: 20,
  fear: 0,
};

export const DEFAULT_EMOTION = { label: 'Neutral', intensity: 20 };

// How close the two of them are, as one thing rather than four numbers. Warmth
// carries it; wariness cuts it, so a character who likes you but suspects you
// is not close. Derived on read — never stored, so it cannot drift from the
// numbers it comes from.
export const RELATIONSHIP_STAGES = [
  {
    name: 'Stranger',
    min: 0,
    behaviour:
      'You barely know this person. Keep to surface things: what you do, where you are, the weather of your life. Deflect anything personal. Your history, your fears and what you actually want are not theirs to have.',
  },
  {
    name: 'Acquaintance',
    min: 25,
    behaviour:
      'You have spoken before. You will talk about your work and your opinions, and you may let slip that there is history behind them, but the details stay yours.',
  },
  {
    name: 'Friendly',
    min: 45,
    behaviour:
      'You like them. You talk about your day, your frustrations and what you think, and you bring up things the two of you have discussed before.',
  },
  {
    name: 'Close',
    min: 62,
    behaviour:
      'You trust them with things that matter. You will talk about where you come from, what drives you and what frightens you — and you expect the same candour back.',
  },
  {
    name: 'Trusted',
    min: 78,
    behaviour:
      'You rely on them. You ask for help, admit when you are struggling, talk through private plans, and hold them to what they promised you.',
  },
  {
    name: 'Deep Bond',
    min: 90,
    behaviour:
      'They are one of the few people you would tell anything. You speak without a guard — which is also why a betrayal from them would cut deepest.',
  },
];

// Milestones the model may propose. Everything else in npc_events is decided
// by the backend from what actually happened.
export const MODEL_EVENT_KINDS = ['promise', 'disagreement', 'favour', 'milestone'];

// Tuning knobs for the context + reflection systems, kept in one place so the
// behaviour is easy to reason about and adjust.
export const CONTEXT = {
  // Messages kept verbatim in the prompt. Older ones fold into the summary.
  RECENT_MESSAGES: 12,
  // Summarise once the transcript grows past this many messages.
  SUMMARY_THRESHOLD: 20,
  // Long-term memories injected per turn.
  MEMORY_LIMIT: 6,
  // Guardrails applied to reflection output.
  MAX_MEMORIES_PER_TURN: 2,
  MAX_MEMORY_LENGTH: 400,
  MAX_RELATIONSHIP_DELTA: 20,
};
