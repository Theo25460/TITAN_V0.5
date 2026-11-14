# Lots 3 et 4 · UX de l’application Android — matrice (document en cours, tenu à jour écran par écran)

Périmètre : `mobile/src/screens/**`, `mobile/src/components/**` (sauf `Crest.tsx`), libellés de `mobile/src/navigation/**`, `mobile/preview/**`, tests des écrans modifiés. Référence : [`cahier-reference.md`](cahier-reference.md) (lots 6, 6 bis, 6 ter et 6 quater du cahier) et [`vocabulaire.md`](vocabulaire.md).

**État au moment de cette écriture : travail en cours.** Les lignes « Non terminé » ne sont ni auditées à fond ni corrigées. Ce fichier est réécrit à la fin du lot.

## Méthode et limites

- Les écrans sont vus dans l’aperçu Web des écrans natifs (`TITAN_PREVIEW=1`, Chromium, 412 × 915 dp, densité 2, données fictives de `mobile/preview/`). **Ce n’est pas un téléphone** : polices, ombres, gestes, clavier, TalkBack et permissions Android ne sont pas vérifiés ici.
- Captures « avant » : `/var/tmp/titan-ux/before/` (61 écrans et états, pris avant toute modification). Paires avant/après des écrans modifiés : `mobile/docs/avant-apres/v131/`.
- **Aucune note de simplicité n’est validée par des humains.** Rien dans ce document ne permet d’écrire « 8/10 atteint ».

## Inventaire vérifié (cahier : « 46 écrans natifs »)

| Mesure | Cahier (V13-38) | Dépôt le 14/11/2026 |
| --- | --- | --- |
| Fichiers `.tsx` sous `mobile/src/screens` | 46 | **48** |
| dont fichiers d’écran `*Screen.tsx` | — | **44** (les 4 autres : `DuoCard`, `Questions`, `ExerciseEditor`, `SportMetricsEditor`) |
| Routes de navigation | — | **45** (40 de pile + 5 onglets ; `RoutesScreen.tsx` porte `Routes` et `Route`) |

Le cahier ne nomme pas les 46 écrans : c’est un décompte de fichiers. L’écart (+2) vient de fichiers ajoutés depuis. La matrice ci-dessous suit les **45 routes**.

## Matrice (format du registre)

| Élément | Attendu | Réalité constatée | Écart | Gravité | Correction | Preuve | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `QG` (onglet) | Comprendre TITAN en 10 s, une action principale, progression, chapitre à suivre, gains récents (UX-131-02, V13-40, ANTI-IA-06) | Avant : niveau en tout petit, progression cachée derrière « Mes repères d’ascension », trois liens texte nus, bouton « Connecter Santé Connect » sur l’accueil, chapitre répété quatre fois, compte neuf accueilli par « Ta première balise t’attend » | Progression et chapitre non visibles, permission proposée avant le besoin, jargon pour un nouveau | P1 | Bandeau = personnage (blason, niveau, rang, barre d’XP) ; carte « Cette semaine + chapitre en cours » toujours visible ; trois accès avec une ligne d’explication ; pas = une ligne facultative ; phrase claire pour un compte neuf | Avant `before/QG*.png` ; test `screens.test.tsx` « QG » et « QG sans historique » ; capture après à venir | Non terminé |
| `Adventure` (onglet) | Une carte dominante : monde actif, chapitre, ce qu’il demande, ce qu’il apporte, une action (RPG-131-01) | Avant : carte de niveau puis quatre grands panneaux de mondes de même poids, Sentiers, jalons, quêtes ; aucun chapitre principal | Mission principale absente | P0 (UX) | Carte « chapitre en cours » en tête, mondes en sélecteur compact, le reste en dessous | Avant `before/Adventure*.png` ; en cours | Non terminé |
| Autres routes | — | Captures « avant » prises, audit en cours | — | — | — | `/var/tmp/titan-ux/before/` | Non terminé |

## À venir dans ce fichier

Contrôle anti-clichés par écran refait, protocole de test utilisateur (5 à 10 personnes, dix tâches, seuil 80 % sans aide), fiche de notation selon la grille UX-131-06, liste des besoins hors périmètre.
