# Titan — CDC UX09, radiogroups Profil / Onboarding

## Périmètre et base

- Lot local `codex/web-radio-controls-cdc`, worktree isolé `titan-radio-controls`.
- Base locale : `24ff253b9117b1b50d8f6c302a4ae40eed6be6bb`, arbre `3e33c77cde800094811f6a9dbeceece7ce68e0c3`.
- Parent publié communiqué : PR #51, `b47f1263714aeee0dc85f72d23de9feb04646374`, ouverte et non fusionnée. Ce lot doit être intégré par le coordinateur, sans supposer ces SHA interchangeables.
- Réservation native « CODEX RADIOS », priorité UX09, écrite et relue par le coordinateur ; aucune écriture Drive par ce lot.
- Fichiers : `js/app/profil.js`, `js/app/onboarding.js`, caches consommateurs `profile.html` / `onboarding.html`, ajouts E2E adjacents aux tests Onboarding et Profil/Maîtrise, ce handoff.

## Diagnostic et comportement livré

Les trois groupes présents utilisent déjà `role="radiogroup"` / `role="radio"`, mais leurs boutons n'avaient ni navigation aux flèches ni `tabindex` mobile. Profil remplace ses contrôles dans `render()` ; `TitanSportBrowser.preserveFocus()` préserve les IDs, absents des radios. Onboarding remplace également le contenu après chaque choix de cadence.

Référence primaire consultée le 13 octobre 2026 : [WAI-ARIA APG, Radio Group Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/radio/), section hors toolbar. Flèches droite/bas vers le suivant, gauche/haut vers le précédent, bouclage et sélection ; Tab entre/sort du groupe ; Espace coche le bouton focalisé.

- Cadence Profil et Onboarding : un arrêt Tab sur le choix courant ; les quatre flèches déplacent focus et choix avec bouclage 1 ↔ 7.
- Avatars Profil : même navigation sur les avatars autorisés ; les radios `aria-disabled="true"` sont exclues du parcours et du Tab. Le premier avatar autorisé sert de point d'entrée si le choix courant n'est pas utilisable.
- Espace sur un choix non coché réutilise le clic. Espace sur le choix déjà coché ne renvoie pas d'action, sauf si une mutation avatar attend encore sa réponse : le contrôleur retient alors cette dernière intention. Entrée et clic restent les activations natives.
- Profil restaure la radio encore focalisée au moment du rendu, puis son `tabindex`, avec `preventScroll`. Il ne mémorise pas une cible à récupérer après une réponse tardive si le focus est parti vers la recherche Maîtrise.
- Après échec d'enregistrement avatar, la sortie du groupe remet son arrêt Tab sur le choix effectivement coché. Les erreurs et règles existantes restent traitées par le moteur.
- Les actions avatar sont séquentielles dans un contexte courant. Pendant une réponse retardée, la dernière intention remplace celle en attente ; une inversion rapide vers l'avatar encore coché est conservée. Le moteur existant reçoit l'action suivante après confirmation de la précédente, avec sa révision courante. La file retient le propriétaire, la référence du client et `titanAccountTransition.epoch` ; elle est invalidée dès `titan:account-changing` et dès qu'un rendu observe un contexte différent, y compris un aller-retour A → B → A. La comparaison après réponse et avant chaque action vérifie également ces valeurs et l'absence de transition active.
- Onboarding conserve son choix/focus au rendu, le choix au retour d'étape et l'enregistre lors de la finalisation existante.

La cadence reste enregistrée par `TitanData.setCadenceTarget()` ; l'avatar par `TitanAdventure.action("avatar", ...)`. Aucun nouvel enregistrement ni contrat RPC n'est ajouté.

## RED / GREEN et preuves locales

Le premier lancement RED était bloqué par l'absence de Chromium dans le cache partagé ; il ne constitue pas une preuve fonctionnelle. Une installation unique Playwright 1.56.1 / Chromium 141 (build 1194) a ensuite réussi. Aucun changement de dépendance n'est commité.

RED fonctionnel avant modification de production :

```sh
node tools/build-public.mjs
node --test --test-concurrency=1 --test-name-pattern='(onboarding radios|profile radios)' tests/e2e/smoke.e2e.mjs
```

Résultat : 7/7 échecs, dont six assertions `0 !== 1` sur le point de Tab unique à 360/1280 px et une attente d'action avatar expirée après flèche sans gestionnaire. Log scratch : `/tmp/titan-radios-red.log`.

RED additionnel avant le traitement de sortie : le test de stockage avatar défaillant attendait `scout` à la réentrée Tab et obtenait `ranger`. Log : `/tmp/titan-radios-failure-red.log`.

RED après revue indépendante : le retour rapide ranger → scout pendant une réponse retardée ne déclenchait jamais la seconde action. Le test expirait à 2 secondes dans l'attente de cette action ; log `/tmp/titan-radios-review-red.log`. La correction conserve la dernière intention sans mutations avatar simultanées.

RED complémentaire du même reviewer : un aller-retour A → B → A pouvait rejouer l'intention de l'ancien contexte. Quatre régressions ont échoué avec une action `scout` supplémentaire après retour de propriétaire observé, epoch changé pour le même ID, remplacement du client et aller-retour de client observé. Log `/tmp/titan-radios-context-red.log`. Elles passent après invalidation persistante du contexte.

GREEN ciblé final : 13/13 cas, aucune `pageerror`. Les cas utilisent les vrais rendus, les actions et le stockage local ; les réponses retardées, transitions de contexte, l'échec de Storage et la préparation de finalisation Onboarding sont synthétiques. Le refresh guest est neutralisé dans les quatre fixtures de contexte pour isoler la mutation déjà partie. Réseau tiers coupé, aucun compte réel.

```sh
TITAN_QA_SCREENSHOTS=1 node --test --test-concurrency=1 --test-name-pattern='(onboarding radios|profile radios)' tests/e2e/smoke.e2e.mjs
pnpm verify
```

`pnpm verify` : exit 0, 183/183 tests, 62 scripts parsés, build réussi et audit sans erreur ; 16 avertissements de métadonnées existantes restent visibles. Logs : `/tmp/titan-radios-green.log`, `/tmp/titan-radios-verify.log`.

Suite E2E complète finale : `pnpm run test:e2e` **exit 0, 250/250 tests**, aucun échec/annulation/skip, environ 193 secondes, y compris PWA installé. Les passages précédents étaient également verts (245/245 avant revue, puis 246/246 après correction de l'inversion rapide). La couverture supplémentaire de la version `300.2` périmée reste à intégrer par le coordinateur. Log final : `/tmp/titan-radios-full-e2e.log`.

Revue indépendante unique Sol 6.1 high (fork sans historique), déclenchée via `requesting-code-review` sur le commit candidat `5a7be213b994514dfdc4a25cd4e99f73673a5d91` : point Important d'intention perdue pendant une réponse retardée puis point Important d'annulation incomplète lors d'un aller-retour de propriétaire. Les deux points sont corrigés et vérifiés en RED/GREEN ; contrôle final par le même reviewer : **aucun point critique, important ou mineur restant identifié**, cinq tests relancés indépendamment, 5/5 passent (inversion rapide et quatre contextes). Le contrôle ad hoc confirme la dernière intention, au plus une action cloud synthétique active, révisions successives 10 → 11 et rejet de la première action puis consommation de la dernière intention sans déplacer le focus Maîtrise. Un premier harness cloud synthétique interférait avec le refresh réel et a expiré ; le contrôle erreurs/propriétaire refait avec l'action guest réelle et refresh neutralisé passe. Aucun compte réel ni lecteur d'écran utilisé.

Contrat exact de contexte : seule l'intention **pas encore envoyée** est annulée. Ce contrôleur n'annule pas un RPC déjà parti et ne change pas les garanties de publication du moteur. Un changement silencieux puis retour à des références identiques, sans événement de transition, changement d'epoch ou rendu observant un contexte différent, n'est pas détectable ici. L'epoch public de l'application est utilisé ; le compteur `sequence` interne de `TitanAdventure` n'est pas exposé et reste intact.

Captures rendues et examinées visuellement : `/tmp/titan-radio-onboarding-360.png`, `/tmp/titan-radio-onboarding-1280.png`, `/tmp/titan-radio-profile-360.png`, `/tmp/titan-radio-profile-1280.png`. Le style, les images et les grilles restent ceux de la base ; absence de débordement horizontal vérifiée à 360/1280 px. Les captures et logs sont temporaires et ne font pas partie du commit.

Les assertions de focus Profil interrogent l'élément actif dans une évaluation atomique : un élément résolu séparément par Playwright peut être remplacé entre résolution et évaluation par les rendus asynchrones existants. Le contrôle de focus extérieur utilise la recherche Maîtrise et sa conservation par ID ; la conservation de tous les autres contrôles après rendu reste hors du lot.

## Caches et intégration par le consommateur

- `profile.html` : `profil.js?v=300.2` → `300.3`.
- `onboarding.html` : `onboarding.js?v=300.2` → `300.3`.
- Le build existant recalculera l'empreinte du service worker. Aucun changement manuel de SW ni du test PWA global dans ce lot.
- Le coordinateur doit ajouter `300.2` à la matrice des ressources périmées Profil/Onboarding du test PWA partagé, puis vérifier la version `300.3` courante sur l'arbre intégré.
- Cherry-pick successif des trois lots sur la base décidée par le coordinateur ; rejouer `pnpm verify` et `pnpm run test:e2e` sur cet arbre exact, puis les contrôles CI.

## Exclusions et état UX09

UX09 reste **partiel** : seuls les trois radiogroups existants de ce périmètre sont traités. Pas d'audit global, de lecteur d'écran ou de clavier mobile matériel ; preuve dans Chromium synthétique à 360/1280 px. Pas de modification CSS, d'assets avatar, d'XP, de rang, de règle de déblocage, de confidentialité, de droits ou de paiement. Pas de backend, SQL, déploiement, fusion, push, compte réel ni fournisseur externe. Aucune modification des sections Assistance ou CMS/PWA globales réservées aux autres lots.

## Intégration finale

Rebasé sans conflit sur le lot CMS PR #53 (local e0ce4ff8f1285a908bda50d10b2c51429d38f8eb, publié f75e18254e03088e8eae3145f6b0c9efbb879276), après labels PR #52. Les fichiers JavaScript métier sont identiques au commit relu d6de0ea6c98501eae5099d209bc6e16949ed8918. La matrice PWA commune inclut désormais Profil/Onboarding300.2 périmés, conserve shell300.3 et dynamique300.1, et contrôle les consommateurs300.3 courants. Validation intégrée et CI exacte consignées dans la PR et le CDC natif.

Validation intégrée avant publication : pnpm verify exit0, 183/183 tests ; ciblage des 13 radios, trois labels Assistance et du PWA global : 17/17, aucun échec/skipped. Les validations intégrales antérieures sont 250/250 (radios isolés) et244/244 (parent CMS). La suite complète de cet arbre est également lancée ; son résultat doit être confirmé dans la PR avant de déclarer le lot livré.
