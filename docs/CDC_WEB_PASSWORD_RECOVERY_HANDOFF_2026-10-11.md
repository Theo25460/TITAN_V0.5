# Nouveau mot de passe web — handoff du 11 octobre 2026

## Résultat et périmètre

Suite de PR #41 : parent publié `e8c58306f185b4e7496a4cdab4ec0996e022850b`, parent local `b58ef348e29d86c53493252c45fd505f8ab27214`, arbre commun `0cf0e7ffc23e7e10fac53b8c5b9382b61963672b`. Lot QA08 / UX10 / UX09 limité à `js/app/update-password.js`, `update-password.html`, `tests/e2e/smoke.e2e.mjs` et ce handoff. Aucun changement à la création des comptes, aux règles auth serveur, aux données, à la suppression de compte du lot Claude ou à l’économie. WORK/Play Console, audit RPG01 et image étrangère restent indépendants.

Le formulaire réserve sa sauvegarde avant `auth.updateUser({ password })`. Les deux champs, le bouton de visibilité et le bouton Enregistrer sont gelés ; une soumission répétée, y compris par `requestSubmit`, ne lance pas un second appel. L’annonce « Enregistrement en cours… » est après le formulaire portant `aria-busy`, pour rester accessible pendant son attente. Après erreur, les valeurs et les états disabled antérieurs reviennent ; le focus retourne au bouton seulement s’il est perdu sur le body, sans déplacer celui d’un lien. L’ancienne erreur est retirée au retry. Après succès, les contrôles et la réservation restent verrouillés pendant les 1,2 secondes précédant la redirection existante vers `/aujourdhui` ; l’annonce d’attente et aria-busy sont retirés pour annoncer le résultat.

Le diagnostic initial différé ne remplace plus une validation ou un résultat déjà affiché par le formulaire. Les rejets et erreurs retournées de `getSession` sont pris en charge ; l’utilisateur peut réessayer au lieu d’un rejet non géré. Sans session et sans interaction, la demande d’un nouveau lien reste identique. Sans client disponible, la sauvegarde annonce l’indisponibilité avant de geler les champs. La longueur minimale, la confirmation, les erreurs de mot de passe identique/session expirée/réseau et les paramètres SDK sont conservés. Le diagnostic `ready` n’autorise pas l’opération : le SDK et Supabase restent l’autorité de session comme dans le parent.

## Preuves reproductibles

Les sept tests `password recovery:` font tourner le script applicatif actuel dans Chromium, sur la page construite, avec le client SDK actuel dont le transport auth est remplacé par des réponses synthétiques. Aucun compte, mot de passe réel ou e-mail n’est utilisé. La fixture bloque seulement la copie du script intégrée à la page avant d’injecter le fichier actuel, pour maîtriser l’ordre des réponses. Les autres tests et le contrôle PWA utilisent le build réellement servi.

Sur le parent, six tests échouent pour les comportements attendus : trois updates au lieu d’un ; champs non gelés ; focus perdu ; erreur remplacée par le diagnostic tardif ; rejet de vérification sans message ; second update après succès. Les validations locales et le message de lien expiré passent déjà. Après correction, sept sur sept passent, sans erreur de page. Le renvoi vers le QG et les timers sont vérifiés avec l’horloge Playwright, sans attendre arbitrairement la navigation.

Vérification visuelle séparée aux largeurs 360/1280 : attente visible dans le viewport, pas de débordement horizontal, valeurs conservées et focus Enregistrer après erreur. Quatre captures attente/erreur inspectées ; script de QA temporaire retiré, captures et logs hors commit. L’identité graphique Titan et les labels existants sont préservés.

`update-password.js` passe de 300.0 à 300.1. Le test PWA injecte la génération 300.0 dans l’ancien cache puis visite `/update-password` ; le nouveau script doit être utilisé dès cette première visite. Aucune purge du stockage de l’utilisateur.

Commandes de validation : `node --check js/app/update-password.js`, `git diff --check`, `pnpm verify` (141 tests, build et audit sans erreur ; 16 avertissements préexistants), `pnpm test:e2e` (154 parcours). Une revue indépendante unique Sol 6.1 et la CI du HEAD publié sont à enregistrer avec leurs résultats exacts dans la PR et le CDC maître avant de libérer le claim. Les logs CI des trois jobs doivent correspondre au HEAD et à sa base main ; conserver les deux voies PostgreSQL16, leurs 18 suites et quatre contrats concurrents par voie, la transaction appelante et le refus sur base non-test.

## Décisions et limites

| Partie examinée | Décision et suite |
| --- | --- |
| Doubles sauvegardes et retry | Corrigés par une réservation synchrone de cette instance de page. Pas d’idempotence serveur ou entre onglets ajoutée ; une autre page peut encore faire sa propre demande. |
| Succès avant navigation | Réservation conservée jusqu’au QG ; pas de deuxième écriture pendant la confirmation. Les liens Connexion/Aide restent disponibles. |
| Requête sans réponse | Aucun timeout ou abort ajouté : une demande réellement en attente garde les contrôles gelés. Un résultat réseau incertain et sa réconciliation restent un futur lot. |
| Diagnostic de lien | Informatif ; après une soumission, il ne reprend pas possession du message. Le formulaire annonce les erreurs effectivement renvoyées par l’opération. Aucun nouveau protocole de vérification/adoption/changement de compte SDK. |
| SDK et session de récupération | Paramètre password et redirection existants conservés ; le serveur reste l’autorité. Test synthétique, pas de recette avec e-mail de récupération réel, jeton réel, multi-onglets ou politique de session du projet. |
| Accessibilité | Contrôles, état d’attente, valeurs et focus vérifiés à 360/1280. Lecteurs d’écran réels, contrastes exhaustifs et audit global restent ouverts. |
| Autres parcours UX10 | Ce lot ne termine pas la recette transversale ; première séance, progression, records, maîtrise, boutique, Communauté, Premium et paramètres restent à compléter. QA08/UX09/UX10 restent [~]. |

## Reprise et rollback

Reprendre depuis le HEAD final enregistré dans la PR/CDC, comparer les formulations actuelles du CDC avant un nouveau lot et ne pas écraser les chantiers actifs. Aucun merge de main, déploiement, base réelle, SQL, récompense, prix, paiement ou Android autorisé par ce lot. Restaurer les trois fichiers applicatifs/tests depuis le parent et retirer ce handoff pour annuler uniquement ce lot ; aucune migration ou restauration de données nécessaire. Avant publication majeure : intégration des lots indépendants, recette réelle et audit Astra maximal prévus par le CDC.
