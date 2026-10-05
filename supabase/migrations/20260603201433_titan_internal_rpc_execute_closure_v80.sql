begin;

-- TITAN OS v80 - close direct execution on internal economy helpers.
-- Public gameplay RPCs keep using these helpers server-side; the browser should
-- not call them directly to compute rewards, charge credits, or purge data.

do $$
declare
    v_signature text;
begin
    foreach v_signature in array array[
        'public.titan_apply_weekly_reward_cap(uuid,integer,integer)',
        'public.titan_charge_credits(uuid,integer,text)',
        'public.titan_economy_limits(uuid)',
        'public.titan_get_economy_status()',
        'public.titan_purge_expired_social_messages()'
    ] loop
        if to_regprocedure(v_signature) is not null then
            execute format('revoke execute on function %s from public, anon, authenticated', v_signature);
        end if;
    end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
