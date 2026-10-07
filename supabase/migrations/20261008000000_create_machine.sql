-- "Ajouter une machine": any signed-in user can create a machine and becomes
-- its maintainer. Clients still cannot write machines or memberships
-- directly; creation goes through create_machine(), which does both inserts
-- atomically with the caller's identity.

alter table public.machines
  add column type text not null default 'roaster'
    check (type in ('roaster', 'grinder', 'espresso', 'other')),
  add column description text check (description is null or length(description) <= 280),
  add column created_by uuid default auth.uid() references auth.users (id) on delete set null;

create index machines_created_by_idx on public.machines (created_by, created_at);

-- "Mahlkönig EK43 S" → "mahlkonig-ek43-s"
create function private.slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      left(
        trim(both '-' from regexp_replace(
          translate(lower(p_text), 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿß', 'aaaaaaceeeeiiiinooooouuuuyys'),
          '[^a-z0-9]+', '-', 'g')),
        48),
      ''),
    'machine');
$$;

create function public.create_machine(
  p_brand text,
  p_model text,
  p_type text,
  p_description text,
  p_pack jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_brand text := btrim(p_brand);
  v_model text := btrim(p_model);
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_base text;
  v_id text;
  v_n int := 1;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if coalesce(length(v_brand), 0) not between 1 and 60 or coalesce(length(v_model), 0) not between 1 and 60 then
    raise exception 'brand and model must be 1 to 60 characters' using errcode = '22023';
  end if;
  if coalesce(p_type, '') not in ('roaster', 'grinder', 'espresso', 'other') then
    raise exception 'unknown machine type' using errcode = '22023';
  end if;
  if jsonb_typeof(p_pack) is distinct from 'object' or pg_column_size(p_pack) > 100000 then
    raise exception 'invalid pack' using errcode = '22023';
  end if;
  -- Abuse guard: the route also rate-limits, but this holds for direct RPC calls.
  if (select count(*) from public.machines
      where created_by = v_uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'too many machines created today' using errcode = 'P0001';
  end if;

  v_base := private.slugify(v_brand || ' ' || v_model);
  v_id := v_base;
  while exists (select 1 from public.machines where id = v_id) loop
    v_n := v_n + 1;
    v_id := v_base || '-' || v_n;
  end loop;

  -- The pack's identity always matches the row, whatever the client sent.
  insert into public.machines (id, brand, model, type, description, pack, created_by)
  values (
    v_id, v_brand, v_model, p_type, v_description,
    p_pack || jsonb_build_object('id', v_id, 'brand', v_brand, 'model', v_model, 'type', p_type),
    v_uid
  );
  insert into public.memberships (user_id, machine_id, role) values (v_uid, v_id, 'maintainer');

  return v_id;
end;
$$;

revoke all on function public.create_machine(text, text, text, text, jsonb) from public, anon;
grant execute on function public.create_machine(text, text, text, text, jsonb) to authenticated;
