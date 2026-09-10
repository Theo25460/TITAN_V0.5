begin;

-- TITAN OS v80 - Supabase connection/security hardening.
-- Keep current authenticated admin/progression RPCs available, but remove
-- unnecessary anon execution and close legacy admin SECURITY DEFINER RPCs.

do $$
declare
    v_signature text;
begin
    foreach v_signature in array array[
        'public.titan_admin_dashboard_v1()',
        'public.titan_admin_get_context_v1()',
        'public.titan_admin_grant_premium_v1(uuid,text,text,timestamp with time zone,boolean,text)',
        'public.titan_admin_list_profiles_v1(text,text,text,text,integer,integer)',
        'public.titan_admin_revoke_premium_v1(uuid,text)',
        'public.titan_admin_run_contest_draw_v1(text,text)',
        'public.titan_admin_update_profile_v1(uuid,jsonb,text)',
        'public.titan_admin_upsert_row_v1(text,text,jsonb,text)',
        'public.titan_admin_write_log_v1(text,text,text,jsonb,jsonb,text)',
        'public.titan_admin_json_value_sql(jsonb,text,text)',
        'public.titan_is_admin(uuid)'
    ] loop
        if to_regprocedure(v_signature) is not null then
            execute format('revoke execute on function %s from public, anon', v_signature);
            execute format('grant execute on function %s to authenticated', v_signature);
        end if;
    end loop;

    foreach v_signature in array array[
        'public.titan_admin_allowed_content_tables()',
        'public.titan_admin_assert()',
        'public.titan_admin_audit_write(text,uuid,jsonb)',
        'public.titan_admin_claim_first(text)',
        'public.titan_admin_content_catalog()',
        'public.titan_admin_dashboard()',
        'public.titan_admin_delete_content(text,text)',
        'public.titan_admin_delete_message(text)',
        'public.titan_admin_hide_chat_message(text,text)',
        'public.titan_admin_list_content(text,integer)',
        'public.titan_admin_list_messages(integer)',
        'public.titan_admin_list_news(integer)',
        'public.titan_admin_list_profiles(text,integer,integer)',
        'public.titan_admin_list_reports(text,integer)',
        'public.titan_admin_publish_news(text,text,text,text,boolean)',
        'public.titan_admin_resolve_report(uuid,text,text)',
        'public.titan_admin_set_news_active(uuid,boolean)',
        'public.titan_admin_update_profile(uuid,jsonb)',
        'public.titan_admin_upsert_content(text,jsonb)'
    ] loop
        if to_regprocedure(v_signature) is not null then
            execute format('revoke execute on function %s from public, anon, authenticated', v_signature);
        end if;
    end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
