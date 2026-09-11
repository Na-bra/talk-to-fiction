import { unwrap } from './db.js';

const COLUMNS = 'id, npc_id, conversation_id, content, npc_interpretation, importance, source, created_at';

const toMemory = (row) => ({
  id: row.id,
  npcId: row.npc_id,
  conversationId: row.conversation_id,
  content: row.content,
  npcInterpretation: row.npc_interpretation,
  importance: row.importance,
  source: row.source,
  createdAt: row.created_at,
});

/** Newest first. */
export async function listMemories(db, npcId) {
  const rows = unwrap(
    await db.from('memories').select(COLUMNS).eq('npc_id', npcId).order('created_at', { ascending: false }),
  );
  return rows.map(toMemory);
}

export async function insertMemories(db, memories) {
  if (!memories.length) return [];
  const rows = unwrap(
    await db
      .from('memories')
      .insert(
        memories.map((memory) => ({
          npc_id: memory.npcId,
          conversation_id: memory.conversationId,
          content: memory.content,
          npc_interpretation: memory.npcInterpretation,
          importance: memory.importance,
          source: memory.source,
        })),
      )
      .select(COLUMNS),
  );
  return rows.map(toMemory);
}

export async function deleteMemoriesForNpc(db, npcId) {
  unwrap(await db.from('memories').delete().eq('npc_id', npcId));
}
