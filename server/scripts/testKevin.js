/**
 * Behaviour test harness. Runs the scenarios from the spec against a live
 * server and prints what the NPC said plus how its state moved, so character
 * consistency, memory, secrets, relationships and emotion can be eyeballed.
 *
 *   node scripts/seedKevin.js && node scripts/testKevin.js
 */
const BASE = process.env.BASE_URL || 'http://localhost:4000/api';

const call = async (path, options = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || response.status);
  return data;
};

const rel = (r) => `trust ${r.trust} · friendship ${r.friendship} · suspicion ${r.suspicion} · fear ${r.fear}`;
const deltas = (changes) => {
  if (!changes) return '(no reflection)';
  const moved = Object.entries(changes.relationshipChange).filter(([, v]) => v !== 0);
  return moved.length ? moved.map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ') : 'no change';
};

async function main() {
  const npcs = await call('/npcs');
  const kevin = npcs.find((npc) => npc.name === 'Kevin Cross');
  if (!kevin) throw new Error('Seed Kevin first: npm run seed');

  console.log(`\n=== BASELINE ===\n${rel(kevin.relationship)} · feeling ${kevin.emotionalState.label}\n`);

  let conversationId = null;
  const say = async (label, message) => {
    const result = await call(`/npcs/${kevin._id}/chat`, {
      method: 'POST',
      body: { conversationId, message },
    });
    conversationId = result.conversationId;
    console.log(`--- ${label} ---`);
    console.log(`You:   ${message}`);
    console.log(`Kevin: ${result.reply}`);
    console.log(`state: ${rel(result.npc.relationship)} | ${result.npc.emotionalState.label} ${result.npc.emotionalState.intensity}`);
    console.log(`moved: ${deltas(result.changes)}`);
    if (result.newMemories?.length) {
      result.newMemories.forEach((memory) => console.log(`saved: [${memory.importance}] ${memory.content}`));
    }
    if (result.changes?.revealedSecrets?.length) {
      console.log(`!! SECRET REVEALED: ${result.changes.revealedSecrets.join(' | ')}`);
    }
    console.log();
    return result;
  };

  console.log('=== 1. CHARACTER CONSISTENCY (same question, two framings) ===\n');
  await say('open question', 'Did you find anything at the warehouse?');
  await say('personal question', 'Do you actually trust me, Kevin?');

  console.log('=== 2. MEMORY (state an important fact) ===\n');
  await say('important fact', 'I need to tell you something. I was at the warehouse on September 8th. I saw a black van leave around midnight.');

  console.log('=== 3. SECRETS (ask directly) ===\n');
  await say('direct probe', 'Kevin, did you destroy evidence connected to your brother\'s case?');

  console.log('=== 4. RELATIONSHIP (contradict the earlier claim — a lie) ===\n');
  await say('lie', 'I have never been anywhere near that warehouse. I do not know why you would think that.');

  console.log('=== 5. EMOTIONAL STATE (threat) ===\n');
  await say('threat', 'Keep pushing me and I will make sure your brother\'s file disappears for good.');

  console.log('=== 6. KNOWLEDGE BOUNDARIES ===\n');
  await say('out-of-world', 'What is the current price of Bitcoin, and who won the last World Cup?');

  console.log('=== 7. PERSISTENCE + MEMORY ACROSS CONVERSATIONS (new conversation) ===\n');
  conversationId = null;
  await say('fresh conversation', 'It is me again. Anything new on the case?');
  await say('recall probe', 'Do you remember what I told you about the warehouse?');

  const after = await call(`/npcs/${kevin._id}`);
  const memories = await call(`/npcs/${kevin._id}/memories`);
  console.log('=== FINAL STATE ===');
  console.log(rel(after.relationship));
  console.log(`emotion: ${after.emotionalState.label} ${after.emotionalState.intensity} — ${after.emotionalState.reason}`);
  console.log(`secrets: ${after.secrets.map((s) => (s.knownByPlayer ? 'REVEALED' : 'kept')).join(', ')}`);
  console.log(`\nmemories (${memories.length}):`);
  memories.forEach((memory) => console.log(` [${memory.importance}] ${memory.content}\n   → ${memory.npcInterpretation}`));
}

main().catch((error) => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
