# Handoff — exclusion confirmée d'une séance (CHEAT14, CHEAT15)

Chantier AUTRE — Claude Code, 19/10/2026, au-dessus de `b6f2912`. Aucune fusion, aucun déploiement, aucune migration appliquée à un projet réel. Décision prise par le développeur sur consigne de Théo (décider sans redemander, revue finale).

## Décision

**L'exclusion d'une séance n'est jamais automatique.** Un administrateur la confirme, avec un motif, depuis le dossier de modération ; elle est auditée et réversible ; la séance reste visible du joueur ; seuls les classements et récompenses compétitives (`is_suspicious`, déjà respecté par les classements, l'Aventure et la carte publique) l'ignorent. Les XP et crédits déjà acquis ne sont pas repris. Un score élevé ne suffit pas : on évite ainsi qu'un athlète exceptionnel soit puni par un faux positif (BOT07, CHEAT10).

## Résultat

| Point | Statut proposé | Ce qui le justifie |
|---|---|---|
| CHEAT14 — séance suspecte visible mais exclue des récompenses compétitives le temps de la vérification | `[~]` | `titan_session_exclusion_v1(séance, exclue, motif)` + boutons « Exclure / Rétablir dans les classements » dans le tableau des séances du dossier. La séance reste lisible par son propriétaire (test). Pas de procédure d'appel pour le joueur (CHEAT19). |
| CHEAT15 — pas de récompense exploitable tant que les contrôles ne sont pas passés | `[~]` | L'exclusion retire la séance des classements ; l'attribution à l'enregistrement reste celle du moteur serveur existant, sans retenue préalable : une séance suspecte a déjà donné ses XP au moment où elle est examinée. Une retenue avant attribution reste à concevoir. |
| CHEAT12/CHEAT13 — score et états reliés à une action | `[~]` | Les états « À examiner » et « Urgent » ouvrent maintenant une action humaine ; aucun lien automatique. |

## Défaut réel corrigé

Depuis la garde v300 (`titan_guard_training_log`), l'onglet **Activités** du centre de contrôle ne pouvait plus modifier `is_suspicious` ni `status` d'une séance d'un autre joueur : `TRAINING_USER_MISMATCH` (reproduit sur le banc). La garde reçoit une **exemption étroite et explicite** : marqueur local à la transaction posé seulement par `titan_session_exclusion_v1`, appelant administrateur, et **aucune colonne autre que les colonnes de revue** ne peut différer. Le reste du corps de la garde est identique à v300 (extrait programmatiquement). Une première approche (effacer temporairement l'identité JWT dans la fonction) a été **refusée par le contrôle automatique de sécurité de la session** et abandonnée au profit de cette exemption explicite.

## Fonctionnement de la RPC

Administrateurs seulement (rôle lu sur le profil) ; motif de 3 à 500 caractères ; refus de sa propre séance, d'une séance d'administrateur, d'une séance inconnue ; idempotente (aucun second audit si l'état est déjà celui demandé) ; écrit `is_suspicious`, `status` (valid ↔ suspicious seulement), `admin_note`, `reviewed_at`, `reviewed_by` et une entrée `session.exclusion` dans `titan_admin_audit` (administrateur, joueur, séance, motif, état précédent).

## Fichiers

`supabase/migrations/20261019210000_session_exclusion.sql`, `sql/tests/300_session_exclusion.sql`, `300_z_session_exclusion_migration.sql`, `js/admin.js` (+ version 300.3 dans `admin.html`), `tests/e2e/admin-moderation.e2e.mjs` (2 parcours, serveur simulé étendu), plan de production et contrôle préalable (17 migrations).

## Vérifications

- RED avant migration et avant interface. Banc PostgreSQL 16 deux voies vertes, rejeu transactionnel. Mutations détectées : contrôle administrateur retiré de la garde, exemption élargie à toutes les colonnes, marqueur non effacé, cible administrateur autorisée, non-idempotence.
- 15 parcours navigateur de l'écran de modération verts (motif obligatoire, annulation par la croix, exclusion puis rétablissement, refus serveur expliqué).
- `pnpm run verify` : voir clôture. Revue de code unique : voir ci-dessous.

## BLOQUANT À CORRIGER MAINTENANT

Aucun Critical/Important connu ouvert.

## NON BLOQUANT / BACKLOG FINITION

- Retenue avant attribution (CHEAT15 strict) : décider d'un délai de maturation des récompenses compétitives pour les séances à risque.
- Procédure d'appel pour le joueur (CHEAT19) et information du joueur sur l'exclusion de sa séance.
- L'onglet Activités garde son éditeur générique (maintenant fonctionnel pour les administrateurs grâce à l'exemption) : à rapprocher de cette action pour ne pas avoir deux voies.
- Production : la garde v300 n'est pas encore appliquée (migration 20261005160000 dans le lot en attente).

## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE

Q-001 (paquet Android) : décision à prendre par le développeur d'après l'état du Play Console ; matrice de conservation proposée pour Q-002 ; effacement complet des clés à la suppression de compte.

## Retour arrière

Rejouer le corps de `titan_guard_training_log` de `20261005160000_ascension_progression_v300.sql`, puis `drop function public.titan_session_exclusion_v1(uuid, boolean, text);`, rétablir `js/admin.js`/`admin.html` à `b6f2912` et retirer les deux parcours du test. Les entrées d'audit déjà écrites restent (elles sont immuables par usage).
