// RLS tests: runs the real migration + seed in PGlite (Postgres in WASM, no
// Docker needed) behind a minimal Supabase stand-in, then checks every policy
// as each role. Run with `npm run test:db`.

import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const migrations = readdirSync(`${ROOT}/migrations`)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(`${ROOT}/migrations/${f}`, "utf8"));
const seed = readFileSync(`${ROOT}/seed.sql`, "utf8");

const db = new PGlite();

// --- Minimal Supabase stand-in ------------------------------------------------
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);

for (const migration of migrations) await db.exec(migration);
await db.exec(seed);
await db.exec(seed); // idempotent

const U = {
  maint: "00000000-0000-0000-0000-00000000000a",
  contrib: "00000000-0000-0000-0000-00000000000c",
  reader: "00000000-0000-0000-0000-00000000000d",
  outsider: "00000000-0000-0000-0000-00000000000e",
  otherContrib: "00000000-0000-0000-0000-00000000000f",
  noname: "00000000-0000-0000-0000-000000000010", // contributor who never chose a username
};

await db.exec(`
  insert into auth.users values ${Object.values(U).map((u) => `('${u}')`).join(",")};
  -- Everyone but "outsider" and "noname" has chosen a username.
  update public.profiles set username = case id
    when '${U.maint}' then 'Maint' when '${U.contrib}' then 'Contrib'
    when '${U.reader}' then 'Reader' when '${U.otherContrib}' then 'Other' end
  where id in ('${U.maint}', '${U.contrib}', '${U.reader}', '${U.otherContrib}');
  insert into public.machines (id, brand, model, pack) values ('other-machine', 'X', 'Y', '{}');
  insert into public.memberships values
    ('${U.maint}', 'stronghold-s7x', 'maintainer'),
    ('${U.contrib}', 'stronghold-s7x', 'contributor'),
    ('${U.reader}', 'stronghold-s7x', 'reader'),
    ('${U.otherContrib}', 'other-machine', 'contributor'),
    ('${U.noname}', 'stronghold-s7x', 'contributor');
  insert into public.contributions (id, machine_id, text, status, proposed_by, reviewed_by, reason, reviewed_at) values
    ('10000000-0000-0000-0000-000000000001', 'stronghold-s7x', 'approved one', 'approved', '${U.contrib}', '${U.maint}', null, now()),
    ('10000000-0000-0000-0000-000000000002', 'stronghold-s7x', 'pending one', 'proposed', '${U.contrib}', null, null, null),
    ('10000000-0000-0000-0000-000000000003', 'stronghold-s7x', 'rejected one', 'rejected', '${U.contrib}', '${U.maint}', 'dup', now()),
    ('10000000-0000-0000-0000-000000000004', 'other-machine', 'other pending', 'proposed', '${U.otherContrib}', null, null, null);
`);

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  -> ${detail}`}`);
};

async function as(user, sql, params) {
  await db.exec("reset role");
  if (user === "anon") {
    await db.exec(`select set_config('request.jwt.claim.sub', '', false); set role anon;`);
  } else {
    await db.exec(`select set_config('request.jwt.claim.sub', '${U[user]}', false); set role authenticated;`);
  }
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}

async function denied(user, sql) {
  try {
    const r = await as(user, sql);
    return { denied: (r.affectedRows ?? 0) === 0, msg: `affected ${r.affectedRows}` };
  } catch (e) {
    return { denied: true, msg: e.message };
  }
}

const texts = (r) => r.rows.map((x) => x.text).sort().join(" | ");
const SEL = "select text from public.contributions";

// --- Reads ---------------------------------------------------------------------
let r = await as("anon", "select id from public.machines order by id");
check("anon reads machines", r.rows.length === 2);

r = await as("anon", "select pack->>'model' as m from public.machines where id='stronghold-s7x'");
check("seed imported the S7X pack", r.rows[0]?.m === "S7X");

r = await as("anon", SEL);
check("anon sees only approved", texts(r) === "approved one", texts(r));

r = await as("outsider", SEL);
check("logged-in outsider sees only approved", texts(r) === "approved one", texts(r));

r = await as("reader", SEL);
check("reader sees only approved", texts(r) === "approved one", texts(r));

r = await as("contrib", SEL);
check("contributor sees approved + all own (any status)", texts(r) === "approved one | pending one | rejected one", texts(r));

r = await as("otherContrib", SEL);
check("other contributor sees approved + own only", texts(r) === "approved one | other pending", texts(r));

r = await as("maint", SEL);
check("maintainer sees everything on own machine only", texts(r) === "approved one | pending one | rejected one", texts(r));

// --- Inserts -------------------------------------------------------------------
const ins = (machine = "stronghold-s7x", extra = "") =>
  `insert into public.contributions (machine_id, text, section, safety${extra ? ", " + extra.split("=")[0] : ""})
   values ('${machine}', 'new', 'profiles', true${extra ? ", " + extra.split("=")[1] : ""})`;

let d = await denied("anon", ins());
check("anon cannot propose", d.denied, d.msg);
d = await denied("outsider", ins());
check("outsider (no membership) cannot propose", d.denied, d.msg);
d = await denied("reader", ins());
check("reader cannot propose", d.denied, d.msg);

r = await as("contrib", ins() + " returning proposed_by, status");
check("contributor can propose (proposed_by defaults to self)", r.rows[0]?.proposed_by === U.contrib && r.rows[0]?.status === "proposed");

r = await as("maint", ins() + " returning status");
check("maintainer can propose", r.rows[0]?.status === "proposed");

d = await denied("contrib", ins("stronghold-s7x", "status='approved'"));
check("contributor cannot insert as approved", d.denied, d.msg);
d = await denied("contrib", ins("stronghold-s7x", `proposed_by='${U.maint}'`));
check("contributor cannot propose on behalf of someone else", d.denied, d.msg);
d = await denied("contrib", ins("other-machine"));
check("contributor cannot propose on a machine they are not a member of", d.denied, d.msg);

// --- Updates -------------------------------------------------------------------
const P = "'10000000-0000-0000-0000-000000000002'";
d = await denied("contrib", `update public.contributions set text='hacked' where id=${P}`);
check("contributor cannot edit own proposal", d.denied, d.msg);
d = await denied("contrib", `update public.contributions set status='approved' where id=${P}`);
check("contributor cannot self-approve", d.denied, d.msg);
d = await denied("reader", `update public.contributions set status='approved' where id=${P}`);
check("reader cannot approve", d.denied, d.msg);

d = await denied("reader", `update public.contributions set text='edited by reader' where id='10000000-0000-0000-0000-000000000001'`);
check("reader cannot edit an approved contribution", d.denied, d.msg);
d = await denied("reader", `delete from public.contributions where id='10000000-0000-0000-0000-000000000001'`);
check("reader cannot delete a contribution", d.denied, d.msg);

d = await denied("maint", `update public.contributions set status='rejected' where id=${P}`);
check("rejection without reason is refused", d.denied, d.msg);

r = await as("maint", `update public.contributions set status='approved', reviewed_by='${U.contrib}', reviewed_at='2000-01-01' where id=${P} returning reviewed_by, reviewed_at`);
check("maintainer approves; reviewed_by/at forced server-side",
  r.rows[0]?.reviewed_by === U.maint && new Date(r.rows[0]?.reviewed_at).getFullYear() > 2000, JSON.stringify(r.rows[0]));

r = await as("anon", SEL);
check("approved proposal becomes public", texts(r) === "approved one | pending one", texts(r));

r = await as("maint", `update public.contributions set text='edited by maintainer' where id=${P} returning text, reviewed_by`);
check("maintainer can edit text (review metadata kept)", r.rows[0]?.text === "edited by maintainer" && r.rows[0]?.reviewed_by === U.maint);

d = await denied("maint", `update public.contributions set proposed_by='${U.maint}' where id=${P}`);
check("proposed_by is immutable", d.denied, d.msg);
d = await denied("maint", `update public.contributions set machine_id='other-machine' where id=${P}`);
check("maintainer cannot move a contribution to another machine", d.denied, d.msg);
d = await denied("maint", `update public.contributions set status='approved' where id='10000000-0000-0000-0000-000000000004'`);
check("maintainer cannot review another machine's contributions", d.denied, d.msg);

r = await as("maint", `update public.contributions set status='rejected', reason='hors sujet' where id='10000000-0000-0000-0000-000000000003' returning status`);
check("maintainer can reject with a reason", r.rows[0]?.status === "rejected");

// --- Deletes / memberships -----------------------------------------------------
d = await denied("maint", `delete from public.contributions where id=${P}`);
check("nobody deletes contributions from the client", d.denied, d.msg);

r = await as("contrib", "select role from public.memberships");
check("contributor sees only own membership", r.rows.length === 1 && r.rows[0].role === "contributor");
r = await as("maint", "select user_id from public.memberships");
check("maintainer sees their machine's members only", r.rows.length === 4, r.rows.length);
r = await as("anon", "select * from public.memberships");
check("anon sees no memberships", r.rows.length === 0);

d = await denied("contrib", `insert into public.memberships values ('${U.contrib}', 'other-machine', 'maintainer')`);
check("cannot grant yourself a role", d.denied, d.msg);
d = await denied("contrib", `update public.memberships set role='maintainer' where user_id='${U.contrib}'`);
check("cannot promote yourself", d.denied, d.msg);
d = await denied("contrib", `update public.machines set pack='{}'`);
check("clients cannot modify machines", d.denied, d.msg);

// --- Profiles (provenance display names) ------------------------------------
r = await as("anon", "select id, display_name, username from public.profiles order by id");
check("every account got a profile, readable by anyone", r.rows.length === Object.keys(U).length);
check("default name does not leak anything but an id prefix",
  r.rows.find((p) => p.id === U.outsider)?.display_name === "Contributeur 0000" && r.rows.find((p) => p.id === U.outsider)?.username === null,
  JSON.stringify(r.rows.find((p) => p.id === U.outsider)));

r = await as("contrib", `update public.profiles set username='Saul' where id='${U.contrib}' returning display_name`);
check("users choose their username; display name follows", r.rows[0]?.display_name === "Saul", JSON.stringify(r.rows[0]));
d = await denied("contrib", `update public.profiles set username='Hacked' where id='${U.maint}'`);
check("users cannot rename someone else", d.denied, d.msg);
d = await denied("outsider", `update public.profiles set username='saul' where id='${U.outsider}'`);
check("usernames are unique, case-insensitively", d.denied, d.msg);
d = await denied("outsider", `update public.profiles set username='-x-' where id='${U.outsider}'`);
check("malformed username is refused", d.denied, d.msg);
d = await denied("contrib", `update public.profiles set display_name='Bypass' where id='${U.contrib}'`);
check("display name cannot be set directly", d.denied, d.msg);
r = await as("outsider", `update public.profiles set username='Aude Martin' where id='${U.outsider}' returning display_name`);
check("accents and spaces allowed in usernames", r.rows[0]?.display_name === "Aude Martin", JSON.stringify(r.rows[0]));

d = await denied("noname", `insert into public.contributions (machine_id, text) values ('stronghold-s7x', 'x')`);
check("no username, no contribution", d.denied, d.msg);
d = await denied("contrib", `update public.profiles set id='${U.reader}' where id='${U.contrib}'`);
check("profile id is not writable", d.denied, d.msg);
d = await denied("contrib", `insert into public.profiles values ('${U.reader}', 'x', now())`);
check("clients cannot create profiles", d.denied, d.msg);
d = await denied("anon", `update public.profiles set display_name='x'`);
check("anon cannot rename anyone", d.denied, d.msg);

// --- create_machine() ------------------------------------------------------
const create = (brand, model, type = "grinder", pack = `'{"version":"0.1.0","id":"spoofed"}'::jsonb`) =>
  `select public.create_machine('${brand}', '${model}', '${type}', 'Moulin du labo', ${pack}) as id`;

d = await denied("anon", create("Mahlkönig", "EK43 S"));
check("anon cannot create a machine", d.denied, d.msg);

r = await as("reader", create("Mahlkönig", "EK43 S"));
const newId = r.rows[0]?.id;
check("signed-in user creates a machine with a clean slug", newId === "mahlkonig-ek43-s", newId);

r = await as("reader", `select role from public.memberships where machine_id='${newId}'`);
check("creator becomes maintainer of the new machine", r.rows[0]?.role === "maintainer", JSON.stringify(r.rows));

r = await as("anon", `select type, created_by, pack->>'id' as pack_id, pack->>'type' as pack_type from public.machines where id='${newId}'`);
check("new machine is publicly readable, typed, pack id forced to the row id",
  r.rows[0]?.type === "grinder" && r.rows[0]?.pack_id === newId && r.rows[0]?.pack_type === "grinder" && r.rows[0]?.created_by === U.reader,
  JSON.stringify(r.rows[0]));

r = await as("reader", create("Mahlkönig", "EK43 S"));
check("same name gets a suffixed id", r.rows[0]?.id === "mahlkonig-ek43-s-2", r.rows[0]?.id);

d = await denied("reader", create("Mahlkönig", "X", "toaster"));
check("unknown type is refused", d.denied, d.msg);
d = await denied("reader", `select public.create_machine(null, 'X', 'grinder', null, '{}'::jsonb)`);
check("missing brand is refused", d.denied, d.msg);
d = await denied("reader", create("Brand", "Model", "grinder", `'[1,2]'::jsonb`));
check("non-object pack is refused", d.denied, d.msg);

for (const m of ["A", "B", "C"]) await as("reader", create("Daily", m));
d = await denied("reader", create("Daily", "D"));
check("6th machine in a day is refused", d.denied, d.msg);

d = await denied("noname", create("No", "Name"));
check("no username, no new machine", d.denied, d.msg);

d = await denied("reader", `insert into public.machines (id, brand, model, pack) values ('direct', 'x', 'y', '{}')`);
check("direct machine insert is still refused", d.denied, d.msg);

// --- Contribution sources ---------------------------------------------------
const src = (extra) =>
  `insert into public.contributions (machine_id, text${extra ? ", " + Object.keys(extra).join(", ") : ""})
   values ('stronghold-s7x', 'source test'${extra ? ", " + Object.values(extra).map((v) => `'${v}'`).join(", ") : ""})
   returning id, source_type, source_label, source_ref`;

r = await as("contrib", src());
const selfRow = r.rows[0];
check("no source given → the contributor, label from profile", selfRow?.source_type === "contributor" && selfRow?.source_label === "Saul" && selfRow?.source_ref === U.contrib, JSON.stringify(selfRow));

r = await as("contrib", src({ source_label: "Aude", source_ref: U.maint }));
const audeRow = r.rows[0];
check("named person kept as written, cannot point at another account", audeRow?.source_label === "Aude" && audeRow?.source_ref === null, JSON.stringify(audeRow));

r = await as("contrib", src({ source_type: "manual", source_label: "Manuel du moulin" }));
check("manual source with its title", r.rows[0]?.source_type === "manual" && r.rows[0]?.source_label === "Manuel du moulin", JSON.stringify(r.rows[0]));

d = await denied("contrib", src({ source_type: "document" }));
check("document source without a label is refused", d.denied, d.msg);

await as("contrib", `update public.profiles set username='Saul S' where id='${U.contrib}'`);
r = await as("contrib", `select id, source_label from public.contributions where id in ('${selfRow.id}', '${audeRow.id}')`);
const byId = Object.fromEntries(r.rows.map((x) => [x.id, x.source_label]));
check("renaming yourself updates your own sources only", byId[selfRow.id] === "Saul S" && byId[audeRow.id] === "Aude", JSON.stringify(byId));

r = await as("maint", `update public.contributions set source_type='manual', source_label='Manuel S7X' where id='${audeRow.id}' returning source_label, status`);
check("maintainer can correct a source before validating", r.rows[0]?.source_label === "Manuel S7X" && r.rows[0]?.status === "proposed", JSON.stringify(r.rows[0]));
d = await denied("contrib", `update public.contributions set source_label='Moi' where id='${audeRow.id}'`);
check("contributor cannot rewrite a source", d.denied, d.msg);

r = await as("contrib", src());
const ownRow = r.rows[0];
await as("maint", `update public.contributions set source_label='Aude' where id='${ownRow.id}'`);
await as("contrib", `update public.profiles set username='Saul 2' where id='${U.contrib}'`);
r = await as("contrib", `select source_label, source_ref from public.contributions where id='${ownRow.id}'`);
check("a source reassigned to another person survives the proposer's rename",
  r.rows[0]?.source_label === "Aude" && r.rows[0]?.source_ref === null, JSON.stringify(r.rows[0]));

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
