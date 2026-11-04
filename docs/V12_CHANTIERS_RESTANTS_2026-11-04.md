# TITAN V1.2 — chantiers restants : état, contrat proposé, protocoles de recette (4 nov. 2026)

Complète `V12_ANDROID_UX_POLISH_2026-11-04.md`. Rien ici n'est « validé » : les protocoles servent à produire la preuve sur appareil.
Périmètre rappelé : aucune migration, aucun changement des règles serveur XP/RPG ni de la synchronisation des profils (Astra).

## 1. Pas → RPG (V12-02, V12-39) — contrat proposé pour la revue serveur, **non implémenté**
_Mise à jour : le compteur TITAN existe désormais (§1bis) ; pour qu'il alimente le RPG, la source `titan_pedometer` doit être acceptée côté serveur avec les mêmes règles (plus-haut-atteint, plafonds, fenêtre de jours)._

**Ce qui existe** (`20261028100000_daily_activity.sql`) : `titan_import_daily_activity_v1(source, jour, pas)` remplace le total du jour
(`on conflict … do update`) ; consentement vérifié à chaque écriture ; plafond 200 000 ; plusieurs sources ne s'additionnent jamais
(lecture = maximum). L'écriture est donc déjà **idempotente par construction**. Aujourd'hui elle ne donne ni XP, ni crédit, ni quête (RPG21).

**Principe proposé** — « le total du jour remplace, la récompense ne fait qu'avancer » :
1. Une valeur dérivée serveur par jour : `walk_progress(jour) = f(min(pas_du_jour, plafond))`, calculée **depuis le total stocké**, jamais depuis un delta envoyé par le client.
2. Un **plus-haut-atteint** par `(compte, jour)` : le gain accordé ne croît que si `f` dépasse ce plus-haut. Resynchroniser le même total, réimporter ou changer de source → gain nul. Un total qui baisse (correction de la source) ne retire rien.
3. Plafond quotidien explicite (ex. palier de pas au-delà duquel `f` est plate) et plafond hebdomadaire ; fenêtre de jours acceptés limitée (ex. aujourd'hui et hier) pour interdire la création d'historique récompensé.
4. Ne nourrit **que** ce que le cahier désigne : jauge de marche du monde et objectif quotidien (V12-39), pas l'XP d'effort. L'XP reste la mesure d'un effort enregistré (parité gratuit / TITAN+).
5. Sans consentement ou sans donnée : aucune ligne, aucun zéro, aucun reproche (le client l'affiche déjà ainsi).
6. Journal d'audit : chaque avancée écrit (jour, ancien plus-haut, nouveau, source) ; réponse de l'RPC renvoie « ce que ces pas ont fait avancer » pour l'affichage V12-02 (« ces pas ont fait avancer… »).

**Tests serveur à écrire par Astra** : même total envoyé 5× → un seul gain ; total qui baisse puis remonte → pas de double ; deux sources même jour → maximum, un gain ; jour hors fenêtre → refus ; consentement révoqué → refus ; compte suspendu → refus ; export de données inclut l'historique.

**Côté client (prêt à brancher, rien à changer avant le contrat)** : `data/steps.ts` envoie déjà le total du jour, relit à l'ouverture et au retour au premier plan (garde 30 min). Il restera à afficher la réponse « avancé de… » dans `StepsCard` et la jauge dans l'Aventure, et à remplacer la phrase « ne créent ni séance ni récompense » **le jour où** la règle est en production — pas avant.

## 1bis. Compteur de pas TITAN (livré dans cette passe, **à valider sur capteur réel**)

**Pourquoi** : Santé Connect ne donne pas de pas instantanés et exige une synchronisation ; l'utilisateur voulait un compteur propre à TITAN, qui bouge quand on marche.
**Comment** : module natif Expo local `mobile/modules/titan-pedometer` (Kotlin) lisant le capteur matériel `TYPE_STEP_COUNTER` (total cumulé depuis le démarrage). `lib/stepLedger.ts` en tire des pas par jour ; `data/pedometer.ts` partage l'état par compte ; `data/steps.ts` fusionne avec Santé Connect **sans additionner** (le plus élevé du jour gagne et nomme sa source).
**Comportement honnête** : désactivé par défaut ; la permission Android « activité physique » n'est demandée qu'à l'activation ; le nombre bouge **pendant que TITAN est ouvert** ; les pas faits TITAN fermé sont rattrapés à l'ouverture (partagés à minuit selon les heures d'éveil et signalés « estimés ») ; rien ne tourne en arrière-plan (ni service, ni verrou) ; avant la première lecture, aucun chiffre ; redémarrage du téléphone géré ; plafond de plausibilité par heure.
**Limites connues, dites** : (1) TITAN fermé, rien n'est compté en direct — le compteur matériel garde le total, TITAN le relit ; (2) le compteur matériel peut être remis à zéro par certains constructeurs : géré comme un redémarrage, au prix d'un possible manque ; (3) les pas TITAN **restent sur le téléphone** : la fonction serveur n'accepte que la source `health_connect`. Les envoyer au compte (web, RPG) demande une source `titan_pedometer` côté serveur (Astra) ; (4) la distance affichée est une approximation (foulée de 0,75 m).
**CI** : le contrôle du paquet exige désormais la permission `ACTIVITY_RECOGNITION` (preuve que le module est lié) et l'autorise dans la liste blanche.
**Recette** : sur un téléphone réel, activer, marcher 100 pas écran allumé (le nombre doit monter en ~1 s), verrouiller, marcher 200 pas, rouvrir (rattrapage), redémarrer le téléphone, vérifier : pas de baisse, pas de doublon, pas de saut ; refuser la permission → message clair ; Samsung (One UI) et un fabricant à gestion de batterie agressive.
**À relire par le propriétaire (non modifié ici)** : la politique de confidentialité (`legal_privacy.html`) ne mentionne pas le capteur de pas du téléphone ; la déclaration « sécurité des données » de Google Play doit refléter que les pas comptés restent sur l'appareil.

## 2. Google OAuth Android (V12-03)

**Dans le code** : PKCE vers `titan://auth-callback`, échange du code, callback ignoré s'il est malformé ou en double, et — nouveau — message clair si l'app revient au premier plan sans callback (`createReturnWatch`).
**Hypothèse de cause du retour sur le site (à vérifier, non prouvée)** : Supabase ne redirige vers `redirectTo` que s'il figure dans *Authentication → URL Configuration → Redirect URLs* ; sinon il retombe sur le *Site URL* (le site). Vérifier la présence exacte de `titan://auth-callback`.
**Recette (AAB signé distribué via Play fermé, pas un APK CI)** : (1) compte neuf ; (2) compte existant ; (3) annuler dans Google ; (4) app fermée pendant l'autorisation ; (5) double clic sur le bouton ; (6) navigateur par défaut ≠ Chrome. Noter pour chacun : écran final, session valide au redémarrage, absence de second compte, et si le message « connexion non terminée » apparaît quand le callback manque.

## 3. Garmin (V12-04)

**Dans le code** : l'écran ouvre l'autorisation dans le navigateur, relit l'état au retour au premier plan, distingue « compte connecté » / « dernière réception » et ne parle d'import qu'à la réception réelle ; retrait disponible.
**Reste, hors client** : callback `https://titan-app.fr/auth/garmin/callback` jusqu'à la liaison serveur, réglages push du programme Garmin, import réel d'une activité.
**Recette** : autoriser → revenir dans TITAN → « connecté » visible → redémarrer l'app → toujours connecté → faire une activité réelle → vérifier journal (une seule fois) → retirer l'autorisation → état « non connecté ». Garder captures et horodatages ; ne pas écrire « import validé » sans la ligne de journal.

## 4. GPS natif (V12-26)

**Dans le code** : service de premier plan + notification, brouillon local par compte, pause/reprise, précision insuffisante affichée honnêtement ; une entrée directe existe maintenant sur l'onglet Séance.
**Recette Scénario D, par catégorie d'appareil (Samsung/One UI, Pixel/AOSP, Xiaomi/Oppo/Honor)** : sortie extérieure 20–30 min ; écran verrouillé ; mode économie d'énergie ; ouverture caméra/appel pendant l'enregistrement ; perte GPS temporaire ; arrêt forcé puis réouverture (que reste-t-il du brouillon ?). Mesures à noter : distance vs repère connu, vitesse maximale plausible, points manquants, notification toujours présente. Un trajet d'émulateur ne compte pas.

## 5. Compatibilité (V12-23/29) — fait et à faire

**Corrigé et vu sur le banc d'aperçu (600, 840, 900×480, 1200 dp, aucun débordement horizontal)** : barre d'onglets (le « + » recouvrait « Séance » dès 600 dp), pied de formulaire qui ne mange plus l'écran sous 520 dp de hauteur, libellés d'onglets plafonnés à 1,3×.
**À faire sur appareil** : pliable fermé/ouvert pendant une saisie (brouillon conservé ?), rotation, split-screen, police 130/150/200 %, TalkBack, appareil 3–4 Go de RAM, Android 11 → 16. Le verrou `orientation: "portrait"` reste en place (ignoré par Android 16 ≥ 600 dp).

## 6. Web
- **Sélecteur de séance (V12-07)** : « Voir les N sports » par famille (liste complète alphabétique, repliable) en plus de la recherche ; vérifié à 390 et 1280 px.
- **Guide de première connexion (V12-06)** : styles portés dans le design system.
- Reste : recette sur le site déployé (non déployé ici).
