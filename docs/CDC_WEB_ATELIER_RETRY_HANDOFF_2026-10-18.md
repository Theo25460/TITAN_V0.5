# Atelier — reprise du catalogue — 18 octobre 2026

Lot limité à UX09, QA08 et QA13 ; ces exigences globales restent partielles.
Branche `codex/web-atelier-retry-cdc`, dépendance PR #85 (`codex/web-coaching-forms-cdc`, commit `60112c2c50493f518d0bb0b6e9075e654494bf04`). Sans fusion ni déploiement.

## Comportement livré

- UX09 : le premier chargement et la relance sans catalogue ont un statut vivant « Chargement de l’Atelier… », préparé avant la relance et extérieur aux éléments occupés. Le bouton Réessayer est désactivé pendant la lecture. Après une relance au clavier, le focus rejoint Collection, le bouton Réessayer disponible ou l’information de serveur ancien, uniquement si l’utilisateur n’a pas déplacé le focus ailleurs.
- QA08 : les appels concurrents du même propriétaire/client/époque partagent la lecture en cours. Après 15 secondes, une lecture bloquée rend la main avec un message et une nouvelle tentative explicite. Le délai est libéré en fin de demande ; une transition de compte invalide et interrompt l’attente locale. Le signal d’annulation est transmis au builder RPC s’il est disponible ; une réponse ancienne ne remplace pas la suivante, même si le transport ignore l’annulation.
- QA13 : reprise au clavier à 360/1280 px, succès/échec répété, focus extérieur prioritaire, changement de compte/client/époque et comportement invité vérifiés. Le serveur ancien conserve le repli de lecture du statut TITAN+ depuis le profil, sans inventer de catalogue ni de prix.

Le statut est préparé dans le HTML initial et les états d’erreur avant la mise à jour de son texte. Le catalogue déjà affiché reste utilisable pendant sa lecture de fond, avec le comportement existant des onglets et du focus.

## Périmètre

`js/app/atelier.js`, `boutique.html` (ressource 300.8), nouveau `tests/e2e/atelier-retry.e2e.mjs` inclus dans `test:e2e`, `package.json` et ce document.
Aucun changement des fonctions d’achat, d’équipement, de checkout ou d’attribution d’activation, ni de leurs paramètres/règles de crédits, XP ou Premium. Aucun SQL/RLS/backend réel, Profil, smoke partagé ou Android modifié. Aucun compte réel ni achat réel.

Le délai couvre la lecture `titan_atelier`, pas la lecture du profil de repli ni les mutations. Ce lot ne constitue pas un audit de sécurité des achats, un contrôle d’idempotence ou une annulation d’opération serveur.

## Vérification

Les vrais écrans et contrôles utilisent un client de lecture synthétique. Toute mutation inattendue fait échouer la fixture ; les requêtes externes sont bloquées. Le test de délai attend réellement les 15 secondes. RED initial : 6 échecs sur 11 tests ; deux tests supplémentaires exposent l’absence de région de statut préexistante et la perte de focus après le repli de serveur ancien.

```sh
node --test tests/e2e/atelier-retry.e2e.mjs
node --test --test-name-pattern='^atelier|^tab (keyboard|semantics|focus):.*atelier' tests/e2e/smoke.e2e.mjs
pnpm verify
git diff --check
```

Résultats : 15/15 nouveaux tests + 11/11 tests existants d’Atelier, 188/188 tests de base ; 62 scripts analysés, build de 103 fichiers hors ligne, audit sans erreur et 16 avertissements préexistants. Revue indépendante sans constat important ; 13/13 tests exécutés indépendamment, puis les deux tests ajoutés relus. Relance et résultat inspectés visuellement à 360/1280 px ; focus du résultat vérifié dans la zone visible au-dessus de la navigation mobile. Aucun nouveau CSS.

Les deux derniers tests couvrent l’interactivité du catalogue déjà affiché pendant une lecture de fond et la transmission du signal à un builder synthétique compatible abortSignal. Ce dernier vérifie la propagation de l’annulation, pas son effet sur un transport Supabase ou une opération serveur réels.

Les tests existants d’Atelier couvrent notamment les achats simulés, l’acquisition permanente, l’accès emprunté, les filtres, les aperçus et la protection contre une réponse d’un ancien compte. Ils ne prouvent pas le fonctionnement d’un backend ou d’un paiement réel.

Limites : Chromium, pas de lecteur d’écran réel, autres moteurs, PWA/Android, suite E2E entière ou CI distante certifiés. Les appels déjà envoyés ne sont pas garantis annulés côté serveur. Le repli profil garde son comportement antérieur.
