# Passation — UX06 / UX09 / QA13, changement de mode Auth

## Résultat

L'e-mail couramment saisi est conservé en mémoire de la page avant le remplacement du formulaire Connexion/Inscription. Il ne dépend plus d'un envoi précédent. Sa valeur affichée reste celle saisie, y compris les caractères non valides ; le rendu utilise toujours l'échappement existant, puis la validation/normalisation existantes s'appliquent seulement à l'envoi. Un retour depuis l'écran de récupération, où il n'y a plus de champ, garde l'adresse de la demande précédente.

Le sélecteur devient un groupe de deux boutons natifs avec `aria-pressed`, adapté au changement de formulaire et au déplacement du focus vers son premier champ. Les rôles `tablist/tab` incomplets sont retirés. Tab, Entrée et Espace utilisent le comportement natif ; les styles existants reconnaissent déjà les deux états ARIA, sans CSS nouveau. Le nom et mot de passe restent propres au formulaire remplacé ; cases de conditions et statistiques ne sont pas transportées ni enregistrées par un changement de mode.

L'attente empêche toujours un changement concurrent, même par clic synthétique. Le focus et le nettoyage des erreurs introduits par PR #57 sont conservés. Aucun nouvel appel réseau, stockage persistant, analytics, changement de règle Auth ou contenu juridique.

## Régressions et validation

Baseline `pnpm verify`183/183. Première sonde lancée trop tôt pendant le build : serveur absent, résultat de harness non qualifié comme RED. Relance sur build stabilisé : cinq tests, deux positifs gardés verts et trois RED concrets (adresse perdue aux deux formats et normalisation prématurée des caractères spéciaux). Après correctif :21/21 ciblés, zéro échec/skipped, incluant modes, validations, attente Auth, parcours existants et PWA. Verify du correctif183/183, build/audit réussis,16 warnings existants.

Les vrais composants sont utilisés dans Chromium360/1280 avec transport Auth synthétique. Clavier Entrée/Espace, focus du premier champ, email édité, mots de passe/cases non transportés, erreur locale effacée par remplacement, texte spécial inerte, attente synthétique bloquée et retour récupération sont vérifiés. Deux captures360/1280 inspectées : mêmes formes, disposition et DA ; pas de débordement du document.

Auth300.4 devient300.5 dans login ; la génération périmée300.4 rejoint le PWA global, toutes les anciennes versions des autres composants sont conservées. La suite E2E complète du parent a262 parcours ; la CI exacte du nouveau HEAD doit confirmer267 et les deux voies SQL avant remise. Pas de nouvelle exécution E2E complète locale revendiquée ; vérification ciblée locale et CI complète suffisent ici. Revue indépendante unique avant livraison, conclusions/CI/SHA/lecture native consignées dans PR et CDC.

## Isolation et limites

Quatre fichiers : composant Auth, loginHTML, suiteE2E et passation. Branche `codex/web-auth-modes-cdc` dans le worktree lié existant propre. Parent PR #57 prête/ouverte/non fusionnée, publié215016e0cf3e6a07feb9fad90da1b2cdfee38ead, localbbc904b8cd58bdda974894aa583ed0dff4b8a79e, arbrea69d737602224e4315d48b18128e53bd5dea0856.

UX06/UX09/QA13 restent partiels : aucun essai lecteur d'écran, compte/provider réel, ni conformité globale. Aucun serveur/SQL, règle de consentement, asset, Android, main, fusion ou déploiement modifié. Réservation native écrite et relue ;307 formulations/42 ajouts juridiques et autres chantiers WORK/RPG01 préservés.
