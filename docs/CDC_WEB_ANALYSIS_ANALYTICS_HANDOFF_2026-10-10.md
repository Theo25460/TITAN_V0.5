# Handoff — analytics des analyses TITAN+

Branche `codex/web-analysis-analytics-cdc`, suite de la PR #29 ouverte et non fusionnée. Base locale `5db808b70546cea3616d1908e09f3c0e26e7e200`, parent publié `21ccaaaaa56f65cea3a93049981da944b7d84e1f` : même arbre `b72cf687b54d4007c01a50853db3d044d39ef5ff`. Premier commit relu `0403f920076a367935499abb61b54ef9146854c4` ; corrections de revue `bdd8e31b043fdaaa47f0a3ffd4fb7de0ea672d07`.

## Changements

Sept événements suivent les consultations volontaires de comparaisons/bilans, exports CSV et opérations confirmées sur les vues sauvegardées. Aucun compteur de consultation sur rafraîchissement automatique, erreur, refus Premium ou réponse invalide/étrangère/obsolète. Une mutation confirmée compte même si le rafraîchissement de liste échoue. Une ouverture restaure des paramètres ; le recalcul réussi est compté séparément. L’export mesure le déclenchement du téléchargement.

Les propriétés d’analyse se limitent au type de vue éventuel, sans nom, UUID, recherche, sport, valeur sportive, période ou UTM. Consentement refusé : aucune insertion. Les quatorze noms historiques et le contrat serveur restent inchangés ; voir [ANALYTICS_EVENTS_V300.md](ANALYTICS_EVENTS_V300.md).

L’envoi capture la session et utilise une instance éphémère du même SDK, sans authentification persistée ni refresh. Son fetch vérifie le contexte juste avant le dispatch natif, après toutes les attentes internes du SDK. Les époques de consentement/auth/transition et l’identité du client protègent aussi refus→accord, A→B→A et remplacement direct du client. Le client partagé n’est pas modifié. Les événements uniques sont mémorisés après insertion acceptée, avec déduplication concurrente par clé ; une erreur/hors ligne n’interdit plus une tentative explicite.

Sur /login, le receipt d’inscription fournit le propriétaire attendu, séparé des propriétés transmises. L’observation auth fonctionne sans state.js ; une session étrangère est refusée et deux comptes n’utilisent plus la même clé anon:signup. Une inscription sans session reste sans user_id.

Analytics versionné 300.2 sur les quatorze pages ; modules d’analyse Progrès et auth de login versionnés. Aucun changement dans js/config.js, le SDK vendored, schéma, migrations, grants/RLS, RPC, droits Premium, paiements, prix ou récompenses.

## Vérifications et revue

- Socle initial : 101/101 tests. Treize nouvelles régressions : 10 échecs RED, puis 13/13. Cinq nouveaux scénarios navigateur : 4 échecs RED, puis 5/5 aux largeurs concernées.
- Première suite complète : 59/60 E2E, fixture PWA qui empoisonnait une URL encore actuelle. Correction : nouveau cache 300.2 et fixture limitée aux véritables anciennes versions 300.0/300.1 ; assertions conservées. Suite suivante 60/60.
- Unique revue indépendante GPT-6.1 Sol sur 5db808..0403f92 : zéro Critical/Minor, deux Important. Le SDK attendait une deuxième session après la garde ; login n’avait ni époque de compte ni clé propre au signup. Les deux findings sont acceptés et corrigés par l’exécuteur, sans seconde revue.
- Neuf régressions SDK/login supplémentaires : 8 échecs RED, puis 9/9. Elles chargent le véritable SDK 2.111.0, retardent sa préparation de token et vérifient l’absence de dispatch natif après invalidation. Session/HTTP seuls simulés. Sixième nouveau E2E sur UI réelle de login à 360/1280 px : session étrangère refusée, deux comptes distincts acceptés, répétition dédupliquée.
- Vérification finale locale après corrections : pnpm verify, 123/123 tests, build réussi, audit sans erreur et avertissements SEO préexistants. pnpm test:e2e, 61/61. git diff --check réussi.
- sql/tests/300_analytics_events.sql : identités synthétiques, véritables rôles authenticated/anon, vérification des lignes minimales, refus du compte étranger et de lecture client ; transaction intégralement rollback. Pas de résultat SQL local revendiqué. CI finale requise sur réplique vide via les deux voies existantes.
- SHA GitHub, arbre publié identique et résultats des trois jobs du dernier HEAD : preuves canoniques ajoutées à la PR de cette branche et au [cahier](https://docs.google.com/document/d/1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M) après leur lecture. La CI du parent ou du premier code relu ne vaut pas preuve du livrable corrigé.

## Limites examinées et décisions de l’exécuteur

Chacune des huit lignes « Declined to judge » de la revue est conservée :

- Suivi public js/content.js : hors de ce collecteur ; audit à poursuivre, DATA09 reste partiel.
- Marqueur checkout lié au navigateur plutôt qu’au propriétaire : suivi de conversion encore ouvert, DATA07 reste partiel ; droits serveur conservés.
- Déduplication atomique entre onglets/appareils et retry après réponse perdue post-commit : limite documentée, aucune garantie globale exactement-une-fois. Compteurs sans autorité financière.
- Paiement réel et son attribution : encore ouverts, aucune action de billing ni recette réelle revendiquée.
- Dashboard DATA08 complet : reste ouvert, ce lot ne fournit que des événements.
- Intégrations natives/Android d’activité : restent ouvertes ; les dix exigences ajoutées sont préservées et priorité au web.
- Whitelist des propriétés côté serveur face à des inserts directs fabriqués : caractérisation du schéma/RLS existant seulement. Le filtre client n’est pas présenté comme garantie serveur ; durcissement à traiter sous chantier dédié.
- Retrait rétroactif après dispatch HTTP : limitation explicite ; la garde protège la période précédant l’envoi, aucune suppression de données réelles effectuée.

Les deux défauts de compte/consentement font partie du lot et ne sont pas écartés. Retour arrière : retirer ce patch d’instrumentation et versions de cache ; aucune migration à annuler, aucune donnée à restaurer.

## Cahier et suite

257 formulations inchangées, dont les dix ajouts sources/activité quotidienne depuis PR #29. DATA07/DATA09 passent de [ ] à [~] et restent partiels : état 29 [x], 21 [~], 207 [ ]. WORK Play Console intact ; claim Codex libéré après livraison et lecture de la CI finale. Conversion globale, suivi public, dashboard et intégrations d’activité restent à poursuivre.

Trois PNG étrangers conservés et exclus : avatar_1 `6c86828561cda015dcac2cb9f2b95486fb080083826474def604c1093a52029b`, avatar_2 `591984a1f7a7722bf0ec9d3d3d33c32e067f85598d5373d60ef0f71f68ac2581`, mob_9 `d4e744f9bffa0430cce91e44207d023fc34b0d0f4052e27b9e85063e48838c2f`.

Aucune fusion, mise en production, migration sur un projet réel ou action Android/Play Console. Les PR précédentes restent ouvertes ; recette réelle et audit global Astra maximal requis avant le déploiement majeur. Ce lot réversible suit l’autonomie autorisée dans le cahier ; pas de méthodologie de conception lourde pour ces compteurs et défauts bornés.
