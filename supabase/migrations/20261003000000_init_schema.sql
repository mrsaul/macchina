-- Roast Copilot — initial schema: machines, contributions, memberships + RLS.
--
-- Access model (see CLAUDE.md):
--   - approved contributions are readable by everyone, including anonymous users;
--   - contributors and maintainers of a machine can propose contributions;
--   - only maintainers can review (approve / reject) or edit a contribution;
--   - a contributor always sees their own proposals, whatever their status.
-- Roles are per machine, stored in memberships.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.contribution_status as enum ('proposed', 'approved', 'rejected');
create type public.member_role as enum ('reader', 'contributor', 'maintainer');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per machine. `pack` is a copy of the versioned JSON pack from
-- packs/<id>.json (Git stays the source of truth; see supabase/seed.sql).
create table public.machines (
  id         text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  brand      text not null,
  model      text not null,
  pack       jsonb not null check (jsonb_typeof(pack) = 'object'),
  created_at timestamptz not null default now()
);

create table public.contributions (
  id          uuid primary key default gen_random_uuid(),
  machine_id  text not null references public.machines (id) on delete cascade,
  text        text not null check (length(btrim(text)) > 0),
  section     text,
  safety      boolean not null default false,
  status      public.contribution_status not null default 'proposed',
  proposed_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reviewed_by uuid references auth.users (id) on delete set null,
  reason      text,
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  -- A rejection must be explained to the contributor.
  constraint rejected_needs_reason check (status <> 'rejected' or reason is not null),
  -- Review metadata only exists once a contribution has been reviewed.
  constraint reviewed_at_matches_status check ((status = 'proposed') = (reviewed_at is null))
);

create index contributions_machine_status_idx on public.contributions (machine_id, status);
create index contributions_proposed_by_idx on public.contributions (proposed_by);

create table public.memberships (
  user_id    uuid not null references auth.users (id) on delete cascade,
  machine_id text not null references public.machines (id) on delete cascade,
  role       public.member_role not null default 'reader',
  primary key (user_id, machine_id)
);

create index memberships_machine_idx on public.memberships (machine_id);

-- ---------------------------------------------------------------------------
-- Role helper
-- ---------------------------------------------------------------------------

-- Lives outside the API-exposed `public` schema so it cannot be called over
-- PostgREST. SECURITY DEFINER lets policies read memberships without
-- recursing into memberships' own RLS.
create schema if not exists private;

create function private.has_machine_role(p_machine_id text, p_roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.machine_id = p_machine_id
      and m.role = any (p_roles)
  );
$$;

revoke all on function private.has_machine_role(text, public.member_role[]) from public;
grant usage on schema private to authenticated;
grant execute on function private.has_machine_role(text, public.member_role[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Review bookkeeping
-- ---------------------------------------------------------------------------

-- RLS decides *who* may update; this trigger keeps the row consistent:
-- identity columns are immutable and review metadata is set by the server,
-- never trusted from the client.
create function private.contributions_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id
     or new.machine_id <> old.machine_id
     or new.proposed_by <> old.proposed_by
     or new.created_at <> old.created_at then
    raise exception 'id, machine_id, proposed_by and created_at are immutable'
      using errcode = 'check_violation';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'proposed' then
      new.reviewed_by := null;
      new.reviewed_at := null;
    else
      new.reviewed_by := (select auth.uid());
      new.reviewed_at := now();
    end if;
  else
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  end if;

  return new;
end;
$$;

create trigger contributions_before_update
before update on public.contributions
for each row execute function private.contributions_before_update();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.machines enable row level security;
alter table public.contributions enable row level security;
alter table public.memberships enable row level security;

-- Defense in depth: clients never write machines or memberships, and never
-- delete contributions. Those go through the service role / migrations.
revoke insert, update, delete, truncate on public.machines from anon, authenticated;
revoke insert, update, delete, truncate on public.memberships from anon, authenticated;
revoke insert, update, delete, truncate on public.contributions from anon;
revoke delete, truncate on public.contributions from authenticated;

-- machines ------------------------------------------------------------------

create policy "machines: anyone can read"
on public.machines for select
to anon, authenticated
using (true);

-- contributions: read -------------------------------------------------------

create policy "contributions: anyone can read approved"
on public.contributions for select
to anon, authenticated
using (status = 'approved');

create policy "contributions: authors read their own"
on public.contributions for select
to authenticated
using (proposed_by = (select auth.uid()));

-- Maintainers must see pending proposals to review them.
create policy "contributions: maintainers read all for their machine"
on public.contributions for select
to authenticated
using (private.has_machine_role(machine_id, array['maintainer']::public.member_role[]));

-- contributions: write ------------------------------------------------------

create policy "contributions: contributors and maintainers propose"
on public.contributions for insert
to authenticated
with check (
  status = 'proposed'
  and proposed_by = (select auth.uid())
  and reviewed_by is null
  and reviewed_at is null
  and private.has_machine_role(machine_id, array['contributor', 'maintainer']::public.member_role[])
);

-- Covers review (status change) and text edits. Contributors have no update
-- policy, so they cannot edit or self-approve their proposals.
create policy "contributions: maintainers review and edit"
on public.contributions for update
to authenticated
using (private.has_machine_role(machine_id, array['maintainer']::public.member_role[]))
with check (private.has_machine_role(machine_id, array['maintainer']::public.member_role[]));

-- memberships ---------------------------------------------------------------

create policy "memberships: users read their own"
on public.memberships for select
to authenticated
using (user_id = (select auth.uid()));

create policy "memberships: maintainers read their machine's members"
on public.memberships for select
to authenticated
using (private.has_machine_role(machine_id, array['maintainer']::public.member_role[]));
