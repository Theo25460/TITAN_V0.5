# Fin de première utilisation web — handoff du 11 octobre 2026

## Résultat et périmètre

Suite de PR #42 : parent publié `5aa30bf9a31024cb32b11bfbfd8000dcc7769ed1`, parent local `b8f63d45044e59fbebca1622700bca0bc5e5902a`, arbre commun `fd5ddafde6572c10fe23af9f2d0232ffc2512a9b`. Lot QA08 / UX10 / UX09 limité à `js/app/onboarding.js`, `onboarding.html`, `tests/e2e/smoke.e2e.mjs` et ce handoff. Stockage partagé, auth, profil/suppression du lot Claude, WORK/Play Console et audit RPG01 indépendants ; aucune modification de règle sportive, XP, crédits, Premium ou paiement.

La dernière étape réserve sa préparation avant les effets de `finish` : préférences, consentement, sauvegarde et événement de fin. Les répétitions et destinations contradictoires ne relancent pas ces effets. Retour et les deux liens sont gelés pendant l’attente, y compris contre un événement synthétique ; input/change ne peuvent alors modifier le brouillon. Le premier href est capturé. Une annonce « Préparation en cours… » se trouve après la région live occupée, pour être annoncée pendant son attente. Les attributs disabled/aria-disabled/tabindex/aria-busy antérieurs sont conservés pour restauration.

Une exception synchrone de préparation est désormais prise en charge, avec message « La préparation n’a pas pu se terminer. Réessaie. », choix conservés et contrôles restaurés ; un retry retire l’ancienne erreur. Le focus retourne au choix seulement s’il est perdu sur body, sans déplacer celui d’un autre lien. Le serveur n’est pas présenté comme enregistré après une erreur locale. La préparation n’est pas atomique : des effets synchrones antérieurs à l’exception peuvent déjà avoir eu lieu ; aucun rollback des préférences/consentement n’est inventé.

Le comportement cloud existant est conservé : continuer le parcours local après rejet de la sauvegarde cloud ou après le plafond de 2,5 secondes. Ce plafond ne confirme pas une sauvegarde serveur. En cas de consentement non sauvegardé, un seul avertissement est affiché avant navigation ; le choix devient Continuer et les liens ne renvoient pas une nouvelle préparation, comme dans le parent. Retour redevient disponible après cet avertissement. Aucune navigation avant cet avertissement. La préparation reste réservée lorsqu’une navigation normale a été demandée.

Le rendu mobile a révélé un défaut préexistant : le bouton contenant « Enregistrer une séance de course à pied » forçait le nowrap et élargissait la page à 373 px pour un viewport de 360 px, avant toute sauvegarde. Une règle limitée aux `.ob-go .asc-btn` de cette page permet le retour à la ligne, garde le centrage et ajoute l’espace vertical nécessaire ; les styles partagés ne changent pas. L’identité graphique Titan, les quatre étapes et leurs textes restent en place.

## Preuves reproductibles

Neuf nouveaux tests `onboarding finish:` font tourner le script applicatif dans Chromium sur la page construite. Seules les frontières de sauvegarde, consentement et analytics de la fixture sont contrôlées pour retarder/réussir/rejeter/jeter une exception ; réseau tiers bloqué, données locales de découverte, aucune donnée de compte réel. La copie intégrée du script est bloquée avant injection du fichier courant ; les étapes sont parcourues avec les vrais contrôles. Le test existant de consentement utilise encore le vrai stockage volontairement bloqué et le build intégré.

Six tests RED sur le parent : trois préparations au lieu d’une ; Retour actif ; état d’attente absent ; exception sans reprise ; trois avertissements ; deuxième destination acceptée. Deux cas préexistants passent déjà : rejet/plafond cloud et réglages de cinq sports/rythme/analytics. Une septième preuve RED est ajoutée après la recette visuelle pour le débordement mobile avant sauvegarde. Après correction, neuf nouveaux cas et le test de consentement existant passent (10/10), dont trois largeurs 320/360/1280 et absence de débordement avant/pendant/après avertissement.

Recette visuelle séparée à 360/1280 : attente, erreur de préparation et avertissement de consentement inspectés, annonce d’attente dans le viewport, contrôles/choix lisibles. Six captures et logs hors commit ; script temporaire retiré avant publication. L’installation Chromium a dû être restaurée après disparition de son cache ; ce premier blocage d’environnement n’est pas compté comme une preuve RED applicative.

Script `onboarding.js` 300.1 → 300.2. Le test PWA charge les générations 300.0 et 300.1 dans l’ancien cache, puis contrôle l’utilisation du script actuel dès la première visite. La règle de retour à la ligne fait partie de cette page HTML ; aucune purge du stockage utilisateur.

Validation après la correction mobile : `node --check js/app/onboarding.js`, `git diff --check`, `pnpm verify` (141/141 tests, build et audit sans erreur ; 16 avertissements préexistants) et `pnpm test:e2e` (163/163 parcours). Une revue indépendante unique Sol 6.1 et la CI du HEAD publié sont à enregistrer avec leurs résultats exacts dans la PR et le CDC avant de libérer le claim. Vérifier les trois logs CI sur HEAD/base exacts, les deux voies PostgreSQL16 avec 18 suites SQL et quatre contrats concurrents par voie, transaction appelante et refus non-test.

## Décisions et limites

| Partie examinée | Décision et suite |
| --- | --- |
| Répétitions et conflits | Réservation synchrone dans cette instance de page ; première destination conservée. Pas d’idempotence serveur/inter-onglets ajoutée. |
| Retour / réglages | Gel pendant la préparation seulement. Avant envoi et après erreur/avertissement, les choix et Retour restent disponibles. Une reprise explicite peut refaire les effets de préparation ; pas de transaction globale. |
| Cloud tardif ou en erreur | Délai de 2,5 secondes et poursuite locale existants conservés. La demande peut rester en vol après navigation ; aucune annulation ni preuve de persistence cloud ajoutée. |
| Exception synchrone | Erreur explicite et reprise, sans navigation automatique. Préférences/consentement peuvent avoir changé avant l’exception ; stockage partagé non refactoré. |
| Consentement | Avertissement existant conservé, une seule fois par préparation ; Continuation sans nouvel envoi. Échec du vrai stockage déjà couvert par le test antérieur ; aucune nouvelle politique analytics. |
| Compte / autre page | Aucun protocole d’adoption de session, changement de compte ou coordination entre onglets. Le lien de marque vers QG reste disponible ; ouvrir une autre page reste possible. |
| Rendu / accessibilité | Retours à la ligne limités aux boutons de dernière étape ; 320/360/1280 vérifiés, attente hors région busy. Lecteurs d’écran réels, contraste exhaustif et audit global ouverts. |
| UX10 transversal | Ce lot ne termine pas première séance réelle, progression, records, maîtrise, boutique, Communauté, Premium et paramètres. QA08/UX09/UX10 restent [~]. |

## Reprise et rollback

Reprendre depuis le HEAD final enregistré dans PR/CDC, relire les nouvelles exigences et chantiers actifs avant modification. Restaurer les trois fichiers app/HTML/tests depuis le parent et retirer ce handoff pour annuler ce lot ; aucune migration ou restauration de données requise. Main non fusionné, aucun déploiement, base réelle, SQL, Android, image ou règle économique modifiés. Recette réelle, intégration des lots indépendants et audit Astra maximal avant publication majeure restent ouverts.
