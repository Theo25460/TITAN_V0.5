# ACT01 / ACT02 / ACT04 — première valeur sportive

Lot issu de la revue ACT09 du checkpoint PR102, sur la tête validée de PR103 `d2a3e6a737c9983f5e26961627aba68b108c2cfd`. Un seul lot traite les trois frictions observées. Aucun changement SQL, de prix, de gain, de campagne ou de paiement.

## Résultat

- **ACT01** : l'offre ne prétend plus que TITAN+ ouvre davantage de mondes. Deux blocs distinguent l'essai/journal gratuit utilisable et les campagnes complètes/nouvelles analyses préparées. Les restrictions de disponibilité existantes restent visibles ; aucun ajout préparé n'est présenté comme inclus immédiatement dans un achat. Générateur et pages index/tarifs synchronisés.
- **ACT02** : l'onboarding ne promet plus qu'enregistrer n'importe quelle première séance débloque une balise. Le suivi sportif reste l'action principale. Un chemin facultatif permet de démarrer l'aventure d'abord ; il ne démarre aucune campagne automatiquement. Le QG sans campagne explique de commencer avant la prochaine séance. Action première séance, accès secondaire à la progression et à l'aventure vérifiés à 360 et 1280 px.
- **ACT04** : le résultat découverte propose directement « Créer mon compte » vers le vrai formulaire d'inscription, en conservant Terminé/Journal. Il précise conservation locale, XP estimés et ajout des séances au compte après inscription. Les résultats des comptes connectés et les reçus confirmés gardent leur contrat existant.

Les versions passent à onboarding300.4, qg300.3 et moment300.2 sur ses deux consommateurs. La suppression du compte, le nom Profil, smoke.e2e.mjs et les images restent inchangés. Aucun crédit rétroactif, obligation de RPG ou nouvelle pop-up.

## Preuves

- `pnpm run verify` : 238/238 tests, build, audit 0 erreur/16 avertissements existants et garde de publication verts.
- Six nouveaux parcours réels navigateur à 360/1280 px dans `tests/e2e/activation.e2e.mjs`, branchés dans la commande CI. Ils vérifient offre/CTA, fin d'onboarding sans campagne automatique, QG vide, écriture durable d'une séance découverte, ouverture du vrai formulaire d'inscription et séance toujours présente au retour au journal. La séance de ce test est créée par `logActivity`, sans passer par le formulaire ; ce n'est pas une recette du formulaire ni d'une inscription réelle.
- 34/34 parcours activation + contexte Moment/QG verts ; transition de compte, fermeture de récapitulatif, absence de fuite et conservation des actions vérifiées.
- 22 anciens parcours onboarding/enregistrement rejoués : 21 verts et un échec de contexte détruit pendant une navigation, dans le test de cap exact 2499+1 ms. Ce test isolé repasse 1/1 sans changement de code. La course d'horloge du banc est documentée, aucune logique de sauvegarde ni test réservé modifié. La CI finale doit confirmer la suite complète.
- Revue indépendante unique du diff : aucun Critical/Important confirmé ; les six nouveaux cas rejoués indépendamment. Limite mineure : le nouveau cas récapitulatif n'exerce pas le formulaire d'enregistrement ; les tests existants du formulaire sont conservés.
- Rendus onboarding/résultat/offre inspectés à 360/1280 px ; absence de débordement horizontal vérifiée par les nouveaux parcours. Pas de recette sur appareil physique ou de test humain de compréhension/attractivité certifié.

## Statuts réels

ACT01 reste partiel : la compréhension en 10–30 secondes doit être observée chez des personnes. ACT02 peut être fermé pour les critères du QG décrits ci-dessus après CI verte ; cela ne certifie pas l'attrait humain. ACT04 reste partiel : le parcours connecté et sa confirmation réelle restent à recetter avec un compte, en conservant la distinction estimation/confirmation.

## Bloquant à corriger maintenant

Aucun défaut produit Critical/Important confirmé par la revue. Ne pas considérer la livraison vérifiée sur la seule suite ciblée : attendre les trois jobs CI de la tête publiée.

## Non bloquant / backlog finition

Recette humaine ACT10, compte connecté réel, appareils physiques, disponibilité des ajouts au moment de la publication et test d'horloge du banc. Ces limites ne justifient pas une série de micro-PR sur les mêmes libellés.

## Prochain macro-bloc

Checkpoint isolé d'intégration des derniers lots Claude et de ce lot, en respectant le claim CHEAT19 et toute déclaration nouvelle. Trois points cohérents proposés : A08 / QA05 / ACT09. Conserver les historiques, inventorier les migrations et vérifier la coexistence ; aucun merge main, déploiement ou migration réelle implicite.

## Suivi de PR103

Le blocage d'envoi du précédent tour est levé par l'autorisation de Théo. PR103 est prête, non fusionnée ; CI39253756681 entièrement verte sur d2a3e6a : 238 tests, 701 navigateurs, deux voies PostgreSQL16 et concurrence réelle. CHEAT16 clos dans le cahier ; CHEAT17/18 restent partiels pour les endpoints et signaux hors séances. L'intégration Claude b9db01f est rapportée dans le cahier, sans mutation de main par ce lot.
