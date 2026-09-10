-- TITAN OS v86 - duplicate index cleanup
-- Date: 2026-06-04
-- Objectif: supprimer les index strictement redondants signales par Supabase.
-- Verification prealable: aucun des index supprimes n'est attache a une contrainte.

drop index if exists public.messages_created_idx;
drop index if exists public.profiles_friend_code_unique_idx;
