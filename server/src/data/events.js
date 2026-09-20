import { unwrap } from './db.js';

const COLUMNS = 'id, npc_id, conversation_id, kind, title, detail, meta, occurred_at';

const toEvent = (row) => ({
  id: row.id,
  npcId: row.npc_id,
  conversationId: row.conversation_id,
  kind: row.kind,
  title: row.title,
  detail: row.detail,
  meta: row.meta ?? {},
  occurredAt: row.occurred_at,
});

/** A character's history, most recent first. */
export async function listEvents(db, npcId, limit = 100) {
  const rows = unwrap(
    await db
      .from('npc_events')
      .select(COLUMNS)
      .eq('npc_id', npcId)
      .order('occurred_at', { ascending: false })
      .limit(limit),
  );
  return rows.map(toEvent);
}

/**
 * Writes what happened this turn. Best-effort on purpose: a character's
 * history is worth less than the conversation itself, so a failure here —
 * including this table not existing yet — must never cost the player a reply.
 * The 'met' event has a unique index, so a duplicate is expected and ignored.
 */
export async function recordEvents(db, events) {
  if (!events.length) return [];
  const { data, error } = await db
    .from('npc_events')
    .insert(
      events.map((event) => ({
        npc_id: event.npcId,
        conversation_id: event.conversationId ?? null,
        kind: event.kind,
        title: event.title,
        detail: event.detail ?? '',
        meta: event.meta ?? {},
      })),
    )
    .select(COLUMNS);
  if (error) {
    if (error.code !== '23505') console.error('[events] not recorded:', error.message);
    return [];
  }
  return data.map(toEvent);
}
