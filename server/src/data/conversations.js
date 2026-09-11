import { unwrap } from './db.js';

const COLUMNS = 'id, npc_id, title, summary, summarised_up_to, created_at, updated_at';

const toMessage = (row) => ({
  id: row.id,
  role: row.role,
  content: row.content,
  createdAt: row.created_at,
});

function toConversation(row, messages) {
  return {
    id: row.id,
    npcId: row.npc_id,
    title: row.title,
    summary: row.summary,
    summarisedUpTo: row.summarised_up_to,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(messages ? { messages } : {}),
  };
}

/** Most recently active first, with a message count rather than the messages. */
export async function listConversations(db, npcId) {
  const rows = unwrap(
    await db
      .from('conversations')
      .select(`${COLUMNS}, messages(count)`)
      .eq('npc_id', npcId)
      .order('updated_at', { ascending: false }),
  );
  return rows.map(({ messages, ...row }) => ({
    ...toConversation(row),
    messageCount: messages?.[0]?.count ?? 0,
  }));
}

/** With its full transcript in order, or null if it is not this character's. */
export async function getConversation(db, npcId, conversationId) {
  const row = unwrap(
    await db.from('conversations').select(COLUMNS).eq('id', conversationId).eq('npc_id', npcId).maybeSingle(),
  );
  if (!row) return null;
  const messages = unwrap(
    await db
      .from('messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', row.id)
      .order('seq', { ascending: true }),
  );
  return toConversation(row, messages.map(toMessage));
}

export async function createConversation(db, npcId) {
  const row = unwrap(await db.from('conversations').insert({ npc_id: npcId }).select(COLUMNS).single());
  return toConversation(row, []);
}

/** One message per insert, so the identity column records the true order. */
export async function appendMessage(db, conversationId, { role, content }) {
  const row = unwrap(
    await db
      .from('messages')
      .insert({ conversation_id: conversationId, role, content })
      .select('id, role, content, created_at')
      .single(),
  );
  return toMessage(row);
}

export async function updateConversation(db, id, { title, summary, summarisedUpTo }) {
  unwrap(
    await db
      .from('conversations')
      .update({ title, summary, summarised_up_to: summarisedUpTo })
      .eq('id', id),
  );
}

export async function deleteConversationsForNpc(db, npcId) {
  unwrap(await db.from('conversations').delete().eq('npc_id', npcId));
}
