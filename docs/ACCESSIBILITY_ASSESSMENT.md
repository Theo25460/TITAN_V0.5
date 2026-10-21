# Accessibilité numérique : qualification et état (LEG52)

État au 21/10/2026. **Conclusion provisoire, à valider (LEG13) : ce n'est pas un avis juridique.**

## 1. Les obligations s'appliquent-elles à TITAN ?

- La directive européenne sur l'accessibilité (directive (UE) 2019/882, dite « EAA »), transposée en droit français, s'applique depuis le **28 juin 2025** aux **services de commerce électronique** vendus à des consommateurs. Cette hypothèse historique de commerce électronique ne décrit pas la V1 actuelle : aucun abonnement TITAN+ n’est en vente, Paddle et les publicités restent désactivés. La qualification du service gratuit et les éventuelles obligations restent à établir par une personne compétente (LEG13/LEG52), sans déduire automatiquement son inclusion ou son exemption.
- Les **microentreprises qui fournissent des services** (moins de 10 personnes et chiffre d'affaires ou total de bilan annuel inférieur ou égal à 2 millions d'euros) sont **exemptées** d'une partie des exigences ; l'exemption demande en général de pouvoir la justifier par écrit (taille, chiffre d'affaires) et ne laisserait, selon une source consultée, aucun délai de grâce si l'on dépasse le seuil (à vérifier).
- TITAN est aujourd'hui porté à titre personnel, sans structure (LEG16 ; les mentions légales actuelles évoquent aussi un cofondateur, point à clarifier : sous dix personnes, le nombre exact ne change pas la conclusion). **Hypothèse de travail : il relève de l'exemption des microentreprises** de services. Deux points ne sont pas tranchés par ce dépôt et doivent l'être par une personne compétente : (a) l'exemption vaut-elle pour une personne physique qui n'est pas encore immatriculée, et dans quelles conditions de justification ; (b) elle cessera de valoir si l'activité dépasse les seuils, ou si l'éditeur change de statut.
- Textes à relire directement et à identifier précisément sur Légifrance (les sources consultées citent la loi n° 2023-171, le décret n° 2023-931 et l'ordonnance n° 2023-859, sans que l'article de l'exemption soit établi ici) (les résumés trouvés en ligne ne citent pas l'article exact de l'exemption, et un guide affirme qu'une entreprise de moins de deux ans pourrait en bénéficier : à vérifier, non retenu ici).

## 2. Contrôles techniques réalisés indépendamment de la qualification juridique

L'accessibilité est traitée comme une qualité du produit, avec des preuves automatiques dans le dépôt :

| Mesure | Preuve |
|---|---|
| Lien d'évitement « Aller au contenu » sur les pages de l'application | présent dans les pages (`asc-skip`) |
| Mouvement réduit respecté | `prefers-reduced-motion` dans cinq feuilles de style |
| Retour du focus après fermeture d'une boîte de dialogue, récupération d'erreur, changement de compte | tests `dialog-return-focus`, `shell-focus`, `*-recovery-focus`, `moment-context-focus` |
| Navigation au clavier de la planification | test `planner-keyboard` |
| Erreurs annoncées (`role="alert"`) et états (`role="status"`) sur les formulaires récents (recours, vérification, suppression) | tests de ces écrans |
| Aucun défilement horizontal, de 320 à 1280 px, toutes densités Android | test `viewports` (AND06, AND07) |
| **Aucune violation WCAG 2.0/2.1 A et AA détectée par axe-core** sur les 41 pages joueur et publiques, en session découverte, à 390 px | test `tests/e2e/accessibility-axe.e2e.mjs`, relancé à chaque intégration |

## 3. Ce qui n'est pas couvert

- Un contrôle automatique ne trouve qu'une partie des défauts : états qui demandent une interaction (fenêtres, erreurs), ordre de lecture, formulation pour lecteur d'écran, alternatives textuelles pertinentes des graphiques, contraste dans tous les thèmes.
- **Aucun audit manuel**, aucun essai avec VoiceOver, TalkBack ou NVDA, aucun audit RGAA : à faire avant toute déclaration publique.
- **Aucune déclaration d'accessibilité publiée** : volontairement. Publier « partiellement conforme » ou « conforme » est un acte juridique ; tant que l'exemption n'est pas confirmée et qu'aucun audit manuel n'existe, rien n'est affirmé sur le site.
- Les écrans connectés (profil, séance, journal, boutique) ne sont audités par axe qu'à l'état découverte.

## 4. Suite recommandée

1. Faire confirmer l'exemption (LEG13, `docs/LEGAL_VALIDATION_POINTS.md`) et décider si une déclaration est publiée malgré tout.
2. Un passage manuel au lecteur d'écran sur les cinq parcours principaux (créer un compte, enregistrer une séance, lire le journal, ouvrir les statistiques, supprimer son compte) et au clavier seul.
3. Étendre le test axe aux écrans connectés avec des données synthétiques.
