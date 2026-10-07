-- Contribution flow: public display names for provenance, and Realtime on
-- contributions so the Journal updates live.

-- ---------------------------------------------------------------------------
-- Profiles: the only user data shown publicly ("proposé par / validé par").
-- Emails never leave auth.users; the default name is derived from the id.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 60),
  created_at   timestamptz not null default now()
);

create function private.default_display_name(p_user_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'Contributeur ' || upper(left(replace(p_user_id::text, '-', ''), 4));
$$;

-- Every new account gets a profile.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, private.default_display_name(new.id))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- Accounts created before this migration.
insert into public.profiles (id, display_name)
select u.id, private.default_display_name(u.id)
from auth.users u
on conflict (id) do nothing;

alter table public.profiles enable row level security;

revoke insert, delete, truncate on public.profiles from anon, authenticated;
revoke update on public.profiles from anon;
-- Users may only ever change their display name.
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy "profiles: anyone can read display names"
on public.profiles for select
to anon, authenticated
using (true);

create policy "profiles: users rename themselves"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Realtime: stream contribution changes. Realtime applies the same RLS
-- policies per subscriber, so visitors only receive approved rows.
-- Guarded so the migration also runs where the publication does not exist
-- (local tests).
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.contributions;
  end if;
end;
$$;
