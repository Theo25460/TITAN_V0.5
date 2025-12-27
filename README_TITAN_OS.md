# Titan OS – Plateforme Gamifiée de Suivi Sportif

Titan OS est une application web front-end reliée à Supabase, qui transforme le suivi sportif
en expérience de jeu : boss, inventaire, quêtes, guildes, chat et progression joueur.

## Structure du projet

- `index.html` : hub central (vue d'ensemble, boss, résumé joueur)
- `login.html` : connexion / création de session locale
- `profile.html` : profil du joueur, inventaire, stats de base
- `training.html` : enregistrement des activités (pompes, course, etc.)
- `activities.html` : historique détaillé des séances
- `adventure.html` : système de boss / zone / combat
- `social.html` : partie sociale, hooks vers guildes / réseau
- `chat.html` : chat global temps réel basé sur Supabase Realtime
- `admin.html` : panneau d'administration (réservé aux comptes admin côté base)

- `js/main.js` : noyau système (état global, logique de progression, intégration Supabase)
- `js/chat.js` : gestion du chat temps réel
- `js/social.js` : logique sociale (hooks pour guildes, réseau, news)
- `js/items.js` : base des objets et rendu inventaire
- `js/data.js` : configuration statique (sports, boss, zones, talents, etc.)
- `sw.js` : service worker pour mise en cache offline basique

## Supabase

Le front utilise un client Supabase initialisé avec l'URL du projet et la clé `anon` publique.
Toute la sécurité réelle (permissions, contrôle des écritures, règles anti-triche, accès admin)
doit être gérée **dans Supabase** via les Row Level Security (RLS) et les politiques sur chaque table.

Rien dans ce projet n'empêche techniquement un utilisateur malveillant de modifier ses propres
requêtes si les règles côté base sont trop permissives. C'est un point à verrouiller en priorité
avant un déploiement public.

## Points forts techniques

- État global du joueur (profil, progression, inventaire, boss en cours) stocké dans `localStorage`
  via une clé unique `STATE_KEY`.
- Synchronisation possible avec Supabase pour :
  - les profils (`profiles`)
  - les activités (`activities`)
  - le chat (`messages`)
  - les guildes / raids (`guilds`, `guild_raid`)
- Système de boss avec :
  - HP, niveau, faiblesse par catégorie de sport
  - calcul d'énergie / dégâts basés sur l'activité
  - multiplicateurs globaux configurables dans `game_settings`
- Support du format GPX pour importer des traces de course / rando
- Service worker pour limiter les rechargements et améliorer le ressenti de "système"

## Sécurité (à faire côté base plus tard)

Avant un déploiement réel, il faudra :

1. Activer et vérifier la RLS sur :
   - `profiles`
   - `activities`
   - `messages`
   - `guilds`, `guild_raid`
   - `inventory`, `items`
2. S'assurer que :
   - un joueur ne peut lire / écrire **que** ses propres données
   - seuls les admins peuvent accéder aux données globales sensibles
   - les actions critiques (récompenses, crédits, XP) sont validées côté base

Ce front doit être considéré comme un **client de jeu**, pas comme une source de vérité.

## Déploiement

- Dossier racine : ce répertoire (`Titan_V0.1/` le plus profond)
- Fichiers importants :
  - `index.html` comme point d'entrée
  - `sw.js` enregistré dans `index.html` pour le PWA / cache
- Le `CACHE_NAME` dans `sw.js` est versionné (`titan-os-v5`) pour forcer
  une mise à jour des caches lors des prochaines publications.

## Utilisation en portfolio

Pour présenter Titan OS :

- Explique la vision : transformer un suivi sportif en univers de jeu cohérent.
- Montre la base Supabase : tables `profiles`, `activities`, `items`, `guilds`, etc.
- Montre le découpage des pages et la logique client.
- Mets en avant :
  - l'aspect produit (vision globale)
  - la structuration des données
  - l'utilisation d'un backend BaaS (Supabase)
  - la complexité gérable par un seul développeur (toi).

Ce document sert à cadrer le projet et le rendre lisible pour un jury, un recruteur
ou un collaborateur futur.
