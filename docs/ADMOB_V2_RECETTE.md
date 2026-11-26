# AdMob Android — état des lieux, corrections et recette avant V2.0

26 novembre 2026. Branche `claude/upbeat-cannon-za5wix`, partie de `main` = `0dae9af` (release 1.4.0).
Aucun identifiant secret n'est concerné : l'identifiant d'application AdMob et les blocs d'annonces sont publics par nature
(ils figurent dans tout APK). Aucune annonce réelle n'a été demandée, affichée ni cliquée pendant ce travail.

## 1. Les quatre états, à ne pas confondre

| État | Verdict au 26/11/2026 | Preuve ou manque |
| --- | --- | --- |
| **Configuré** (code et build) | **OUI**, éteint par défaut | SDK `react-native-google-mobile-ads` 17.4.0, identifiant d'application dans le manifeste, UMP, 3 bannières, 1 interstitiel, politique de fréquence, interrupteurs build + serveur (§ 2, § 3) |
| **Testé avec les annonces de test** | **PARTIEL** | Jest (faux SDK), bundle et manifeste en `ads=off` et `ads=test`, APK `ads=test` compilé et contrôlé en CI (run 288, § 7). **Jamais** vu sur un téléphone : ni annonce « Test Ad », ni formulaire Google (pas d'appareil ni de SDK Android dans ce conteneur) |
| **Approuvé par AdMob** | **INCONNU** | Aucun accès à la console AdMob. À vérifier par Théo (§ 6) |
| **Diffusé en production** | **NON** | La release Play 1.4.0 (versionCode 1400) est un build `ads=off` : SDK jamais démarré, `AD_ID` absent, déclarée « sans annonces » (`docs/ABSOLUTE_ONE_RAPPORT_FINAL.md` § Options) |

## 2. Diagnostic initial (avant ce travail)

Tout ce qui suit est sur `main`, donc dans le code du build de production, mais **inactif** dans ce build.

| Élément | Constat | Fichier |
| --- | --- | --- |
| SDK | `react-native-google-mobile-ads` 17.4.0 (UMP inclus) ; l'API utilisée (`requestInfoUpdate`, `loadAndShowConsentFormIfRequired`, `showPrivacyOptionsForm`, `getConsentInfo`) existe bien dans cette version | `mobile/package.json`, `src/ads/sdk.ts` |
| Identifiant d'application | `ca-app-pub-8126986266950187~1902494129`, posé par le plugin Expo ; `DELAY_APP_MEASUREMENT_INIT=true` | `mobile/app.config.ts` |
| Blocs | QG, Journal, Statistiques (bannières), fin de séance (interstitiel) ; un bloc natif réservé, utilisé nulle part | `src/ads/adIds.ts` |
| Test / production | `EXPO_PUBLIC_TITAN_ADS=1` → unités de **test Google** ; + `EXPO_PUBLIC_TITAN_ADS_LIVE=1` (jamais en `__DEV__`) → unités réelles. CI : `ads=test` interdit en signature `upload`, `ads=live` interdit hors `upload` | `adIds.ts`, `.github/workflows/android-native.yml` |
| `AD_ID` | Bloqué sans publicité, présent avec ; vérifié par le contrôle du paquet en CI. Permissions Privacy Sandbox (attribution, sujets) toujours retirées | `app.config.ts`, workflow |
| Consentement | UMP avant toute initialisation ; refus ou erreur = application sans annonce ; « Gérer mes choix publicitaires » dans Profil › Confidentialité | `src/ads/manager.ts`, `PrivacyScreen.tsx` |
| Droits | `profiles.is_elite` lu sur le serveur (TITAN+, Coach, Coach Ultra, place offerte par un coach) ; droits inconnus = aucune annonce ; expiration remise à faux par un balayage SQL horaire (`docs/MONETISATION.md` § B) | `src/ads/useAds.ts` |
| Garde-fous | jamais pendant un GPS ouvert, un chrono, un brouillon non relu, le tutoriel ; jamais hors ligne ; interstitiel seulement après confirmation serveur, 2 premières séances exclues, 1/5 séances, 30 min d'écart, 2/jour | `src/ads/policy.ts` |
| `app-ads.txt` | servi en production : `google.com, pub-8126986266950187, DIRECT, f08c47fec0942fa0` (HTTP 200, vérifié le 26/11) | `app-ads.txt` |
| Textes publics | CGU, confidentialité, page TITAN+ : « l'application Android n'affiche aujourd'hui aucune publicité ; si une version… » ; fiche Play : « Gratuit, sans publicité » | `legal_*.html`, `mobile/docs/PUBLIER_PLAY_CONSOLE.md` |
| Branches non fusionnées | aucune ne touche `mobile/src/ads` ; les lots V1.7.x / V1.8.x modifient `app.config.ts` (pas les lignes AdMob) | `git diff origin/main...<branche>` |

### Défauts trouvés

1. **Pas de coupure rapide.** La table `private.titan_feature_flags` a été créée « pour couper une régie, un format ou un
   emplacement sans release » (migration `20261020050000`, ADS17), mais aucun code publicitaire ne la lisait : couper les
   annonces exigeait un nouveau build et une revue Play.
2. **Deux surcouches au même toucher.** Sur « Terminer », l'interstitiel et la demande d'avis Google Play partaient en parallèle.
3. **Interstitiel périmé.** Une annonce préchargée reste valable une heure chez Google ; une annonce plus ancienne pouvait être
   présentée.
4. **Panne du module natif.** Si le module natif ne se chargeait pas, la bannière levait une exception pendant le rendu du QG,
   du Journal ou des Statistiques.

## 3. Changements

| Changement | Effet | Fichiers |
| --- | --- | --- |
| Interrupteurs serveur `ads.android` et `ads.android.interstitial` | Un build avec annonces n'affiche **rien** tant que Théo n'a pas créé et ouvert `ads.android` ; l'interstitiel exige en plus `ads.android.interstitial`. Absent, faux, illisible ou hors ligne = fermé. Pourcentage de déploiement possible (même compte, même côté). Fermé = ni bannière, ni interstitiel, ni formulaire Google, ni carte « Publicité » dans Confidentialité. Un build sans annonces ne lit pas ces drapeaux | `src/ads/adIds.ts`, `src/ads/useAds.ts`, `src/data/flags.ts`, `PrivacyScreen.tsx` |
| Une surcouche au plus sur « Terminer » | Pas d'interstitiel après un nouveau record (la séance ne consomme pas son tour) ; pas de demande d'avis quand un interstitiel a été montré. La navigation vers le QG reste immédiate | `useSessionInterstitial.ts`, `SessionResultScreen.tsx` |
| Annonce de plus de 55 min jamais montrée | elle est jetée et une nouvelle est demandée au prochain écran de résultat éligible | `src/ads/interstitial.ts` |
| Bannière tolérante au module natif absent | l'écran s'affiche sans annonce | `src/components/AdBanner.tsx` |

Inchangés : prix, avantages des offres, formats, emplacements, plafonds de fréquence, textes juridiques et commerciaux.
**Aucune migration SQL** : les drapeaux se créent dans l'admin existante. Aucune nouvelle dépendance.

Délai de coupure : les drapeaux sont relus au plus toutes les 10 minutes (et au retour au premier plan une fois ce délai
passé). Une bannière déjà affichée disparaît au prochain rendu ; aucune nouvelle requête n'est faite une fois le drapeau lu fermé.

## 4. Parcours publicitaire retenu (inchangé, modéré)

- **QG** : une bannière adaptative en ligne, tout en bas, après la progression et les cartes.
- **Journal** : sous les filtres, avant la liste.
- **Progrès › Statistiques** : entre l'ADN sportif et la maîtrise par discipline.
- **Fin de séance** : interstitiel au toucher de « Terminer », seulement s'il est déjà chargé, après confirmation du serveur
  et sous les plafonds de `policy.ts`.
- Jamais : connexion, inscription, onboarding, tutoriel, formulaires, achat, séance en cours (GPS, chrono, brouillon), hors
  ligne, compte payant, droits inconnus. Libellé « Publicité » visible ; l'espace réservé se rend s'il n'y a pas d'annonce (6 s au plus).
- Les bannières sont dans le flux de la page : elles ne recouvrent aucune action.
- Le bloc natif réservé reste inutilisé ; aucun format nouveau (ouverture d'application, vidéo récompensée) sans décision produit.

## 5. Consentement

- **Outil** : Google UMP (CMP certifiée Google), via le SDK. Le formulaire s'ouvre la première fois qu'un emplacement pourrait
  s'afficher pour un compte gratuit dont les droits sont connus, hors séance, et seulement si `ads.android` est ouvert.
- Le SDK n'est initialisé (`initialize()`) **qu'après** `canRequestAds=true`. Une erreur réessaie au plus une fois par minute ;
  un refus n'est pas redemandé.
- Refus dans l'EEE : selon le choix, Google sert des annonces limitées ou aucune ; l'application reste entière dans tous les cas.
- Modification : Profil › Confidentialité › « Gérer mes choix publicitaires » (formulaire d'options de confidentialité Google).
- Configuration des requêtes : contenu `PG`, pas de traitement « enfant », `tagForUnderAgeOfConsent=false`.
- **Point juridique ouvert** (non tranché ici) : les textes disent 13 ans, aucun âge n'est demandé, et l'âge du consentement
  numérique en France est 15 ans. À valider avant `ads=live` : âge minimal ou marquage « mineur » des requêtes.

## 6. Ce que Théo doit vérifier ou faire dans les consoles

Rien de ce qui suit n'est vérifiable depuis ce conteneur (consoles authentifiées, play.google.com refusé par le proxy).

**AdMob** (apps.admob.com)
1. Applications › TITAN (Android) : l'app est **associée à la fiche Play** `fr.titanapp.app`, et son état d'examen est
   « Prête » (pas « Diffusion limitée » ni « En attente »). Ne rien activer tant que l'examen est en attente.
2. Applications › TITAN › Paramètres › `app-ads.txt` : statut « Validé » (le fichier est servi ; le lien passe par le site
   développeur indiqué dans la fiche Play, qui doit être `https://titan-app.fr`).
3. Les 4 blocs listés dans `src/ads/adIds.ts` existent, sont actifs et rattachés à cette app (bannière ×3, interstitiel ×1).
4. **Confidentialité et messages** : un message **RGPD (EEE, Royaume-Uni, Suisse)** publié pour cette app, en français, avec
   le lien vers `https://titan-app.fr/legal_privacy`. Sans message publié, UMP n'affiche aucun formulaire. Message « États
   américains » : à publier aussi si l'app est distribuée aux États-Unis.
5. Paramètres › **Appareils de test** : ajouter le S23 (identifiant publicitaire de l'appareil) avant toute recette d'un build `ads=live`.
6. Paiements / compte : profil de paiement complet, aucune alerte de règlement.

**Play Console** (au moment de l'envoi d'un build `ads=live`, pas avant)
1. Contenu de l'application › Annonces : **Oui**.
2. Contenu de l'application › Identifiant publicitaire : **Oui**, finalité « Publicité ou marketing » (le paquet contient `AD_ID`).
3. Sécurité des données : ajouter les lignes du kit AdMob (identifiants de l'appareil, interactions, diagnostics, position
   approximative), partagées avec Google, finalité publicité (`mobile/docs/PUBLIER_PLAY_CONSOLE.md` § 4 et § 4 bis).
4. Fiche : retirer « sans publicité » de la description courte et longue (textes de `docs/play-store/README.md`).

**Textes publics** (même jour que la publication `ads=live`) : CGU § 3, confidentialité, page TITAN+ et `PUBLIER_PLAY_CONSOLE.md`
§ 4 bis passent de « aujourd'hui aucune publicité » à un fait présent ; `tests/coherence-offers.test.mjs` l'exige
(ligne « the release shipped now shows ads »). Validation juridique humaine requise.

**Admin TITAN** (titan-app.fr/admin › Drapeaux), seulement après l'examen AdMob « Prête » et la publication Play :
1. Créer `ads.android`, activé, déploiement 10 %, description « Publicités Android (bannières) ».
2. Après quelques jours sans incident : 100 %. Puis créer `ads.android.interstitial` (même progression).
3. Coupure d'urgence : décocher `ads.android` (tout) ou `ads.android.interstitial` (l'interstitiel seul).

## 7. Tests exécutés ici

| Commande | Résultat |
| --- | --- |
| `npm run typecheck` (mobile) | OK |
| `npx jest --ci` (mobile) | **115 suites, 1 023 tests, tous verts** (1 012 avant ; 11 nouveaux) |
| `node --test tests/coherence-offers.test.mjs` et les 7 autres tests racine qui lisent `mobile/src` | tous verts (14, 4, 5, 7, 2, 9, 9, 8) |
| `npx expo export:embed --platform android --dev false` en `ads=off` et `ads=test` (`--reset-cache`) | OK ; `off` : `ADS_BUILD=false` ; `test` : `ADS_BUILD=true`, `ADS_LIVE=false` (unités de test seulement) |
| `EXPO_OFFLINE=1 npx expo prebuild --platform android --clean` en `off` et `test` | `off` : `AD_ID` retiré (`tools:node="remove"`) ; `test` : non bloqué ; les deux : identifiant d'application, `DELAY_APP_MEASUREMENT_INIT`, Privacy Sandbox retirée |

Nouveaux tests : interrupteur `ads.android` absent ou faux (aucune bannière, formulaire jamais ouvert), interrupteur
d'interstitiel fermé (séances comptées, rien préchargé), maître fermé, record célébré sans annonce puis tour suivant normal,
annonce de plus de 55 min jetée, chargement jamais attendu, erreur SDK à la création, module natif absent, « Terminer » :
annonce montrée → pas de demande d'avis, pas d'annonce → demande d'avis selon ses règles, navigation immédiate.

**GitHub Actions**, run 288 (`android-native.yml`, `workflow_dispatch`, `signing=throwaway`, `ads=test`, SHA `5cbabdc`,
26/11/2026 10:51–11:19 UTC) : https://github.com/Theo25460/TITAN_V0.5/actions/runs/45805243137

| Job | Résultat |
| --- | --- |
| Types et tests unitaires (typecheck, Jest, bundle Metro de production) | succès |
| APK et AAB release : garde-fous `ads`, `expo prebuild`, Gradle `assembleRelease bundleRelease`, **contrôles du paquet** | succès. Avec `ads=test`, le contrôle exige `com.google.android.gms.permission.AD_ID` dans l'APK, l'identifiant d'application `ca-app-pub-8126986266950187~1902494129` dans le manifeste et aucune permission Privacy Sandbox : les trois sont passés |
| Parcours réel sur émulateur Android 14 (réplique du schéma de production) + vérifications serveur | succès. **Attention** : ce job compile sa propre application de test **sans** annonces ; il prouve l'absence de régression, pas l'affichage publicitaire |
| AAB signé pour Play | ignoré (normal : clé jetable) |

Artefact à installer sur le S23 : **`titan-android-1288-essai-NE-PAS-PUBLIER`** (APK et AAB, versionCode 1288, versionName
2.0.0, clé jetable, unités de test Google), disponible jusqu'au 26/12/2026. Désinstaller d'abord la version Play (signature
différente, et 1288 est inférieur à 1400).

Non exécuté : tout essai sur téléphone (formulaire Google, annonces « Test Ad »).

## 8. Recette manuelle sur le S23 (build d'essai `ads=test`)

Build : Actions › « Android natif (React Native) » › Run workflow sur cette branche, `signing=throwaway`, `ads=test`,
`e2e` coché. Installer l'APK « essai-NE-PAS-PUBLIER » (désinstaller d'abord la version Play : signatures différentes).
Drapeaux pendant la recette : les ouvrir à 100 % sur la base de production **n'a aucun effet sur les utilisateurs Play**
(le build 1400 est `ads=off` et ne contient pas de lecture de ces clés ; le site ne lit que `ads.web`). Les refermer après la
recette, et les laisser fermés jusqu'à l'étape « Admin TITAN » du § 6.

| # | Manipulation | Attendu |
| --- | --- | --- |
| 1 | Drapeaux fermés, compte gratuit, ouvrir QG/Journal/Stats | aucune bannière, aucun formulaire Google |
| 2 | Ouvrir `ads.android`, relancer l'app | formulaire Google (EEE) au premier QG ; aucune bannière avant le choix |
| 3 | « Tout refuser » | l'app fonctionne ; annonces limitées ou aucune ; rien ne bloque |
| 4 | Confidentialité › « Gérer mes choix publicitaires », accepter | bannières « Test Ad » libellées « Publicité », sans recouvrir de bouton |
| 5 | Mode avion | les bannières disparaissent, aucun message d'erreur |
| 6 | Lancer un GPS ou un chrono, revenir au QG | aucune bannière tant que l'effort est ouvert |
| 7 | Enregistrer 5 séances confirmées (pas d'historique), « Terminer » à la 5e | interstitiel de test, puis QG ; pas d'invite d'avis en même temps |
| 8 | Séance avec nouveau record | aucun interstitiel |
| 9 | Compte TITAN+ (licence de test) | aucune annonce, aucun formulaire, pas de carte « Publicité » |
| 10 | Refermer `ads.android`, attendre 10 min, revenir au premier plan | plus aucune bannière |
| 11 | Mettre l'app en arrière-plan pendant un interstitiel, revenir ; tourner l'écran | pas de plantage |

Ne jamais toucher une annonce dans un build `ads=live`. Pour un build `ads=live` de recette : S23 déclaré appareil de test
(§ 6, 5) et vérifier la mention « Test Ad » avant tout geste.

## 9. Après approbation AdMob et publication `ads=live`

Vérifier dans AdMob › Rapports, par bloc, sans cliquer : demandes, taux de remplissage, impressions, et dans « Erreurs »
les codes (`NO_FILL` est normal au début, surtout à 10 % de déploiement et en annonces limitées ; ce n'est pas une panne
à lui seul). Les annonces ne seront déclarées **diffusées en production** qu'avec des impressions réelles constatées dans ces rapports.

## 10. Fusion V2.0

- Branche `claude/upbeat-cannon-za5wix`, base `0dae9af` (= `main`). SHA : voir le dernier commit de la branche.
- Dépendances : aucune nouvelle ; aucune migration ; le drapeau s'appuie sur `20261020050000_feature_flags.sql` (en production).
- Conflits possibles : `SessionResultScreen.tsx` est aussi modifié par `claude/stoic-meitner-ubw09b` (stories de partage, zones
  différentes) ; `app.config.ts` n'est pas touché ici.
- Après la fusion générale V2.0 (après V1.9) : relancer `npm run typecheck`, `npm test`, les tests racine, le workflow Android
  (`ads=test`, `e2e`), puis la recette § 8 sur le S23.
- Pour la release V2.0 avec annonces : `signing=upload`, `ads=live`, `billing=true` (sans `partial_release`), après § 6.
