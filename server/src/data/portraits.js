import { unwrap } from './db.js';

const BUCKET = 'portraits';
// Long enough to outlast a session; every character response signs afresh.
const SIGNED_URL_SECONDS = 60 * 60 * 24;

/**
 * Where a character's portrait lives. The first folder must be the owner's
 * id — the storage policies in 0002_portraits.sql check exactly that.
 */
export const portraitPath = (userId, npcId) => `${userId}/${npcId}`;

export async function uploadPortrait(db, path, bytes, contentType) {
  unwrap(await db.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true, cacheControl: '3600' }));
}

export async function removePortrait(db, path) {
  unwrap(await db.storage.from(BUCKET).remove([path]));
}

/**
 * Swaps the internal storage path for `portraitUrl`, a signed link the browser
 * can load. Links are signed as the signed-in user, so storage policies apply.
 * Signing failures cost the picture, never the page: the character just shows
 * initials.
 */
export async function withPortraitUrls(db, npcs) {
  const list = Array.isArray(npcs) ? npcs : [npcs];
  const paths = list.map((npc) => npc?.portraitPath).filter(Boolean);
  const urls = new Map();
  if (paths.length) {
    const { data, error } = await db.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
    if (error) console.error('[portrait] could not sign links:', error.message);
    for (const item of data || []) if (item.signedUrl) urls.set(item.path, item.signedUrl);
  }
  const out = list.map((npc) => {
    if (!npc) return npc;
    const { portraitPath: path, ...rest } = npc;
    return { ...rest, portraitUrl: (path && urls.get(path)) || null };
  });
  return Array.isArray(npcs) ? out : out[0];
}
