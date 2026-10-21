import json, sys
bk = json.load(open(sys.argv[1], encoding="utf8"))
out = []
w = out.append
w("set timezone='UTC'; set session_replication_role = replica;")
# auth tables: real column list from the production catalog (typed), so rows keep their exact content
cols = {}
for c in bk["auth_columns"]: cols.setdefault(c["t"], []).append(c)
w("create schema if not exists auth; create schema if not exists storage;")
for t, cs in cols.items():
    w(f"create table if not exists auth.{t} (id uuid primary key);")
    for c in cs:
        if c["c"] == "id": continue
        typ = c["type"]
        w(f'alter table auth.{t} add column if not exists "{c["c"]}" {typ};')
w("create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);") if False else None
# storage metadata: generic jsonb columns (metadata only, the files themselves are not in a SQL export)
for t in ("storage.buckets", "storage.objects"):
    rows = bk["tables"][t]
    keys = list(rows[0].keys()) if rows else ["id"]
    w(f"create table if not exists {t} (" + ",".join(f'"{k}" jsonb' for k in keys) + ");")
w("create schema if not exists supabase_migrations;")
tag = "$restore_data$"
for t, rows in bk["tables"].items():
    if t == "supabase_migrations.schema_migrations":
        w("truncate supabase_migrations.schema_migrations;")
    sch, name = t.split(".")
    payload = json.dumps(rows, ensure_ascii=False)
    assert tag not in payload
    w(f"""do $do$ declare cols text; begin
  select string_agg(quote_ident(column_name), ',' order by ordinal_position) into cols from information_schema.columns
   where table_schema='{sch}' and table_name='{name}' and is_generated='NEVER' and identity_generation is distinct from 'ALWAYS';
  execute format($f$insert into {t} (%1$s) select %1$s from jsonb_populate_recordset(null::{t}, $1)$f$, cols) using {tag}{payload}{tag}::jsonb;
end $do$;""")
# sequences: continue after the highest restored id
w("""do $do$ declare r record; m bigint; begin
  for r in select n.nspname s, c.relname t, a.attname col, pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) seq
           from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
           where c.relkind='r' and n.nspname in ('public','private') and pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) is not null loop
    execute format('select coalesce(max(%I),0) from %I.%I', r.col, r.s, r.t) into m;
    if m > 0 then perform setval(r.seq, m); end if;
  end loop; end $do$;""")
print("\n".join(x for x in out if x))
