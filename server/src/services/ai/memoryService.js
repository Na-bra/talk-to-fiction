import { Memory } from '../../models/Memory.js';
import { CONTEXT } from '../../constants.js';
import { generateText } from './client.js';
import { config } from '../../config/env.js';

const IMPORTANCE_SCORE = { low: 1, medium: 2, high: 3 };
const STOP_WORDS = new Set([
  'about', 'after', 'again', 'been', 'before', 'being', 'could', 'does', 'doing',
  'from', 'have', 'here', 'into', 'just', 'like', 'more', 'much', 'only', 'over',
  'said', 'same', 'should', 'some', 'such', 'than', 'that', 'them', 'then',
  'there', 'these', 'they', 'this', 'those', 'very', 'want', 'were', 'what',
  'when', 'where', 'which', 'will', 'with', 'would', 'your',
]);

function keywords(text) {
  return new Set(
    (text || '')
      .toLowerCase()
      .split(/[^a-z0-9']+/)
      .filter((word) => word.length > 3 && !STOP_WORDS.has(word)),
  );
}

/**
 * Retrieval for the MVP: importance + recency + keyword overlap with what the
 * player just said. An NPC has tens of memories, not millions, so scoring them
 * all in JS is exact and instant. Swapping in embeddings later means replacing
 * only the body of this function.
 */
export async function retrieveMemories(npcId, query = '', limit = CONTEXT.MEMORY_LIMIT) {
  const memories = await Memory.find({ npcId }).sort({ createdAt: -1 }).lean();
  if (memories.length <= limit) return memories.reverse();

  const queryWords = keywords(query);
  const now = Date.now();

  const scored = memories.map((memory) => {
    const overlap = [...keywords(`${memory.content} ${memory.npcInterpretation}`)].filter((word) =>
      queryWords.has(word),
    ).length;
    const ageDays = (now - new Date(memory.createdAt).getTime()) / 86_400_000;
    const recency = 1 / (1 + ageDays); // 1.0 today, decaying smoothly
    const score = IMPORTANCE_SCORE[memory.importance] * 2 + recency * 2 + overlap * 3;
    return { memory, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.memory)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

/**
 * Validates memory candidates produced by the reflection call before they are
 * persisted. The model proposes; the backend decides.
 */
export async function storeMemories(npcId, conversationId, candidates = []) {
  const clean = [];
  for (const candidate of candidates.slice(0, CONTEXT.MAX_MEMORIES_PER_TURN)) {
    const content = (candidate?.content || '').toString().trim();
    if (content.length < 8) continue; // too thin to be worth remembering
    clean.push({
      npcId,
      conversationId,
      content: content.slice(0, CONTEXT.MAX_MEMORY_LENGTH),
      npcInterpretation: (candidate?.npcInterpretation || '')
        .toString()
        .trim()
        .slice(0, CONTEXT.MAX_MEMORY_LENGTH),
      importance: IMPORTANCE_SCORE[candidate?.importance] ? candidate.importance : 'medium',
      source: 'conversation',
    });
  }
  if (!clean.length) return [];
  return Memory.insertMany(clean);
}

/**
 * Folds everything older than the recent window into a rolling summary, so the
 * prompt carries a fixed amount of history no matter how long the chat runs.
 */
export async function summariseIfNeeded(conversation, npc) {
  const total = conversation.messages.length;
  if (total <= CONTEXT.SUMMARY_THRESHOLD) return conversation;

  const cutoff = total - CONTEXT.RECENT_MESSAGES;
  if (cutoff <= conversation.summarisedUpTo) return conversation;

  const older = conversation.messages.slice(0, cutoff);
  const transcript = older
    .map((message) => `${message.role === 'npc' ? npc.name : 'Player'}: ${message.content}`)
    .join('\n');

  const summary = await generateText({
    system:
      'You compress conversation transcripts for a character-simulation engine. Write a factual third-person summary of what was said and what happened, from the perspective of what the character would retain. Keep every commitment, accusation, revelation and named detail. No preamble, no commentary. Under 200 words.',
    messages: [
      {
        role: 'user',
        content: `Character: ${npc.name}.${conversation.summary ? `\n\nSummary so far:\n${conversation.summary}` : ''}\n\nTranscript to fold in:\n${transcript}`,
      },
    ],
    maxTokens: 600,
    temperature: 0.3,
    model: config.ai.fastModel,
  });

  conversation.summary = summary;
  conversation.summarisedUpTo = cutoff;
  return conversation;
}
