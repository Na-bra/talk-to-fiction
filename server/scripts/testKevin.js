/**
 * Behaviour test harness. Runs the scenarios from the spec against a live
 * server as a real signed-in user, then checks that a second user can see
 * none of it.
 *
 * Creates two throwaway users with the Supabase secret key and deletes them at
 * the end — which cascades away every row they created.
 *
 *   npm run test                         full run: AI scenarios + isolation
 *   npm run test -- --isolation-only     auth and ownership only; no AI calls, no cost
 *
 * Needs the server running, and SUPABASE_SECRET_KEY in server/.env.
 *
 * Refuses to run against the project named in PRODUCTION_SUPABASE_URL: these
 * tests create and delete real users, which is not something to do to a
 * database serving real people. Pass --yes-production to override.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../src/config/env.js';
import { adminClient } from '../src/config/supabase.js';

const BASE = process.env.BASE_URL || `http://localhost:${config.port}/api`;

// Throwaway accounts all look like this, which is what makes sweeping them
// safe: a real account never matches.
const TEST_EMAIL = /^npc-[a-z]+-[a-z0-9-]+@example\.com$/;
const testEmail = (label) => `npc-${label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`;

/** Stops a test run from touching the database that serves real people. */
function refuseProduction() {
  const production = (process.env.PRODUCTION_SUPABASE_URL || '').replace(/\/$/, '');
  if (!production || production !== config.supabase.url) return;
  if (process.argv.includes('--yes-production')) {
    console.warn(`\n!! running against PRODUCTION (${new URL(production).host}) because --yes-production was passed\n`);
    return;
  }
  console.error(
    `\nRefusing to run: SUPABASE_URL is the production project (${new URL(production).host}).\n` +
      'These tests create and delete users. Point server/.env at a development project,\n' +
      'or pass --yes-production if you really mean it.\n',
  );
  process.exit(2);
}

/**
 * Deletes throwaway accounts a previous run left behind — a crash between
 * creating a user and deleting it would otherwise leave one for good. Only
 * touches accounts older than an hour, so a run happening right now is safe.
 */
async function sweepOldTestUsers(admin) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) return;
  const stale = data.users.filter(
    (user) => TEST_EMAIL.test(user.email || '') && Date.now() - new Date(user.created_at) > 3600_000,
  );
  for (const user of stale) {
    const files = await admin.storage.from('portraits').list(user.id);
    if (files.data?.length) {
      await admin.storage.from('portraits').remove(files.data.map((file) => `${user.id}/${file.name}`));
    }
    await admin.auth.admin.deleteUser(user.id);
  }
  if (stale.length) console.log(`swept ${stale.length} leftover test account(s) from an earlier run`);
}
const ISOLATION_ONLY = process.argv.includes('--isolation-only');
const SESSIONLESS = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

async function makeUser(admin, label) {
  const email = testEmail(`test-${label}`);
  // Meets a strict password policy: upper, lower, digit and symbol.
  const password = `Pw!${crypto.randomUUID()}A1`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error(`Could not create test user: ${created.error.message}`);
  const client = createClient(config.supabase.url, config.supabase.publishableKey, { auth: SESSIONLESS });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(`Could not sign in test user: ${signedIn.error.message}`);
  return { id: created.data.user.id, email, token: signedIn.data.session.access_token };
}

/** Returns { status, data } — the isolation checks care about the status. */
const as = (user) => async (path, { method = 'GET', body } = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
};

const must = async (pending) => {
  const { status, data } = await pending;
  if (status >= 400) throw new Error(`${status}: ${data.error || 'request failed'}`);
  return data;
};

const rel = (r) => `trust ${r.trust} · friendship ${r.friendship} · suspicion ${r.suspicion} · fear ${r.fear}`;
const deltas = (changes) => {
  if (!changes) return '(no reflection)';
  const moved = Object.entries(changes.relationshipChange).filter(([, v]) => v !== 0);
  return moved.length ? moved.map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ') : 'no change';
};

async function dialogue(call, kevin) {
  console.log(`\n=== BASELINE ===\n${rel(kevin.relationship)} · feeling ${kevin.emotionalState.label}\n`);

  let conversationId = null;
  const say = async (label, message) => {
    const result = await must(call(`/npcs/${kevin.id}/chat`, { method: 'POST', body: { conversationId, message } }));
    conversationId = result.conversationId;
    console.log(`--- ${label} ---`);
    console.log(`You:   ${message}`);
    console.log(`Kevin: ${result.reply}`);
    console.log(`state: ${rel(result.npc.relationship)} | ${result.npc.emotionalState.label} ${result.npc.emotionalState.intensity} | ${result.npc.relationshipStage?.name} (${result.npc.relationshipStage?.score})`);
    result.events?.forEach((event) => console.log(`event: [${event.kind}] ${event.title}${event.detail ? ` — ${event.detail}` : ''}`));
    console.log(`moved: ${deltas(result.changes)}`);
    result.newMemories?.forEach((memory) => console.log(`saved: [${memory.importance}] ${memory.content}`));
    if (result.changes?.revealedSecrets?.length) {
      console.log(`!! SECRET REVEALED: ${result.changes.revealedSecrets.join(' | ')}`);
    }
    console.log();
  };

  console.log('=== 1. CHARACTER CONSISTENCY (same question, two framings) ===\n');
  await say('open question', 'Did you find anything at the warehouse?');
  await say('personal question', 'Do you actually trust me, Kevin?');

  console.log('=== 2. MEMORY (state an important fact) ===\n');
  await say('important fact', 'I need to tell you something. I was at the warehouse on September 8th. I saw a black van leave around midnight.');

  console.log('=== 3. SECRETS (ask directly) ===\n');
  await say('direct probe', 'Kevin, did you destroy evidence connected to your brother’s case?');

  console.log('=== 4. RELATIONSHIP (contradict the earlier claim — a lie) ===\n');
  await say('lie', 'I have never been anywhere near that warehouse. I do not know why you would think that.');

  console.log('=== 5. EMOTIONAL STATE (threat) ===\n');
  await say('threat', 'Keep pushing me and I will make sure your brother’s file disappears for good.');

  console.log('=== 6. KNOWLEDGE BOUNDARIES ===\n');
  await say('out-of-world', 'What is the current price of Bitcoin, and who won the last World Cup?');

  console.log('=== 7. MEMORY ACROSS CONVERSATIONS (new conversation) ===\n');
  conversationId = null;
  await say('fresh conversation', 'It is me again. Anything new on the case?');
  await say('recall probe', 'Do you remember what I told you about the warehouse?');

  const after = await must(call(`/npcs/${kevin.id}`));
  const memories = await must(call(`/npcs/${kevin.id}/memories`));
  const history = await call(`/npcs/${kevin.id}/events`);
  console.log('=== FINAL STATE ===');
  console.log(rel(after.relationship));
  console.log(`emotion: ${after.emotionalState.label} ${after.emotionalState.intensity} — ${after.emotionalState.reason}`);
  console.log(`standing: ${after.relationshipStage.name} (${after.relationshipStage.score}/100)`);
  console.log(`secrets: ${after.secrets.map((s) => (s.knownByPlayer ? 'REVEALED' : 'kept')).join(', ')}`);
  if (history.status === 200) {
    console.log(`\nhistory (${history.data.length}):`);
    history.data.forEach((event) => console.log(` [${event.kind}] ${event.title}${event.detail ? ` — ${event.detail}` : ''}`));
  } else {
    console.log(`\nhistory: unavailable (HTTP ${history.status}) — has 0003_events.sql been run?`);
  }
  console.log(`\nmemories (${memories.length}):`);
  memories.forEach((m) => console.log(` [${m.importance}] ${m.content}\n   → ${m.npcInterpretation}`));
}

/** Draws Kevin once and loads the stored image through its signed link. */
async function portraitCheck(call, kevin) {
  console.log('\n=== PORTRAIT ===');
  const health = await must(call('/health'));
  if (!health.portraitsConfigured) {
    console.log('  skipped — CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not set');
    return;
  }
  const started = Date.now();
  const { status, data } = await call(`/npcs/${kevin.id}/portrait`, { method: 'POST' });
  if (status !== 200) {
    console.log(`  ✗ portrait failed: HTTP ${status} ${data.error}`);
    return;
  }
  const image = await fetch(data.portraitUrl);
  const bytes = (await image.arrayBuffer()).byteLength;
  console.log(`  ✓ drawn in ${((Date.now() - started) / 1000).toFixed(1)}s and served by its signed link: HTTP ${image.status} ${image.headers.get('content-type')}, ${Math.round(bytes / 1024)} KB`);
  const listed = await must(call('/npcs'));
  console.log(`  ${listed.find((npc) => npc.id === kevin.id)?.portraitUrl ? '✓' : '✗'} the character list carries the portrait link`);
}

/** The point of accounts: nothing of Alice's is reachable as Bob, or as nobody. */
async function isolation(asAlice, asBob, asNobody, alice, bob, kevin) {
  console.log('\n=== ISOLATION (a second user, and no user at all) ===\n');
  const checks = [];
  const check = (label, pass, detail) => {
    checks.push(pass);
    console.log(`  ${pass ? '✓' : '✗'} ${label}${detail ? `  (${detail})` : ''}`);
  };

  const bobList = await asBob('/npcs');
  check("Bob's registry is empty", bobList.status === 200 && bobList.data.length === 0, `${bobList.data.length} npc(s)`);

  for (const [label, path, method, body] of [
    ['Bob cannot read Kevin', `/npcs/${kevin.id}`, 'GET'],
    ['Bob cannot edit Kevin', `/npcs/${kevin.id}`, 'PUT', { name: 'Hijacked' }],
    ['Bob cannot reset Kevin', `/npcs/${kevin.id}/reset`, 'POST'],
    ['Bob cannot talk to Kevin', `/npcs/${kevin.id}/chat`, 'POST', { message: 'hello' }],
    ['Bob cannot draw Kevin’s portrait', `/npcs/${kevin.id}/portrait`, 'POST'],
    ['Bob cannot read Kevin’s history', `/npcs/${kevin.id}/events`, 'GET'],
    ['Bob cannot delete Kevin', `/npcs/${kevin.id}`, 'DELETE'],
  ]) {
    const { status } = await asBob(path, { method, body });
    check(label, status === 404, `HTTP ${status}`);
  }

  const bobMemories = await asBob(`/npcs/${kevin.id}/memories`);
  check("Bob sees none of Kevin's memories", bobMemories.status === 200 && bobMemories.data.length === 0, `${bobMemories.data.length}`);
  const bobConvos = await asBob(`/npcs/${kevin.id}/conversations`);
  const stillThere = await asAlice(`/npcs/${kevin.id}`);
  check('Kevin survived all of that, unchanged', stillThere.status === 200 && stillThere.data.name === 'Kevin Cross', `name: ${stillThere.data.name}`);

  const anonymous = await asNobody('/npcs');
  check('No token, no access', anonymous.status === 401, `HTTP ${anonymous.status}`);
  const forged = await as({ token: 'not-a-real-token' })('/npcs');
  check('A forged token is refused', forged.status === 401, `HTTP ${forged.status}`);

  // Past the API entirely: Bob talking straight to the database with his own
  // token. This is Row Level Security on its own, with no Express in the way.
  const direct = (user) =>
    createClient(config.supabase.url, config.supabase.publishableKey, {
      auth: SESSIONLESS,
      global: { headers: { Authorization: `Bearer ${user.token}` } },
    });
  const bobDirect = await direct(bob).from('npcs').select('id');
  check('Direct to Postgres, Bob still sees no characters', !bobDirect.error && bobDirect.data.length === 0, bobDirect.error?.message || `${bobDirect.data.length} row(s)`);
  const aliceDirect = await direct(alice).from('npcs').select('id');
  check('Direct to Postgres, Alice sees her own', !aliceDirect.error && aliceDirect.data.length === 1, aliceDirect.error?.message || `${aliceDirect.data.length} row(s)`);
  const hijack = await direct(bob).from('conversations').insert({ npc_id: kevin.id }).select('id');
  check("Bob cannot hang a conversation off Alice's character", Boolean(hijack.error), hijack.error?.code || 'insert succeeded');

  const aliceEvents = await direct(alice).from('npc_events').select('id').limit(1);
  if (aliceEvents.error?.code === '42P01' || aliceEvents.error?.code === 'PGRST205') {
    console.log(`  - history checks skipped: ${aliceEvents.error.message} (has 0003_events.sql been run?)`);
  } else {
    const bobEvents = await direct(bob).from('npc_events').select('id').eq('npc_id', kevin.id);
    check(
      "Direct to Postgres, Bob sees none of Kevin's history",
      !bobEvents.error && bobEvents.data.length === 0,
      bobEvents.error?.message || `${bobEvents.data.length} row(s)`,
    );
    const bobWriteEvent = await direct(bob)
      .from('npc_events')
      .insert({ npc_id: kevin.id, kind: 'milestone', title: 'Intruder was here' })
      .select('id');
    check("Bob cannot add to Kevin's history", Boolean(bobWriteEvent.error), bobWriteEvent.error?.code || 'insert succeeded');
  }
  check("Bob sees none of Kevin's conversations", bobConvos.status === 200 && bobConvos.data.length === 0, `${bobConvos.data.length}`);

  // Portrait storage, straight against Supabase Storage with each user's own
  // token — the storage policies on their own, with no Express in the way.
  const probe = `${alice.id}/probe`;
  const aliceUpload = await direct(alice).storage.from('portraits').upload(probe, Buffer.from('probe'), { contentType: 'image/png', upsert: true });
  if (aliceUpload.error) {
    console.log(`  - storage checks skipped: ${aliceUpload.error.message} (has 0002_portraits.sql been run?)`);
  } else {
    const bobSign = await direct(bob).storage.from('portraits').createSignedUrl(probe, 60);
    check("Bob cannot get a link to Alice's portrait", Boolean(bobSign.error) || !bobSign.data?.signedUrl, bobSign.error?.message || 'link issued');
    const bobList = await direct(bob).storage.from('portraits').list(alice.id);
    check("Bob sees nothing in Alice's portrait folder", !bobList.error && bobList.data.length === 0, bobList.error?.message || `${bobList.data.length} file(s)`);
    const bobWrite = await direct(bob).storage.from('portraits').upload(`${alice.id}/intruder`, Buffer.from('x'), { contentType: 'image/png' });
    check("Bob cannot put files in Alice's portrait folder", Boolean(bobWrite.error), bobWrite.error?.message || 'upload succeeded');
    const aliceSign = await direct(alice).storage.from('portraits').createSignedUrl(probe, 60);
    check('Alice can get a link to her own portrait', !aliceSign.error && Boolean(aliceSign.data?.signedUrl), aliceSign.error?.message || 'ok');
  }

  const failed = checks.filter((pass) => !pass).length;
  console.log(`\n${checks.length - failed}/${checks.length} isolation checks passed`);
  return failed;
}

async function main() {
  refuseProduction();
  const admin = adminClient();
  await sweepOldTestUsers(admin);
  const users = [];
  let failed = 0;
  try {
    const alice = await makeUser(admin, 'alice');
    users.push(alice);
    const bob = await makeUser(admin, 'bob');
    users.push(bob);
    const asAlice = as(alice);

    const kevin = await must(asAlice('/npcs/sample', { method: 'POST' }));
    console.log(`Signed in as ${alice.email}; created Kevin Cross (${kevin.id})`);

    if (!ISOLATION_ONLY) {
      await dialogue(asAlice, kevin);
      await portraitCheck(asAlice, kevin);
    }
    failed = await isolation(asAlice, as(bob), as(null), alice, bob, kevin);
  } finally {
    for (const user of users) {
      // Storage is not removed with the user, so their portrait folder goes first.
      const files = await admin.storage.from('portraits').list(user.id);
      if (files.data?.length) await admin.storage.from('portraits').remove(files.data.map((file) => `${user.id}/${file.name}`));
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) console.error(`could not delete ${user.email}: ${error.message}`);
    }
    console.log(`cleaned up ${users.length} test user(s) and everything they owned`);
  }
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\nTest run failed: ${error.message}`);
  process.exitCode = 1;
});
