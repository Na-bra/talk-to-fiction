import { hasSupabase } from '../config/env.js';
import { publicClient } from '../config/supabase.js';

/**
 * Exchanges an email and password for an access token.
 *
 * The web client never calls this — it signs in with Supabase directly. It
 * exists so Swagger and scripts can get a token to send as a Bearer header.
 */
export async function token(req, res) {
  if (!hasSupabase()) {
    return res.status(503).json({ error: 'Supabase is not configured.', code: 'missing_supabase' });
  }
  const email = (req.body?.email || '').toString().trim();
  const password = (req.body?.password || '').toString();
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const { data, error } = await publicClient().auth.signInWithPassword({ email, password });
  if (error || !data?.session) {
    return res.status(401).json({ error: error?.message || 'Sign-in failed.', code: 'invalid_credentials' });
  }
  res.json({
    accessToken: data.session.access_token,
    expiresAt: data.session.expires_at,
    user: { id: data.user.id, email: data.user.email },
  });
}

export const me = (req, res) => res.json(req.user);
