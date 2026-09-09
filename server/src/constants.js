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
