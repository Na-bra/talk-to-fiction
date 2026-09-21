# AI NPC Generator — API

Create fictional characters with a personality, a private life, and a memory — then talk to them.
The goal is an NPC that behaves like a persistent character rather than a chatbot wearing a costume.

Every account has its own characters, its own conversations with them, and its own memories.

This is the API. The React interface lives in its own repo, at
[`../ai-npc-generator-client`](../ai-npc-generator-client).

## Stack

| Layer | Choice |
|---|---|
| Database + auth | Supabase — Postgres with Row Level Security, and Supabase Auth |
| API | Express 5 (ESM JavaScript, no build step) |
| Model | Google Gemini — `gemini-3.5-flash-lite` for both dialogue and state tracking |

## Setting up Supabase (once)

1. Create a project at [supabase.com](https://supabase.com). The free tier is enough.
2. Open the **SQL Editor** and run each file in [`supabase/migrations`](supabase/migrations), in order:
   - `0001_init.sql` creates four tables — `npcs`, `conversations`, `messages`, `memories` — each
     with Row Level Security switched on.
   - `0002_portraits.sql` adds a portrait column and a private `portraits` storage bucket.
   - `0003_events.sql` adds `npc_events`, the character's history with you.
   - `0004_goals.sql` adds `npc_goals`, what each character is pursuing.

   Check the project in the browser's address bar before running anything.
3. From **Project Settings**, copy the Project URL, the publishable key and the secret key into
   `server/.env`. The client needs the same URL and publishable key in its own `.env`.
4. For local development, consider turning off email confirmation (**Authentication → Sign In /
   Providers → Email**). With it on, every new account has to click a link before it can sign in,
   and Supabase's built-in mailer is heavily rate-limited. If you keep it on, add
   `http://localhost:5173` under **Authentication → URL Configuration** so the link returns to the
   app.

## Running it

```bash
npm install                        # installs server/
cp server/.env.example server/.env # Supabase + Gemini settings (see above)
npm run dev                        # http://localhost:4000
```

Then start the client, create an account, and use **Add Kevin Cross (sample)** on the empty
registry to get a character to talk to.

Without a Gemini key, accounts and character editing still work and AI routes return a clear 503.
Without the Supabase settings, `/api/health` and the docs still load and everything else returns 503.

**Interactive API docs: <http://localhost:4000/api/docs>** — Swagger UI with every endpoint and
working "Try it out" buttons. To use them signed in: call `POST /auth/token` with your email and
password, copy `accessToken`, click **Authorize** and paste it. The raw spec is at
`/api/openapi.json` for Postman or Insomnia.

### Environment

```env
PORT=4000
CLIENT_ORIGIN=                       # client origin(s), comma-separated; empty allows any

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=            # "anon" on older projects; safe to expose
SUPABASE_SECRET_KEY=                 # "service_role" on older projects; test harness only

AI_API_KEY=
AI_MODEL=gemini-3.5-flash-lite       # dialogue
AI_MODEL_FAST=gemini-3.5-flash-lite  # reflection + summarisation

CLOUDFLARE_ACCOUNT_ID=               # portraits; optional — without them, initials
CLOUDFLARE_API_TOKEN=
PORTRAITS_PER_USER_PER_DAY=20
```

**The running API never uses the secret key.** It bypasses Row Level Security, so only the test
harness reads it — to create and delete throwaway users. You can leave it empty if you do not run
the tests.

Two model slots, because the two jobs are not the same job. Dialogue has to hold a character
together under pressure; reflection and summarisation are structured extraction. Both default to
Flash-Lite 3.5 ($0.30/$2.50 per MTok) — the 2.5 family is cheaper still but is closed to new API
keys, so it appears in the model catalogue and then 404s on use.

If a character feels flat or gives up secrets too easily, raise `AI_MODEL` to `gemini-3.5-flash` —
that is the knob that matters. Leave `AI_MODEL_FAST` alone; nothing it does needs a bigger model.

```bash
npm run models   # list models, then call both configured ones to prove they work
```

That command probes by making a real one-token call, because listing a model is not the same as
being allowed to use it.

## API

Every route needs `Authorization: Bearer <access token>` except the three marked public.

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/health` | Service health — **public** |
| `GET` | `/api/options` | Suggested traits + emotion vocabulary — **public** |
| `POST` | `/api/auth/token` | Email + password → access token, for Swagger and scripts — **public** |
| `GET` | `/api/me` | Who the token belongs to |
| `GET` | `/api/npcs` | Your characters |
| `POST` | `/api/npcs` | Create |
| `POST` | `/api/npcs/sample` | Add a copy of Kevin Cross |
| `POST` | `/api/npcs/generate` | Draft character fields from partial input |
| `GET` | `/api/npcs/:id` | Read |
| `PUT` | `/api/npcs/:id` | Update |
| `DELETE` | `/api/npcs/:id` | Delete (cascades conversations, messages, memories) |
| `POST` | `/api/npcs/:id/reset` | Reset state, memories, conversations (test helper) |
| `POST` | `/api/npcs/:id/portrait` | Draw (or redraw) a portrait from the character sheet |
| `GET` | `/api/npcs/:id/memories` | Long-term memories |
| `GET` | `/api/npcs/:id/events` | The character's history: milestones, changes of standing, secrets let slip |
| `GET` | `/api/npcs/:id/goals` | What the character is pursuing |
| `POST` | `/api/npcs/:id/goals/plan` | Read the sheet and write down their pursuits |
| `PUT` | `/api/npcs/:id/goals/:goalId` | Edit a goal, its progress or status |
| `DELETE` | `/api/npcs/:id/goals/:goalId` | Remove a goal |
| `GET` | `/api/npcs/:id/conversations` | Conversation list |
| `POST` | `/api/npcs/:id/conversations` | Start a conversation |
| `GET` | `/api/npcs/:id/conversations/:conversationId` | Full transcript |
| `POST` | `/api/npcs/:id/chat` | Send a message, get an in-character reply |

Another user's character answers 404, never 403 — the API does not confirm that it exists.
`generate` has no `:id` because the Creator uses it *before* the character exists.

## Accounts and ownership

The client signs in with Supabase Auth and sends the session's access token with every request.
`middleware/auth.js` verifies it with `getClaims` — locally against the project's signing keys when
the project uses asymmetric JWTs — and attaches `req.db`, a Supabase client that **acts as that
user**.

Every query goes through `req.db`, so Postgres applies Row Level Security to all of them. Ownership
does not depend on each handler remembering a `user_id` filter: the policies in the migration
limit every table to the signed-in user's rows, and a missing filter still cannot return anyone
else's data.

Foreign keys are checked without RLS, so the policies go one step further: a conversation, message
or memory can only be written against a parent the same user owns. Without that, a user could
attach their own rows to someone else's character id.

A character's relationship and emotional state still live on the character row. Each character has
exactly one owner, so "the player" is always its owner — the single-player design holds per account.

Two things are **not** private per account:

- **The Gemini key.** Every signed-in user spends from the same budget, and there is no rate
  limiting yet.
- **Nothing stops users editing their own rows directly.** The publishable key is public by design,
  so a user with their token can write to their own rows through Supabase's REST API, bypassing this
  server's validation. They can only ever touch their own data, and the database's own check
  constraints (relationship values 0–100, valid emotions and roles) still apply. At worst someone
  cheats at their own game.

## Portraits

`POST /api/npcs/:id/portrait` draws a head-and-shoulders portrait with Cloudflare Workers AI
(FLUX.1 schnell, about 3–8 seconds) and stores it in Supabase Storage. The prompt is built from the
name, age, occupation, setting, personality and background — **never the secrets**, because a
portrait is something the player sees. Drawing again replaces the portrait; deleting the character
deletes it.

**Portraits are private.** `0002_portraits.sql` creates a private bucket in which each user owns one
folder, named by their user id. The API uploads and signs links as the signed-in user, so the storage
policies decide access, exactly as Row Level Security does for the tables. Every character response
carries `portraitUrl`, a link signed for 24 hours; the storage path itself never leaves the API.
There is no public URL.

**Cost:** Cloudflare's free allowance is 10,000 neurons a day, about 230 portraits at 512×512. It is
shared by every account, so each account gets a daily share (`PORTRAITS_PER_USER_PER_DAY`, default
20). A used-up share or allowance answers 429.

Setup: create a free Cloudflare account, copy the **Account ID**, and create an API token from the
**Workers AI** template (Workers AI → Use REST API). Put both in `server/.env` — never in
`.env.example`, which is committed.

## How it works

### Context

`services/ai/promptBuilder.js` assembles the system prompt in four layers:

1. **Behaviour rules + dossier** — identity, personality, background, goals, fears, motivations,
   values, speech style.
2. **Private knowledge** — secrets, with rules that make disclosure a character decision.
3. **Current state** — emotion and the four relationship values, rendered as prose bands
   (`Trust 62/100 — you trust them conditionally`) rather than raw numbers to act on.
4. **Retrieved memories** and the rolling conversation summary.

The stable layers come first so the provider's prefix caching has something constant to hit; the
volatile layer follows and never disturbs it.

History is **not** concatenated forever: the last 12 messages go verbatim, and anything older is
folded into the conversation's `summary` once the transcript passes 20 messages. Prompt size is
bounded no matter how long a conversation runs.

### Memory

Two tiers. Short-term is the recent message window. Long-term is the `memories` table, written only
when something is actually worth remembering.

Retrieval scores every memory by `importance × 2 + recency × 2 + keyword overlap × 3` and takes the
top 6. With tens of memories per character this is exact and instant; it is also the single
function to replace if embeddings are ever needed.

### The chat turn

Each turn makes **two** model calls:

1. **Reply** — the in-character response, on `AI_MODEL` at temperature 0.95.
2. **Reflection** — a separate JSON-schema-constrained call on `AI_MODEL_FAST` at temperature 0.2,
   returning candidate memories, relationship deltas, an emotion, and any secret the character
   actually gave away.

The exchange is saved as soon as the reply exists — it is what the player saw, so it survives even
if reflection fails. Messages carry an identity `seq` column that orders the transcript, because
the two halves of an exchange can share a timestamp.

Reflection is applied to a copy of the character and only adopted once saved, so a failed write
never produces a response describing state the database does not hold. Gemini's constrained
decoding is not trusted on its own: the JSON is re-parsed and validated against the same Zod schema
before anything touches the database.

### Standing

The four axes are the machinery; **standing** is what the character acts on. `stages.js` turns them
into one of Stranger, Acquaintance, Friendly, Close, Trusted or Deep Bond — warmth (trust and
friendship) carried, wariness (suspicion and fear) subtracted — and the prompt states it plainly
along with what someone at that stage will and will not discuss. It is derived on every read and
never stored, so it cannot disagree with the numbers behind it. The numeric lines stay in the
prompt too: a character who likes you *and* suspects you reads differently from a neutral one.

Standing is why the same question gets a different answer from a stranger and from someone who
trusts you — and it can fall as well as rise.

### Goals

The sheet's `goals` field stays as the author's prose. `npc_goals` is the tracked version: one row
per pursuit, each with the next step, what stands in the way, and progress from 0 to 100.
`POST /npcs/:id/goals/plan` reads the sheet and writes one to three of them — never from the
secrets, which are things a character hides rather than chases.

Active goals go into the prompt, so a character asks for what they need and complains about what is
blocking them. A turn may move **one** goal by at most 15 points, up or down, and reaching 100 marks
it achieved. Every move is written to the history. As everywhere else, the model proposes and
`goalService.js` decides: an unknown goal number, a goal that is not active, or an update that
changes nothing is dropped.

### History

`npc_events` is the character's history with you: meeting, changes of standing, secrets let slip,
and milestones — a promise, a real disagreement, a meaningful favour. The backend decides all of
them from what happened; only the milestone is proposed by the model, capped at one per turn and
dropped unless it is convincing. Writing history is best-effort: if it fails, the conversation is
unaffected.

### Relationships and emotion

The model proposes; the backend decides. In `services/ai/relationshipService.js`:

- non-numeric deltas are dropped,
- each axis is capped at ±20 per turn,
- results are clamped to 0–100,
- emotion labels must come from the known vocabulary,
- a secret flips to `knownByPlayer` only if the model names an existing, still-hidden secret.

`{ trust: -900 }` moves trust by −20.

Editing a character never un-reveals a secret: each secret has a stable id, and resubmitting it —
by id, or by its unchanged text — keeps its revealed state. New secrets always start hidden. Only
`reset` hides them all again.

## Testing NPC behaviour

```bash
npm run test:units                  # state rules only: no network, no database, no cost
npm run test                        # full run: AI scenarios + isolation checks
npm run test -- --isolation-only    # auth and ownership only — no AI calls, no cost
```

Needs the server running and `SUPABASE_SECRET_KEY` set. The harness creates two throwaway users,
runs everything, and deletes them at the end, which cascades away every row they created. It also
sweeps any throwaway account an earlier crashed run left behind — only ones older than an hour, and
only addresses of the form `npc-<label>-<id>@example.com`, which a real account never matches.

**Keep the tests off the database that serves real people.** Set `PRODUCTION_SUPABASE_URL` to the
production project and the harness refuses to run whenever `SUPABASE_URL` matches it, exiting 2.
`--yes-production` overrides it deliberately. Leave it empty while there is only one project.

The plan is a second Supabase project for development and CI, with production used only by Render
and Vercel. Supabase's free plan allows two active projects per organisation and unlimited paused
ones, so a spare slot may need a project paused first.

The full run walks the matrix from the spec as the first user — consistency, memory across
conversations, secret-keeping under direct questioning, relationship movement after a lie,
emotional change under threat, and knowledge boundaries — printing each reply alongside the state
it produced.

Then it checks isolation as the second user: an empty registry, 404 on reading, editing, resetting,
talking to or deleting the first user's character, no visible memories or conversations, 401 with
no token or a forged one — and the same checks **straight against Postgres** with the second user's
token, which tests Row Level Security with no Express in the way. The process exits non-zero if any
isolation check fails.

### In CI

`.github/workflows/test.yml` runs on every push and pull request: it installs the API, syntax-checks
every file, starts the server, and runs `npm test -- --isolation-only` against Supabase. It needs
three repository secrets — `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`.
The full behaviour run stays manual: it costs Gemini money and trips per-minute rate limits if run
repeatedly.

## Layout

```
server/src/
  config/       env, and the Supabase clients (verifier, per-user, admin)
  middleware/   requireUser — verifies the token, attaches req.user and req.db
  data/         npcs, conversations, memories, portraits — the only files that talk to Supabase
  routes/       one router
  controllers/  npcController, chatController, authController
  services/ai/  client (the only file that touches a model SDK), promptBuilder,
                npcService, memoryService, relationshipService
  constants.js  emotions, traits, tuning knobs
  samples.js    the Kevin Cross character sheet
  docs/         openapi.js — the API spec behind /api/docs
supabase/
  migrations/   0001_init.sql — tables, constraints, Row Level Security
                0002_portraits.sql — portrait column, private storage bucket and its policies
```

## Running it in Docker

The database and auth live in Supabase, so there is only the API to run:

```bash
cp server/.env.example server/.env     # Supabase + Gemini settings
docker compose up --build              # http://localhost:4000
```

**Your keys are never baked into the image** — `.dockerignore` excludes every `.env`, and Compose
reads `server/.env` from the host at run time instead. Requires Compose v2.24+ for the `env_file`
syntax that tolerates a missing file.

## Deploying it free

Three pieces: Supabase (already hosted), a web service for this API, and a static site for the UI.

**API — [Render](https://render.com) free web service.** Connect the repo, no card. Render can use
the Dockerfile or its own Node build — the settings below are for the latter.

| Setting | Value |
|---|---|
| Build command | `npm install` |
| Start command | `npm start` |
| Environment | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `AI_API_KEY`, `AI_MODEL`, `AI_MODEL_FAST`, `CLIENT_ORIGIN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` |

Leave `SUPABASE_SECRET_KEY` off the deployed service — nothing there needs it.

**Client — Vercel, Netlify or Cloudflare Pages**, from the client repo. See its README.

The pieces have to know about each other: `VITE_API_URL` on the client points at this API,
`CLIENT_ORIGIN` here points at the client (miss it and CORS blocks every request), and the client's
URL goes into Supabase under **Authentication → URL Configuration** so confirmation emails link to
the real site rather than localhost.

Render's free tier cold-starts in 30–60 seconds after inactivity, and Supabase pauses free projects
that sit unused for a while — the first request after that fails until the project is resumed from
the dashboard. Fine for a demo; check [supabase.com/pricing](https://supabase.com/pricing) for
current limits before relying on it.


## Limitations

- **No rate limiting.** Any signed-in user can spend your Gemini budget. Add a per-user limit, or
  keep sign-ups closed, before sharing a deployment widely.
- The per-account portrait limit is held in memory, so it resets when the server restarts — which
  free hosting does often. It slows one person down; it does not guarantee the cap.
- Storage is not part of the database cascade. Deleting a character removes its portrait, but
  deleting a whole user account in Supabase leaves their portrait folder behind.
- `/auth/token` signs in on the caller's behalf from this server's IP, so Supabase's per-IP auth
  rate limits apply to everyone using it at once. It exists for Swagger and scripts; the client
  never calls it.
- Two calls per turn means replies are slower than a plain chatbot. Reflection is trivially movable
  to a background job.
- Safety filters are relaxed to `BLOCK_ONLY_HIGH` so ordinary fiction (threats, lies, crime) is not
  filtered. A blocked response surfaces as a 422 rather than being retried.
- Swapping model providers means rewriting `services/ai/client.js` only — nothing else imports a
  model SDK. Swapping databases means rewriting `data/` and the auth middleware.
- Keyword retrieval misses paraphrase — "the storage building" will not match a memory that says
  "warehouse".
- Summarisation is one-way; detail folded into the summary cannot be recovered.
- Free hosting tiers sleep. The first request after idling pays a cold start.
