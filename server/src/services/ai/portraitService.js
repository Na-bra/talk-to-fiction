import { config, hasImageKey } from '../../config/env.js';
import { AiError } from './client.js';

const clip = (text, max) => {
  const value = (text ?? '').toString().replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

// Sentences are joined with our own full stops, so drop any the sheet already has.
const sentence = (text, max) => clip(text, max).replace(/[.!?…]+$/, '');

/**
 * Turns a character sheet into an image prompt. Secrets are never included:
 * a portrait is something the player sees.
 */
export function buildPortraitPrompt(npc) {
  const age = npc.age !== null && npc.age !== undefined && npc.age !== '' ? `${npc.age}-year-old` : '';
  const who = [age, npc.occupation || 'person'].filter(Boolean).join(' ');
  const traits = (npc.personality || []).slice(0, 4).join(', ').toLowerCase();
  return [
    `Head-and-shoulders character portrait of ${clip(npc.name, 80)}, a ${clip(who, 120)}.`,
    npc.setting && `World: ${sentence(npc.setting, 220)}.`,
    traits && `Their expression and bearing read as ${traits}.`,
    npc.background && `Backstory, for mood only: ${clip(npc.background, 320)}`,
    'Painterly digital illustration, cinematic soft lighting, muted colour palette, detailed face, looking toward the viewer, simple dark background.',
    'Single person. No text, letters, captions, logos, watermark or border.',
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 2000);
}

/** The real image type, read from its first bytes rather than taken on trust. */
function sniff(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 4).toString('latin1') === '\x89PNG') return 'image/png';
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/** Draws a portrait with Cloudflare Workers AI. Returns { bytes, contentType }. */
export async function generatePortrait(npc) {
  if (!hasImageKey()) {
    throw new AiError(
      'missing_key',
      'Portraits are not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in server/.env.',
    );
  }

  let response;
  try {
    response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.image.accountId}/ai/run/${config.image.model}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.image.apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: buildPortraitPrompt(npc), steps: 4 }),
        signal: AbortSignal.timeout(60_000),
      },
    );
  } catch (error) {
    throw new AiError('upstream', `Could not reach Cloudflare: ${error.message}`);
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const message = (body.errors || []).map((error) => error.message).join('; ') || `HTTP ${response.status}`;
    if (response.status === 401 || response.status === 403 || /authenticat|unauthori/i.test(message)) {
      throw new AiError('missing_key', 'Cloudflare rejected the credentials. Check CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.');
    }
    if (response.status === 429 || /allocation|neuron|rate limit/i.test(message)) {
      throw new AiError('quota', 'Today’s free portrait allowance is used up. It resets tomorrow.');
    }
    if (/nsfw|safety|flagged/i.test(message)) {
      throw new AiError('refused', 'The image service declined to draw this character.');
    }
    throw new AiError('upstream', `Cloudflare: ${message}`);
  }

  const base64 = body?.result?.image ?? body?.image;
  if (typeof base64 !== 'string' || !base64) throw new AiError('bad_output', 'Cloudflare returned no image.');
  const bytes = Buffer.from(base64, 'base64');
  const contentType = sniff(bytes);
  if (!contentType) throw new AiError('bad_output', 'Cloudflare returned data that is not an image.');
  return { bytes, contentType };
}

// Cloudflare's free allowance is shared by every account on this server, so
// each account gets a daily share. In memory: it resets when the server
// restarts — enough to stop one person draining the pool, not a billing system.
const usage = new Map();
const today = () => new Date().toISOString().slice(0, 10);

export function portraitsLeftToday(userId) {
  const entry = usage.get(userId);
  const used = entry?.day === today() ? entry.count : 0;
  return Math.max(0, config.image.dailyLimitPerUser - used);
}

export function recordPortrait(userId) {
  const entry = usage.get(userId);
  const day = today();
  usage.set(userId, { day, count: entry?.day === day ? entry.count + 1 : 1 });
}
