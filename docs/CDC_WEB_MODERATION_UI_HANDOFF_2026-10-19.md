# Handoff — écran de modération du centre de contrôle (BOT04, BOT05, BOT03)

Chantier AUTRE — Claude Code, 19/10/2026, suite de `docs/CDC_WEB_MODERATION_QUEUE_HANDOFF_2026-10-19.md`. Branche `claude/titan-cahier-charges-0k7cdn` au-dessus de `c7fe4347b2844201c7c67049e190e7368e77a0d2`. Aucune fusion, aucun déploiement, aucune migration, aucune donnée réelle. Aucun SQL modifié.

## Résultat

| Point | Statut proposé | Ce qui le justifie |
|---|---|---|
| BOT04 — vue d'administration pour comprendre pourquoi un compte est signalé | `[x]` | Nouvel onglet « Modération » dans `admin.html` / `js/admin.js` : file classée, dossier d'un compte avec score expliqué, signaux, preuves brutes et décisions. |
| BOT05 — afficher les signaux à l'origine du score | `[x]` | Chaque ligne de la file et le dossier montrent raison, gravité, occurrences réelles, points et dates ; la règle de calcul est écrite dans le dossier ; les preuves brutes sont affichées (tronquées avec mention au-delà de 1200 caractères). |
| BOT03 — file de comptes/séances à examiner | `[~]` | File de **comptes** utilisable. Les séances concernées ne sont lisibles que dans les preuves brutes du dossier : pas de liste de séances dédiée. |
| BOT06 — actions graduées | `[~]` | Classer, surveiller, suspendre, rétablir et annuler sont utilisables depuis l'écran ; le retrait de récompenses ou de classement reste absent. |
| BOT08 — aucun accès public aux outils de modération | `[~]` proposé | Les fonctions refusent tout autre rôle que `admin`/`super_admin` côté serveur ; l'écran n'appelle rien pour un non-administrateur (test). La protection générale des autres endpoints d'administration n'a pas été auditée ici. |

## Comportement

- Appelle uniquement `titan_moderation_queue_v1`, `_case_v1`, `_decide_v1`, `_revert_v1`. Le serveur décide qui peut lire ou agir ; l'écran affiche et demande.
- Décisions : motif obligatoire via la confirmation existante du centre de contrôle ; fermer la confirmation par la croix ou en cliquant à côté l'annule (comportement ajouté à `closeModal`, commun à toutes les confirmations du centre : elles traitaient déjà « Annuler » comme un refus, la croix laissait une promesse en attente).
- Erreurs du serveur traduites (déjà suspendu, administrateur, état modifié ailleurs, dernière décision seulement, etc.). États : file vide, serveur sans la migration (message indiquant `20261019150000_moderation_queue.sql`), accès refusé.
- Un compte classé sans suite sort de la file : son dossier reste accessible depuis la liste des **Utilisateurs** (nouveau bouton) et par **identifiant** dans l'onglet, donc sa décision reste annulable. L'annulation d'un classement indique les signaux rouverts sur les signaux attendus.
- Un compte **banni** n'offre ni suspension ni rétablissement (un bannissement se lève hors de cette file) ; classer, surveiller et annuler restent possibles.
- Tout texte venant du serveur (noms, raisons, preuves) est échappé ; rien n'est exécuté (test avec une balise `img` piégée).
- Si le rafraîchissement échoue après une décision déjà enregistrée, un message le dit ; l'écran n'est plus repeint si l'administrateur est parti ailleurs.
- CSS : le dialogue ne dépasse plus l'écran à 360 px (colonne de grille bornée, défilement interne des tableaux) ; règles fusionnées avec les règles d'origine du dialogue, donc valables pour tous les dialogues du centre.

## Fichiers

`js/admin.js` (+ version 300.1 dans `admin.html`), `css/admin.css`, `tests/e2e/admin-moderation.e2e.mjs` (ajouté au script `test:e2e` de `package.json`, sans quoi la CI ne l'exécuterait pas). Aucun fichier réservé (Profil, `smoke.e2e.mjs`, RPG, Android) modifié.

## Vérifications

- RED avant implémentation : cinq des six premiers parcours échouaient (onglet absent) ; le sixième, accès refusé d'un non-administrateur, passait déjà et verrouille ce comportement.
- 10 parcours navigateur (Chromium, serveur d'administration simulé qui enregistre ses appels) : file classée, texte échappé, aucune preuve brute dans la file, états vide / ancien serveur / refusé, non-administrateur sans appel, dossier, motif obligatoire, suspension puis rétablissement et annulation, refus du serveur, 360 px sans débordement, dossier retrouvé par identifiant après classement et annulation partielle, fermeture par la croix, compte banni et preuve tronquée, lien depuis les utilisateurs, échec de rafraîchissement signalé. Une mutation sans échappement est détectée.
- `pnpm run verify` : 219/219, build et audit sans erreur (16 avertissements préexistants). Suite E2E complète : voir la note de clôture du cahier.
- Revue de code unique : 9 remarques. 8 corrigées (le classement faisait disparaître le dossier, rafraîchissement sans garde, compte banni, fermeture par la croix, vue quittée, troncature silencieuse, CSS dupliqué, tests insuffisants) ; 1 documentée (texte de la règle de score écrit en dur, voir ci-dessous).

## BLOQUANT À CORRIGER MAINTENANT

Aucun Critical/Important connu ouvert. Rappel : `profile.html` charge encore `training-store.js?v=300.0` (réservation Codex du Profil).

## NON BLOQUANT / BACKLOG FINITION

- La règle de score (poids 1/3/8/20, 3 occurrences, 30 jours) est écrite en dur dans le texte du dossier comme dans le SQL : à renvoyer par le serveur si elle change.
- Les actions « Suspendre / Bannir / Réactiver » de l'onglet **Utilisateurs** passent par l'ancienne RPC directe : elles sont journalisées (journal d'audit, `admin_logs`) mais ne créent pas de décision de modération annulable. À rapprocher, sans supprimer les anciennes actions.
- Les modérateurs ne voient pas encore l'onglet (réservé aux administrateurs côté serveur).
- Pas de pagination au-delà de 100 comptes dans la file.
- Aucun test avec le vrai serveur ni un compte réel : recette réelle après déploiement.

## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE

CHEAT12/CHEAT13 (score de risque et états par séance) pour alimenter la file avec des signaux de séance, ou un autre macro-bloc non réservé : Android et intégrations santé, ou monétisation. RPG réservé à Codex.

## Retour arrière

Rétablir `js/admin.js`, `css/admin.css`, `admin.html` et `package.json` à l'arbre parent (`c7fe434`) et supprimer `tests/e2e/admin-moderation.e2e.mjs`. Aucune donnée ni migration concernée ; les décisions déjà enregistrées restent dans la base et lisibles par les fonctions.
