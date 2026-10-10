# Handoff — vues d’analyse privées PREM08

PR : https://github.com/Theo25460/TITAN_V0.5/pull/28, branche `codex/web-analysis-views-cdc`, suite des PR #19–#27 ouvertes et non fusionnées. Base locale `901e36712e2c550f78a5502b2fed5610e5ea500c`, premier livrable local `aedb639697be6785c37a1cda4d17985612ffbe12` ; même arbre publié `d154239ed024ac1897776972d63b96d8cab10fc0`, commit GitHub `f7d85e70b16507bbe6ebf3e6a539481e484f60d1`.

## Livrable

Dans Progrès, après une comparaison ou un bilan calculé, « Enregistrer cette vue » ouvre un formulaire de nom. Mes vues d’analyse reste un panneau secondaire replié ; dix cartes privées au maximum, ouvrir/renommer/supprimer. Ouvrir relit les paramètres et relance le moteur d’analyse avec données, accès et fuseau courants. Nom échappé, périodes relatives, aucun résultat en cache ou stockage local.

Table privée RLS, lecture invoker et mutation definer à chemin vide/auth.uid obligatoire. Pas d’écriture directe API ou de publication Realtime. Révision attendue, quota verrouillé par propriétaire, création avec UUID client stable et répétition identique reconnue. Profil verrouillé en lecture pendant la mutation pour sérialiser une mise à jour d’abonnement/suspension. Paramètres exacts et bornés, noms 1–40 caractères, unicité propriétaire sans casse. Compte Free : préférences conservées, listées et supprimables, ouverture/modification Premium contrôlée côté serveur. Compte suspendu refusé. Suppression de compte en cascade.

Serveur ancien, hors ligne, panne, réponse malformée et délai de quinze secondes : messages honnêtes, aucune sauvegarde supposée. Les réponses d’une session précédente, même A→B→A, et celles d’un panneau fermé/caché sont ignorées. Un succès serveur suivi d’un échec de rafraîchissement est explicitement signalé. Offre/FAQ et HTML générés reproductibles ; prix et règles d’XP/crédits inchangés.

## Vérifications

- Avant lot : 93 tests verts. Contrats SQL écrits puis échec « analysis views RPC must exist » ; implémentation puis SQL vert. CLI Supabase 2.120.0 a créé la migration `20261009212850_analysis_views_v300.sql`, jamais appliquée à un projet réel.
- RED module/FAQ/section absents, puis parcours livrés. Cas supplémentaires microsecondes PostgreSQL et expiration au moment du save : RED→GREEN.
- 101/101 tests unitaires, build public et audit sans erreur ; avertissements SEO antérieurs. 52/52 E2E complets locaux, dont huit vues. Mobile 360 et desktop 1280 px, noms HTML affichés comme texte, aucune erreur console ni débordement. Captures locales inspectées, non ajoutées au dépôt.
- Unique revue indépendante Sol 6.1 sur `901e367..aedb639` : 13 tests unitaires/offre, huit E2E vues, SQL PGlite et diff --check vérifiés indépendamment. Aucun Critical/Important, trois Minor ci-dessous. Aucun comportement écarté (« Declined to judge : None »), aucune seconde revue.
- CI premier passage : https://github.com/Theo25460/TITAN_V0.5/actions/runs/37995034526, trois jobs verts sur `f7d85e70b16507bbe6ebf3e6a539481e484f60d1`, 101 tests et 52 E2E. Le dernier commit ajoute seulement ce handoff et le bilan du plan ; sa CI doit être verte avant livraison. La PR et le cahier donnent le dernier HEAD et sa CI canonique, afin de ne pas prétendre qu’un commit documentaire a été testé sur la preuve de son parent.
- PostgreSQL16 natif, logs database `114038774591` : quinze migrations individuelles ou bundle historique + six correctifs ; quinze suites SQL dans chaque voie. Conservation de transaction appelante, refus préalable des bases non-test, deux cas concurrents économie existants et deux nouveaux cas vues (dernière place/révision) sur chaque voie. Les refus attendus du catalogue cosmétique dans sa suite dédiée sont des contrôles d’échec, pas un échec CI.
- Trois PNG étrangers inchangés et exclus de tous les commits : avatar_1 `6c86828561cda015dcac2cb9f2b95486fb080083826474def604c1093a52029b`, avatar_2 `591984a1f7a7722bf0ec9d3d3d33c32e067f85598d5373d60ef0f71f68ac2581`, mob_9 `d4e744f9bffa0430cce91e44207d023fc34b0d0f4052e27b9e85063e48838c2f`.

## Décisions prises, dans leur ordre

1. Continuer sans nouvelle validation de design ou confirmation de publication de branche isolée : autonomie explicite du CDC et « Continue », aucune production/fusion. Coût si faux : confort à revoir et PR à fermer.
2. Dix vues de paramètres relatifs, étude PREM08 et PREM06 encore partiel : suite des analyses sans constructeur de dashboard ni résultats persistants. Coût si faux : quota ou périmètre à ajuster dans une migration suivante.
3. Une revue Sol 6.1, sans agents d’implémentation : modèle prescrit par le cahier et exécution inline. Coût si faux : audit global Astra réservé à la grande livraison.
4. Réutiliser le worktree lié isolé et préserver les trois PNG : espace fourni par l’hôte, aucune reprise des changements étrangers. Coût si faux : collision nécessitant une nouvelle isolation.
5. SQL local PGlite puis deux routes PostgreSQL16 CI : aucun binaire natif disponible ici, aucune base réelle utilisée. Coût si faux : livraison bloquée par échec CI ; aucune concurrence déclarée vérifiée avant ses logs natifs.

## Trois Minor différés

1. Annuler pendant une sauvegarde efface le brouillon ; une réponse incertaine ultérieure affirme à tort qu’il est conservé. Le nom doit être ressaisi, le message devra être rendu cohérent. Pas de donnée serveur perdue ni d’accès étranger.
2. Renommer après Supprimer laisse la confirmation de suppression visible mais inactive ; il faut annuler/réouvrir cette confirmation.
3. Annuler une suppression perd le focus clavier après remplacement du bouton ; il faut retrouver la carte au clavier. Correction future : rétablir le focus sur Supprimer.

Grades confirmés par effet utilisateur : limitations d’interface bornées, sans défaut bloquant de quota, droits, isolation ou calcul. Différés conformément à executing-plans, pas de passe de correction superflue.

## Cahier et suite

247 formulations préservées aux lectures avant commits ; état initial 28 [x], 19 [~], 200 [ ]. PREM08 ferme uniquement après revue et CI du dernier HEAD verte, avec étude des cinq conforts dans la spec et presets livrés : état attendu 29 [x], 18 [~], 200 [ ]. PREM06 reste [~], widgets/personnalisation d’accueil plus large hors lot ; favoris et historique gratuits préservés. Claim WORK Play Console respecté, aucune collision. Handoff natif et libération de ce claim après preuve du dernier HEAD, sans modifier les formulations.

Ne pas fusionner/déployer/appliquer cette migration sans l’autorisation de livraison prévue au cahier. Recette réelle multiappareils, autres navigateurs/lecteurs d’écran/charge et audit global Astra maximal restent ouverts. Retour arrière : retirer panneau/hooks/mentions et RPC ajoutées ; conserver la table si des paramètres réels y ont été créés. Aucune restauration de données ou modification de récompense nécessaire.
