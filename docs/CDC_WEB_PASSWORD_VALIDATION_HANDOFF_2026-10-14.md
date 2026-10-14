# Passation — UX09 / QA13, validation de Nouveau mot de passe

## Correctif

Longueur insuffisante et confirmation différente sont maintenant marquées `aria-invalid` sur le champ correspondant et reliées à l'alerte `pw-msg` existante par `aria-describedby`. Le focus et les messages existants sont conservés. Éditer le champ invalide efface seulement son erreur locale ; pour une confirmation différente, modifier l'un des deux mots de passe efface aussi ce diagnostic dépendant. Une prochaine soumission vérifie de nouveau longueur et égalité.

Le nettoyage conserve toute autre description du champ. Il ne touche pas aux erreurs génériques de serveur, réseau ou session. Avant un envoi valide, aucun état local invalide ne subsiste. Pendant l'enregistrement, les événements synthétiques ne modifient ni validation ni réservation ; les diagnostics initiaux retardés gardent le contrat `interacted` existant.

Aucun mot de passe n'est stocké, journalisé ou envoyé par le correctif. Seul l'appel Auth existant envoie la valeur capturée après validation. Seuil8, égalité, session, réussite/redirection QG et reprise restent inchangés. Aucun CSS ou texte juridique modifié.

## Tests et preuves

Baseline/correctif `pnpm verify`183/183, build/audit réussis,16 warnings existants. Cinq nouveaux tests : quatre RED concrets sur absence d'`aria-invalid`, un positif de réservation déjà vert. Puis13/13 ciblés verts, zéro échec/skipped : nouveaux champs aux deux formats, édition du premier ou second mot de passe, description antérieure conservée, erreur générique préservée, garde pending et diagnostic initial ; sept parcours récupération du parent et PWA global.

Vrais composants/Chromium360/1280, activation du bouton à Entrée et correction au clavier, transport Auth synthétique. Deux captures360/1280 inspectées : focus confirmation visible, message et DA existants lisibles. Pas de lecteur d'écran ni compte Auth réel. Pas de nouvelle suite E2E complète locale revendiquée ; la CI du HEAD exact doit confirmer272 E2E et les deux voies SQL avant remise.

Ressource update-password300.1→300.2, generation périmée300.1 ajoutée au PWA global sans perdre les autres générations. Revue indépendante unique exigée ; conclusions, preuve CI, SHA et lecture native consignés dans PR/CDC.

## Isolation et limites

Quatre fichiers : composant update-password, consommateurHTML, suiteE2E et passation. Branche `codex/web-password-validation-cdc` dans le worktree lié existant propre. Parent PR #58 prête/ouverte/non fusionnée, publiée1f3dfd437244d970fdb0776456f6d620e71b6b2, local7491f4678f26d94a3d7530cab23f2b12a3045f01, arbred74a477b3668078ecc31ffc6f5eacde44b20d7f0.

UX09/QA13 restent partiels : audit global, lecteurs d'écran et appareils/comptes réels ouverts. Aucun nouveau contrat Auth, backend/SQL/provider réel, consentement, asset, Android, main/fusion/déploiement. Réservation native écrite/relue ;307 formulations/42 ajouts juridiques et WORK/RPG01 conservés.
