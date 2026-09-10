# Tests de release TITAN OS v90

Date d’exécution : 31 juillet 2026  
Environnement : aperçu local `http://127.0.0.1:4176`, Edge/Chromium, mobile 390 × 844, desktop 1280 × 720/900, Supabase live en lecture seule.

## Verdict de release

**GO pour preview/staging.** Le code, le build public, les parcours invités et le responsive central sont validés. Le passage production doit être précédé d’un smoke test authentifié avec un compte dédié et de l’activation de la protection Supabase contre les mots de passe compromis.

## Commandes exécutées

| Commande | Résultat |
| --- | --- |
| `pnpm test` | Réussi — 17/17 tests |
| `pnpm run build` | Réussi — sortie `dist` générée |
| `node tools/audit-public.mjs` | Réussi — 33 HTML, 5 CSS, 36 JS, aucune anomalie |
| `node tools/check-inline-scripts.mjs` | Réussi |
| `node tools/check-public-assets.mjs` | Réussi |

Les tests ajoutés couvrent la navigation sport-first, l’absence d’Olympique comme filtre principal, la redirection Activities → Journal, les onglets Liste/Calendrier, la présence de date/heure dans la saisie et les KPI sport-first de Progrès.

## Matrice des routes inspectées

Légende : D = desktop, M = mobile, R = retestée après refonte.

| Groupe | Routes | Contrôle | Résultat |
| --- | --- | --- | --- |
| Public | `/`, `/sports`, `/guide`, `/algorithme`, `/service`, `/changelog`, `/partenariats` | D + M ; R sur `/` et `/sports` | Réussi |
| Cœur sportif | `/training`, `/journal`, `/stats`, `/sport_details`, `/disciplines`, `/activities` | D + M + R | Réussi ; `/activities` redirige vers Journal |
| Progression/modules | `/adventure`, `/trophies`, `/talents`, `/health`, `/boutique` | D + M ; R sur `/health` | Réussi |
| Social | `/social`, `/chat` | D + M ; R sur `/chat` | Réussi |
| Compte/système | `/login`, `/onboarding`, `/profile`, `/notifications`, `/admin`, `/update-password`, `/dynamic-page` | D + M ; R sur onboarding/profile | Réussi ; warning attendu sans jeton recovery |
| Légal | `/legal_hub`, `/legal_mentions`, `/legal_privacy`, `/legal_cgu` | D + M | Réussi |
| Erreurs | `/404.html`, `/network-error.html` | D + M | Réussi en accès direct |

## Parcours fonctionnels réellement joués

| Parcours / état | Vérification | Résultat |
| --- | --- | --- |
| Visiteur → Enregistrer | Navigation principale, choix sport, date/heure par défaut, champs essentiels avant options | Réussi |
| Musculation riche | Ajout d’un Squat, 3 séries de 8 × 80 kg, RIR 2, calcul du volume | Réussi — 1 920 kg |
| Builder musculation | Ajout/suppression de série, duplication/réordre/suppression d’exercice, routine récente | Contrôles présents et logique exécutée sans erreur |
| Journal vide | Chronologie, message explicatif, CTA Enregistrer, filtres réinitialisables | Réussi |
| Journal Liste/Calendrier | Changement de vue sans formulaire ni narration concurrente | Réussi |
| Progrès vide | KPI sportifs en premier et gamification repliée | Réussi |
| Progrès avec métriques | Sélecteurs Minutes/Séances/Distance/Volume et 7/30/90/365/tout | Réussi au niveau rendu/calcul |
| Catalogue Sports | Recherche, familles d’usage, absence du filtre Olympique, rendu progressif | Réussi — 24 cartes après chargement live ; 12 en fallback local |
| Mes sports | Aucun second catalogue ; accès au catalogue canonique | Réussi |
| Activities | Compatibilité ancienne URL | Réussi — redirection vers `/journal` |
| Landing visiteur | Landing publique et CTA conservés | Réussi |
| QG connecté | Branche session, résumé semaine, dernière séance, état sans données | Vérifié par code et DOM ; pas de compte de test pour mutation live |
| Réseau/erreur | Pages réseau et 404 lisibles | Réussi en accès direct |

Le scénario « utilisateur régulier enregistre une séance récente en moins de 30 secondes » est compatible avec le nouveau nombre d’étapes, mais n’a pas fait l’objet d’une mesure chronométrée avec un compte réel. Aucune donnée de production n’a été créée pour fabriquer cette preuve.

## Responsive et accessibilité

- Mobile autoritatif testé à 390 × 844 dans le navigateur intégré ; captures Edge à 500 × 900 pour éviter sa largeur headless minimale.
- Desktop testé à 1280 × 720/900.
- Aucun débordement horizontal sur Enregistrer, Journal, Progrès, Sports et Mes sports.
- Navigation basse à cinq destinations ; action Enregistrer disponible en un geste depuis les écrans centraux.
- Cibles interactives critiques contrôlées : aucune cible à la fois sous 44 px de large et de haut sur les parcours centraux après correction.
- Un titre principal cohérent, labels de formulaire, focus visible et `prefers-reduced-motion` présents.
- L’information n’est pas portée uniquement par la couleur dans les états centraux.
- Ce passage n’est pas un audit automatisé WCAG exhaustif et n’en revendique pas la certification.

## Console, PWA et assets

- Aucune erreur JavaScript bloquante pendant le parcours des 33 routes.
- Deux avertissements cumulés sur `/update-password` sont attendus sans lien de récupération actif.
- Cache service worker renommé `titan-os-v90-sport-first-release` et références d’assets passées en `?v=90.0`.
- Build public revalidé après les modifications ; routes publiques, SEO, manifest et fichiers d’erreur restent inclus.
- Les captures `qa-v90-*.png` sont exclues du déploiement public par la configuration Netlify.

## Contrôle Supabase en lecture seule

| Contrôle | Résultat |
| --- | --- |
| État projet | `ACTIVE_HEALTHY`, Postgres 17.6.1, `eu-west-1` |
| Tables publiques | 64/64 avec RLS active et policies |
| Fonctions membre privilégiées | 25/25 contrôlent `auth.uid()` et fixent `search_path=public` |
| SQL dynamique | Aucun `EXECUTE` dynamique détecté dans ces RPC |
| Catalogue | 277 total, 260 actifs, aucun nom/slug vide, aucun doublon normalisé |
| Famille Olympique primaire | 0 |
| Écritures live | 0 |
| Avertissements | 25 RPC intentionnelles + protection mots de passe compromis désactivée |

## Captures de validation

- `qa-v90-training-mobile.png` — Enregistrer, mobile.
- `qa-v90-journal-desktop.png` — Journal, desktop.
- `qa-v90-stats-desktop.png` — Progrès, desktop.
- `qa-v90-sports-mobile.png` — Sports, mobile en fallback local.

## Points non validés ou reportés

- Smoke test complet connecté : aucun identifiant de test fourni.
- Création, édition et suppression live : aucune mutation volontaire sur le projet réel.
- Édition/suppression d’une séance : reportée jusqu’au RPC transactionnel de recalcul.
- Abonnement/paiement : non muté et non souscrit pendant cet audit.
- Activation de la protection des mots de passe compromis : action Dashboard Supabase.
- Consolidation des policies permissives : à tester en staging avant migration.
