# Prévoir : formulaire et contexte de compte

18/10/2026 — lot SEC03 / UX09 / QA13, exigences globales maintenues `[~]`.
Branche : `codex/web-planner-context-cdc`, empilée sur PR #92 (`6bb5aa39531ae98bb63395faddb5c2f548ded714`).

Le planning et son formulaire pouvaient conserver des notes de l’ancien compte. Le panneau ouvert ne vérifiait pas son contexte d’origine avant Enregistrer ou Repos / libre ; le retour clavier pouvait aussi viser un jour du nouveau contexte.

Le module lie son écran et chaque formulaire au propriétaire, client, epoch et à l’instance d’accès aux données. La transition efface immédiatement l’ancien contenu et ferme uniquement son propre panneau. Le nouveau contexte est adopté au rendu suivant. Une discordance silencieuse au moment d’une action ferme l’ancien formulaire sans appel au réglage ni notification. Les gestionnaires d’un formulaire fermé, détaché ou déplacé hors de son panneau ne peuvent plus agir.

Le retour clavier reste limité au contexte d’origine. Un rendu d’historique sous le même compte conserve le brouillon, sa recherche et les retours sur le jour courant. Les validations, choix de sport, durée, note et payloads d’enregistrement/repos restent identiques. Aucun changement de data.js, stockage, synchronisation cloud, calcul ou moteur RPG/XP. Ressource Prévoir 300.2 ; Profil et smoke.e2e.mjs non modifiés.

## Vérification

- RED : trois tests ciblés reproduisent l’ancien contenu pendant la transition et l’ancien formulaire restant ouvert.
- GREEN : 14/14 nouveaux tests de contexte + 9/9 tests clavier existants. Transitions à 360/1280 px, notes retirées, sauvegarde/repos obsolètes refusés, A → B → A, client/epoch changés silencieusement, enregistrement courant, brouillon courant, focus extérieur et événement de fermeture ancien.
- Review : deux scénarios rouges montrent qu’un formulaire retiré de son panneau encore ouvert pouvait appeler son gestionnaire. Garde de rattachement ajoutée ; les deux tests sont repassés indépendamment par le reviewer. Aucun chemin normal de l’interface ne retire actuellement seulement le formulaire : il s’agit d’un renforcement défensif, pas d’une régression utilisateur démontrée.
- pnpm verify : 188/188 tests de base, 62 scripts analysés, build 103 fichiers offline ; audit 0 erreur et 16 avertissements préexistants.
- Contrôle visuel planning/formulaire à 360/1280 px ; aucune nouvelle CSS. git diff --check sur les fichiers du lot.
- Review finale sans constat restant ; le reviewer a relancé les deux cas détachés, pas les 23 tests navigateur complets.

## Limites

Interface réelle avec contextes et gateway de réglages synthétiques ; tests clavier existants sur stockage invité local. Aucun compte réel ni écriture backend. Auth SDK, synchronisation cloud et sécurité des écritures serveur restent dans les couches existantes, non auditées de bout en bout ici. Lecteur d’écran réel, autres moteurs, PWA/Android installé, suite E2E entière et CI distante hors validation. Aucun merge ni déploiement.
