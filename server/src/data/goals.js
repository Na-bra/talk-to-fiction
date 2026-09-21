import { unwrap } from './db.js';

const COLUMNS = 'id, npc_id, title, current_objective, obstacle, progress, status, sort, created_at, updated_at';

const toGoal = (row) => ({
  id: row.id,
  npcId: row.npc_id,
  title: row.title,
  currentObjective: row.current_objective,
  obstacle: row.obstacle,
  progress: row.progress,
  status: row.status,
  sort: row.sort,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toRow = (fields) => {
  const row = {};
  const map = {
    title: 'title',
    currentObjective: 'current_objective',
    obstacle: 'obstacle',
    progress: 'progress',
    status: 'status',
    sort: 'sort',
  };
  for (const [field, column] of Object.entries(map)) {
    if (fields[field] !== undefined) row[column] = fields[field];
  }
  return row;
};

export async function listGoals(db, npcId) {
  const rows = unwrap(
    await db
      .from('npc_goals')
      .select(COLUMNS)
      .eq('npc_id', npcId)
      .order('status', { ascending: true })
      .order('sort', { ascending: true })
      .order('created_at', { ascending: true }),
  );
  return rows.map(toGoal);
}

/**
 * What the character is pursuing right now — the only goals that reach the
 * prompt. Returns nothing rather than throwing when the table is missing, so
 * a conversation still works before the migration is run.
 */
export async function activeGoals(db, npcId) {
  const { data, error } = await db
    .from('npc_goals')
    .select(COLUMNS)
    .eq('npc_id', npcId)
    .eq('status', 'active')
    .order('sort', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[goals] not loaded:', error.message);
    return [];
  }
  return data.map(toGoal);
}

export async function getGoal(db, npcId, goalId) {
  return toGoal(
    unwrap(await db.from('npc_goals').select(COLUMNS).eq('id', goalId).eq('npc_id', npcId).maybeSingle()),
  ) ;
}

export async function createGoals(db, npcId, goals) {
  if (!goals.length) return [];
  const rows = unwrap(
    await db
      .from('npc_goals')
      .insert(goals.map((goal, index) => ({ npc_id: npcId, sort: index, ...toRow(goal) })))
      .select(COLUMNS),
  );
  return rows.map(toGoal);
}

export async function updateGoal(db, npcId, goalId, fields) {
  const row = toRow(fields);
  if (!Object.keys(row).length) return getGoal(db, npcId, goalId);
  return toGoal(
    unwrap(
      await db.from('npc_goals').update(row).eq('id', goalId).eq('npc_id', npcId).select(COLUMNS).maybeSingle(),
    ),
  );
}

export async function deleteGoal(db, npcId, goalId) {
  return unwrap(await db.from('npc_goals').delete().eq('id', goalId).eq('npc_id', npcId).select('id')).length > 0;
}
