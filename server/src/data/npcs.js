import { unwrap } from './db.js';

const COLUMNS =
  'id, name, age, occupation, setting, personality, background, motivations, goals, fears, ' +
  'core_values, speech_style, secrets, relationship, emotional_state, created_at, updated_at';

// Postgres columns are snake_case; the API has always spoken camelCase. The
// mapping lives here, so nothing above the data layer sees a column name.
const FIELD_TO_COLUMN = {
  name: 'name',
  age: 'age',
  occupation: 'occupation',
  setting: 'setting',
  personality: 'personality',
  background: 'background',
  motivations: 'motivations',
  goals: 'goals',
  fears: 'fears',
  values: 'core_values',
  speechStyle: 'speech_style',
  secrets: 'secrets',
  relationship: 'relationship',
  emotionalState: 'emotional_state',
};

function toNpc(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    age: row.age,
    occupation: row.occupation,
    setting: row.setting,
    personality: row.personality ?? [],
    background: row.background,
    motivations: row.motivations,
    goals: row.goals,
    fears: row.fears,
    values: row.core_values,
    speechStyle: row.speech_style,
    secrets: row.secrets ?? [],
    relationship: row.relationship,
    emotionalState: row.emotional_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(fields) {
  const row = {};
  for (const [field, column] of Object.entries(FIELD_TO_COLUMN)) {
    if (fields[field] !== undefined) row[column] = fields[field];
  }
  return row;
}

export async function listNpcs(db) {
  const rows = unwrap(await db.from('npcs').select(COLUMNS).order('created_at', { ascending: false }));
  return rows.map(toNpc);
}

/** Null when the character does not exist or belongs to someone else. */
export async function getNpc(db, id) {
  return toNpc(unwrap(await db.from('npcs').select(COLUMNS).eq('id', id).maybeSingle()));
}

export async function createNpc(db, fields) {
  return toNpc(unwrap(await db.from('npcs').insert(toRow(fields)).select(COLUMNS).single()));
}

export async function updateNpc(db, id, fields) {
  const row = toRow(fields);
  if (!Object.keys(row).length) return getNpc(db, id);
  return toNpc(unwrap(await db.from('npcs').update(row).eq('id', id).select(COLUMNS).maybeSingle()));
}

/** True if a row was deleted. Conversations, messages and memories cascade. */
export async function deleteNpc(db, id) {
  return unwrap(await db.from('npcs').delete().eq('id', id).select('id')).length > 0;
}

/** Persists only the state a chat turn can change. */
export function saveNpcState(db, npc) {
  return updateNpc(db, npc.id, {
    relationship: npc.relationship,
    emotionalState: npc.emotionalState,
    secrets: npc.secrets,
  });
}
