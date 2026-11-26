#!/usr/bin/env python3
"""TITAN V2.0 (mission A2) — rehearsal of the canonical packages on a SYNTHETIC replica of the current production state.

tools/db/v2-replica-rehearsal.sh builds a throwaway database at the production head (structure snapshot + every migration up
to tools/db/production-head.txt, registry seeded like production's), then runs this script, which:

  1. seeds several old accounts with synthetic data in every table that is empty at the production head (journal, imports,
     sources, routes, RPG, LIVE, economy, entitlements, coaching, friends, clubs, cordées, private notes...), plus coherent
     flows through the real RPCs (a coach link accepted with consent, its messages);
  2. photographs: row count and checksum of every table (over the columns that existed before), every public function
     (identity arguments, result, security definer, grants to anon/authenticated), the full account export of each account;
  3. applies the packages release-v2-01 ... in order, file by file, as production would (00 must be all ok, each 01.. file
     a guarded transaction, 99 all ok), then the historical postflights v11, v13 and v131;
  4. replays every package file: each must be refused and change nothing (idempotence / retry after a partial run);
  5. checks the invariants: no row lost or altered in an existing table, every old export key and value still exported
     (new keys allowed), every old public function still callable with the same arguments and grants (old client / new
     server), the new tables private by construction (RLS, no direct grant) and the new functions closed to anon,
     a second unrelated account refused on the first account's objects (IDOR), and the client feature flags absent = closed.

No real data: every account and value here is synthetic. The database must be a titan_test_ disposable one.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

PSQL = sys.argv[1:]
if not PSQL:
    sys.exit('Usage: v2-replica-rehearsal.py <psql and disposable DB arguments>')
ROOT = Path(__file__).resolve().parents[2]
HEAD = (ROOT / 'tools/db/production-head.txt').read_text().strip()
FAIL = []


def q(sql, check=True):
    r = subprocess.run(PSQL + ['-qAt', '-v', 'ON_ERROR_STOP=1', '-X'], input=sql, text=True, capture_output=True, timeout=600)
    if check and r.returncode:
        raise RuntimeError(r.stderr.strip()[-2000:])
    return r.stdout.strip() if not r.returncode else None


def qjson(sql):
    out = q(sql)
    return json.loads(out) if out else None


def run_file(path):
    r = subprocess.run(PSQL + ['-qAt', '-v', 'ON_ERROR_STOP=1', '-X', '-f', str(path)], text=True, capture_output=True, timeout=600)
    return r.returncode, r.stdout.strip(), r.stderr.strip()


def check(name, ok, detail=''):
    print(('  ok   ' if ok else '  FAIL ') + name + (f' — {detail}' if detail and not ok else ''))
    if not ok:
        FAIL.append(f'{name}: {detail}')


if not q('select current_database()').startswith('titan_test_'):
    sys.exit('Refused: the V2.0 replica rehearsal requires a titan_test_ disposable database')
assert q('select max(version) from supabase_migrations.schema_migrations') == HEAD, 'the replica must stand at the production head'

# ----------------------------------------------------------------------------------------------------------- 1. synthetic seed
ACCOUNTS = {  # synthetic people only
    'A': '00000000-0000-4000-8000-00000000000a', 'B': '00000000-0000-4000-8000-00000000000b',
    'C': '00000000-0000-4000-8000-00000000000c', 'K': '00000000-0000-4000-8000-00000000000d',
}
q("insert into auth.users(id, email, raw_user_meta_data, created_at) values " + ",".join(
    f"('{u}', 'synthetic-{k.lower()}@example.invalid', '{{}}', now() - interval '400 days')" for k, u in ACCOUNTS.items()) + ";")
q("update public.profiles set username = 'Synth ' || right(id::text, 1) where id in (" + ",".join(f"'{u}'" for u in ACCOUNTS.values()) + ");")

meta = qjson(r"""
select jsonb_agg(t) from (
 select c.oid::regclass::text as rel, n.nspname as schema,
  (select count(*) = 0 from pg_class x where false) as dummy,
  (select jsonb_agg(jsonb_build_object('name', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'notnull', a.attnotnull,
     'default', pg_get_expr(d.adbin, d.adrelid) is not null, 'identity', a.attidentity <> '' or a.attgenerated <> '') order by a.attnum)
   from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as cols,
  (select jsonb_agg(jsonb_build_object('cols', (select jsonb_agg(att.attname) from unnest(k.conkey) ck join pg_attribute att on att.attrelid = c.oid and att.attnum = ck),
     'ref', k.confrelid::regclass::text, 'refcols', (select jsonb_agg(att.attname) from unnest(k.confkey) ck join pg_attribute att on att.attrelid = k.confrelid and att.attnum = ck)))
   from pg_constraint k where k.conrelid = c.oid and k.contype = 'f') as fks,
  (select jsonb_agg(pg_get_constraintdef(k.oid)) from pg_constraint k where k.conrelid = c.oid and k.contype = 'c') as checks
 from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('public', 'private') and c.relkind = 'r'
) t""")
counts = qjson("select jsonb_object_agg(format('%I.%I', schemaname, tablename), (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', schemaname, tablename), false, true, '')))[1]::text::bigint) from pg_tables where schemaname in ('public','private')")
norm = lambda rel: rel if '.' in rel else 'public.' + rel
tables = {norm(t['rel']): t for t in meta}
empty = [r for r in tables if counts.get(r, 0) == 0]
# Seed in foreign-key order (referenced tables first).
order, seen = [], set()
def visit(rel, stack=()):
    if rel in seen or rel in stack or rel not in tables:
        return
    for fk in tables[rel]['fks'] or []:
        visit(norm(fk['ref']), stack + (rel,))
    seen.add(rel); order.append(rel)
for r in sorted(empty):
    visit(r)
order = [r for r in order if r in empty]
USER_REF = {'auth.users', 'public.profiles'}
seeded, skipped, keys = {}, {}, {}


def literals(col, checks):
    out = []
    for c in checks or []:
        if re.search(rf'\b{re.escape(col)}\b', c):
            out += re.findall(r"'([^']*)'::", c) + re.findall(r"IN \('([^']*)'", c)
    return [x for x in out if x != '']


def value(col, rel, i, who, fkmap):
    name, typ = col['name'], col['type']
    if name in fkmap:
        ref, refcol = fkmap[name]
        if ref in USER_REF:
            return f"'{who}'"
        pool = keys.get((ref, refcol))
        if pool:
            return f"'{pool[i % len(pool)]}'"
    lits = literals(name, tables[rel]['checks'])
    if typ.startswith('uuid'):
        return 'gen_random_uuid()' if not re.search(r'(^|_)(user|owner|athlete|coach|sender|author|member|reporter|by|creator|player|actor|admin|leader)(_id)?$', name) else f"'{who}'"
    if lits:
        return "'" + lits[i % len(lits)].replace("'", "''") + "'"
    if typ in ('text', 'character varying') or typ.startswith('character varying') or typ.startswith('varchar'):
        return f"'synthetic {name} {i}'"
    if typ in ('integer', 'bigint', 'smallint', 'numeric', 'real', 'double precision') or typ.startswith('numeric'):
        return str(1 + i)
    if typ == 'boolean':
        return 'false'
    if typ.startswith('timestamp'):
        return f"now() - interval '{3 + i} days'"
    if typ == 'date':
        return f"current_date - {3 + i}"
    if typ in ('jsonb', 'json'):
        return "'{}'"
    if typ.endswith('[]'):
        return "'{}'"
    if typ == 'interval':
        return "interval '1 hour'"
    return None


for rel in order:
    t = tables[rel]
    fkmap = {}
    for fk in t['fks'] or []:
        if len(fk['cols']) == 1:
            fkmap[fk['cols'][0]] = (norm(fk['ref']), fk['refcols'][0])
    n_ok = 0
    for i, who in enumerate([ACCOUNTS['A'], ACCOUNTS['B'], ACCOUNTS['C'], ACCOUNTS['K']] * 2):
        cols, vals = [], []
        for c in t['cols']:
            if c['identity']:
                continue
            must = c['notnull'] and not c['default']
            refuser = c['name'] in fkmap and fkmap[c['name']][0] in USER_REF
            if not must and not refuser and not (c['type'].startswith('uuid') and re.search(r'(^|_)(user|owner|athlete|coach)_id$', c['name'])):
                continue
            v = value(c, rel, i, who, fkmap)
            if v is None:
                cols = None; break
            cols.append(f'"{c["name"]}"'); vals.append(v)
        if cols is None:
            break
        pk = q(f"select a.attname from pg_index x join pg_attribute a on a.attrelid = x.indrelid and a.attnum = x.indkey[0] where x.indrelid = '{rel}'::regclass and x.indisprimary and x.indnkeyatts = 1")
        ret = f' returning "{pk}"::text' if pk else ''
        sql = f"set session_replication_role = replica; insert into {rel} ({', '.join(cols)}) values ({', '.join(vals)}) on conflict do nothing{ret};" if cols else ''
        if not sql:
            continue
        out = q(sql, check=False)
        if out is None:
            skipped[rel] = 'insert refused by a constraint'
            continue
        n_ok += 1
        if pk and out:
            keys.setdefault((rel, pk), []).append(out.splitlines()[-1])
    if n_ok:
        seeded[rel] = n_ok
q('set session_replication_role = origin;')

# Coherent flows through the real RPCs (consent, places, messages): coach K invites, athlete A accepts with consent.
def as_user(uid, sql):
    out = q(f"begin; select set_config('request.jwt.claims', json_build_object('sub', '{uid}', 'role', 'authenticated')::text, true) is null; set local role authenticated; {sql}; commit;")
    return out.splitlines()[-1] if out else out
inv = json.loads(as_user(ACCOUNTS['K'], "select public.titan_coach_portal('invite', '{}'::jsonb)"))
link = json.loads(as_user(ACCOUNTS['A'], f"select public.titan_coach_portal('accept', jsonb_build_object('token', '{inv['token']}', 'since_date', current_date - 60, 'consent', true))"))['id']
as_user(ACCOUNTS['K'], f"select public.titan_coach_message_send_v1('{link}', 'Synthetic message') ") if q("select to_regprocedure('public.titan_coach_message_send_v1(uuid,text)') is not null") == 't' else None
print(f'Seed: {len(seeded)} tables seeded ({sum(seeded.values())} rows), {len(skipped)} refused by a constraint, coach link {link}')
check('seed covers most empty tables', len(seeded) >= 0.6 * len(order), f'{len(seeded)}/{len(order)}')

# ----------------------------------------------------------------------------------------------------------- 2. photograph
def photograph(columns=None):
    rels = sorted(tables)
    snap = {}
    for rel in rels:
        cols = columns[rel] if columns else [c['name'] for c in tables[rel]['cols']]
        proj = ', '.join(f'"{c}"' for c in cols)
        snap[rel] = q(f"select count(*) || ':' || md5(coalesce(string_agg(r::text, E'\\n' order by r::text collate \"C\"), '')) from (select row({proj}) r from {rel}) x")
    return snap
COLUMNS = {rel: [c['name'] for c in tables[rel]['cols']] for rel in tables}
FUNCS_SQL = r"""select jsonb_object_agg(p.oid::regprocedure::text, jsonb_build_object('result', pg_get_function_result(p.oid), 'secdef', p.prosecdef,
  'anon', has_function_privilege('anon', p.oid, 'EXECUTE'), 'auth', has_function_privilege('authenticated', p.oid, 'EXECUTE')))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'"""
def exports():
    out = {}
    for k, uid in ACCOUNTS.items():
        out[k] = json.loads(as_user(uid, 'select public.export_own_data()::text'))
    return out
before = photograph(); funcs_before = qjson(FUNCS_SQL); export_before = exports()
priv_before = qjson(r"""select coalesce(jsonb_object_agg(p.oid::regprocedure::text, true), '{}') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private'""")
tables_before = set(tables)

# ----------------------------------------------------------------------------------------------------------- 3. packages
packages = sorted(p for p in (ROOT / 'supabase').glob('release-v2-*') if p.is_dir())
check('canonical packages present', len(packages) > 0)
def check_rows(path, label):
    code, out, err = run_file(path)
    rows = [l for l in out.splitlines() if '|' in l]
    ok = code == 0 and rows and all(l.split('|')[-1] == 't' for l in rows)
    check(label, ok, err[-300:] or out[-300:])
for pkg in packages:
    files = sorted(pkg.glob('*.sql'))
    check_rows(files[0], f'{pkg.name} 00-check-before all ok')
    for f in files[1:-1]:
        code, out, err = run_file(f)
        check(f'{pkg.name}/{f.name} applied', code == 0, err[-400:])
    check_rows(files[-1], f'{pkg.name} 99-check-after all ok')
for pf in ('postflight-v11.sql', 'postflight-v13.sql', 'postflight-v131.sql'):
    out = q((ROOT / 'tools/db' / pf).read_text().strip().rstrip(';').join(['select coalesce(jsonb_agg(row_to_json(r)), \'[]\') from (', ') r;']))
    rows = json.loads(out)
    bad = [r for r in rows if r.get('blocking', True) and r.get('ok') is not True]
    check(f'{pf}: {len(rows)} rows, every blocking row true', rows and not bad, json.dumps(bad, ensure_ascii=False)[:600])

# ----------------------------------------------------------------------------------------------------------- 4. retry
after_once = photograph(COLUMNS)
for pkg in packages:
    for f in sorted(pkg.glob('*.sql'))[1:-1]:
        code, _, err = run_file(f)
        check(f'{pkg.name}/{f.name} refused on replay', code != 0 and 'already registered' in err, err[-200:])
check('a refused replay changes nothing', photograph(COLUMNS) == after_once)

# ----------------------------------------------------------------------------------------------------------- 5. invariants
after = photograph(COLUMNS)
changed = [r for r in before if before[r] != after[r]]
check('no row lost or altered in any pre-existing table (pre-existing columns)', not changed, ', '.join(changed)[:800])

def subset(old, new, path='$'):
    if isinstance(old, dict):
        if not isinstance(new, dict):
            return [path]
        return [m for k, v in old.items() for m in (subset(v, new[k], f'{path}.{k}') if k in new else [f'{path}.{k} (missing)'])]
    if isinstance(old, list):
        if not isinstance(new, list) or len(new) != len(old):
            return [path + ' (length)']
        return [m for i, (a, b) in enumerate(zip(old, new)) for m in subset(a, b, f'{path}[{i}]')]
    return [] if old == new or re.search(r'(exported_?[aA]t|generated_?[aA]t)$', path) else [path]
export_after = exports()
for k in ACCOUNTS:
    missing = subset(export_before[k], export_after[k])
    check(f'account {k}: every old export key and value still exported', not missing, ', '.join(missing)[:600])
new_keys = sorted(set(export_after['A']) - set(export_before['A']))
print('  ·    new export keys:', ', '.join(new_keys))

funcs_after = qjson(FUNCS_SQL)
broken = [f for f, v in funcs_before.items() if funcs_after.get(f) != v]
check('old client / new server: every public function keeps its arguments, result, security and grants', not broken, ', '.join(broken)[:800])
new_funcs = sorted(set(funcs_after) - set(funcs_before))
anon_new = [f for f in new_funcs if funcs_after[f]['anon']]
check('new public functions are closed to anon', not anon_new, ', '.join(anon_new))
nosp = q(r"""select coalesce(string_agg(p.oid::regprocedure::text, ', '), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','private') and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')""")
check('every security definer function pins its search_path', nosp == '', nosp)
# main's convention: a public SECURITY INVOKER wrapper may call a private SECURITY DEFINER function granted to authenticated (which
# checks auth.uid() itself); nothing private is ever executable by anon; a private function open to authenticated must be a
# security definer one. A trigger function cannot be called directly, its PUBLIC grant is only hygiene (revoked by v2-08 if present).
PRIV_SQL = r"""select coalesce(jsonb_object_agg(p.oid::regprocedure::text, jsonb_build_object('anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
  'auth', has_function_privilege('authenticated', p.oid, 'EXECUTE'), 'secdef', p.prosecdef, 'trigger', p.prorettype = 'trigger'::regtype)), '{}')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private'"""
priv_after = qjson(PRIV_SQL)
new_priv = {f: v for f, v in priv_after.items() if f not in priv_before}
bad = [f for f, v in new_priv.items() if not v['trigger'] and (v['anon'] or (v['auth'] and not v['secdef']))]
check(f'{len(new_priv)} new private functions: none open to anon, those open to authenticated are security definer', not bad, ', '.join(bad))
open_trig = [f for f, v in new_priv.items() if v['trigger'] and (v['anon'] or v['auth'])]
check('new private trigger functions carry no EXECUTE grant to API roles', not open_trig, ', '.join(open_trig))
print('  ·    new private functions callable by authenticated (security definer, own auth.uid() check):',
      ', '.join(sorted(f for f, v in new_priv.items() if v['auth'] and not v['trigger'])) or 'none')
new_tables = q(r"""select coalesce(string_agg(format('%I.%I', n.nspname, c.relname), ' '), '') from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public','private') and c.relkind = 'r'""").split()
new_tables = [t for t in new_tables if t not in tables_before]
loose = q("select coalesce(string_agg(t, ', '), '') from unnest(array[" + ",".join(f"'{t}'" for t in new_tables) + "]::text[]) t where not (select relrowsecurity from pg_class where oid = t::regclass) or has_table_privilege('anon', t, 'SELECT') or has_table_privilege('authenticated', t, 'SELECT') or has_table_privilege('authenticated', t, 'INSERT') or has_table_privilege('authenticated', t, 'UPDATE') or has_table_privilege('authenticated', t, 'DELETE')") if new_tables else ''
check(f'{len(new_tables)} new tables: RLS on, no direct grant to anon/authenticated', loose == '', loose)

# IDOR: B, unrelated to A and K, asks for A's coach link and A's objects through the new read RPCs; anon gets nothing either.
def refused(uid, sql):
    try:
        out = as_user(uid, f'select ({sql})::text') if uid else q(f"begin; set local role anon; select ({sql})::text; commit;")
    except RuntimeError as e:
        return True, str(e).splitlines()[-1][:120]
    return out in (None, '', '[]', '{}', 'null', 'f') or '"rows": []' in out or '"items": []' in out, (out or '')[:160]
probes = [
    ('coach portal sessions of A through K\'s link', f"public.titan_coach_portal('sessions', jsonb_build_object('link_id', '{link}', 'to_date', current_date))"),
    ('coach portal assignments of the link', f"public.titan_coach_portal('assignments', jsonb_build_object('link_id', '{link}'))"),
    ('coach messages of the link', f"public.titan_coach_messages_v1('{link}', null)"),
]
if q("select to_regprocedure('public.titan_coach_followup_v1(text,jsonb)') is not null") == 't':
    probes.append(('coach follow-up dossier of the link', f"public.titan_coach_followup_v1('dossier', jsonb_build_object('link_id', '{link}'))"))
route = keys.get(('private.titan_routes', 'id'), [None])[0]
if route and q("select to_regprocedure('public.titan_route_get_v2(uuid)') is not null") == 't':
    probes.append(('route of A', f"public.titan_route_get_v2('{route}')"))
for label, sql in probes:
    ok, detail = refused(ACCOUNTS['B'], sql)
    check(f'IDOR refused for an unrelated account: {label}', ok, detail)
    ok, detail = refused(None, sql)
    check(f'anon refused: {label}', ok, detail)

flags = q("select coalesce(string_agg(key, ', '), '') from private.titan_feature_flags where key ~ '^(screens\\.(gps|cordee_relay|cordee_reprise|cordee_suite|club_season|club_match|club_match_versus|club_agenda|coach_followup|coach_feedback|coach_review|coach_programs|coach_cycle_report|coach_groups)|ads\\.android)' and enabled")
check('no lot flag is opened by the packages', flags == '', flags)

print(f'Replica rehearsal: {len(FAIL)} failure(s).')
if FAIL:
    sys.exit('FAILED:\n  ' + '\n  '.join(FAIL))
print('OK: the canonical packages upgrade a synthetic replica of production without loss.')
