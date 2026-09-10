-- TITAN OS v70 - Journal/statistiques sportives
-- Non destructif: accelere les filtres par utilisateur, sport et date.

create index if not exists training_logs_user_sport_date_idx
on public.training_logs (user_id, sport, date desc);

notify pgrst, 'reload schema';
