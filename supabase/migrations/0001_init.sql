-- AI NPC Generator — initial schema.
--
-- Run once: Supabase dashboard -> SQL Editor -> paste this file -> Run.
-- (Or `supabase db push` if you use the Supabase CLI.)
--
-- Every row belongs to a user, and Row Level Security is enabled on every
-- table. The API queries *as the signed-in user*, so ownership is enforced by
-- Postgres itself: a filter missing from application code still cannot return
-- another user's rows.

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Characters
-- ---------------------------------------------------------------------------

create table public.npcs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,

  name            text not null check (char_length(name) between 1 and 120),
  age             integer check (age between 0 and 5000),
  occupation      text not null default '',
  setting         text not null default '',
  personality     text[] not null default '{}',
  background      text not null default '',
  motivations     text not null default '',
  goals           text not null default '',
  fears           text not null default '',
  -- "values" is an SQL keyword; the API still calls this field `values`.
  core_values     text not null default '',
  speech_style    text not null default '',

  -- [{ id, content, knownByPlayer, revealedAt }]. Character knowledge, not
  -- prompt material: the flag flips only when the character actually tells.
  secrets         jsonb not null default '[]' check (jsonb_typeof(secrets) = 'array'),

  -- One owner per character, so the relationship with "the player" is the
  -- relationship with the owner — it lives on the character row.
  relationship    jsonb not null default '{"trust": 50, "friendship": 20, "suspicion": 20, "fear": 0}',
  emotional_state jsonb not null default '{"label": "Neutral", "intensity": 20, "reason": ""}',

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- The API clamps these already; this is the backstop for anything that
  -- writes to the table without going through it.
  constraint relationship_in_range check (
        (relationship ->> 'trust')::numeric      between 0 and 100
    and (relationship ->> 'friendship')::numeric between 0 and 100
    and (relationship ->> 'suspicion')::numeric  between 0 and 100
    and (relationship ->> 'fear')::numeric       between 0 and 100
  )
);

create index npcs_user_id_created_at_idx on public.npcs (user_id, created_at desc);

create trigger npcs_set_updated_at
  before update on public.npcs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Conversations and their messages
-- ---------------------------------------------------------------------------

create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  npc_id           uuid not null references public.npcs (id) on delete cascade,
  title            text not null default 'New conversation',
  -- Rolling summary of everything older than the recent window, so a prompt
  -- never has to carry the whole transcript.
  summary          text not null default '',
  summarised_up_to integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index conversations_npc_id_updated_at_idx on public.conversations (npc_id, updated_at desc);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  -- Strict insertion order. created_at cannot order a transcript on its own:
  -- the two halves of an exchange are written back to back and can share a
  -- timestamp.
  seq             bigint generated always as identity,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'npc')),
  content         text not null,
  created_at      timestamptz not null default now()
);

create index messages_conversation_id_seq_idx on public.messages (conversation_id, seq);

-- ---------------------------------------------------------------------------
-- Long-term memory
-- ---------------------------------------------------------------------------

create table public.memories (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  npc_id             uuid not null references public.npcs (id) on delete cascade,
  conversation_id    uuid references public.conversations (id) on delete set null,
  content            text not null,
  -- How the character read the event, which is what keeps memory in character.
  npc_interpretation text not null default '',
  importance         text not null default 'medium' check (importance in ('low', 'medium', 'high')),
  source             text not null default 'conversation' check (source in ('conversation', 'manual', 'seed')),
  created_at         timestamptz not null default now()
);

create index memories_npc_id_created_at_idx on public.memories (npc_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

-- Signed-out visitors get nothing. Signed-in users get the table verbs, and
-- the policies below narrow every one of them to rows they own.
revoke all on public.npcs, public.conversations, public.messages, public.memories from anon;
grant select, insert, update, delete
  on public.npcs, public.conversations, public.messages, public.memories
  to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table public.npcs          enable row level security;
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
alter table public.memories      enable row level security;

create policy "Owners manage their characters"
  on public.npcs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Foreign keys are checked without RLS, so a child row must also prove its
-- parent belongs to the same user — otherwise a user could hang their own
-- conversation off someone else's character id.
create policy "Owners manage their conversations"
  on public.conversations for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.npcs
      where npcs.id = conversations.npc_id and npcs.user_id = (select auth.uid())
    )
  );

create policy "Owners manage their messages"
  on public.messages for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id and conversations.user_id = (select auth.uid())
    )
  );

create policy "Owners manage their memories"
  on public.memories for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.npcs
      where npcs.id = memories.npc_id and npcs.user_id = (select auth.uid())
    )
    and (
      memories.conversation_id is null
      or exists (
        select 1 from public.conversations
        where conversations.id = memories.conversation_id and conversations.user_id = (select auth.uid())
      )
    )
  );
