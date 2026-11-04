# Vues d’analyse sauvegardées — contrat PREM08 / PREM06

Lot après PR #27, dans la branche `codex/web-analysis-views-cdc`. Le cahier autorise les choix réversibles et l’exécution autonome ; `Continue` reprend cette exécution. Aucun déploiement, fusion, prix, récompense ou donnée réelle dans ce lot.

## Besoin et étude des conforts

Retrouver une analyse utile sans ressaisir ses filtres. Depuis Progrès, une personne TITAN+ peut conserver dix vues nommées et privées, puis obtenir un calcul à jour. Le panneau reste secondaire et replié.

| Confort PREM08 | Décision | Justification |
|---|---|---|
| Presets et vues sauvegardées | Livrer dix paramètres nommés | Suite directe des comparaisons et bilans, sans données d’analyse en cache |
| Favoris avancés | Conserver les favoris gratuits actuels ; groupes éventuels ultérieurs | Ne pas reprendre un outil gratuit à l’utilisateur |
| Historique étendu | Ne pas fermer l’historique existant | Les séances et exports de base restent gratuits |
| Comparaisons | Réutiliser PR #26 et permettre de retrouver ses filtres | Pas de second moteur ni de métrique nouvelle |
| Page d’accueil personnalisable | Garder les modules simples ; constructeur hors lot | PREM06 demeure partiel, widgets et personnalisation plus large à étudier ensuite |

## Interface publique

Table privée `private.titan_analysis_views`, liée au profil avec suppression en cascade. Pas de publication Realtime ni d’écriture directe par les rôles API. Lecture propriétaire RLS et RPC invoker ; écriture RPC definer à chemin vide, propriétaire issu exclusivement de `auth.uid()`, droits d’exécution limités à authenticated.

`titan_analysis_views(p_id uuid default null)` retourne `{version:1,owner,available,reason?,limit:10,count,views}`. `count` est le total propriétaire ; `p_id` filtre les lignes. Un compte Free peut lire et supprimer ses paramètres conservés. Un profil suspendu est refusé. Un identifiant étranger ne livre aucune ligne.

Une ligne contient exactement `{id,name,kind,options,revision,created_at,updated_at}`. Nom de 1 à 40 caractères après retrait des espaces de bord, sans caractères de contrôle, unique par propriétaire sans distinction de casse. Ordre par mise à jour décroissante puis id. Aucun résultat, note, biométrie, GPS, date absolue ou fuseau persistant.

Options strictes :

- `comparison` : `{weeks:4|12|26,sport:<sports.id existant>|null}`.
- `report` : `{period:"month"|"year",offset:0|1}`.

`titan_mutate_analysis_view(p_action text,p_id uuid,p_expected_revision integer,p_name text default null,p_kind text default null,p_options jsonb default null)` accepte save/delete. Toute sauvegarde revalide le profil, l’abonnement, l’expiration et le remboursement. Quota sérialisé par verrou transactionnel propriétaire. Première création : UUID client et révision attendue 0 ; une répétition identique à révision 1 retourne le même reçu sans consommer de place. Modification et suppression : révision attendue égale à la révision actuelle, sinon conflit. Une suppression déjà absente n’est pas présentée comme réussie. Collision d’identifiant étranger refusée sans lire ses paramètres. Réponses : `{version:1,owner,action:"save",view}` ou `{version:1,owner,action:"delete",deleted_id}`. Lecture séparée après mutation pour éviter une visibilité STABLE périmée.

## Parcours

Bouton « Enregistrer cette vue » dans chaque analyse calculée. Il ouvre Mes vues avec le type et les filtres utilisés, puis demande seulement un nom. Liste de dix cartes au maximum : ouvrir, renommer, supprimer. Renommer conserve les filtres ; pour changer des filtres, sauvegarder une nouvelle vue depuis l’analyse. Suppression confirmée avec le nom visible.

Ouvrir relit la vue sur le serveur, revalide TITAN+, restaure ses filtres puis lance le RPC d’analyse avec les données courantes et le fuseau actuel. Les périodes restent relatives. Le serveur d’analyse contrôle encore le droit ; la lecture de paramètres n’accorde aucun accès.

À expiration, paramètres listés et supprimables, sauvegarde et ouverture indisponibles jusqu’au retour de TITAN+. Les favoris, statistiques, historique et exports de base restent gratuits. Serveur ancien, panne, hors ligne, invité, session en transition : message explicite, aucune fausse sauvegarde. Les requêtes ont un délai de quinze secondes ; les réponses retardées d’une autre session, d’un panneau fermé ou caché sont ignorées. Rien n’est mis en file hors ligne ni dans le stockage local. Les noms sont échappés comme texte.

## Preuves requises

SQL sous rôle authenticated : droits, isolation, quota, répétition, révision, options strictes, expiration/remboursement/suspension, suppression Free et cascade. Deux connexions PostgreSQL natives : créations simultanées à la dernière place, mises à jour concurrentes. Tests JS des contrats et texte ; vrais parcours Chromium à 360 et 1280 px, sauvegarde/restauration/rename/delete, accès expiré, panne/délai, session A→B→A, options malformées et ancienne réponse. Offre générée reproductible, prix inchangé, suite existante verte. Migration additive testée par la CI sur les deux chemins, jamais appliquée en production.

PREM08 peut fermer après étude et confort livré/contrôlé ; PREM06 reste [~]. Les 247 libellés du cahier restent identiques.
