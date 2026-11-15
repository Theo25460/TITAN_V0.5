# Accessibilité numérique : qualification et état (LEG52)

État au 21/10/2026, contrôles techniques complétés le 15/11/2026 (§ 2 bis). **Conclusion provisoire, à valider (LEG13) : ce n'est pas un avis juridique.**

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

## 2 bis. Contrôles du 15/11/2026 (V1.3.1, application Web privée)

Réalisés sur un build local (`/var/tmp/titan-web`, Chromium 153 sans interface, compte synthétique, Supabase simulé). Détail et preuves : [`v131/lot3-8-web-ux-performance.md`](v131/lot3-8-web-ux-performance.md).

| Contrôle | Résultat | Preuve |
|---|---|---|
| axe-core 4.10.2, règles WCAG 2.0, 2.1 **et 2.2** niveaux A et AA, 20 pages privées × compte vide et compte rempli × 360 et 1280 px, session découverte | Avant : 4 échecs, tous sur `adventure` (`target-size` : boutons radio « Ton chemin », `summary`). Après correction : **0** | script `axe.mjs` (hors dépôt), test « adventure: … WCAG 2.2 target size holds » (`tests/e2e/v131-web-ux.e2e.mjs`) |
| Même analyse **connecté** (15 pages × journal vide et 24 séances × 2 largeurs) et sur des états ouverts : feuille « Ta semaine type », menu, formulaire de séance en erreur, résultat de séance, détail du journal, nouvel objectif, QG hors ligne, connexion et inscription en erreur, première étape d’accueil, page hors ligne | 1 défaut trouvé : contraste du libellé du personnage choisi (Profil › Mon identité), corrigé. Après : **0** sur 72 états. Non analysé : feuille de chapitre de l’aventure en mode connecté (l’aventure simulée répondait « indisponible ») | script `axe2.mjs` (hors dépôt) |
| Parcours **au clavier seul** (Tab, Entrée, flèches ; aucun clic), à 1280 et 360 px : se connecter ; enregistrer une séance (QG → recherche du sport → formulaire → Enregistrer → résultat → Terminé) ; ouvrir le Profil et déplier « Mon identité » ; ouvrir l’Aventure | Les quatre aboutissent. Corrigés au passage : focus perdu après le choix d’un sport, après la fermeture du résultat et après « Commencer la campagne » (il repartait du haut de la page) ; champs de saisie dont le focus n’était signalé que par une bordure de 1 px (anneau de 2 px ajouté) | script `kbd.mjs` (hors dépôt), tests « session page: Back returns… », « a double click… », « adventure: … » |
| Taille des cibles (WCAG 2.2, 2.5.8 : 24 px) | Aucune cible sous 24 px signalée par axe après correction ; les actions principales mesurées au clavier font 44 px de haut ou plus (40 px pour la pastille du profil dans la barre du haut) | `axe.mjs`, `kbd.mjs` |
| Recomposition à 320 px | Pas de défilement horizontal sur le QG refait (bande de rang, tuiles) | test « the rank strip keeps character, level and crest on one row at 320 and 360 px » ; `viewports.e2e.mjs` |
| Mouvement réduit | L’anneau de gain du résultat de séance s’affiche dans son état final ; les blocs ajoutés au QG reprennent l’apparition existante (`asc-appear`), coupée par `prefers-reduced-motion` et par le réglage « Réduire les animations » | `js/app/moment.js` (`reducedMotion`), test `motion-setting` |

Ce que ces contrôles **ne prouvent pas** : la restitution par un lecteur d’écran (aucun essai NVDA, VoiceOver ou TalkBack), l’usage sur un téléphone réel, le zoom texte à 200 % sur chaque page (vérifié seulement sur le Profil par `profile-passport`), la pertinence des libellés pour une personne non voyante, le contraste du texte posé sur les images (bandeau du QG sur ordinateur, tuiles des mondes), mesuré par axe seulement là où il sait le calculer.

## 3. Ce qui n'est pas couvert

- Un contrôle automatique ne trouve qu'une partie des défauts : états qui demandent une interaction (fenêtres, erreurs), ordre de lecture, formulation pour lecteur d'écran, alternatives textuelles pertinentes des graphiques, contraste dans tous les thèmes.
- **Aucun audit manuel**, aucun essai avec VoiceOver, TalkBack ou NVDA, aucun audit RGAA : à faire avant toute déclaration publique.
- **Aucune déclaration d'accessibilité publiée** : volontairement. Publier « partiellement conforme » ou « conforme » est un acte juridique ; tant que l'exemption n'est pas confirmée et qu'aucun audit manuel n'existe, rien n'est affirmé sur le site.
- Les écrans connectés ont été analysés par axe le 15/11/2026 avec un compte synthétique (§ 2 bis), mais cette analyse n’est pas rejouée à chaque intégration : le test automatique `accessibility-axe` reste à l’état découverte et aux règles WCAG 2.0/2.1.

## 4. Suite recommandée

1. Faire confirmer l'exemption (LEG13, `docs/LEGAL_VALIDATION_POINTS.md`) et décider si une déclaration est publiée malgré tout.
2. Un passage manuel au lecteur d'écran sur les cinq parcours principaux (créer un compte, enregistrer une séance, lire le journal, ouvrir les statistiques, supprimer son compte) et au clavier seul.
3. Intégrer à la recette automatique l’analyse axe des écrans connectés et des règles WCAG 2.2 (faite à la main le 15/11/2026, § 2 bis).
