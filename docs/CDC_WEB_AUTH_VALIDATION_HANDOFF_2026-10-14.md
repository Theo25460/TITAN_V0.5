# Passation — UX09 / QA13, validation accessible de Connexion

## Défaut et correctif

Les validations locales annonçaient une erreur générale sans `aria-invalid`, association au champ ni focus de correction. E-mail invalide (connexion/récupération), mot de passe absent/court, nom court et conditions non cochées sont maintenant repérés sur le contrôle correspondant, avec `aria-describedby` vers le message existant et focus sur ce contrôle. Une édition de ce même champ retire l'état local et le lien d'erreur, en conservant d'éventuelles descriptions antérieures.

La validation se termine avant toute réservation d'action, écriture de consentement et appel Auth. Les valeurs, seuils, sanitation du nom et textes existants sont conservés. Les erreurs serveur restent génériques : une réponse « mauvais identifiants » ne permet pas d'attribuer la faute à un champ. Les attentes sérialisées et le focus de reprise sur le bouton d'action restent ceux du parent. Une édition/activation synthétique pendant une attente ne modifie pas ce contrat.

Le message possède un ID stable ; aucun CSS/style/message juridique/route/contrat distant modifié. La génération Auth300.3 devient300.4 dans login ; le test PWA inclut300.3 périmé tout en gardant les anciennes générations des autres composants. Les rôles des boutons de mode et les changements de mode sont hors du lot.

## Preuves

Baseline locale `pnpm verify`183/183. Cinq tests nouveaux RED sur le parent (0/5, assertion `aria-invalid` absente), puis GREEN :16/16 ciblés incluant attente Auth, parcours existants, récupération et PWA global ; zéro erreur/skipped. Vérification du correctif `pnpm verify`183/183, build/audit réussis avec16 warnings de métadonnées existants.

Les tests utilisent les vrais composants et clavier Chromium360/1280, actions activées par focus du bouton puis Entrée (cinq cas rejoués5/5), avec transport Auth synthétique : chaque champ reçoit le focus, le message est réellement relié, une description antérieure est préservée, les corrections au clavier aboutissent, aucune écriture de consentement ni requête ne part avant validation. Les erreurs serveur conservent le focus de retry et n'inventent pas de champ invalide. La récupération pendant une attente conserve son unique action.

Quatre captures signin/signup360/1280 produites dans `/tmp`, inspection ciblée sur signup360 et signin1280 : repère de focus et messages lisibles, DA existante conservée. Aucun compte réel ni lecteur d'écran matériel testé. Suite complète et CI exacte obligatoires avant remise ; résultats consignés dans PR/CDC, sans utiliser les résultats hérités comme preuve du HEAD.

## Isolation et limites

Branche `codex/web-auth-validation-cdc`, worktree isolé `titan-auth-validation`. Parent PR #56 prête/ouverte/non fusionnée, publiéda6023f021c5005370178a95962a615a4def4377, local8a2dab9a717614a0ce27d6039ffc7de0a7d90e23, arbre2bad69c8ae11c67fc15dee8b6853686f2303190e. Quatre fichiers : composant Auth, loginHTML, suiteE2E, passation.

UX09/QA13 restent partiels : pas de certification globale, contraste/lecteur d'écran/appareil réel. Pas de validation distante de mot de passe ou nouvelle règle d'authentification. Aucun serveur/SQL/consentement/paiement, image étrangère, Android, WORK/RPG01, main, fusion ou déploiement modifié. Réservation native avant correctif,307 formulations/42 ajouts juridiques préservés. Une revue indépendante unique est requise avant livraison.
