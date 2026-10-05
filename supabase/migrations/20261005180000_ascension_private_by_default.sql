-- TITAN 300 Ascension — profiles are private by default.
-- Only the default for new rows changes: existing accounts keep the privacy they already have
-- (no rewrite of real data). The athlete opens visibility from Profil › Confidentialité.
alter table public.profiles
  alter column privacy set default '{"publicProfile": false, "showStats": false, "socialPresence": false, "friendRankings": false}'::jsonb;
