begin;

-- TITAN OS - Server-side wager challenge creation.
-- Purpose: debit wager credits atomically when a connected user creates a paid challenge.

create extension if not exists pgcrypto;

alter table if exists public.profiles
  add column if not exists credits integer not null default 0;

create table if not exists public.social_challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references auth.users(id) on delete cascade,
  opponent_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'wager',
  sport text,
  stake integer not null default 0,
  status text not null default 'pending',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.social_challenges enable row level security;
revoke all on public.social_challenges from anon;
grant select, insert, update on public.social_challenges to authenticated;

drop policy if exists "social_challenges_select_involved" on public.social_challenges;
drop policy if exists "social_challenges_insert_own" on public.social_challenges;
drop policy if exists "social_challenges_update_involved" on public.social_challenges;
drop policy if exists "social_challenges_involved_select" on public.social_challenges;
drop policy if exists "social_challenges_challenger_insert" on public.social_challenges;
drop policy if exists "social_challenges_involved_update" on public.social_challenges;

create policy "social_challenges_select_involved"
on public.social_challenges
for select
to authenticated
using (challenger_id = auth.uid() or opponent_id = auth.uid());

create policy "social_challenges_insert_own"
on public.social_challenges
for insert
to authenticated
with check (challenger_id = auth.uid());

create policy "social_challenges_update_involved"
on public.social_challenges
for update
to authenticated
using (challenger_id = auth.uid() or opponent_id = auth.uid())
with check (challenger_id = auth.uid() or opponent_id = auth.uid());

create or replace function public.titan_create_wager_challenge(
  p_opponent_id uuid,
  p_sport text,
  p_stake integer default 50
)
returns table (
  challenge_id uuid,
  credits_after integer,
  stake integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_stake integer := greatest(0, least(coalesce(p_stake, 50), 500));
  v_credits integer;
  v_expires_at timestamptz := now() + interval '24 hours';
  v_challenge_id uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_opponent_id is null or p_opponent_id = v_uid then
    raise exception 'INVALID_OPPONENT' using errcode = '22023';
  end if;

  if v_stake <= 0 then
    raise exception 'INVALID_STAKE' using errcode = '22023';
  end if;

  select coalesce(p.credits, 0)::integer
  into v_credits
  from public.profiles p
  where p.id = v_uid
  for update;

  if not found then
    raise exception 'PROFILE_MISSING' using errcode = '42501';
  end if;

  if v_credits < v_stake then
    raise exception 'NO_FUNDS' using errcode = '23514';
  end if;

  update public.profiles as p
  set credits = v_credits - v_stake
  where p.id = v_uid
  returning p.credits::integer into v_credits;

  insert into public.social_challenges(challenger_id, opponent_id, type, sport, stake, status, expires_at)
  values (v_uid, p_opponent_id, 'wager', left(coalesce(p_sport, 'mixed'), 40), v_stake, 'pending', v_expires_at)
  returning id into v_challenge_id;

  return query
  select v_challenge_id, v_credits, v_stake, v_expires_at;
end;
$$;

revoke all on function public.titan_create_wager_challenge(uuid, text, integer) from public;
grant execute on function public.titan_create_wager_challenge(uuid, text, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
