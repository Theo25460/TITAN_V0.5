# Avant / après — finition visuelle de l'application Android (21/10/2026)

Planches produites à partir des **vrais écrans React Native** (banc d'aperçu `TITAN_PREVIEW=1`, Chromium, 412 dp),
avec des données fictives. « Avant » = la première version livrée (PR #116 au commit `ef5eebf`), « Après » = le code
actuel. Les écrans examinés un par un sont ceux-ci ; un défaut trouvé est corrigé dans le même lot.

| Planche | Ce qui change |
|---|---|
| `01-accueil-et-qg.jpg` | Accueil qui montre la boucle séance → progression → aventure ; QG avec le personnage dans l'anneau d'XP, le monde en cours, la semaine regroupée dans une seule carte |
| `02-seance-et-records.jpg` | Moment après séance (XP qui défilent, crédits, records battus avec l'ancienne valeur, maîtrise, chapitre) ; fiche de séance sans cases imbriquées ; records dont les mises en garde standard ne sont plus répétées sous chaque carte |
| `03-aventure.jpg` | Monde en chemin de 9 chapitres avec obstacle ou gardien et phases ; cartes de mondes en dégradé ; collection de 36 médailles |
| `04-progres-et-profil.jpg` | Graphique hebdomadaire corrigé (libellés « Invalid Date » superposés avant), « Tes questions » du site, moyenne ; profil avec maîtrises visuelles |

Régénérer : voir `../play-store/README.md` (même banc), puis `scripts/preview-shots.mjs` sans `PLAY_STORE`.
