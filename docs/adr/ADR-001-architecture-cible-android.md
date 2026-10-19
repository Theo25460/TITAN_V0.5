# ADR-001 : Architecture cible unique web / PWA / Android

**Statut :** Proposé (aucune décision prise : à valider par Théo)
**Date :** 19/10/2026
**Décideurs :** Théo (produit), avec la relecture de la politique Google Play le jour de la publication (GP01)
**Points du cahier :** A04, A05, AND01-AND02, AND08-AND09, AND13, AND17-AND20, GP01, SEC11 (position d'architecture seulement)

## Contexte

Titan est une application web statique (pages HTML, JavaScript sans framework, Supabase pour le compte et la base, Paddle pour TITAN+) installable en PWA (`manifest.json`, `sw.js`). L'état réel du dépôt pour Android :

- **Trusted Web Activity** (Bubblewrap) : `android/twa-manifest.json`, `.github/workflows/android-twa.yml`, `docs/ANDROID.md`. La coque ouvre `https://titan-app.fr/aujourdhui?source=twa` dans Chrome ; comportement **attendu** (non vérifié : la coque n'a jamais été construite ni exécutée) : mêmes session, hors ligne et mises à jour que le web. Notifications désactivées (`enableNotifications: false`), aucune fonction native, pas de dépendance alpha.
- Détection côté web : `js/app/shell.js` mémorise `titan_twa` quand `source=twa` ou quand le référent est `android-app://`.
- Achats : TITAN+ est vendu sur le web par Paddle. Dans la coque, l'Atelier (`js/app/atelier.js`, seule entrée d'achat de l'application) remplace le bouton « Passer à TITAN+ » par une note qui renvoie au site. **Limites relevées** : la détection est une heuristique `localStorage` (`titan_twa`, posée par `source=twa` ou un référent `android-app://`, dans `js/app/shell.js`) ; le stockage d'une TWA est celui de Chrome, donc le drapeau y est partagé avec le navigateur du même profil et peut masquer le bouton sur le site après un lancement de la coque ; `openEliteCheckout` (`js/main.js`) n'est lui-même gardé nulle part.
- **Jamais exécuté ici** : pas de SDK Android, pas de clé de signature ; l'identité du paquet était discordante (`fr.titanapp.twa` dans le dépôt, `fr.titanapp.app` côté Play Console) ; **Q-001 est levée (Théo, 19/10/2026) : `fr.titanapp.app` est définitif et le dépôt est aligné** (`docs/CDC_WEB_ANDROID_PACKAGE_HANDOFF_2026-10-19.md`).

Contraintes du cahier : partager au maximum le code entre web, PWA et Android (A04) ; privilégier Capacitor ou équivalent si cela conserve le code existant, **sans réécrire en natif sans justification majeure** (A05) ; zéro régression web/PWA (AND01) ; Health Connect prioritaire sur Android pour pas et métriques, avec synchronisation incrémentale, fraîcheur visible et robustesse hors ligne (AND18) ; Garmin direct seulement s'il apporte plus (AND19) ; couche « sources d'activité » indépendante du fournisseur (AND17) ; compatible avec un futur Apple Health sans seconde architecture (AND20).

## Décision proposée

**Une seule base de code web, deux étages Android, sans réécriture :**

1. **Maintenant : garder la TWA** comme coque de publication. Elle partage 100 % du code, ne casse rien et suffit tant qu'aucune fonction native n'est requise.
2. **Dès qu'une fonction native devient nécessaire (Health Connect, AND18) : ajouter une coque Capacitor qui charge le même build web**, derrière une **couche d'abstraction « sources d'activité » écrite côté web** (AND17), avec un fournisseur « web / saisie manuelle » aujourd'hui et un fournisseur « Health Connect » fourni par un plugin natif le jour venu. On propose de **garder la même fiche Play** et de remplacer la coque publiée (choix de conception, non une règle de la plateforme) plutôt que de publier deux applications.
3. **Pas de natif complet** : aucune exigence du cahier ne le justifie à ce jour.

Avant d'engager l'étage 2, faire **une étude de faisabilité courte** (§ Action 3) : les points marqués « à vérifier » ci-dessous ne sont pas établis depuis le dépôt.

## Options considérées

### Option A : TWA seule (état actuel)
| Dimension | Évaluation |
|---|---|
| Complexité | Faible : une coque générée, aucun code natif |
| Partage de code | Total (c'est le site) |
| Mises à jour | Instantanées (le site), sauf métadonnées de la coque |
| Hors ligne | Service worker de Chrome, identique au web |
| Fonctions natives | **Aucun pont natif prévu par défaut** : une TWA standard n'expose pas de pont JavaScript → natif, donc Health Connect n'est pas accessible depuis le site (ajouter une activité native ou une application compagnon sortirait de l'option A) |
| Facturation | Paddle web ; l'Atelier masque l'achat dans la coque. Facturation Google Play éventuellement utilisable via les API web de Chrome pour une TWA (à vérifier) |
| Notifications | Désactivées aujourd'hui (`enableNotifications: false`) ; les notifications web de Chrome peuvent être activées dans la coque sans passer à Capacitor (à vérifier) |
| Risque de régression | Très faible |

**Pour :** coût et risque minimaux, déjà préparée dans le dépôt. **Contre :** ne peut pas porter AND18/AND19 ; dépend de Chrome (sans navigateur compatible, repli sur un onglet personnalisé, `fallbackType: customtabs`) ; règles de facturation Google à vérifier pour un abonnement vendu hors Play.

### Option B : Capacitor (coque WebView + plugins natifs) autour du même build web
| Dimension | Évaluation |
|---|---|
| Complexité | Moyenne : projet Android natif à maintenir, plugins, signature, mises à jour de SDK |
| Partage de code | Très élevé : le build web est embarqué ou chargé à distance |
| Fonctions natives | Oui, par plugins (Health Connect, notifications locales/push, partage) — plugin Health Connect existant ou à écrire : **à vérifier** |
| Hors ligne | Dépend du mode : build embarqué (hors ligne natif, mais une autre origine) ou URL distante (comme la TWA) — **à vérifier** pour service worker (la WebView peut se comporter autrement que Chrome), session Supabase et Paddle |
| Origine | Une coque à build embarqué sert le site depuis une origine locale : il faut **autoriser cette origine** côté Supabase (URL de redirection, CORS) et côté Paddle (domaines approuvés), et la CSP de `netlify.toml` ne s'y applique pas — **à vérifier** |
| Détection de plateforme | L'heuristique `titan_twa` ne détecte pas Capacitor : sans détecteur de plateforme, le paiement Paddle s'afficherait dans la WebView |
| Facturation | Plugin de facturation Google Play possible ; vente Paddle dans une WebView à vérifier |
| Risque de régression | Moyen : changement d'origine (stockage local, session, service worker) et moteur WebView plutôt que Chrome |

**Pour :** voie qui garde le code et ouvre Health Connect sans réécriture ; extensible vers iOS (AND20) sous réserve d'un poste Apple, d'un compte développeur et d'un plugin Apple Health (à vérifier). **Contre :** coût de maintenance d'un projet natif, régressions possibles de session/hors ligne si l'origine change, mises à jour du pont natif à publier via le Play Store (même en mode URL distante pour tout changement de plugin) ; Health Connect exige aussi une déclaration de permissions et une revue de la politique de confidentialité sur Google Play (GP01) ; une lecture **en arrière-plan** (synchronisation incrémentale, AND18) est une tâche native qu'une WebView ne fait pas à application fermée : la « fraîcheur visible » dépendra du plugin.

### Option C : application native (Kotlin / Compose)
| Dimension | Évaluation |
|---|---|
| Complexité | Élevée : tout réécrire (séances, journal, RPG, Atelier, social, stats) |
| Partage de code | Nul ; deux bases à maintenir |
| Fonctions natives | Toutes |
| Risque de régression | Très élevé |

**Pour :** performances et accès natif maximum. **Contre :** contredit A04/A05, coût et délai sans commune mesure ; **non retenue dans cette proposition** tant qu'aucune exigence ne l'impose.

## Analyse des compromis

- **Health Connect décide du moment**, pas du principe : tant que AND18 n'est pas lancé, la TWA suffit. Passer à Capacitor « par avance » ajoute de la maintenance et un risque de régression sans bénéfice utilisateur.
- **Le vrai travail partagé est la couche « sources d'activité »** (AND17) : elle vit dans le code web et dans Supabase (séances importées, activité quotidienne, déduplication, provenance : SEC11). Si elle est écrite sans supposer Android, TWA, Capacitor et un futur iOS l'utilisent à l'identique ; c'est l'investissement qui rend le choix de coque réversible.
- **Facturation** : la décision de vendre TITAN+ par Paddle seulement sur le web, ou par la facturation Google dans l'application, **n'est pas technique** : elle dépend de la politique de Google en vigueur le jour de la publication (GP01) et de la décision produit/juridique (LEG19-LEG25). Les deux options A et B savent suivre l'une ou l'autre voie.
- **Identité du paquet (Q-001 levée, AND02)** : `fr.titanapp.app`, définitive, alignée dans le dépôt. Elle touche aussi la construction : `tools/build-public.mjs` écrit `assetlinks.json` avec ce paquet par défaut (variable `TWA_PACKAGE_ID`).
- **Passer de la TWA à Capacitor est gratuit seulement avant la première publication.** Après publication, c'est une **mise à jour sur place** : même identifiant de paquet, même clé de signature (Play App Signing), `versionCode` supérieur, mêmes liens d'application (`assetlinks.json` avec les mêmes empreintes, AND09). Les joueurs perdraient aussi les données locales non synchronisées (file d'envoi, brouillons, instantanés) et leur session, car le stockage de Chrome et celui de la WebView sont distincts : critère de décision pour la date de bascule.
- **Notifications** : aucune exigence ne les rend nécessaires aujourd'hui (ACT07 interdit les notifications insistantes). Si une exigence apparaît, les notifications web d'une TWA sont une option intermédiaire avant Capacitor (à vérifier).

## Conséquences

- Plus facile : poursuivre la publication Android sans bloquer le web ; ajouter Health Connect plus tard sans réécrire ; garder une seule logique métier.
- Plus difficile : si Capacitor est retenu, maintenir un projet natif, tester l'origine (session, hors ligne, achat) et publier les mises à jour natives par le Play Store.
- À revoir : après l'étude de faisabilité, et après la vérification des règles Google Play (GP01).

## Hors périmètre de cette proposition

Aucune écriture dans `android/`, le workflow ou `docs/ANDROID.md`. Rien n'a été exécuté : aucune compilation Android, aucun test sur appareil, aucune lecture de Play Console. Les affirmations sur Chrome, WebView, Capacitor, plugins et règles Google Play sont des connaissances générales, **à vérifier** le jour de la décision (GP01).

## Actions

0. [ ] Détecteur de plateforme (TWA, coque Capacitor, web) à prévoir dans la couche d'abstraction pour remplacer l'heuristique `titan_twa` et garder le paiement Paddle hors des coques selon la décision de facturation.
1. [x] Paquet Android : `fr.titanapp.app` (Q-001 levée, dépôt aligné).
2. [ ] Valider le principe « TWA maintenant, Capacitor quand une fonction native l'exige, jamais de natif complet » (ou le corriger).
3. [ ] **Étude de faisabilité Capacitor (court, jetable)** : une coque qui charge `https://titan-app.fr` (puis une variante à build embarqué), pour vérifier sur appareil : persistance de la session Supabase et déconnexion (AND08), service worker et hors ligne (AND13), ouverture du paiement Paddle, liens d'application (AND09), et l'existence d'un plugin Health Connect utilisable ou le coût d'en écrire un. Aucun impact sur la TWA publiée.
4. [ ] Concevoir la couche « sources d'activité » (AND17) côté web et base : modèle commun, provenance, déduplication multi-sources (SEC11, AND19), indépendante du fournisseur et de la coque.
5. [ ] Vérifier la politique de facturation Google Play applicable le jour de la publication (GP01) avant de fixer la vente de TITAN+ dans la coque.
6. [ ] Réviser cet ADR à l'issue de 1, 3 et 5 ; passer le statut à Accepté ou Remplacé.
