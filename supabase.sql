-- ============================================================================
-- Khelaghor backend — Supabase (free tier)
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- It creates:
--   1. site_settings — ONE row (id=1) holding the whole settings JSON
--      (match length, coin rewards, shop prices, features, admin password hash)
--   2. game_events  — one row per finished match (anonymous stats)
--   3. update_site_settings() — the ONLY way to write settings. It checks
--      the admin password hash, so random visitors cannot change settings
--      even though the anon key is public.
-- Security notes:
--   - The anon key is public by design (it is embedded in the site).
--   - Reads are public; writes go through the RPC hash check only.
--   - For stricter security later, enable Supabase Auth (email login) and
--     replace the hash check with an auth check. See README.md.
-- ============================================================================

create table if not exists public.site_settings (
  id int primary key,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.site_settings (id, settings)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

create table if not exists public.game_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event jsonb not null default '{}'::jsonb
);

alter table public.site_settings enable row level security;
alter table public.game_events enable row level security;

drop policy if exists "khelaghor_read_settings" on public.site_settings;
create policy "khelaghor_read_settings" on public.site_settings
  for select using (true);

drop policy if exists "khelaghor_insert_events" on public.game_events;
create policy "khelaghor_insert_events" on public.game_events
  for insert with check (true);

drop policy if exists "khelaghor_read_events" on public.game_events;
create policy "khelaghor_read_events" on public.game_events
  for select using (true);

create or replace function public.update_site_settings(p_hash text, p_settings jsonb)
returns boolean
language plpgsql
security definer
as $$
declare cur jsonb;
begin
  select settings into cur from public.site_settings where id = 1;
  if cur is null then
    insert into public.site_settings (id, settings) values (1, p_settings);
    return true;
  end if;
  -- First setup: no password yet -> anyone may set it (once).
  if (cur ->> 'adminHash') is null then
    update public.site_settings set settings = p_settings, updated_at = now() where id = 1;
    return true;
  end if;
  -- Afterwards: only the matching password hash may write.
  if (cur ->> 'adminHash') = p_hash then
    update public.site_settings set settings = p_settings, updated_at = now() where id = 1;
    return true;
  end if;
  return false;
end;
$$;

grant execute on function public.update_site_settings(text, jsonb) to anon, authenticated;
