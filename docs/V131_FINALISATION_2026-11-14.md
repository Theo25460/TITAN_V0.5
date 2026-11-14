# TITAN V1.3.1 · Finalisation du 14 novembre 2026

Complète [le dossier de livraison V1.3.1](V131_RELEASE_DOSSIER.md). Branche : `claude/titan-v131-finalization-9g6jjo`, partie de `main` (`67e17c7`).
Ce document dit ce qui a été fait, ce qui a été vérifié et comment, ce qui reste bloqué, et ce qui attend une décision humaine.
Rien n'a été déployé : ni Netlify, ni Google Play, ni migration sur la base de production.

## 1. État trouvé au départ

| Sujet | Constat vérifié |
|---|---|
| Code V1.3.1 | `main` contient la V1.3.1 (#142). Web : 578 tests, build et typage verts. Android : 757 tests et typage verts. |
| Base de production | Le registre des migrations s'arrête à `20261102150000`. **Aucune des sept migrations V1.3 / V1.3.1 n'est appliquée.** Conséquences mesurées en lecture seule : `authenticated` a encore `INSERT` sur `public.friendships` (faille d'amitié forcée ouverte, table vide : 0 ligne, donc aucune amitié forgée à nettoyer) ; `titan_play_checkout_ready_v1` et `titan_apply_play_entitlement_v1` n'existent pas (aucun achat Play ne peut être enregistré) ; 2 accès `manual`, aucun accès `google_play` ; correspondance `titan01/02/03` → offres déjà en place ; tâche horaire `titan_coach_seats_sweep` présente. Conseiller de sécurité Supabase : aucune erreur, 4 avertissements (fonctions `SECURITY DEFINER` exposées par conception, un `search_path` mutable sur `private.titan_intent_day_ok`, protection « mots de passe compromis » désactivée). |
| Illustrations | PR #147 (brouillon) : 4 blasons photoréalistes approuvés (Éclaireur, Explorateur, Sentinelle, Gardien), 153 propositions vectorielles en attente, aucune intégration. Son contrôle `render` échouait depuis l'approbation. |

## 2. Ce qui a été corrigé

### Paiements Google Play (priorité critique)

Cause la plus probable de l'incident V1.2.1 (paiement accepté, accès non ouvert) : l'application ouvrait Google Play sans vérifier que le serveur
pouvait enregistrer l'achat, et le serveur n'était pas configuré. Si l'achat venait d'un compte testeur de licence, la cause est le refus
volontaire des achats de test sur le service public (voir § 5). La V1.3.1 de `main` fermait déjà le premier cas ; restaient les défauts suivants.

| Défaut | Gravité | Correction | Preuve |
|---|---|---|---|
| Un achat accepté par Google mais jamais confirmé (application fermée pendant le contrôle bancaire, paiement en attente validé plus tard, réseau coupé, réponse perdue) ne pouvait être rattrapé que par le bouton « Restaurer mes achats ». | Majeur | `BillingRecovery` : à la connexion, au retour au premier plan et au retour du réseau, les achats que Play attribue à ce compte et qui ne sont pas soldés sont renvoyés au serveur, puis clôturés dans Play une fois l'accès ouvert. Silencieux, jamais pendant un paiement en cours, au plus une fois toutes les 5 minutes. | `mobile/__tests__/playBilling.test.ts` (6 scénarios de reprise), `billingRecovery.test.tsx` (5) |
| Le contrôle avant paiement ne prouvait que le droit de lire le catalogue. Un compte de service sans droit de lire les achats répondait « prêt », Google encaissait, puis toute vérification échouait. | Majeur | Le contrôle interroge Google sur un achat qui ne peut pas exister : « achat inconnu » prouve le droit, un refus ou une panne garde Google Play fermé. Il exige aussi que le point de notification (RTDN) soit configuré. | `tests/play-billing.test.mjs` (2 scénarios ajoutés, 40/40) |
| Un achat de test refusé renvoyait vers « Restaurer mes achats », qui ne peut jamais le rattacher. | Bloquant pour la recette | Message propre : achat de test, aucun accès ouvert, pas un paiement réel. | `playBilling.test.ts` |
| Après une erreur de confirmation, l'écran ne relisait pas le profil : un accès accordé dont la réponse s'était perdue restait invisible. | Mineur | Relecture du profil et de l'inventaire Play après toute erreur. | Relecture de code, suite de l'écran verte |
| Requêtes de facturation sans délai : l'écran pouvait tourner indéfiniment et bloquer la restauration. | Mineur | Abandon après 20 s. | `playBilling.test.ts` |
| Le prix affiché pouvait être celui d'un essai gratuit ou d'une offre annuelle, sans période. | Mineur | Prix récurrent de Google avec sa période (« 4,99 € / mois »), essai annoncé comme tel, offre mensuelle préférée (celle que le serveur contrôle). Aucun montant n'est écrit dans l'application. | `playBilling.test.ts` |

Non modifié, volontairement : le rapprochement horaire révoque un accès dont le produit n'est plus dans `PLAY_PRODUCT_IDS` (règle testée
existante). Une faute de frappe dans cette variable retirerait donc l'accès d'abonnés payants : la modifier demande une relecture.

### Sécurité sociale (Supabase)

Audit rejoué sur une base PostgreSQL locale (migrations complètes, requêtes hostiles sous le rôle `authenticated`).
La migration existante `20261110142656` ferme bien l'amitié forcée (insertion et mise à jour directes refusées, auto-acceptation impossible,
tiers refusé) et s'applique sans risque dans l'ordre prévu. Les défauts trouvés autour sont corrigés par une nouvelle migration additive,
`20261114160000_v131_social_consent_hardening.sql` : voir § 3 pour le détail et les preuves.

### Illustrations et intégration

- Les 4 blasons approuvés sont intégrés sur le Web et sur Android partout où un rang est affiché (bandeau du QG, carrière, profil, aventure,
  révélation de niveau, moment de séance). Champion, Titan et Légende gardent le blason vectoriel tant que leur visuel n'est pas approuvé :
  une ligne par rang suffit ensuite (`BADGES` dans `js/app/crest.js`, `rankImages` dans `mobile/src/core/images.ts`).
- Web : `/assets/ranks`, WebP transparents 256 et 512 px, `srcset`, boîte réservée, texte alternatif avec le nom du rang, petit fichier mis en cache hors ligne.
- Android : fichiers embarqués (hors ligne), petit fichier jusqu'à 86 dp, grand au-delà, même boîte de mise en page que le blason vectoriel.
- Registre des assets régénéré (`docs/V13_ASSET_REGISTRY.*`, famille `ranks`, provenance) ; registre de la bibliothèque graphique mis à jour sur la branche de design.
- Contrôle `render` de la PR #147 réparé : une proposition vectorielle remplacée par un master approuvé reste archivée sans faire échouer le contrôle.

## 3. Migration `20261114160000_v131_social_consent_hardening`

Additive, rejouable, sans suppression de ligne. S'applique après `20261110152900`. Les modifications de table tournent sous un délai de
verrou de 5 s : en cas de contention, rien n'est changé et le fichier se rejoue. Les signatures, formes de retour et droits des fonctions
sont conservés.

| Défaut constaté sur la base rejouée | Gravité | Correction |
|---|---|---|
| Supprimer son compte échouait au-delà de 30 amitiés (`SOCIAL_RATE_LIMIT`), et supprimer un utilisateur sans session (tableau de bord, API d'administration) échouait dès qu'il avait une amitié (`AUTH_REQUIRED`). | Majeur | Le garde de suppression laisse passer l'effacement du compte, un blocage et une suppression sans joueur connecté ; un rôle API sans identité reste refusé. |
| Le duel hérité `titan_create_social_challenge` permettait de défier un inconnu ou quelqu'un qui vous a bloqué, et révélait l'existence d'un compte. | Majeur | Réservé aux amis acceptés et non bloqués ; même refus pour un compte inconnu, un inconnu et un compte bloqué. |
| Dans un défi entre amis, tout membre invité ou inscrit lisait l'identifiant, le nom et la progression de tous les autres, y compris après un blocage ; un lien d'invitation ne vérifiait le blocage qu'avec le créateur. | Majeur | Un membre n'est nommé qu'à lui-même, à ses amis et à l'autre joueur d'un lien d'invitation (les deux ont consenti au duel) ; les autres apparaissent comme « Participant », sans identifiant ni progression. Un lien est refusé si un blocage existe avec un membre. Bloquer quelqu'un fait quitter les défis créés par l'autre. |
| `friendships.status` acceptait `NULL` (lu comme « accepté ») et aucune contrainte. | Mineur | `NOT NULL`, `pending` ou `accepted`, `pending` par défaut ; une ligne écrite directement par l'API ne peut être que `pending`. |
| Deux demandes d'amitié simultanées renvoyaient une erreur de clé unique brute. | Mineur | Deux demandes croisées deviennent une amitié. |
| `titan_admin_role` et `titan_is_admin` répondaient sur le compte d'autrui. | Mineur | Réponse réservée à son propre compte, aux administrateurs et au code serveur. |
| Refuser une demande, retirer un ami et bloquer partageaient le même quota horaire : on pouvait ne plus pouvoir bloquer un ami. | Mineur | Un blocage ne consomme plus ce quota. |

Effets visibles côté client : un participant anonymisé est affiché sans barre de progression (Web et Android adaptés).
Non corrigé, à suivre : `titan_challenge_result_v1` nomme encore tous les inscrits dans les résultats figés ; une invitation de binôme en
attente n'expire pas ; `titan_guild_week` montre les minutes des membres quel que soit leur réglage ; `titan_find_profile_by_friend_code` n'a pas de limite de débit.

## 4. Vérifications réellement effectuées

| Vérification | Résultat | Portée |
|---|---|---|
| `pnpm test` (Web) | 581 tests, 0 échec | Unitaires et contrats, Google et Supabase simulés |
| `pnpm run typecheck`, `build`, `audit`, `release-check` | Verts ; build : 153 fichiers hors ligne | Local |
| `npm test` (Android) | 773 tests, 76 suites, 0 échec | Jest, magasin Play simulé |
| `npm run typecheck` (Android) | Vert | TypeScript |
| Bundle Android de production (`expo export:embed`, facturation activée) | Généré, 43 assets dont les 8 blasons | JavaScript et assets ; pas Gradle |
| `tools/db/test-migrations.sh` | Vert : toutes les migrations, tous les tests SQL, contrats concurrents | PostgreSQL 16 local (la CI utilise 17.6) |
| `RELEASE_SQL=supabase/release-300.sql tools/db/test-migrations.sh` | Vert | Idem |
| Requêtes hostiles sous `authenticated` avant / après migration | Chaque exploitation refusée après | Base locale, comptes synthétiques |
| Parcours navigateur ciblés (Playwright) | Voir ci-dessous | Site construit, Supabase simulé |
| Captures de l'application Android (aperçu Web d'Expo, 412 × 915) | QG, Carrière, Profil, Aventure, montée de niveau, galerie des blasons : blasons nets, transparents, non déformés | Rendu navigateur, pas un téléphone |
| Composant Web des blasons à 390 et 1 100 px | 16 images chargées, carrées, texte alternatif présent, aucune requête en échec | Chromium |
| Chaîne de la bibliothèque graphique (`render.mjs`, `validate-proposals.mjs`) sur une copie | 0 anomalie, 617 références vérifiées | Local |
| Production Supabase | Lecture seule uniquement : registre, droits, conseiller de sécurité | Aucune écriture |

Parcours navigateur exécutés localement : passeport, parcours V1.3, assets de marque, CSP, tailles d'écran, accessibilité (axe), QG,
client de facturation, fumée, puis duels par lien, binôme, clubs, classement équitable, quête commune, saisons, comptes peuplés,
vitrine de profil et détail hebdomadaire. La suite complète (plus de 130 fichiers) est exécutée par la CI sur la PR.

## 5. Blocages et limites

### Illustrations manquantes : production bloquée

Un générateur d'images est connecté (Buzzy), mais la production n'a pas pu être menée :

1. **Crédits insuffisants** pour les modèles haut de gamme : `gpt-image-2.6-sunburst` et `Nano Banana Pro` ont répondu `insufficient credit`. Seul `Nano Banana 2` (1K) a accepté une génération.
2. **Téléchargement interdit** : les images produites sont servies par `res-prod.buzzy.now`, hôte refusé par la politique réseau de la session. La proposition d'un environnement autorisant cet hôte a été refusée.
3. **Bac à sable du générateur indisponible** (« this plan does not include the execution environment ») : impossible de voir, contrôler ou retoucher une image côté générateur.

Résultat : un seul candidat « Champion » a été généré, **jamais vu ni contrôlé, non enregistré dans le dépôt**
(`https://res-prod.buzzy.now/file-service/4668ac37-a4c8-4eb2-8326-08a30db8a84a.png`, projet Buzzy « TITAN V1.3.1 — illustrations »).
La génération a été arrêtée là : produire des dizaines d'images sans pouvoir les regarder aurait dépensé des crédits pour un résultat non vérifiable.
Aucun SVG ni dégradé n'a été fabriqué pour simuler les visuels manquants.

Restent donc à produire, dans le style des 4 blasons approuvés : les blasons **Champion, Titan, Légende** ; puis, par lots,
les 12 récompenses et leurs états, les 4 balises de chapitre, les paliers, les illustrations d'états vides, de social, de profil et d'onboarding.
Les mondes, gardiens et avatars actuels sont des illustrations existantes du produit et restent en place.

Pour débloquer : autoriser `res-prod.buzzy.now` dans les domaines autorisés de l'environnement (ou accepter la proposition d'environnement), et recharger les crédits du générateur.

### Paiements : ce que le code ne peut pas prouver

- Aucun achat réel n'a été effectué. Tous les scénarios Google sont simulés.
- **Un achat fait avec un compte testeur de licence sera toujours refusé par le service public** (choix existant : `PLAY_ALLOW_TEST_PURCHASES` n'est accepté que sur un banc isolé). La preuve finale demande soit le banc isolé décrit au dossier, soit un achat réel avec un compte non testeur, remboursé ensuite.
- Les variables Netlify `PLAY_*` (dont `PLAY_RTDN_*`, désormais exigées pour ouvrir un achat), les droits du compte de service Play et le branchement Pub/Sub ne sont pas lisibles d'ici.
- Les clients V1.2.1 (1301) déjà installés n'ont pas le contrôle avant paiement : garder les produits inactifs dans la Play Console tant que le serveur et les migrations ne sont pas en place, puis retirer 1301.
- La réponse exacte de Google à la sonde « achat inconnu » pour un compte sans droit (401 ou 403 attendu) reste à constater sur le banc.

### Autres vérifications impossibles ici

- Compilation Gradle et AAB signé : uniquement par le workflow `android-native.yml` (clé d'envoi en secret). Le bundle JavaScript Android de production a été généré localement avec ses assets.
- Appareil Android physique, e-mails de production, retours Google OAuth réels, Garmin réel, Health Connect réel.
- Recherche de secrets dans tout l'historique : le clone local est superficiel ; la CI le fait sur l'historique complet.

## 6. Opérations soumises à validation humaine

1. **Appliquer les migrations en production**, après sauvegarde et répétition sur copie, dans l'ordre : `20261104085851` (déjà présente hors registre : 6 fonctions portent `PT409`, à réconcilier), `20261105213712`, `20261110130137`, `20261110140000`, `20261110142656`, `20261110152700`, `20261110152800`, `20261110152900`, `20261114160000`. Puis contrôles `tools/db/postflight-v13.sql` et `postflight-v131.sql`. Tant que ce n'est pas fait, la faille d'amitié forcée reste ouverte en production et aucun achat Play ne peut ouvrir d'accès.
2. **Configurer et activer la facturation** : variables Netlify `PLAY_*` et `PLAY_RTDN_*`, droits du compte de service, Pub/Sub. Ne pas activer les produits dans la Play Console avant.
3. **Recette d'achat réelle** : achat, restauration, renouvellement, annulation, remboursement, prix TTC du dialogue Google (4,99 €, 19,99 €, 39,99 €), sur banc isolé ou avec un compte non testeur.
4. **Approuver les illustrations manquantes** une fois produites (Champion, Titan, Légende d'abord) ; décider du sort des 153 propositions vectorielles de la PR #147.
5. **Fusionner** la PR de finalisation, puis autoriser le SHA dans `TITAN_APPROVED_RELEASE_SHA` pour le déploiement Netlify.
6. **Lancer le build signé** `1.3.1 (1303)` (`android-native.yml`, clé d'envoi) et l'envoyer à Google Play.
7. Activer la protection « mots de passe compromis » dans Supabase Auth ; corriger le `search_path` de `private.titan_intent_day_ok` lors d'une prochaine migration.
8. Décision produit à trancher : `private.titan_coach_capacity` accorde 20 sportifs suivis à tout TITAN+ payant sans offre Coach (règle héritée de la V1), contre 5 pour Coach et 15 pour Coach Ultra.
