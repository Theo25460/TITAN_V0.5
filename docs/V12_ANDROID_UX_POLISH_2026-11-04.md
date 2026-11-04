# TITAN V1.2 — passe UX Android du 4 novembre 2026 (suivi V12-XX)

**Branche** : `claude/practical-ride-w973hu`, issue de `codex/v12-android-compact-rpe-ux-20261104` (`c5b5574`) sans réécriture de l'historique.
**Périmètre respecté** : client `mobile/` et feuille de style/guide du site. **Aucun** changement au backend Supabase, à la synchronisation des profils, aux migrations SQL ni aux règles serveur XP/RPG (chantier GPT Astra). Rien n'est déployé ni fusionné.

## Honnêteté des statuts
« Corrigé » ci-dessous = **codé + testé automatiquement + vu dans le banc d'aperçu Chromium (données fictives)**. Rien n'est **validé sur téléphone réel** : le cahier l'exige pour clore un V12-XX, ces lignes restent donc « à recetter ».

| ID | Ce qui est fait dans cette passe | Preuve | Reste à faire |
|---|---|---|---|
| V12-06 (web) | Cause racine : les styles du guide de première connexion n'existaient que dans `css/style.css`, plus chargé par aucune page Ascension ; l'overlay s'affichait non stylé en bas de l'accueil. Styles portés dans `css/ascension.css` (dialogue fixe, cibles ≥ 44–48 px, focus, réduction des animations), accents corrigés, CSS passé en `v=300.7`. | capture `web-guide-360.png`, `npm test` racine : mêmes 3 échecs qu'avant (dépendances racine absentes) | Recette sur le site déployé (non déployé ici) |
| V12-08 | Dialogue TITAN (`components/Dialog.tsx`, API de `Alert.alert`) à la place des 13 alertes système ; retour Android = annuler ; file d'attente ; une seule exécution ; boutons 48 dp qui passent à la ligne | 5 tests, capture `dialogue-deconnexion-360x740.png` | Vérifier le geste Retour sur appareil |
| V12-17 | Archiver/restaurer séance ou objectif, actualiser les données : action immédiate + « Annuler » dans le toast (révision renvoyée par le serveur) ; confirmations lourdes conservées (suppression, déconnexion, compte) | test `undoArchive` | Recette sur compte réel |
| V12-13/32/33 | « Refaire ma dernière séance » (onglet Séance et QG) : formulaire normal prérempli, date jamais reprise, rien d'enregistré avant validation | 2 tests + QG | Chronométrer ≤ 30 s avec 5 habitués |
| V12-31 | Sous la priorité du jour, enregistrer une séance est toujours à un appui (refaire / enregistrer) ; carte des pas compacte par défaut | tests écrans, captures 320×640 et 360 | Test d'usage « 10 secondes » |
| V12-01/05 | Pas relus au retour au premier plan (garde 30 min, consentements inchangés) ; placeholder qui réserve la place des pas ; état du tutoriel gardé en mémoire (plus d'invitation en retard) ; textes de consentement Santé Connect alignés sur le comportement réel | 3 tests | **Filmer un démarrage à froid sur le compte du propriétaire (S23)** : la cause exacte du saut n'est pas prouvée |
| V12-24 / V12-42 | Libellés d'onglets plafonnés à 1,3× (5 onglets tenables à 200 %) ; graphique linéaire sélectionnable par toucher n'importe où, glissement, et boutons Point précédent/suivant 48 dp | 4 tests | TalkBack et police 200 % sur appareil |
| V12-10 | Le GPS avait pour seule porte un formulaire de sport GPS : carte « Suivre ma sortie en GPS » sur l'onglet Séance (sport GPS favori/récent, sinon course) | test `gpsShortcutSport` | Test des 4 fonctions clés avec ≥ 5 nouveaux testeurs |
| V12-38 | « Depuis ta dernière visite » au QG : séances confirmées uniquement, après ≥ 18 h d'absence, fermable, rien si rien ne s'est passé, jamais de série ni de jour manqué ; dernière visite gardée par compte | 4 tests | Test J+1 / J+7 sur appareil |
| V12-35 | « Comment ça marche ? » repliable sur l'Aventure : séance → chapitre → balise → gardien → repos (vocabulaire vérifié contre `WorldScreen`) | 1 test | 4 testeurs sur 5 expliquent le lien activité → quête → chapitre |
| V12-41 | Un `Button` ne relance pas une action asynchrone en cours ; les appuis rapides sur une action synchrone ne sont jamais avalés ; une erreur libère le bouton | 4 tests | Parcours critique sur téléphone 3–4 Go |
| V12-01 (suite) | **Compteur de pas TITAN** (capteur du téléphone, sans tiers) : carte à anneau « En direct », écran Mes pas, fusion sans addition avec Santé Connect | 17 tests (registre + store, capteur simulé) + 15 tests UI ; aperçu avec capteur simulé (6 491 → 6 500 en 3 s) | **Validation sur capteur matériel** ; compilation Kotlin par la CI |
| V12-43 | « Sources et capteurs » : un écran, un vocabulaire (autorisé / reçu / intégré) | 3 tests | Recette Garmin/Santé Connect réels |
| V12-30/31 | QG refondu : priorité → refaire → tableau du jour (pas + semaine) → ascension → visite guidée → un repère | tests écrans, captures 320/360 | Test d'usage 10 s / 60 s |
| Web/Android | « TITAN sur le site » : porte vers analyses, coach, GPX, exports, prévision ; principe dans `V12_REFONTE_UX_PRODUIT_2026-11-04.md` | 1 test | — |
| V12-36 | **Révélation de progression** (signature) : anneau d'XP, braises, blason au niveau supérieur, record en ambre ; seulement sur reçu serveur ; passable ; sans animation si réduite — Android (`ProgressReveal`) et web (fenêtre de séance) | 7 tests + 4 tests web ; captures Android et web | Ressenti réel (durée, fluidité) sur téléphone modeste |
| V12-08 (suite) | Plus aucun pop-up système : calendrier/molettes TITAN, interrupteur TITAN, explications TITAN avant les permissions, repli `Alert` supprimé, sélecteur natif désinstallé | 9 + 3 tests | Vérifier sur appareil le geste Retour et les molettes |
| Identité | Blasons de rang et balise (vectoriel, 7 rangs), au profil/QG/Aventure/web | 7 tests + 4 tests web | Revue visuelle par le propriétaire |

## Non traité ici, avec la raison
- **V12-02 (pas → RPG)** : exige une règle serveur (plafond, idempotence). Hors périmètre imposé. Les textes disent donc toujours que les pas ne créent ni séance ni récompense.
- **V12-03 (Google revient sur le Web)** : le client demande bien `titan://auth-callback` (PKCE). Si l'utilisateur atterrit sur le site, la cause probable est côté Supabase : **Authentication → URL Configuration → Redirect URLs doit contenir exactement `titan://auth-callback`**, sinon Supabase retombe sur le *Site URL*. À vérifier dans le tableau de bord (non modifié ici), puis recetter sur AAB signé : compte neuf, compte existant, annulation, app fermée.
- **V12-04 (Garmin), V12-26 (GPS)** : nécessitent essai fournisseur et sorties réelles.
- **V12-07 (sélecteur de sports Web)** : non traité (Web uniquement, Android satisfaisant).
- **V12-23/29** : largeur lisible 720 dp et bouton/RPE adaptatifs hérités de la branche de départ ; rotation, pliables et matrice d'appareils réels restent à faire. Le verrou `orientation: "portrait"` n'a pas été modifié (Android 16 l'ignore de toute façon ≥ 600 dp).

## Vérifications exécutées (4 nov. 2026)
- Local : `npm run typecheck` OK ; `npx jest` (mobile) : 58 suites, 607 tests verts (départ : 44 suites, 526 tests) ; bundle Android de production OK ; balayage `scripts/preview-overflow.mjs` : 32 écrans × 320/360/412/600/840 dp, aucun débordement horizontal.
- **CI « Android natif » (run 146, commit 52d23fe), lue sur GitHub** : types + tests + bundle ✔ ; **compilation Gradle de l'APK et de l'AAB release avec le module `titan-pedometer` ✔** ; contrôle du paquet ✔ (il exige `ACTIVITY_RECOGNITION` dans le manifeste final, preuve que le module est lié) ; parcours Maestro sur émulateur Android 14 ✔ (première séance, progression, hors ligne, GPS, changement de compte).
- Banc d'aperçu web (`TITAN_PREVIEW=1`) : captures dans `mobile/docs/v12-captures/`. Données fictives, Chromium : **pas une preuve Android**. Aucun téléphone réel n'a été utilisé : aucun V12-XX n'est « validé ».
- Les commits postérieurs à 52d23fe (tirer pour actualiser relit aussi Santé Connect, documents) n'étaient pas encore passés en CI à la rédaction.
