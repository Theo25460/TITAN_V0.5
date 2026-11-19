# TITAN — Refonte intégrale des illustrations Web + Android (HORS ABONNEMENTS)
**Mission exécutable pour Work — 13 novembre 2026**

## Mandat
Produire, contrôler et déposer sur **GitHub** une bibliothèque unifiée de nouvelles illustrations pour **tous les écrans et parcours pertinents de TITAN Web + Android**. Le travail antérieur d'audit est **déjà effectué** : **NE PAS refaire un audit général** et ne pas répéter la refonte des pictogrammes sportifs. Parcourir seulement les fichiers réellement appelés par l'interface pour dresser une liste technique de remplacement et retrouver les usages concrets.

**Branche de production :** `design/titan-illustrations-global-v2-20261113`. Ne jamais travailler directement sur `main`. Ne pas fusionner ou déployer de visuels non approuvés.

## Périmètre (traiter toutes les occurrences réelles, sans s'arrêter à cette liste)
### P0 — Identité de progression et récompenses
1. **7 blasons de grades** : Éclaireur, Explorateur, Sentinelle, Gardien, Champion, Titan et Légende. Créations réalistes d'héraldique contemporaine, matières progressives et silhouette identifiable sans lire de texte ; concept **distinct** pour chaque rang. **Ne pas modifier la règle serveur associant niveau et rang**.
2. **Paliers / insignes de niveaux** : variantes intermédiaires, progression et hiérarchie de prestige, sans créer de nouveaux niveaux métier.
3. **Trophées, badges, récompenses, records, exploits, régularité/streak, collection, jalons, titres visuels, cadres** : donner une identité claire à chaque famille et aux états gagné / verrouillé / découvert / rare. Conserver exactement les IDs et conditions de déblocage existants.
4. **Balises de chapitres et étapes RPG** : actif, verrouillé, découvert, confirmé.

### P1 — Mondes, parcours, personnages et progression RPG
5. Les **4 mondes Renaissance** : Vallée de l'Aube (valley), Archipel des Marées (archipelago), Forges (forge), Aurores (aurora). Cohérence d'échelle, géographie, luminosité et topographie. Ni décors impossibles ni portails/ruines clichés collés gratuitement.
6. Les **4 gardiens** : aube, marées, forge, aurores ; objets/portraits crédibles, pas d'anatomie improbable.
7. Les **6 avatars existants** : scout, ranger, keeper, artisan, navigator, sentinel ; cohérence d'une même collection, cadrage approprié au cercle Android/Web. Ne pas imposer de caractéristiques sensibles supposées au joueur.
8. Visuels d'exploration, sentiers, carte, découvertes, scènes et moments de révélation ; ne pas nuire à la lisibilité des cartes et libellés.
9. Illustrations d'ancien bestiaire/anciens boss/mobs seulement si des références **actives** dans le produit l'exigent. Ne pas régénérer des dizaines de fichiers d'un système désactivé.

### P2 — Tous les autres usages illustratifs
10. Onboarding / premier effort / écrans d'accueil / hero du site / illustration d'écrans de découverte.
11. Missions, quêtes, défis, duels, objectifs quotidiens/hebdomadaires, événements.
12. Profil, passeport, carrière, ADN sportif, objets et identités visuelles de progression.
13. Stats, rapports, records personnels, récapitulatifs et moments marquants (sans transformer les graphiques de données en images figées).
14. Social : amis, groupe, binôme, communauté, classement, coaching, ateliers.
15. États vides : journal, records, statistiques, quêtes, amis, coaching, appareils, progression, etc.
16. État système illustré : hors ligne, erreur, succès, chargement, synchronisation, import GPX et Garmin / montre / GPS — **sans remplacer les icônes fonctionnelles standard par des illustrations lourdes**.
17. Habillage non fonctionnel : illustrations éditoriales, surfaces, motifs topographiques, textures, cartes de partage, composants promotionnels/marketing. Traiter uniquement les vrais usages, pas ajouter de décoration inutile.

### Exclusions strictes
- **Ne jamais changer les logos, couleurs, visuels et illustrations des abonnements TITAN+, Coach, Coach Ultra** : `image/titan-plus-logo.svg`, `image/titan-coach-logo.svg`, `image/titan-coach-ultra-logo.svg`, `image/shop/` et leurs équivalents éventuels ; contrôler tout le diff final.
- **Ne pas redessiner le logo de marque officiel** : `image/titan-mark.svg`, icônes launcher/branding `mobile/assets/brand/`, favicon, sauf mandat explicite.
- **Ne pas recommencer l'iconographie des sports** : bibliothèque de travail existante sur `design/titan-sports-library-consolidation-20261112`, avec ses assets en `proposed`. Ne pas les intégrer de force, ne pas les supprimer ni les déclarer approuvés.
- Aucune modification des règles de progression, XP, abonnements, paiements, catalogue sportif, données Supabase/RLS ou permissions.

## Points d'entrée du code VÉRIFIÉS sur `main`
- **Blasons et balises en code** : `mobile/src/components/Crest.tsx` (`RANK_IDS`, `RankCrest`, `BeaconEmblem`) ; `js/app/crest.js` (`TitanCrest.svg` / `beacon`). Web et Android doivent conserver la même hiérarchie d'IDs, même si leur représentation devient réaliste.
- **Carrière / profil** : `mobile/src/screens/progress/CareerScreen.tsx`, `js/app/carriere.js`, `js/app/profil.js`, `mobile/src/screens/profile/ProfileScreen.tsx`.
- **Récompenses / collection / aventure** : `mobile/src/components/RewardReveal.tsx`, `mobile/src/components/JourneyCard.tsx`, `mobile/src/components/WorldPathMap.tsx`, `js/app/aventure-rpg.js`, `js/app/aventure.js`.
- **Catalogue de l'univers** : `js/renaissance-catalog.js`, `RENAISSANCE_ART.json`.
- **Assets Renaissance WEB** : `assets/renaissance/` : `valley`, `archipelago`, `forge`, `aurora`, `guardian-*`, `scout`, `ranger`, `keeper`, `artisan`, `navigator`, `sentinel`, et variantes -small/-xs/-s.
- **Assets ANDROID embarqués** : `mobile/assets/rpg/`, mappés dans `mobile/src/core/images.ts` via `worldImages`, `guardianImages`, `avatarImages`, `heroImage`. Préserver l'utilisation **hors ligne**.
- **Autres images existantes** : `image/editorial/`, `image/avatar/`, `image/boss/`, `image/mob/` ; vérifier les références *réelles* avant de les remplacer, les anciens éléments peuvent être inactifs.
- **UI/DA** : `css/ascension.css`, `mobile/src/theme/tokens.ts`, `js/app/icons.js`, `mobile/src/components/Icon.tsx`. Les icônes utiles à la navigation et les données visualisées doivent rester sobres, vectorielles ou natives.
- **Écrans** : `mobile/src/screens/{adventure,progress,profile,home,community,session,auth,steps}/` et pages Web liées (`index.html`, `profile.html`, `adventure.html`, `carriere.html`, `stats.html`, `onboarding.html`, etc.). La liste est indicative : inspecter les imports et chemins réellement utilisés.

## Charte esthétique NON NÉGOCIABLE
- Identité TITAN sobre **#05070A / #0E141A / #1B2530**, cyan **#3DD9E8** seulement comme accent, ambre **#F4BB54** pour les accomplissements rares, texte et interface selon les tokens existants.
- Visuels **réalistes / 3D studio réaliste / photographie authentique retouchée avec subtilité** selon le contexte. Les blasons/trophées doivent ressembler à de vrais objets travaillés en métal/pierre/émail, pas à des icônes IA en plastique. Pour les images sportives, privilégier photographie sportive crédible et droits commerciaux vérifiés.
- **Pas de look IA** : pas de halo néon gratuit, ruines SF arbitraires, personnage de dos face à une vallée fantastique, composition systématiquement épique, pseudo runes, texte dans les images, mains absurdes, armes aléatoires, pseudo marques, duplications visuelles.
- Pour RPG, l'imaginaire sert le parcours sportif réel sans l'éclipser. Les illustrations doivent rendre l'histoire plus claire, pas rendre le QG/RPG plus confus.
- Chaque asset a un **sujet spécifique**, une fonction, un cadrage utile Android, et des variantes selon l'usage ; respecter responsive et l'accessibilité.
- Rendu photographique crédible avec texture, imperfections naturelles contrôlées et formes physiquement plausibles ; pas de filtre cyan universel ni effet "3D" systématique sur les icônes fonctionnelles.

## Exécution autonome EN UNE PASSE
1. **Reprise ciblée, pas de nouvel audit** : partir des audits existants, vérifier la liste réelle des imports/occurrences et créer `global-v2/registry/assets.json` avec ID, famille, usage, fichiers sources, cibles Web/Android, état, version, présence, priorité, droits, SHA-256 et décision de conservation/remplacement. Conserver les bons visuels existants.
2. **Produire l'ensemble** des nouveaux assets utiles, les uns après les autres, sans demander des confirmations techniques ; regrouper les revues par familles (rangs, RPG, récompenses, écrans...).
3. **Tout déposer dans GitHub sur la branche dédiée**, sous `design/titan-visual-library/global-v2/` : masters, dérivés et index de prévisualisation (contact sheets), avec statut `proposed` si aucune validation utilisateur n'a été donnée. Les sources doivent être distinctes et récupérables.
4. Formats : master PNG RGBA transparent ou source vectorielle/photographique selon le cas ; dérivés WebP (et AVIF si pertinent) dimensionnés au bon usage. Fonds des illustrations pleine largeur conservés quand c'est intentionnel ; ne pas utiliser de damier imprimé pour une fausse transparence. Ne jamais suréchantillonner une vignette pour en faire un master.
5. Générer une **vue d'ensemble revue** listant absolument tous les assets, leur statut, la miniature, l'usage et le chemin de fichier ; on doit pouvoir approuver les lots sans ouvrir individuellement chaque binaire.
6. **Intégration conditionnelle** : mettre à jour les références Web/Android uniquement pour les assets **explicitement approuvés** et dont les exports finaux ont été vérifiés ; conserver les originaux, mappages et fallbacks là où des propositions attendent encore une validation. Séparer si nécessaire en branche/PR d'intégration ultérieure.
7. **Contrôle final réel** : existence de chaque binaire, dimensions, alpha, contour, poids, licences, colorimétrie, reconnaissance à 32/48/64px, détection doublons par empreinte et similarité, géométrie, liens/paths, fonctionnement offline Android, comparaison écrans Web/Android, tests code/CI si du code est changé. Corriger puis vérifier de nouveau les anomalies.
8. Commits soignés ; ouvrir une **PR brouillon** pour les propositions, sans la fusionner. PR classique/fusion seulement pour la partie explicitement approuvée, sans CI rouge. **Aucune publication automatique** Netlify ou Play Store.
9. À la fin fournir **seulement** un bilan bref : totaux générés/conservés, chemins GitHub, liens des planches, éléments refusés ou à approuver, tests réellement réalisés, PR/commit. Ne pas prétendre avoir fait plus que ce que montrent les fichiers.

## Gouvernance
**Le propriétaire a demandé que chaque création nouvelle soit approuvée.** Pour gagner du temps, produire et pousser tous les candidats dans `proposed`, puis les présenter par lots : cela **ne bloque pas** la production, mais **bloque leur déploiement / fusion en production** jusqu'à validation explicite. Ne jamais considérer l'approbation de Football V05 comme approbation d'un autre asset.

## Priorisation
P0 d'abord (7 blasons, paliers, récompenses, balises), puis P1 (mondes, gardiens, avatars, parcours), puis P2 (onboarding, social, états vides, etc.). **Ne pas bâcler ni prétendre avoir traité tous les écrans sans inventaire et fichiers vérifiables.**
