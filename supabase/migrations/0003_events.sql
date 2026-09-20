-- A character's history: the moments worth remembering about the two of you.
--
-- Run after 0002_portraits.sql: Supabase dashboard -> SQL Editor -> paste -> Run.
--
-- One table, not one per feature. Relationship milestones, stage changes and
-- revealed secrets go here now; goal progress and the character's own events
-- will land in the same place, which is what makes a single timeline possible.

create table public.npc_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  npc_id          uuid not null references public.npcs (id) on delete cascade,
  -- Kept when the conversation is deleted: the moment still happened.
  conversation_id uuid references public.conversations (id) on delete set null,
  kind            text not null check (kind in (
                    'met', 'stage_change', 'secret_revealed',
                    'promise', 'disagreement', 'favour', 'milestone',
                    'goal_progress', 'event'
                  )),
  title           text not null check (char_length(title) between 1 and 160),
  detail          text not null default '',
  -- Room for a kind's own fields (stage names, goal id) without a migration.
  meta            jsonb not null default '{}',
  occurred_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index npc_events_npc_id_occurred_at_idx on public.npc_events (npc_id, occurred_at desc);

-- Meeting someone happens once.
create unique index npc_events_met_once on public.npc_events (npc_id) where kind = 'met';

revoke all on public.npc_events from anon;
grant select, insert, update, delete on public.npc_events to authenticated;

alter table public.npc_events enable row level security;

create policy "Owners manage their character events"
  on public.npc_events for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.npcs
      where npcs.id = npc_events.npc_id and npcs.user_id = (select auth.uid())
    )
    and (
      npc_events.conversation_id is null
      or exists (
        select 1 from public.conversations
        where conversations.id = npc_events.conversation_id
          and conversations.user_id = (select auth.uid())
      )
    )
  );
