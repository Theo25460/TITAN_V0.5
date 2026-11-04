# Comparaisons : focus et reprise après recalcul

18/10/2026 — lot UX09 / QA08 / QA13, trois exigences globales maintenues `[~]`.
Branche : `codex/web-comparison-recovery-focus-cdc`, empilée sur PR #89 (`fcdf41fb575dc473328890272d20a25fe1c4f2a8`).

Le recalcul supprime l’ancien résultat (bouton de sauvegarde, détails, liens et tableau) et désactive Comparer. Le clavier pouvait ensuite rester sur le corps du document, après réussite comme après erreur.

La cible est capturée avant cet effacement. Un focus affecté par le recalcul rejoint le titre frais en cas de réussite, ou Comparer réactivé après erreur, délai expiré, réponse invalide ou accès refusé. Sélecteur, recherche et résumé extérieur survivent au recalcul et gardent le focus. Un autre contrôle choisi entre-temps, un dialogue ouvert ou un contexte de compte/période invalidé restent prioritaires.

Une requête de remplacement peut reprendre la cible perdue par la requête précédente seulement si cette dernière est toujours courante et le focus toujours éligible. Les gardes existantes propriétaire, client, epoch, séquence, panneau ouvert, visibilité et connexion restent appliquées. Le statut vivant reste extérieur à la zone occupée. Les erreurs ne changent plus la séquence de leur propre requête avant son nettoyage final.

Aucun calcul, contrat RPC, droit Premium, événement analytics, délai ou règle de retry n’est modifié. Aucun nouvel appel automatique. La ressource Analyses passe à 300.4 dans Stats.

## Vérification

- RED : 10 des 18 nouveaux scénarios échouaient sur les cibles de focus attendues.
- GREEN : 18/18 nouveaux tests navigateur. Calcul réussi/erreur/réponse invalide/accès refusé/RPC absent à 360 et 1280 px ; détails remplacés, sélecteur/recherche/résumé conservés, focus extérieur/dialogue, requête remplacée, fermeture, changement de période/compte et timeout sans renvoi automatique.
- 10/10 smoke existants ciblés : contrats/agrégats/sources, accès invité/Free, revalidation, filtres concurrents, ancienne réponse/état occupé, mauvaise réponse/propriétaire, synchronisation et déconnexion effectives du SDK dans le scénario synthétique, analytics.
- `pnpm verify` : 188/188 tests de base, 62 scripts analysés, build de 103 fichiers offline, audit 0 erreur et 16 avertissements préexistants.
- Contrôle visuel erreur et réussite à 360 et 1280 px ; aucune nouvelle CSS ; `git diff --check`.
- Review indépendante du diff et des scénarios existants : aucun constat restant. Le reviewer n’a pas exécuté la suite navigateur.

Profil, profile.html et smoke.e2e.mjs ne sont pas modifiés. Tests inscrits dans `test:e2e`.

## Limites

Interface réelle, réponses agrégées synthétiques, aucun compte réel ni écriture backend. Lecteur d’écran réel, autres moteurs, PWA/Android, suite E2E entière et CI distante non validés. Aucun merge, déploiement ou modification de main. Ces résultats ne terminent aucune des trois exigences globales.
