# AI NPC Generator — API

Create fictional characters with a personality, a private life, and a memory — then talk to them.
The goal is an NPC that behaves like a persistent character rather than a chatbot wearing a costume.

This is the API. The React interface lives in its own repo, at
[`../ai-npc-generator-client`](../ai-npc-generator-client).

## Stack

| Layer | Choice |
|---|---|
| Database | MongoDB + Mongoose (three collections) |
| API | Express 5 (ESM JavaScript, no build step) |
| Model | Google Gemini — `gemini-3.5-flash-lite` for both dialogue and state tracking |

## Running it

MongoDB must be running locally (`brew services start mongodb-community`).

```bash
npm install                    # installs server/
cp server/.env.example server/.env
# add your key to server/.env  ->  AI_API_KEY=...   (https://aistudio.google.com/apikey)
npm run seed                   # creates the Kevin Cross test character
npm run dev                    # http://localhost:4000
```

Without a key the API still runs — CRUD works and AI routes return a clear 503.

For the UI, clone the client repo alongside this one and run it too; it proxies `/api` here
automatically in development.

**Interactive API docs: <http://localhost:4000/api/docs>** — Swagger UI with every endpoint,
request/response schemas and working "Try it out" buttons. The raw spec is at
`/api/openapi.json` if you would rather import it into Postman or Insomnia.

### Environment

```env
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/ai-npc-generator
CLIENT_ORIGIN=                       # deployed client origin; empty allows any
AI_API_KEY=
AI_MODEL=gemini-3.5-flash-lite       # dialogue
AI_MODEL_FAST=gemini-3.5-flash-lite  # reflection + summarisation
```

Two model slots, because the two jobs are not the same job. Dialogue has to hold a character
together under pressure; reflection and summarisation are structured extraction. Both default to
Flash-Lite 3.5 ($0.30/$2.50 per MTok) — the 2.5 family is cheaper still but is closed to new API
keys, so it appears in the model catalogue and then 404s on use.

If a character feels flat or gives up secrets too easily, raise `AI_MODEL` to `gemini-3.5-flash` —
that is the knob that matters. Leave `AI_MODEL_FAST` alone; nothing it does needs a bigger model.

```bash
npm --prefix server run models   # list models, then call both configured ones to prove they work
```

That command probes by making a real one-token call, because listing a model is not the same as
being allowed to use it.

## API

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/npcs` | List characters |
| `POST` | `/api/npcs` | Create |
| `GET` | `/api/npcs/:id` | Read |
| `PUT` | `/api/npcs/:id` | Update |
| `DELETE` | `/api/npcs/:id` | Delete (cascades conversations + memories) |
| `POST` | `/api/npcs/generate` | Draft character fields from partial input |
| `POST` | `/api/npcs/:id/reset` | Reset state, memories, conversations (test helper) |
| `GET` | `/api/npcs/:id/memories` | Long-term memories |
| `GET` | `/api/npcs/:id/conversations` | Conversation list |
| `POST` | `/api/npcs/:id/conversations` | Start a conversation |
| `GET` | `/api/npcs/:id/conversations/:conversationId` | Full transcript |
| `POST` | `/api/npcs/:id/chat` | Send a message, get an in-character reply |
| `GET` | `/api/options` | Suggested traits + emotion vocabulary |

`generate` has no `:id` because the Creator uses it *before* the character exists.

## How it works

### Context

`services/ai/promptBuilder.js` assembles the system prompt in four layers:

1. **Behaviour rules + dossier** — identity, personality, background, goals, fears, motivations,
   values, speech style.
2. **Private knowledge** — secrets, with rules that make disclosure a character decision.
3. **Current state** — emotion and the four relationship values, rendered as prose bands
   (`Trust 62/100 — you trust them conditionally`) rather than raw numbers to act on.
4. **Retrieved memories** and the rolling conversation summary.

Layers 1–2 are byte-identical between turns and marked cacheable; the volatile layer follows so a
state change never invalidates the dossier prefix.

History is **not** concatenated forever: the last 12 messages go verbatim, and anything older is
folded into `conversation.summary` once the transcript passes 20 messages. Prompt size is bounded
no matter how long a conversation runs.

### Memory

Two tiers. Short-term is the recent message window. Long-term is the `Memory` collection, written
only when something is actually worth remembering.

Retrieval scores every memory by `importance × 2 + recency × 2 + keyword overlap × 3` and takes the
top 6. With tens of memories per NPC this is exact and instant; it is also the single function to
replace if embeddings are ever needed.

### The chat turn

Each turn makes **two** model calls:

1. **Reply** — the in-character response, on `AI_MODEL` at temperature 0.95.
2. **Reflection** — a separate JSON-schema-constrained call on the cheaper `AI_MODEL_FAST` at
   temperature 0.2, returning candidate memories, relationship deltas, an emotion, and any secret
   the character actually gave away.

Gemini's constrained decoding is not trusted on its own: the JSON is re-parsed and validated
against the same Zod schema before anything touches the database.

Keeping them apart means structured state can never leak into dialogue. Reflection is best-effort:
if it fails, the player still gets their reply and the turn is logged.

### Relationships and emotion

The model proposes; the backend decides. In `services/ai/relationshipService.js`:

- non-numeric deltas are dropped,
- each axis is capped at ±20 per turn,
- results are clamped to 0–100,
- emotion labels must come from the known vocabulary,
- a secret flips to `knownByPlayer` only if the model names an existing, still-hidden secret.

`{ trust: -900 }` moves trust by −20.

## Testing NPC behaviour

```bash
npm run seed                     # fresh Kevin Cross
npm --prefix server run test     # needs the server running
```

The harness walks the full matrix from the spec — consistency, memory across conversations,
secret-keeping under direct questioning, relationship movement after a lie, emotional change under
threat, and knowledge boundaries — printing each reply alongside the state it produced.

For persistence: restart everything and reopen the dossier. NPCs, transcripts, memories and
relationship values are all in MongoDB.

## Layout

```
server/src/
  models/       Npc, Conversation, Memory
  routes/       one router
  controllers/  npcController, chatController
  services/ai/  client (the only file that touches a model SDK), promptBuilder,
                npcService, memoryService, relationshipService
  constants.js  emotions, traits, tuning knobs
  docs/         openapi.js — the API spec behind /api/docs
```

The React client is a separate repo: [`../ai-npc-generator-client`](../ai-npc-generator-client).

## Deploying it free

Two deploys, because the client is its own repo: a static site for the UI, a web service for this.

**Database — [MongoDB Atlas](https://www.mongodb.com/pricing) M0.** Free forever, 512 MB, no card
required. Create a cluster, add `0.0.0.0/0` to the IP allowlist (your host's IP is not fixed), and
copy the connection string into `MONGODB_URI`.

**API — [Render](https://render.com) free web service.** Connect the repo, no card, no Dockerfile.

| Setting | Value |
|---|---|
| Build command | `npm install` |
| Start command | `npm start` |
| Environment | `MONGODB_URI`, `AI_API_KEY`, `AI_MODEL`, `AI_MODEL_FAST`, `CLIENT_ORIGIN` |

**Client — Vercel, Netlify or Cloudflare Pages**, from the client repo. See its README.

The two halves have to know about each other: set `VITE_API_URL` on the client to this API's URL,
and `CLIENT_ORIGIN` here to the client's URL. Miss the second and CORS blocks every request.

The catch is a 30–60 second cold start after inactivity — fine for a demo, irritating in a live
demo. [Koyeb](https://www.koyeb.com)'s free tier (1 vCPU / 512 MB, scale-to-zero, does not expire)
is the better pick if that bothers you; it asks for a card for fraud verification but does not
charge. Avoid Railway (its $1/month credit runs out in days) and Fly.io (no free tier for new
accounts since 2026).

Do **not** commit `.env` — it is already gitignored. Set the key in the host's environment panel.

## Limitations

- One implicit player, so `relationship` and `emotionalState` are embedded on the NPC. Multiple
  players would need a separate collection keyed by player.
- Two calls per turn means replies are slower than a plain chatbot. Reflection is trivially movable
  to a background job.
- Safety filters are relaxed to `BLOCK_ONLY_HIGH` so ordinary fiction (threats, lies, crime) is not
  filtered. A blocked response surfaces as a 422 rather than being retried.
- Swapping providers means rewriting `services/ai/client.js` only — nothing else in the codebase
  imports a model SDK.
- Keyword retrieval misses paraphrase — "the storage building" will not match a memory that says
  "warehouse".
- Summarisation is one-way; detail folded into the summary cannot be recovered.
- No auth, no rate limiting. Anyone who can reach a deployed instance can spend your API budget —
  keep the URL private, or put auth in front of it before sharing.
- Free hosting tiers sleep. The first request after idling pays a cold start.
