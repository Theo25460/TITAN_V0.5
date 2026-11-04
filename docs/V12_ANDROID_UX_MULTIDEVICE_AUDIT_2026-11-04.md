# TITAN V1.2 — audit d'usage Android et compatibilité multi-écrans
**Date : 4 novembre 2026** · **Périmètre : client natif `mobile/`** · **Statut : audit statique et plan de recette, PAS une certification sur appareils.**

## Intention produit
TITAN doit être naturel à utiliser pour un sportif, pas seulement « compilable ». L'utilisateur doit pouvoir en moins de 30 secondes découvrir quoi faire, enregistrer une activité sans crainte de perte, comprendre ce qu'elle a apporté (progression et RPG), retrouver ses données et connecter ses sources sans sortir du parcours. L'ergonomie doit rester robuste sur les appareils Android raisonnablement récents, sans développer une application dédiée à chaque marque.

## Sources et limites des conclusions
- Sources lues : `mobile/app.config.ts`, navigation, QG, formulaire de séance, sélecteur RPE, composants Screen/Button/Charts/StepsCard, Health Connect, Google OAuth, Garmin, GPS, inventaire et E2E.
- Branche de départ : `codex/v12-android-ux-first-pass-20261104` (`c0af308`). Cette branche améliore déjà les libellés des boutons et plafonne les contenus à 720 dp, avec un test de largeur tablette.
- Écrans déjà prévisualisés dans le dépôt : `mobile/docs/avant-apres/`, **captures Chromium 412 dp sur données fictives**, pas des captures d'une installation Android physique.
- Un parcours Maestro API 34 est documenté dans l'inventaire (exécution historique 21/10). Ne pas confondre ces preuves avec un passage complet sur Android 15/16, Samsung, Pixel, Xiaomi, tablette ou pliable.
- `mobile/docs/INVENTAIRE.md` contient des mentions « migrations non appliquées » datées du 2/11 ; les croiser avec `docs/V11_STATUT_REEL_2026-11-03.md` avant de conclure sur le serveur. La vérification de production ne fait pas partie de cet audit.

## Constats et demandes prioritaires

| ID | Gravité | Preuve / vécu utilisateur | Action attendue | Acceptation |
|---|---|---|---|---|
| AND-01 | **P0** | Formulaire séance : dix choix RPE sur une seule ligne `styles.rpe`, largeur individuelle potentiellement ~25 dp sur écran 320 dp. | Grille sensible à la largeur courante, cibles >= 48 dp, sélection lisible. | Dans ce lot : composant `RpeSelector` + tests des fenêtres 240/280/320/360/900 dp. Valider visuellement et au toucher sur émulateur avant fusion. |
| AND-02 | **P0** | `app.config.ts`: `orientation: "portrait"` et `targetSdkVersion: 36`. Sur grands écrans Android 16 (sw >= 600 dp), Android ignore par défaut certaines limitations d'orientation/dimensionnement ; `Screen` limite uniquement la largeur du contenu. | Vrais états adaptatifs : portrait/paysage, pliage/dépliage, multi-fenêtre, hauteur réduite, footer/clavier, onglets. Ne pas se reposer sur le verrou portrait. | Aucun contenu, CTA, clavier ou modal inaccessible à 320-1200 dp, hauteur 480+, rotation pendant une saisie et une activité. État conservé. Référence : https://developer.android.com/about/versions/16/behavior-changes-16 |
| AND-03 | **P0** | Google PKCE retourne vers `titan://auth-callback` ; test automatisé unitaire mais pas preuve d'installation Android réouvrant la bonne instance. | Vérifier inscription/connexion Google, navigateur annulé, retour depuis navigateur, app fermée, double callback, liens malformés. | Retour dans TITAN Android, jamais imposé dans le site web ; session correcte, aucun écran blanc/boucle. |
| AND-04 | **P0** | GPS : service foreground, notification et stockage local existent, mais pas de validation complète réelle de batterie/constructeurs et arrière-plan. | Tests écran verrouillé, poche, 1h et 3h, perte GPS, mode économie, pause, reprise, changement de compte, redémarrage, appel entrant. | Temps/distance conservés, interruption honnête, export GPX possible, aucune trace attribuée à un autre compte. |
| AND-05 | **P1** | Carte QG « Pas du jour » existe ; actualisation automatique au plus toutes les 30 min, pas en continu. | Montrer une donnée fraîche en arrivant sur le QG et au retour au premier plan, avec état de synchronisation visible, sans promettre de « live ». Envisager un intervalle plus court uniquement s'il respecte l'énergie, les permissions et les ressources. | Les pas lus par Santé Connect apparaissent après synchronisation et restent honnêtes sur leur date ; un refus, une absence ou un hors-ligne n'affiche pas un faux zéro. |
| AND-06 | **P1** | Garmin : connexion dans navigateur externe, après le flux écran demande « reviens et actualise », réception réelle non automatique. | Retour compréhensible vers le natif, attente d'état, confirmation des activités effectivement reçues, erreurs/refus explicites. | Compte lié et dernière synchro confirmés, retour utilisateur fluide, aucune activité inventée. |
| AND-07 | **P1** | `Charts.tsx`: barres de 30 points et cercles SVG de rayon 4 touchables directement ; zones étroites à 320 dp. | Hitboxes 48 dp ou contrôle de sélection accessible alternatif, focus TalkBack et détail de valeur clair. | Toutes les semaines/jours accessibles sans précision de doigt irréaliste ; labels jamais superposés. |
| AND-08 | **P1** | QG empile l'action, les pas, la visite, la cadence, le RPG, les repères, l'historique, puis la publicité. | Revue « nouveau sportif » : hiérarchie, poids visuel, chargement progressif, éviter trop de scroll avant la première séance. | Action principale visible sans défiler sur téléphone compact avec police standard ; pas de sauts majeurs au chargement. |
| AND-09 | **P1** | `Text.tsx` limite certains agrandissements de titres mais laisse le texte monter jusqu'à 1,8x. Plusieurs `row` et `numberOfLines=1`. | Tests police système 1x, 1,3x, 1,5x, 2x ; texte, contraste, clavier, lecteur d'écran. | Aucune consigne ou CTA tronqué sans moyen de l'ouvrir, onglets nommés, ordre vocal logique. |
| AND-10 | **P1** | Validation E2E historique principalement émulateur Android API 34. | Matrice de téléphones et marques (ci-dessous), tests d'intégration réels ; journaliser modèle, OS, largeur, échec et reproduction. | 0 crash ou blocage P0, 0 perte de séance, accès à tous les parcours critiques. |
| AND-11 | **P2** | Expérience tablette limitée à `maxWidth: 720`. | Éviter « téléphone gigantesque au milieu de l'écran » : largeurs lisibles, double colonne si pertinent dans Journal, statistiques, communauté, espaces vides intentionnels. | Grand écran lisible, sans allonger inutilement les gestes ni étirer les cartes. |
| AND-12 | **P2** | Différents systèmes Android appliquent des paramètres d'économie d'énergie et comportements de navigation spécifiques. | Vérifier barre système/encoches/gestes, clavier Samsung/Gboard, thème sombre forcé, interruptions appel, réseau fluctuant, retour Android. | Parcours identique et intelligible, avec dégradation explicite quand une fonction matérielle manque. |

## Parcours de test à vivre comme un utilisateur

1. **Nouveau joueur — 3 minutes** : installer → comprendre la promesse → créer ou connecter compte Google → sélectionner son sport → enregistrer une activité simple → voir XP, rang, RPG → retrouver la séance sans aide.
2. **Cycliste / coureur — 2 heures** : lancer GPS avec autorisation juste-à-temps → fermer écran → ville et faible signal → pause → reprendre → arrêter → vérifier distance/GPX → enregistrer → rouvrir Journal.
3. **Sportif Santé Connect / Garmin** : connecter, autoriser, refuser, révoquer, changer de compte ; suivre un compteur de pas vrai et son horodatage ; importer une activité existante et vérifier l'absence de doublon/récompense fictive.
4. **Joueur RPG** : comprendre le lien séance → XP → chapitre → quête, terminer un chapitre, reprendre le lendemain sans explication externe.
5. **Mode dégradé** : commencer un brouillon en ligne, perdre le réseau, forcer arrêt de l'app, redémarrer, changer de compte, retrouver le brouillon initial sur le bon compte ; jamais de double écriture.

Chaque parcours doit être évalué sur : **compréhension**, nombre de gestes, temps, lisibilité, erreurs visibles, reprise, et **confiance dans l'enregistrement**. Les tests du code et les captures ne remplacent pas cette recette.

## Matrice d'écrans et d'appareils cible (dp = unités logiques, pas pixels physiques)

| Famille | Fenêtres à vérifier | Scénarios |
|---|---|---|
| Téléphone compact | 320×640, 360×740 | Login, 5 onglets, RPE, séance et clavier, cartes, petites hauteurs |
| Téléphone moderne | 393×852, 412×915 | Parcours complet, safe areas, GPS |
| Grand téléphone | 480×960 | Texte, tableau, hiérarchie QG |
| Pliable fermé et ouvert | 360×800 → 840×900 | Déplier au milieu d'un formulaire, GPS, retour navigateur, navigation |
| Tablette portrait/paysage | 800×1280 et 1200×800 | Lisibilité, espaces, menus, modals, rotation |
| Multi-fenêtre | largeur 240–600, hauteur 480+ | Redimensionner durant une saisie, clavier, footer et onglets |
| Accessibilité | police 1,3x/1,5x/2x, TalkBack, animations réduites | Titres, barre du bas, sélection de graphiques, formulaires, annonces |

**Plateformes :** viser Android 10–16 en priorité produit, sans promettre support universel. Le minimum technique actuel est Android 8.0 / API 26 dans `app.config.ts`; **ne pas le relever sans décision de distribution et sans vérifier les appareils existants**. Vérifier au moins un Pixel, un Samsung One UI et un Xiaomi/HyperOS en réel si possible ; complément par émulateurs API 29, 34, 35, 36.

## Gardes-fous pour chaque correctif

- Ne modifier ni la V1 en production, ni la branche V1.1 de référence, ni les données Supabase, ni les paramètres de publication Google Play.
- Conserver les clés/propriétaires des données, les brouillons et la file d'envoi idempotente. Pour toute correction UI, relancer tests Unit/Jest, typecheck, Metro et idéalement Maestro.
- Les flux OAuth/Garmin et le GPS nécessitent **un test physique** : ne jamais marquer « validé » sur la seule base d'un test unitaire.
- Ne pas renommer des écrans ni introduire de parcours purement décoratifs sans données.
- La dernière passe sécurité/anti-triche reste séparée après stabilisation de l'expérience, sans affaiblir les contrôles déjà en place.

## Critère de sortie V1.2 Android

**Go** uniquement si : principaux parcours complets sur téléphone + tablette/pliable ; 0 bug bloquant ou perte de donnée ; compteurs de pas explicitement horodatés ; retour OAuth vérifié ; GPS vérifié écran verrouillé ; cibles tactiles et police accessibles ; tests CI verts et recette manuelle signée.

**No-go** si : retour Google vers le Web au lieu de l'application, suivi GPS perdu ou attribué au mauvais compte, connexion « réussie » sans effet visible, bouton inaccessible, rotation destructrice, doublon de séance ou crash sur appareil cible.
