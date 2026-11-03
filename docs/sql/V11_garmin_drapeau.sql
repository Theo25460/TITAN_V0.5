-- Garmin : afficher "Connecter Garmin" UNIQUEMENT pour le compte du propriétaire (rollout 6 % : le seau du compte du propriétaire est 5),
-- puis, après le test réel, passer p_rollout à 100. À exécuter dans le SQL Editor APRÈS publication du déploiement Netlify.
insert into private.titan_feature_flags(key, enabled, rollout, description)
values ('screens.garmin', true, 6, 'Connexion Garmin (test propriétaire)')
on conflict (key) do update set enabled = excluded.enabled, rollout = excluded.rollout, updated_at = now();
-- Pour ouvrir à tous après le test :
-- update private.titan_feature_flags set rollout = 100, updated_at = now() where key = 'screens.garmin';
-- Pour couper :
-- update private.titan_feature_flags set enabled = false, updated_at = now() where key = 'screens.garmin';
