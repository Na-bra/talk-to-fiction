import { hasSupabase } from '../config/env.js';
import { verifyAccessToken, clientFor } from '../config/supabase.js';

/**
 * Admits a request only with a valid Supabase access token, then attaches:
 *   req.user — { id, email }
 *   req.db   — a Supabase client acting as that user
 *
 * Handlers query through req.db, so every read and write is filtered by Row
 * Level Security. Ownership is enforced by the database, not by remembering
 * to add a filter in each handler.
 */
export async function requireUser(req, res, next) {
  if (!hasSupabase()) {
    return res.status(503).json({
      error: 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in server/.env.',
      code: 'missing_supabase',
    });
  }

  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ error: 'Sign in required.', code: 'unauthenticated' });
  }

  try {
    const user = await verifyAccessToken(token);
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired session. Sign in again.', code: 'unauthenticated' });
    }
    req.user = user;
    req.db = clientFor(token);
    next();
  } catch (error) {
    next(error);
  }
}
