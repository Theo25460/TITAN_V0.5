# Handoff — ADR architecture cible Android (A04, A05, AND17)

Chantier AUTRE — Claude Code, 19/10/2026, au-dessus de `aa2d7cb`. Documentation seulement : aucun code, aucun fichier Android, workflow ni `docs/ANDROID.md` modifié, aucune action dans Play Console, aucune décision prise.

## Résultat

| Point | Statut proposé | Ce qui le justifie |
|---|---|---|
| A04 — architecture cible unique web / PWA / Android | `[~]` | `docs/adr/ADR-001-architecture-cible-android.md` (statut Proposé) : une base de code, deux étages (TWA maintenant, Capacitor quand une fonction native l'exige), pas de natif complet ; options, critères, conséquences, actions. Non validée par Théo. |
| A05 — Capacitor ou équivalent | `[~]` | Capacitor retenu comme étage 2 proposé ; sa faisabilité (session, hors ligne, Paddle, Health Connect) n'est **pas vérifiée** : étude jetable décrite (action 3). |
| AND17 — couche unifiée « sources d'activité » | `[ ]` inchangé | Seule la position d'architecture est posée (couche côté web et base, indépendante de la coque) ; rien n'est conçu ni codé. |

## Ce qui n'est pas établi

Comportement réel de Capacitor sur l'origine, la session Supabase et le service worker ; existence d'un plugin Health Connect adapté ; règles de facturation Google Play en vigueur ; fonctionnement réel de la TWA (workflow jamais exécuté). Ces points sont marqués « à vérifier » dans l'ADR et ne doivent pas être pris pour acquis (GP01).

## BLOQUANT À CORRIGER MAINTENANT

Aucun Critical. Décision humaine : Q-001 reste le prérequis de toute publication. Point de conformité relevé par la revue (pas un blocage de ce lot) : dans la coque, seul l'Atelier masque le bouton d'achat TITAN+, par une heuristique `localStorage` (`titan_twa`) partagée avec Chrome ; `openEliteCheckout` n'est gardé nulle part (voir l'ADR). À traiter par WORK/Codex avec la décision de facturation (GP01).

## NON BLOQUANT / BACKLOG FINITION

Étude de faisabilité Capacitor ; conception de la couche « sources d'activité » ; vérification de la politique de facturation Google ; mise à jour de `docs/ANDROID.md` si l'ADR est accepté (réservé à WORK et Codex).

## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE

Réponse de Théo à Q-001 et au principe de l'ADR ; ensuite l'étude de faisabilité (AND01-AND03 selon le résultat) ou la couche « sources d'activité » (AND17), qui est indépendante de la coque. Q-002 et CHEAT14/15 restent à trancher.

## Revue

Revue de code unique : 6 familles de remarques, traitées dans l'ADR — affirmations non vérifiées reformulées en « attendu », description exacte du masquage de l'achat, détecteur de plateforme pour Capacitor, origine à autoriser (Supabase, Paddle), bascule TWA → Capacitor (gratuite avant publication seulement : même paquet, clé de signature, `versionCode`, perte des données locales), notifications, lecture Health Connect en arrière-plan et déclaration Google Play, mots « rejetée » / « bascule » nuancés.

## Retour arrière

Supprimer `docs/adr/ADR-001-architecture-cible-android.md` et ce document. Aucune donnée ni code concerné.
