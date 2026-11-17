# Recette visuelle — mission 1 « masterclass » (PR #150)

Captures du site réellement construit (`pnpm run build`, servi par `tools/serve-public.mjs`), prises avec Chromium sans écran.
**Ce ne sont pas des téléphones**, et le compte connecté est **simulé** : `tools/visual/fixture-connected.mjs` joue le serveur dans
la page (compte établi « Camille R. », 120 séances, réglages de production de `tools/visual/flags-production.json`). Aucune
donnée de production n'est lue. Les visiteurs (pages publiques) n'ont pas de compte.

« Avant » = `main` au commit `a4dc113` (fusion de #149), construit à part. « Après » = la tête de la PR #150.
Les deux sont pris sur le même état, à la même largeur, animations réduites (état final).

| Fichier | Écran | Largeur | État | Ce qu'il montre |
|---|---|---|---|---|
| `avant-apres--qg-390.jpg` | QG | 390 | connecté simulé | Le pouls de la semaine (sept jours, « 2/4 jours actifs ») et le rang sur une ligne, au-dessus de l'action du jour |
| `avant-apres--qg-1440.jpg` | QG | 1440 | connecté simulé | La bande d'état alignée sur les deux colonnes |
| `avant-apres--moment-seance-390.jpg` | Fin de séance (Course à pied) | 390 | connecté simulé, séance confirmée | Aplat citron, « 15,8 km » en grand, gain en chiffre |
| `avant-apres--moment-record-390.jpg` | Fin de séance avec record | 390 | connecté simulé | Aplat ambre, le record en tête avec « avant : 57,5 kg » |
| `avant-apres--aventure-390.jpg` | Aventure | 390 | connecté simulé | Mission en quatre lignes, la carte du monde remonte |
| `avant-apres--communaute-390.jpg` | Communauté (haut de page) | 390 | connecté simulé | Le cercle dans l'aplat corail |
| `apres--balise-allumee-390.jpg` | Balise allumée | 390 | connecté simulé, moment ouvert par `TitanAdventureMoment.celebrate("marees", 4)` | Peinture du monde, sentier des neuf balises |
| `apres--gardien-1440.jpg` | Gardien vaincu | 1440 | idem, `celebrate("aube", 9)` | Portrait du gardien, neuvième balise en losange |
| `public/` | Pages publiques | 390 et 1440 | visiteur | Voir `public/README.md` |

Il n'y a pas d'« avant » pour la balise allumée : l'ancienne feuille ne s'ouvrait qu'en jouant un chapitre entier, et la
reconstituer à la main n'aurait pas été une capture du site.

## Refaire ces captures

```bash
pnpm run build && node tools/serve-public.mjs 4173 &
node tools/visual/capture.mjs --base http://127.0.0.1:4173 --out /tmp/shots --widths 320,360,390,412,768,1024,1440,1920 \
  --state connected --pages qg,seance,seanceCourse,seanceMuscu,journal,progres,records,carriere,aventure,communaute,profil,atelier,coaching
```

Variantes ajoutées au banc pendant cette mission : `seanceCourse`, `seanceMuscu`, `seanceBloc` (le formulaire lui-même),
`aventureAube`. La barre d'onglets fixe est masquée sur la capture pleine page (elle reste sur la capture du premier écran).
