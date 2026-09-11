import { createClient } from '@supabase/supabase-js';
import { config } from './env.js';

// A server never holds a session of its own: every request brings its own
// token, and nothing should be written to disk or refreshed in the background.
const SERVER_AUTH = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

let verifier = null;

/**
 * Checks an access token and returns who it belongs to, or null.
 *
 * getClaims verifies the signature locally against the project's published
 * keys when the project uses asymmetric JWT signing, and asks the Auth server
 * when it does not — either way a forged or expired token is rejected.
 */
export async function verifyAccessToken(token) {
  verifier ??= createClient(config.supabase.url, config.supabase.publishableKey, { auth: SERVER_AUTH });
  const { data, error } = await verifier.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: data.claims.email ?? null };
}

/**
 * A client that queries as this user. Postgres sees their identity, so Row
 * Level Security applies to every call made through it.
 */
export function clientFor(token) {
  return createClient(config.supabase.url, config.supabase.publishableKey, {
    auth: SERVER_AUTH,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * A fresh, session-less client for signing in on someone's behalf. Fresh each
 * time: a signed-in client holds that user's session, and sharing one across
 * requests would leak it between them.
 */
export function publicClient() {
  return createClient(config.supabase.url, config.supabase.publishableKey, { auth: SERVER_AUTH });
}

/** Bypasses Row Level Security. Scripts only — never used to serve a request. */
export function adminClient() {
  if (!config.supabase.secretKey) {
    throw new Error('SUPABASE_SECRET_KEY is not set. It is only needed by scripts such as the test harness.');
  }
  return createClient(config.supabase.url, config.supabase.secretKey, { auth: SERVER_AUTH });
}
