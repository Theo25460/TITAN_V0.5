# TITAN OS v87 - Audit final de diffusion

Date: 2026-07-30  
Production: https://titan-app.fr  
Netlify deploy: `6a6badf91ff4857d2930188d`

## Verdict

La release technique v87 est construite, migree et publiee. Les parcours publics et les principaux parcours applicatifs sont fonctionnels en mode invite, sans erreur navigateur observee. La direction artistique a ete conservee.

La diffusion commerciale large reste conditionnee a trois actions proprietaire: rotation de la cle Supabase serveur, activation de la protection contre les mots de passe compromis et remplacement des mentions legales incompletes par l'identite juridique reelle.

## Lecture concurrence

- Hevy concentre sa valeur sur la saisie rapide, la progression et le social.
- Strava combine journal, objectifs, classements et analyse.
- Habitica transforme les habitudes en quetes, recompenses et groupes.
- Zombies, Run! mise sur l'immersion narrative pendant l'effort.

TITAN OS couvre deja ces quatre axes dans une meme experience: journal sportif, progression mesurable, social/guildes et aventure. La v87 privilegie donc la fiabilite, l'onboarding et la lisibilite au lieu d'ajouter des modules concurrents redondants.

Sources:

- https://www.hevyapp.com/features/
- https://support.strava.com/en-us/articles/15402044-strava-subscription-features
- https://habitica.com/static/features?mobile-app=true&theme=dark
- https://support.zombiesrungame.com/hc/en-us/articles/4420999056145-Getting-Started-with-Zombies-Run

## Frontend et pages

- 32 pages publiques auditees en desktop.
- Parcours critiques controles a 360 px: accueil, connexion, entrainement, boutique, social, profil, sante, statistiques, trophees, legal et changelog.
- Aucun overflow horizontal, lien interne casse, image cassee, ID duplique ou erreur JavaScript observe.
- H1, `main`, meta principales, canonicals et JSON-LD valides sur le perimetre public.
- Appels Supabase invites corriges sur Social: aucun RPC ou SELECT profil n'est envoye avec un ID `guest_*`.
- Boutons icone, sliders sante, select statistiques, import GPX et images dynamiques completes avec des noms accessibles.
- Publicite desactivee tant que `ads.txt` n'est pas finalise; aucun preconnect, script ou domaine Adcash n'est autorise par la CSP.

## Images et performance

- Sources PNG/JPEG conservees dans le workspace.
- Variantes WebP generees pour 50 avatars, mobs et boss.
- Assets publies correspondants: 121,49 Mio -> 6,66 Mio.
- Build public complet: environ 9,06 Mio.
- Controle visuel effectue sur plusieurs boss et avatars: DA, cadrage et lisibilite conserves.

## PWA et cache

- Version runtime, cache-busters et service worker alignes en v87.
- Precache etendu aux pages compte/social/chat/activites.
- Installation du service worker resiliente: une ressource indisponible ne fait plus echouer tout le precache.
- CSS/JS: cache 7 jours avec revalidation.
- Images: cache 30 jours avec revalidation.
- Service worker: `no-cache`.

## Supabase

Projet: `oubmftfufwwzwpgvrcag`  
Region: `eu-west-1`  
Etat audite: `ACTIVE_HEALTHY`

Migrations v87 appliquees:

- `titan_rls_auth_select_performance_v87`
- `titan_billing_event_ordering_v87`

Resultats:

- 93 alertes `auth_rls_initplan` supprimees; aucune restante.
- Toutes les tables applicatives exposees conservent RLS.
- RPC billing Paddle reservee a `service_role`; `anon` et `authenticated` n'ont pas `EXECUTE`.
- Les webhooks plus anciens que l'etat Elite courant sont ignores atomiquement.
- 100 dernieres requetes API relues apres correction: 96 HTTP 200, 4 HTTP 201, aucun 4xx/5xx.
- 25 warnings `SECURITY DEFINER` documentes et verifies dans `SUPABASE_SECURITY_REVIEW_V87.md`.
- 59 warnings de policies permissives multiples restent a consolider table par table sur staging.
- 51 index sont signales `unused_index`; ne pas les supprimer sans historique de charge.

## Paddle et fonction Netlify

- Signature HMAC et tolerance temporelle conservees.
- Limite de payload: 128 Kio.
- Idempotence par `event_id`.
- Ordonnancement par `occurred_at`.
- Produit/prix Elite controles par variables Netlify.
- Fonction publiee avec `esbuild` sur `nodejs24.x`.
- GET/HEAD refuses en 405.
- POST sans signature refuse en 401.
- Tests unitaires: 5/5.

## Netlify production

- Etat du deploy: `ready`.
- 91 fichiers publies.
- 150 redirects traites sans erreur.
- 48 regles de headers traitees sans erreur.
- 1 fonction publiee.
- Route inconnue: HTTP 404.
- `/sql/*`: HTTP 404.
- Accueil: HTTP 200.
- WebP: HTTP 200 et `Content-Type: image/webp`.
- CSP, HSTS, `X-Content-Type-Options` et `X-Frame-Options` actifs.
- Scan secret Netlify: aucune correspondance dans les fichiers deployes.

## Tests locaux

- `pnpm test`: 72 scripts analyses, 5 tests webhook reussis.
- `tools/audit-public.mjs`: 32 HTML, 4 CSS, 31 JS, zero finding.
- `pnpm audit --prod`: aucune vulnerabilite connue.
- Build public filtre: aucun SQL, outil, document interne, `node_modules` ou console admin secrete dans `dist`.

## Actions proprietaire encore requises

1. Regenerer la cle serveur Supabase, puis recreer `SUPABASE_SERVICE_ROLE_KEY` comme variable Netlify secrete et limitee aux fonctions. Ne pas reutiliser l'ancienne valeur.
2. Activer la protection contre les mots de passe compromis dans Supabase Auth.
3. Completer les mentions legales avec l'identite, l'adresse, l'immatriculation et la TVA reelles si applicables avant exploitation commerciale large.
4. Executer dans Paddle sandbox ou production controlee un cycle signe complet: creation, renouvellement, impaye, pause, annulation et remboursement.
5. Soumettre `sitemap.xml` dans Search Console et surveiller les vraies 404.

## Documentation de reference

- `SUPABASE_SECURITY_REVIEW_V87.md`
- `PUBLIC_RELEASE_SQL_ORDER.md`
- `PUBLIC_RELEASE_QA_CHECKLIST.md`
- `TODO_PUBLIC_RELEASE.md`
