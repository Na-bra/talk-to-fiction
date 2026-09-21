-- What a character is actually trying to do, and how far along they are.
--
-- Run after 0003_events.sql: Supabase dashboard -> SQL Editor -> paste -> Run.
--
-- The character sheet's `goals` stays as it is: prose the author wrote. This
-- is the tracked version — one row per pursuit, with the objective in front of
-- them and what stands in the way. Conversations move the progress; the
-- backend decides by how much.

create table public.npc_goals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  npc_id            uuid not null references public.npcs (id) on delete cascade,

  title             text not null check (char_length(title) between 1 and 160),
  current_objective text not null default '',
  obstacle          text not null default '',
  progress          integer not null default 0 check (progress between 0 and 100),
  status            text not null default 'active' check (status in ('active', 'achieved', 'abandoned')),
  -- Author's ordering; ties fall back to creation time.
  sort              integer not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index npc_goals_npc_id_status_idx on public.npc_goals (npc_id, status, sort, created_at);

create trigger npc_goals_set_updated_at
  before update on public.npc_goals
  for each row execute function public.set_updated_at();

revoke all on public.npc_goals from anon;
grant select, insert, update, delete on public.npc_goals to authenticated;

alter table public.npc_goals enable row level security;

create policy "Owners manage their character goals"
  on public.npc_goals for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.npcs
      where npcs.id = npc_goals.npc_id and npcs.user_id = (select auth.uid())
    )
  );
