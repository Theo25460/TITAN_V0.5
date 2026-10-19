# Handoff — inventaire technique des tiers et traceurs (LEG40, LEG29, LEG03)

Chantier AUTRE — Claude Code, 19/10/2026, au-dessus de `03f10b1`. Aucune fusion, aucun déploiement, aucun texte juridique publié modifié, aucune qualification juridique. `netlify.toml` (CSP) et `js/config.js` non modifiés.

## Résultat

| Point | Statut proposé | Ce qui le justifie |
|---|---|---|
| LEG40 — inventorier cookies, SDK, stockages, scripts et identifiants | `[~]` | `docs/PRIVACY_TECHNICAL_INVENTORY.md` §1-2 : hôtes tiers (15 relevés, rôle, moment de contact, images de contenu comprises), aucun cookie, tableau des clés `localStorage` / IndexedDB / cache avec finalité. Garde-fou : `tests/third-party-hosts.test.mjs`. Reste ouvert : décision sur la nécessité de chaque clé (consentement), CSP à resserrer, effacement complet à la suppression de compte à vérifier. |
| LEG29 — recenser les sous-traitants réels | `[~]` | Tableau des tiers : Netlify, Supabase (région `eu-west-1`), Paddle, Resend, GitHub, Discord (lien), Adcash (désactivé). Contrats, localisation de Netlify/Paddle/Resend et rôle juridique de chacun non établis. |
| LEG03 — documenter données, finalités, durée | `[~]` | §3 : catégories de données par table et finalité. Les **durées sont absentes volontairement** (Q-002 non tranchée). |

## Changement de code

Retrait de `<link rel="preconnect">` et `<link rel="dns-prefetch">` vers `cdn.jsdelivr.net` dans `admin.html`, `dynamic-page.html`, `sys_core_override_99.html` : aucun script ou style n'y était chargé, mais le navigateur ouvrait quand même une connexion vers cet hôte tiers à chaque ouverture de ces pages. Plus aucune page ne contacte un tiers au chargement hors Supabase.

## Vérifications

- RED avant retrait : le test « aucune page ne contacte un tiers au chargement » échouait sur les trois pages. Mutations détectées : script tiers ajouté à une page (2 échecs), nouvel hôte dans un script livré (1 échec).
- 3 tests : hôtes livrés = inventaire (ni manquant ni périmé), aucune ressource tierce au chargement, publicité désactivée (`adsEnabled` faux et script absent de la CSP).
- Revue de code unique : 4 familles de remarques, traitées : affirmation fausse sur la mesure d'audience (un comptage **anonyme est envoyé avant tout choix** ; refusé = rien ; accordé = rattaché au compte), `img-src https:` ouvert et images de contenu venues de la base, Paddle plus large que `cdn.paddle.com` (cadres `*.paddle.com`, identifiant de compte transmis en `customData`), clés de stockage manquantes (sessionStorage, anciennes clés de paiement, brouillon ancien format, IndexedDB), cookies qualifiés « code du site seulement ». Le test est durci : `ws`/`wss`, casse, jokers `*.hôte`, IPv4, `_redirects`, `ads.txt`, `android/`, et la CSP est comparée à l'inventaire (hôtes et autorisations de schéma seul). Non traité : balises `source`/`video`/`srcset`, URL construites par concaténation.
- `pnpm run verify` : voir clôture.

## BLOQUANT À CORRIGER MAINTENANT

Aucun Critical/Important connu ouvert.

## NON BLOQUANT / BACKLOG FINITION

- **CSP** (`netlify.toml`) : retirer `cdn.jsdelivr.net`, `unpkg.com`, `fonts.googleapis.com`, `fonts.gstatic.com` (rien n'y est chargé) lors d'un lot de déploiement dédié, avec contrôle en navigateur des pages d'administration et de contenu dynamique.
- **Effacement à la suppression de compte** : `titanForgetOwnerDrafts` n'efface que les brouillons de séance ; les clés suffixées par le compte (`titan_goals_v1:`, `titan_adventure_v1:`, marqueur de paiement) restent sur l'appareil. À corriger dans `js/training-store.js` (fichier lié au lot suppression de compte déjà livré) ou à documenter.
- **À qualifier par un humain : le comptage anonyme envoyé avant tout choix de consentement** (`js/app/analytics.js`, état « aucune réponse »), et l'identifiant de compte transmis à Paddle.
- Images de contenu : `img-src https:` laisse tout hôte d'image voir l'IP ; auditer `dynamic_pages.cover_image_url` et les `image_url` des tables de jeu, puis resserrer.
- Production : la base annonce PostgreSQL 17.6 alors que le banc de migrations tourne en PostgreSQL 16 : à aligner pour la répétition de mise en production.
- Localisation et contrats des sous-traitants, bases légales, durées, usage des anciennes tables : humains.
- `sys_core_override_99.html` est une page livrée au nom peu explicite (lien « développeur » dans `js/ui.js`) : à confirmer qu'elle doit être publique.

## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE

Décisions humaines : Q-001, Q-002, CHEAT14/15. Techniquement, sans collision : effacement complet des clés suffixées à la suppression de compte, resserrement de la CSP.

## Retour arrière

Remettre les six lignes de préconnexion dans les trois pages, supprimer `docs/third-party-hosts.json`, `docs/PRIVACY_TECHNICAL_INVENTORY.md`, `tests/third-party-hosts.test.mjs` et son entrée de `package.json`. Aucune donnée concernée.
