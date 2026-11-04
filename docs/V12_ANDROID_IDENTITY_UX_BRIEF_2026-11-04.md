# TITAN Android V1.2 — brief UX, identité et retour d'usage
Mise à jour : 4 novembre 2026 · **Référence métier :** cahier des charges maître (onglet « V1.2 — correctifs du test fermé », section **I**, exigences **V12-30 à V12-44**), https://docs.google.com/document/d/1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M

> Attention : **document de conception, pas fonctionnalité livrée**. Ne pas repousser les P0 existants (Google/Garmin/Health, GPS, sauts QG, multi-écrans). Aucune publication/migration.

## Positionnement
**« Ton sport réel. Une progression qui dure. »** TITAN doit transformer la pratique réelle en une aventure personnelle, sans compliquer l'entraînement. La boucle utilisateur doit tenir en quatre actions : **Bouger → Enregistrer → Comprendre → Avancer**. Le sport donne la valeur. Le RPG donne envie de la retrouver.

## Audit actuel, ancré dans le code
- `src/navigation/Tabs.tsx` : cinq onglets QG/Progrès/Séance/Aventure/Profil, structure saine à garder.
- `src/screens/auth/WelcomeScreen.tsx` : promesse de marque déjà juste ; `OnboardingScreen.tsx` : tutoriel apprécié, conserver.
- `src/screens/home/HomeScreen.tsx` : charge cognitive possible (action, StepsCard, TourCard, semaine, aventure, repères, historiques, pub), surtout à 320 dp. Prioriser une seule action et deux preuves ; placer le reste sous « Voir plus », selon l'état réel.
- `src/screens/session/RecordScreen.tsx` : bons favoris/récents/brouillons ; `SessionFormScreen.tsx` : beaucoup de données spécialisées (à préserver), besoin d'une voie « Express » non destructive et d'une voie « Complet » volontaire.
- `src/screens/session/SessionResultScreen.tsx` : XP, records, maîtrise, quête déjà présents. Recomposer la hiérarchie : résultat confirmé → effort/récompense → cause/effet RPG, sans afficher de gain serveur fictif.
- `src/screens/progress/ProgressScreen.tsx` : nombreux graphiques et indicateurs ; partir des questions humaines et offrir des valeurs accessibles sans geste précis.
- `src/screens/adventure/AdventureScreen.tsx` et `WorldScreen.tsx` : quatre mondes, chapitres et collections déjà réels. Mieux lier au QG et aux séances, pas inventer un cinquième monde.
- `src/components/Text.tsx`, `Charts.tsx`, `Screen.tsx`, `Tabs.tsx` : tests de lisibilité 200 %, orientation Android 16, zones tactiles, scroll/retour.
- Identité visuelle actuelle à préserver : noir `#05070A`, cyan `#3DD9E8` (action/progression), ambre `#F4BB54` (exploit), polices TITAN/Manrope.

## Benchmark : principes vérifiés, aucune copie d'interface
| Référence | Mécanisme observable | Traduction TITAN |
|---|---|---|
| Hevy | routines, performance précédente visible, minuteur de repos | saisie Express + préremplissage contrôlé + détails facultatifs |
| Strava | objectifs visibles avec l'activité, défis amicaux | expliquer après chaque séance son effet sur un but réel |
| Garmin Connect | QG personnalisé avec données choisies | QG utile au sportif du moment, pas un catalogue de cartes |
| Nike Run Club | première expérience accompagnée et langage rassurant | première séance sans jargon, tutoriel existant préservé |
| Duolingo | cohérence du design, parcours, personnages, quêtes d'amis | micro-rituels et émotion, **sans FOMO ni streak punitive** |
| Habitica et Zombies, Run! | progression d'un personnage/missions et récit immersif | 4 mondes TITAN deviennent une conséquence visible de l'effort |

Sources officielles :
- https://www.hevyapp.com/features/track-workouts/
- https://www.hevyapp.com/features/track-exercises/
- https://stories.strava.com/articles/it-just-got-easier-to-set-and-track-a-goal-on-strava
- https://connect.garmin.com/fr/
- https://www.nike.com/fr/nrc-app
- https://blog.duolingo.com/core-tabs-redesign/
- https://habitica.com/
- https://support.zombiesrungame.com/hc/en-us/articles/10447200523549-Zombies-Run-FAQ

## Ordre d'exécution : épurer avant d'étendre
**Lot A, V1.2 obligatoire :** P0 déjà enregistrés ; ensuite hiérarchie QG (V12-31), navigation intentionnelle (30), saisie Express (32), reprise de la dernière séance (33), résultat en trois étages (34), micro-retours (41), statistiques interprétables (42), états des sources (43), accessibilité/tablettes (44). Travailler par écrans et vrais scénarios ; une PR ne doit pas porter une refonte générale opaque.

**Lot B, seulement si A stable :** progression RPG claire et moments narratifs courts (35), cohérence visuelle TITAN (36), découverte progressive (37), retour J+1/J+7 (38) sans notifications punitives. Garder le contenu existant et ne pas perturber les données.

**Lot C, exploratoire hors obligation V1.2 :** pas comme quête d'exploration supplémentaire et défis en duo (39/40). Ces changements exigent données fiables, consentement, plafond, anti-triche/idempotence et contrôles serveur. Pas de récompense automatique non validée.

## Maquettes d'usage à obtenir dans les tests
1. **QG — débutant** : première action au-dessus du pli, pas de carte incompréhensible ni contenu vide.
2. **QG — habitué** : « Refaire ma séance » ou « Reprendre » ; indicateur de semaine et progression du monde actuel en deux preuves, pas 8 pavés simultanés.
3. **Saisie — express** : sport, valeur pertinente, durée, enregistrer. L'utilisateur peut déplier les champs métier à volonté ; tous les 260 sports restent couverts.
4. **Saisie — hors ligne** : après sauvegarde locale, « En attente de synchronisation » ; après reçu, « Confirmée » ; jamais inventer XP avant le reçu.
5. **Résultat — trois étages** : séance enregistrée → XP/record **confirmés** → étape réelle vers objectif/chapitre ; partager facultatif et secondaire.
6. **Retour — J+7 sans activité** : ni reproche ni perte de série ; action adaptée et historique conservé.

## Recette et preuves à produire
- Tests de tâches avec **5 personnes découvrant TITAN** : première séance depuis écran Séance <= 90 s (objectif), habitué <= 30 s, trouver journal/pas/GPS sans aide, comprendre « comment mes efforts font avancer l'aventure ».
- Critère de conception : >= 80 % des testeurs réussissent les fonctions prioritaires sans aide et comprennent le lien sport→RPG ; mesurer plutôt que déclarer « validé ».
- Appareils : fenêtres 320 à 1200 dp, police agrandie, TalkBack, Samsung/Pixel/Xiaomi, Android 14–16, pliable et mode fenêtre. Android 16/API 36 ignore certaines restrictions portrait sur grands écrans (https://developer.android.com/about/versions/16/behavior-changes-16).
- Prérequis absolus : aucune perte de saisie, aucune duplication de récompense, aucun départ Web involontaire lors du callback Google Android, GPS vérifié écran verrouillé.

**Livré actuellement dans la PR #131 :** sélecteur RPE adaptatif et tests, audit multidevice. **Pas livré :** toutes les propositions UX de ce document.
