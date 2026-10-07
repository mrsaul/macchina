-- End-to-end provenance: every contribution says where the knowledge comes
-- from — the contributor, another named person, a manual or a document.

create type public.contribution_source_type as enum ('contributor', 'manual', 'document');

alter table public.contributions
  add column source_type public.contribution_source_type not null default 'contributor',
  add column source_label text check (source_label is null or length(btrim(source_label)) between 1 and 80),
  -- user id (as text) for an account, document id for a document, null otherwise
  add column source_ref text check (source_ref is null or length(source_ref) <= 120);

-- Fills and checks the source on insert, and when the source is edited:
-- - contributor, no label  → the proposer: label from their profile, ref = their id;
-- - contributor, a label   → another person (e.g. "Aude", maybe without an
--                            account): kept as written, ref cleared unless it
--                            is the proposer (no pointing at other accounts);
-- - manual / document      → a label is required ("Manuel du moulin").
create function private.contributions_fill_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.source_label := nullif(btrim(coalesce(new.source_label, '')), '');

  if new.source_type = 'contributor' then
    if new.source_label is null then
      new.source_ref := new.proposed_by::text;
      new.source_label := (select p.display_name from public.profiles p where p.id = new.proposed_by);
    elsif new.source_ref is distinct from new.proposed_by::text then
      new.source_ref := null;
    end if;
  elsif new.source_label is null then
    raise exception 'a manual or document source needs a label' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger contributions_fill_source
before insert or update of source_type, source_label, source_ref on public.contributions
for each row execute function private.contributions_fill_source();

-- Renaming yourself renames you everywhere you are the source.
create function private.profiles_sync_source_label()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.display_name is distinct from old.display_name then
    update public.contributions
    set source_label = new.display_name
    where source_type = 'contributor' and source_ref = new.id::text;
  end if;
  return new;
end;
$$;

create trigger profiles_sync_source_label
after update of display_name on public.profiles
for each row execute function private.profiles_sync_source_label();

-- Existing rows: the proposer is the source.
update public.contributions c
set source_ref = c.proposed_by::text,
    source_label = (select p.display_name from public.profiles p where p.id = c.proposed_by)
where c.source_type = 'contributor' and c.source_label is null;
