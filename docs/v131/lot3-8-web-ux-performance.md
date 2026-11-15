# Lots 3 et 8 · Application Web privée — UX, performance mesurée, accessibilité, stabilité

> Document en cours d’écriture (15/11/2026). Les sections marquées « à compléter » ne sont pas terminées : rien n’y est affirmé.

Périmètre : pages privées (`aujourdhui`, `training`, `journal`, `stats`, `records`, `carriere`, `objectifs`, `prevoir`, `adventure`, `profile`, `social`, `coaching`, `boutique`, `onboarding`, `login`, `update-password`, `athlete`, `defi`), `js/app/*.js` (sauf `crest.js`), `js/*.js` (sauf GPX et import/export, `ga4-consent.js`), `css/*.css`, `sw.js`. Références : [`cahier-reference.md`](cahier-reference.md), [`vocabulaire.md`](vocabulaire.md).

## 1. Méthode et limites

- Build « comme en production » : copie du dépôt dans `/var/tmp/titan-web-base/` (état avant ce lot) et `/var/tmp/titan-web/` (état après), `node tools/build-public.mjs` dans la copie ; le `dist/` partagé du dépôt n’a pas été reconstruit.
- Serveur de mesure : serveur statique local reproduisant `netlify.toml` (Brotli, `Cache-Control` par dossier, adresses sans `.html`). **Ce n’est pas Netlify** : HTTP/1.1 local, pas de CDN, pas de HTTP/2.
- Mesures : Lighthouse 12 (Chromium 153 sans interface), une passe par page et par profil ; mobile = profil Lighthouse par défaut (4G lente simulée 1,6 Mbit/s, 150 ms, processeur ×4), ordinateur = `--preset=desktop`. Les requêtes vers Supabase et Google sont bloquées (aucune lecture de production). État mesuré : session découverte (aucun compte), première visite, sans cache ni service worker.
- Captures : Chromium, 360, 768 et 1280 px, session découverte vide puis avec 60 séances fictives injectées. **Aucun téléphone réel, aucun lecteur d’écran, aucun compte réel.**
- Aucune note de simplicité n’est validée par des humains (UX-131-06/07).

## 2. Mesures de départ (avant ce lot), 14/11/2026

| Page | Profil | Score | FCP | LCP | TBT | CLS | Poids transféré | Requêtes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` (accueil public, mesure seule) | mobile | 99 | 0,91 s | 2,26 s | 42 ms | 0,000 | 211 Ko | 12 |
| `/` | ordinateur | 100 | 0,26 s | 0,56 s | 0 ms | 0,000 | 302 Ko | 12 |
| `/aujourdhui` | mobile | 83 | 1,11 s | 4,75 s | 42 ms | 0,000 | 461 Ko | 55 |
| `/aujourdhui` | ordinateur | 99 | 0,43 s | 0,96 s | 0 ms | 0,000 | 531 Ko | 55 |
| `/training` | mobile | 81 | 2,91 s | 4,14 s | 33 ms | 0,009 | 435 Ko | 47 |
| `/training` | ordinateur | 99 | 0,60 s | 0,87 s | 0 ms | 0,005 | 435 Ko | 47 |
| `/profile` | mobile | 83 | 1,89 s | 4,54 s | 55 ms | 0,000 | 462 Ko | 56 |
| `/profile` | ordinateur | 99 | 0,39 s | 0,93 s | 0 ms | 0,005 | 462 Ko | 56 |
| `/adventure` | mobile | 80 | 1,47 s | 5,36 s | 14 ms | 0,000 | 688 Ko | 78 |
| `/adventure` | ordinateur | 96 | 0,65 s | 1,34 s | 0 ms | 0,000 | 877 Ko | 78 |

Constats de départ : 33 à 34 scripts par page (274 Ko compressés), polices 113 Ko, le contenu principal est dessiné par JavaScript après le dernier script (d’où un LCP mobile de 4 à 5 s en 4G lente simulée) ; plusieurs fichiers partagés sont appelés sous des clés `?v=` différentes selon la page et donc téléchargés deux ou trois fois.

Axe (WCAG 2.0/2.1/2.2 A et AA) avant ce lot, 20 pages × 2 états × 2 largeurs : seule `adventure` échoue (`target-size` : deux boutons radio « Ton chemin », un `summary`).

## 3. Re-contrôles de stabilité (15/11/2026)

Méthode : Chromium piloté par Playwright sur le build de `/var/tmp/titan-web`, compte synthétique, Supabase simulé par interception (aucune écriture réelle). Scripts d’expérience hors dépôt (`scratchpad/web/exp*.mjs`) ; ce qui est devenu un test est cité.

| Élément | Attendu | Réalité constatée | Écart | Gravité | Correction | Preuve | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Boucle d’enregistrement du profil (PR #133) | Aucune écriture sans modification ; pas de réessai en boucle | 6 pages ouvertes 23 s sans action : 0 appel `titan_save_profile_state`, aucun appel après le chargement. Modification réelle de la semaine type : 2 appels pour 2 valeurs distinctes | Aucun | — | Aucune | `exp1.mjs`, `exp2.mjs` ; `tests/profile-sync-backoff.test.mjs` (22 tests), `tests/e2e/profile-sync.e2e.mjs` | Vérifié conforme |
| Conflit de version `40001` | Une tentative, copie locale gardée, pas de réessai automatique ni au rechargement | 1 appel en 40 s, panneau de récupération affiché, 0 appel après rechargement | Aucun | — | Aucune | `exp2.mjs` (mode 40001) ; `profile-sync.e2e.mjs` | Vérifié conforme |
| Serveur en erreur 503 / réseau coupé | Réessai borné et espacé | 503 : 2 appels en 40 s (le second à 30 s) ; réseau coupé : 1 appel, reprise au retour du réseau | Aucun | — | Aucune | `exp2.mjs` ; test « automatic retries stop after six failures » | Vérifié conforme |
| Fenêtre héritée « Bienvenue dans TITAN OS » | Rien ne couvre le QG d’un nouveau compte | **Reproduit** : tout compte connecté qui ne l’avait pas vue recevait une fenêtre modale de huit blocs (vocabulaire retiré : « boss », « guilde », « Boutique », « charge, fraîcheur, radar »), icônes vides, lien vers une page supprimée, et une écriture du profil à la fermeture | Parcours de première connexion masqué | **P0** | Fenêtre retirée (`js/ui.js`), remplacée par trois lignes dans le QG | `before-auth/auth-aujourdhui-360.png` ; test « a signed-in new account lands on a readable QG » (`tests/e2e/v131-web-ux.e2e.mjs`) | Corrigé et vérifié |
| Service worker après un déploiement : page et scripts | Jamais d’ancienne page avec de nouveaux scripts, ni l’inverse | Déploiement A → B : dès le premier affichage, page, scripts (`rev=`) et styles (clé changée) sont ceux de B | Aucun | — | Aucune | `exp_sw.mjs` | Vérifié conforme |
| Service worker après un déploiement : feuille de style dont la clé `?v=` n’a pas changé | Styles à jour | **Reproduit** : le premier affichage après le déploiement sert l’ancienne feuille depuis le cache (à jour à l’affichage suivant). La nouvelle version restait ensuite « en attente » indéfiniment tant que le bouton n’était pas pressé, avec 2 à 3 générations de cache conservées (≈ 15 Mo chacune) | Styles périmés un affichage ; stockage | P1 | `js/pwa.js` : une version en attente est appliquée au démarrage de la page suivante (jamais sur une page déjà utilisée) ; clés de styles unifiées et changées. Reste : le build n’ajoute `rev=` qu’aux scripts — **à faire par : intégration (`tools/build-public.mjs`)**, ajouter l’empreinte aux feuilles de style | `exp_sw.mjs`, `exp_sw4.mjs` (rechargement automatique 1,1 s après le chargement, une seule génération de cache ensuite) ; `tests/pwa-update.test.mjs` (5 tests) | Corrigé et vérifié (mesure locale) ; reste côté build |
| Changement de compte pendant une écriture | Rien du compte A n’arrive chez B | Séance de A en vol, déconnexion, connexion de B, réponse tardive : journal de B vide, XP inchangée, aucune requête de séance avec le jeton de B, file de A invisible pour B | Aucun | — | Aucune | `exp5.mjs` ; `session-routine-isolation`, `qg-context`, `moment-context-focus` | Vérifié conforme |
| Double clic sur « Enregistrer » | Une séance | Double clic puis Entrée : 1 appel `titan_submit_training_session`, 1 séance | Aucun | — | Aucune (garde déjà en place) | `exp3.mjs` ; test « a double click on Enregistrer sends one session » | Vérifié conforme |
| Retour arrière sur la page Séance | Retour du formulaire vers la liste des sports | **Reproduit** : le choix d’un sport remplaçait l’entrée d’historique ; Retour quittait la page vers le QG | Navigation imprévisible | P1 | `js/app/seance.js` : le formulaire est une étape d’historique ; Retour montre la liste et garde le brouillon, Avancer le rouvre ; après enregistrement, un seul Retour quitte la page | tests « session page: Back returns… » et « …without a dead history step » | Corrigé et vérifié |
| Hors ligne | Pages servies par le cache, séance gardée puis envoyée une fois | 152 ressources en cache ; 6 pages s’ouvrent hors ligne ; séance saisie hors ligne : « Confirmation en attente », 0 envoi ; après rechargement hors ligne toujours en file ; au retour du réseau 1 envoi, 1 identifiant, statut confirmé | Aucun | — | Aucune | `exp6.mjs` ; `smoke.e2e.mjs`, `queue-503-retry`, `authenticated-session-resume` | Vérifié conforme (Chromium, réseau simulé) |

## 4. Matrice UX, accessibilité, performance après

À compléter.
