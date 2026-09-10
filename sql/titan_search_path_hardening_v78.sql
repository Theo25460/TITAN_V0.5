begin;

-- TITAN OS v78 - Supabase advisor cleanup for simple immutable/stable helpers.
-- Keeps helper functions deterministic by removing role-mutable search_path.

alter function public.titan_clean_economy_message(text, integer) set search_path = '';
alter function public.titan_week_start(timestamp with time zone) set search_path = '';
alter function public.titan_v72_sport_profile(text, text, text, text) set search_path = '';
alter function public.titan_v72_tracking_summary(text) set search_path = '';
alter function public.titan_v72_sport_fields(text) set search_path = '';

notify pgrst, 'reload schema';

commit;
