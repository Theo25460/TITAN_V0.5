# Moments : partage lié au compte et envoi — 17/10/2026

Lot de trois exigences : SEC03 / UX10 / QA08, toutes globalement partielles.
Branche `codex/web-moment-share-session-cdc`, parent PR #79,
`58bb1d7b853a2b1673a9aceed91dbe8fc2348c92`.

## Problème et correction

La feuille de partage utilisait le client mutable au moment de l’envoi, sans capture de session,
sans garde des soumissions répétées, ni traitement borné des réponses perdues. Le SDK recherche
lui-même une session supplémentaire avant son fetch : un contrôle de l’état UI seul ne suffit pas.

La feuille capture désormais propriétaire/client/époque à son ouverture. Elle ferme son brouillon
aux événements de transition, vérifie ce contexte avant et après la lecture de session et épingle
le jeton correspondant au propriétaire dans Authorization. Une réponse ne confirme le partage
que si le contexte reste courant, l’identifiant retourné est un UUID et user_id est celui attendu.
Les anciens formulaires retenus, réponses et recherches de session tardives ne peuvent pas être
rejoués ou confirmer une opération pour le nouveau contexte.

Une seule feuille reste ouverte ; les soumissions répétées sont bloquées par une garde interne.
Les champs et fermetures utilisateur sont bloqués pendant l’attente, avec statut hors formulaire
aria-busy. Le brouillon reste modifiable après un rejet serveur structuré explicite 4xx ; en mode
hors ligne rien n’est envoyé et le brouillon peut être repris après reconnexion.

L’attente totale est bornée à 15 secondes. Si aucun RPC n’a été lancé, l’utilisateur peut reprendre
sans qu’une ancienne recherche de session ne parte ensuite. Après lancement du RPC, un résultat
perdu, une erreur réseau, une erreur de passerelle 5xx ou un reçu incohérent restent incertains :
le bouton Partager est bloqué pour cette feuille et le lien vers /social#moments invite à vérifier
avant tout renvoi. Une fermeture ou un abort ne garantit pas l’annulation d’une écriture déjà reçue.
Le booléen false de l’API signifie non confirmé ; aucun mécanisme d’idempotence serveur ajouté.

## Preuves

- Baseline : `pnpm verify`, 188/188 tests, build/audit sans erreur, 16 avertissements préexistants.
- Premier RED réel : 11/14 échecs sur le parent. Le premier lancement sans Chromium installé
  est exclu. Un témoin de reçu cross-owner a ensuite été renforcé pour attendre un résultat réel ;
  il reproduit séparément le faux succès du parent (1/1 échec attendu).
- Premier GREEN : 14/14. Un cas supplémentaire de passerelle 503 avec code démontre qu’un code
  seul ne suffit pas à autoriser un renvoi (RED 1/1), puis la classification a été corrigée.
- GREEN final : `pnpm verify`, 188/188, build/audit sans erreur, 16 avertissements préexistants.
- `node --test --test-concurrency=1 tests/e2e/moment-share-session.e2e.mjs tests/e2e/dialog-return-focus.e2e.mjs` : 26/26 (16 nouveaux +10 retour des fenêtres).
- `git diff --check` réussi. Revue indépendante en copie isolée : build et 26/26 tests navigateur réussis, aucun constat Critical/Important/Minor.

Tests avec vraie feuille, vrai SDK vendored Supabase 2.111.0 et custom fetch contrôlé : sessions,
identités, jetons et reçus synthétiques ; aucune authentification ni aucun RPC externe réel.
En-tête réseau effectivement reçu par le custom fetch vérifié, y compris quand le SDK obtient un
second jeton différent. Cas nominal à 360/1280 px ; double envoi, brouillons conservés, changements
de compte/client/époque, perte réseau, timeouts auth/écriture, réponses anciennes/incohérentes et
absence de double confirmation couverts. L’abort est volontairement ignoré par certains fetchs de
fixture pour prouver que le garde protège aussi contre un résultat tardif.

## Références techniques et limites

La fonction SQL existante `20261005200000_ascension_social.sql` a seulement été lue : elle utilise
auth.uid(), vérifie l’appartenance du log et retourne la ligne insérée en JSON. Aucune garantie
sur son déploiement ou ses RLS réelles n’est tirée de cette lecture. Les sources installées
supabase-js/lib/fetch.ts et postgrest-js/PostgrestBuilder.ts ont été vérifiées pour le second
getAccessToken, setHeader et abortSignal. Documentation getSession et changelog Supabase consultés ;
le changement TLS annoncé pour novembre n’impose pas de modification à ce lot navigateur.

Share300.1 sur training.html, journal.html et records.html. Profil, profile.html et smoke partagé
intacts. Lot limité à la feuille dès son ouverture : les autres surfaces de détail et l’ensemble
des endpoints ne sont pas certifiés par ces tests. Aucun changement SQL/RLS/serveur, aucune donnée
réelle ni récompense/XP modifiée. Serveur effectif, révocation du jeton déjà émis, sessions réelles,
autres moteurs, PWA installée/Android, suite E2E entière et CI distante hors validation.
Aucun merge ni déploiement.
