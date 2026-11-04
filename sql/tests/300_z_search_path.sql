-- A caller-controlled search_path must not change private card serialization.
-- The attacker schema exists only in this disposable transaction, never in production.
begin;
create schema qa_search_path;
create function qa_search_path.jsonb_build_object(text,boolean,text,text,text,jsonb)
returns jsonb language sql immutable as $$select '{"enabled":true,"slug":"forged","show":{}}'::jsonb$$;
grant usage on schema qa_search_path to authenticated;
grant execute on function qa_search_path.jsonb_build_object(text,boolean,text,text,text,jsonb) to authenticated;
set local role authenticated;
set local search_path=qa_search_path,pg_catalog,public;
do $$
declare r public.titan_public_cards; j jsonb;
begin
  r:=pg_catalog.jsonb_populate_record(null::public.titan_public_cards,
    '{"enabled":false,"slug":"qa-safe","show_name":false,"show_level":true,"show_totals":false,"show_sports":true,"show_titles":false}');
  j:=private.titan_card_settings_json(r);
  assert j->>'slug'='qa-safe' and (j->>'enabled')::boolean=false,'caller search_path cannot forge serialized card settings';
  assert j->'show'='{"name":false,"level":true,"totals":false,"sports":true,"titles":false}'::jsonb,'visibility settings preserved under hostile search_path';
end $$;
reset role;
rollback;
