# Bilans : focus après recalcul et reprise

18/10/2026 — lot UX09 / QA08 / QA13, trois exigences globales maintenues `[~]`.
Branche : `codex/web-report-recovery-focus-cdc`, empilée sur PR #88 (`7eed057141b0ef555f58e8075c09224e6c044ebf`).

Le recalcul et l’export suppriment le résultat précédent, donc le bouton ou le détail qui portait le focus. Le bouton Calculer est désactivé pendant la requête. Le focus pouvait rester sur le corps du document après réussite, erreur, refus Premium ou expiration du délai.

La correction mémorise le focus avant cet effacement. Seul un élément du résultat supprimé ou le bouton Calculer désactivé donne lieu à restauration : titre du bilan frais après réussite, Calculer en l’absence de résultat. Le sélecteur de période et le résumé extérieur restent prioritaires. Un autre contrôle choisi entre-temps, un dialogue ouvert, un panneau fermé, une période modifiée ou un autre contexte de compte empêchent la reprise du focus de l’ancienne requête. Le statut vivant demeure extérieur à la zone occupée.

Les erreurs sont rendues directement dans le statut ; le `finally` commun enlève l’état occupé et réactive Calculer avant toute restauration. Les gardes existantes de propriétaire, client, epoch, séquence, connexion et visibilité restent appliquées. Aucun calcul, format CSV, droit Premium, RPC, analytics ou délai n’a changé ; pas de retry automatique.

## Vérification

- RED : 5 des 10 premiers scénarios échouaient sur les cibles de focus attendues.
- Review indépendante : trois P2 reproduits par trois tests rouges (sélecteur déplacé lors d’une actualisation ; résumé interne exclu de la récupération ; actualisation remplaçant une requête en attente sans reprendre sa cible). La cible passe à la requête de remplacement seulement si le contexte précédent est toujours valide et le focus toujours éligible ; aucune intention de téléchargement n’est transmise.
- GREEN : 16 nouveaux tests navigateur + 6 tests de pagination existants ; scénarios export réussi/erreur/réponse invalide/accès refusé, recalcul explicite, focus extérieur/sélecteur/dialogue, panneau fermé, compte changé, période changée, timeout sans renvoi et actualisation passive et requête remplacée. Succès/erreurs principaux à 360 et 1280 px.
- 4 smoke existants ciblés : analytics bilan/export, panne/refus du suivi, vues sauvegardées et droits expirés.
- `pnpm verify` : 188 tests de base, vérification des scripts, build et audit.
- Contrôle visuel des états erreur et réussite à 360 et 1280 px ; aucune nouvelle CSS.
- Review finale indépendante : les trois régressions ciblées repassent (3/3), aucun constat restant.
- `git diff --check`.

Ressource Rapports : 300.4 dans Stats. Le test de pagination existant ne change que son assertion de version. Profil, profile.html et smoke.e2e.mjs non modifiés.

## Limites

Interface réelle avec réponses agrégées synthétiques ; aucun compte réel, aucune écriture backend. Lecteur d’écran réel, autres moteurs, PWA/Android, suite E2E entière et CI distante non validés. Le contexte de recherche/pagination est toujours remis à zéro lors du recalcul selon le comportement existant. Aucun changement de contrat de téléchargement, ni de garantie serveur. Les 16 avertissements d’audit préexistants demeurent. Aucun merge ni déploiement.
