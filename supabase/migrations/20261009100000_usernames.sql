-- Every account must choose a username before contributing or creating a
-- machine. The username is what provenance shows ("Saul"): display_name now
-- simply follows it.

alter table public.profiles
  add column username text
    constraint username_format check (
      username is null
      or username ~ '^[A-Za-zÀ-ÖØ-öø-ÿ0-9]([A-Za-zÀ-ÖØ-öø-ÿ0-9 ._-]{0,28}[A-Za-zÀ-ÖØ-öø-ÿ0-9])?$'
    );

-- Case-insensitive uniqueness: "Saul" and "saul" are the same person.
create unique index profiles_username_key on public.profiles (lower(username));

-- Users set their username; display_name is derived, no longer writable.
revoke update (display_name) on public.profiles from authenticated;
grant update (username) on public.profiles to authenticated;

create function private.profiles_display_from_username()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.username is not null then
    new.display_name := new.username;
  end if;
  return new;
end;
$$;

create trigger profiles_display_from_username
before insert or update on public.profiles
for each row execute function private.profiles_display_from_username();

-- The rename sync must fire whatever column the UPDATE named (a column-list
-- trigger on display_name would miss updates that only set username).
drop trigger profiles_sync_source_label on public.profiles;
create trigger profiles_sync_source_label
after update on public.profiles
for each row execute function private.profiles_sync_source_label();

-- Fix: a person label other than the proposer's own name must not stay tied
-- to the proposer's account, or a later rename would overwrite it.
create or replace function private.contributions_fill_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposer_name text := (select p.display_name from public.profiles p where p.id = new.proposed_by);
begin
  new.source_label := nullif(btrim(coalesce(new.source_label, '')), '');

  if new.source_type = 'contributor' then
    if new.source_label is null then
      new.source_ref := new.proposed_by::text;
      new.source_label := v_proposer_name;
    elsif new.source_label is distinct from v_proposer_name then
      new.source_ref := null; -- another person, e.g. "Aude"
    else
      new.source_ref := new.proposed_by::text;
    end if;
  elsif new.source_label is null then
    raise exception 'a manual or document source needs a label' using errcode = '23514';
  else
    -- a manual or document is never an account
    if new.source_ref = new.proposed_by::text then
      new.source_ref := null;
    end if;
  end if;

  return new;
end;
$$;

-- Gate: no username, no contribution and no new machine. Triggers cover every
-- path (app, direct API calls, create_machine()).
create function private.require_username()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Same function on two tables: read the author column by name.
  v_user uuid := (to_jsonb(new) ->> case tg_table_name when 'contributions' then 'proposed_by' else 'created_by' end)::uuid;
begin
  if v_user is not null and not exists (
    select 1 from public.profiles p where p.id = v_user and p.username is not null
  ) then
    raise exception 'choose a username first' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger contributions_require_username
before insert on public.contributions
for each row execute function private.require_username();

create trigger machines_require_username
before insert on public.machines
for each row execute function private.require_username();
