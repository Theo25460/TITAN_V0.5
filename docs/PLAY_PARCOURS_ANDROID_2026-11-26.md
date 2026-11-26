# Parcours de découverte et d'installation Android — 26/11/2026

Branche `claude/funny-cerf-ui44tf`, partie de `main` à `0dae9af9b32d7cf7ec3ceca7b1dee52e92544f39` (même tête que `claude/eloquent-rubin-ar73ww`). Chantier autonome, livrable avant la V2.0. Lien officiel : `https://play.google.com/store/apps/details?id=fr.titanapp.app`.

## 1. Audit préalable

| Constat | Détail |
|---|---|
| Mécanisme Play déjà présent, **éteint** | `tools/data/play-store.json` vide ⇒ aucune page ne contenait de lien Play. Code prêt : lien de pied de page caché jusqu'au script, balise `titan-play-store`, `js/play-store.js`, `MobileApplication` sur l'accueil. |
| Lien non exact | `js/play-store.js` ajoutait `&referrer=utm_source=…&utm_campaign=<page>` : contraire à « exactement le lien officiel ». |
| Élément fixe | Sur téléphone Android, une bande fixe en bas de page (`css/play-store.css`), qui réservait de la place et doublait les autres accès. |
| Textes obsolètes | `/service` (« Comment installer TITAN ») et `/debuter-titan` ne parlaient que de l'installation depuis le navigateur ; `/fonctionnalites` disait « C'est une application web installable » (contradiction F-09 relevée dans `docs/v131/lot6-textes-juridique.md`). |
| iOS | Aucune mention d'App Store ; `operatingSystem: "Web, Android, iOS (navigateur)"` reste juste (iPhone = version Web). Rien changé. |
| Liens contradictoires | Aucun autre lien vers une fiche ; les seuls autres liens Play sont la page des abonnements dans les textes juridiques (correct). |
| Mesure existante | GA4 sur consentement explicite (`js/ga4-consent.js`) : page vue + 3 conversions, **énumérées dans la politique de confidentialité**. Statistiques internes (`js/app/analytics.js`) réservées aux pages de l'application, avec contrat SQL. **Aucune mesure de clics sur les pages publiques.** |
| Pages de destination | Pages générées (accueil, guides par sport, `/titan-plus`, `/fonctionnalites`…) et la **carte d'athlète partagée** `/u/<lien>` (`athlete.html`), seule page publique où arrivent des contenus partagés. |
| Branches | Toutes les branches de la chaîne TITAN ONE (#154, #156, #157, #158, #160) sont ancêtres de `main` (vérifié par `git merge-base --is-ancestor`). Les branches non fusionnées qui touchent les mêmes fichiers sont listées au § 6. |

## 2. Choix d'emplacement

- **Accueil, premier écran** : « Commencer sur le Web » (action principale, inchangée dans sa cible `/onboarding`) puis « Télécharger sur Google Play » (secondaire). Le bouton « Voir comment ça marche » laisse sa place : la section qu'il visait suit immédiatement le premier écran. Deux choix, pas trois. Sur 360 × 640 le bouton Play est entièrement visible sans défiler. La navigation n'est pas modifiée (le bouton « Commencer » d'en-tête reste celui du Web).
- **Rappel plus bas** : dans l'appel final commun aux pages générées, sous « Commencer » / « J'ai un compte », une phrase « Sur un téléphone Android, TITAN existe aussi en application. » et le bouton Play. Sur l'accueil c'est le seul rappel.
- **Pied de page** de toutes les pages publiques : lien texte (existant, désormais visible sans script).
- **Carte d'athlète partagée** : « Télécharger sur Google Play » à côté de « Découvrir TITAN ». C'est le passage contenu partagé → site → fiche Play.
- **Bouton texte** dans la charte TITAN avec une icône générique de téléchargement : aucun badge officiel imité (le kit de Google n'est pas dans le dépôt).
- **Jamais dans l'application** : retiré dans l'application Android (TWA détectée comme avant) et dans une PWA installée (masqué en CSS avant tout script, puis retiré).
- **Lien exact** : aucun paramètre ajouté, ouverture dans l'onglet courant (`rel="noopener"`), aucune bande fixe ni fenêtre.

## 3. Mesure

Aucun nouvel événement n'est créé : il n'existe pas de mesure des clics sur les pages publiques, et un nouvel événement GA4 rendrait inexacte la politique de confidentialité, qui les énumère. Chaque lien a un `id` stable par emplacement (`play-hero`, `play-final`, `play-footer`, `play-athlete-card`) : si la mesure améliorée « Clics sortants » est active sur le flux GA4 (réglage de la propriété, invisible depuis le dépôt), les clics des visiteurs **ayant accepté GA4** y apparaissent avec `link_id`, sans donnée personnelle et sans code ajouté. Un clic n'est pas une installation ; sans paramètre `referrer`, Play Console ne peut pas attribuer une installation à une page.

## 4. Fichiers

| Fichier | Changement |
|---|---|
| `tools/data/play-store.json` | Adresse officielle. |
| `tools/lib/public-template.mjs` | `playLink(placement)` (adresse exacte, `id`, `data-play-store`), pied de page visible, ligne Play dans `finalCta`. |
| `tools/build-public-site.mjs` | Premier écran de l'accueil ; réponses « Puis-je installer TITAN ? » et « TITAN est-il une application mobile ? ». |
| `tools/build-public-docs.mjs`, `tools/content/service-main.tpl` | Réponse « Comment installer TITAN sur mon téléphone ? » (Android : Google Play ; Web conservé ; iPhone : Safari). |
| `js/play-store.js` | Réécrit : vérifie l'adresse, la rétablit si besoin, retire tout dans l'application Android / la PWA ; plus de paramètre, de bande ni d'envoi. |
| `css/public.css` | Styles des boutons, ligne de rappel, pied de page, très petits écrans, masquage en PWA. |
| `css/play-store.css` | Supprimé (bande fixe). |
| `athlete.html`, `js/app/athlete.js`, `css/one-communaute.css` | Accès Android sur la carte d'athlète partagée. |
| Pages HTML régénérées | Accueil, guides, offres, aide, pages juridiques (seulement en-tête et pied de page pour ces dernières), 404. |
| `tests/play-store-link.test.mjs`, `tests/e2e/play-store-link.e2e.mjs`, `tests/asset-cache-keys.test.mjs` | Voir § 5. |
| `docs/PLAY_CONSOLE.md` § 10, `mobile/docs/PUBLIER_PLAY_CONSOLE.md` § 8 | État et procédure à jour. |

## 5. Recette

- `pnpm run verify` : typecheck, 787/787 tests Node, build, audit (0 erreur, 17 avertissements identiques à `main`), contrôle de sûreté.
- `tests/play-store-link.test.mjs` (8) : seule la fiche exacte est acceptée ; tous les liens Play de toutes les pages livrées vont exactement à la fiche, avec un emplacement connu et un `id` unique ; accueil = une action Web + une action Play au premier écran, un rappel, un pied de page ; aucune promesse App Store ; sans adresse configurée, rien sur Google Play ; le script n'ajoute ni paramètre ni bande et n'envoie rien.
- `tests/e2e/play-store-link.e2e.mjs` (6, Chromium) : téléphone Android 360 × 640 (bouton au premier écran, cibles ≥ 44 px, rien de fixe, pas de défilement horizontal) ; clavier (Web puis Play, anneau de focus visible, Entrée suit l'adresse exacte) ; tablette 768 et ordinateur 1024/1440 ; application Android et PWA installée (rien) ; adresse invalide (rien) ; carte d'athlète (lien exact, absent dans l'application).
- `tests/asset-cache-keys.test.mjs` : retrait de la référence `play-store.js → play-store.css`, que le code ne fait plus.
- Mesures à 320, 360, 412, 768, 1024 et 1440 px sur `/`, `/journal-course-a-pied`, `/titan-plus`, `/service` : liens exacts, aucun débordement, aucun défilement horizontal.
- Suite navigateur complète `pnpm run test:e2e` : résultat dans le compte rendu de livraison.

## 6. Limites et étapes manuelles

- **Fiche non vérifiée depuis l'environnement** : `play.google.com` est refusé par le proxy réseau de la session. Avant de fusionner : ouvrir l'adresse dans un navigateur non connecté et vérifier qu'elle affiche bien TITAN en production (pas une piste de test). Si la fiche n'est pas publique, ne pas déployer (§ 10 de `docs/PLAY_CONSOLE.md`).
- **Aucun appareil réel** : rendu vérifié en Chromium émulé (agent utilisateur Android, écran tactile). Sur un vrai téléphone Android : ouvrir `https://titan-app.fr/` dans Chrome, toucher « Télécharger sur Google Play » ⇒ l'application Play Store doit s'ouvrir sur TITAN ; faire de même en bas de page et sur une carte `/u/…` ; ouvrir l'application TITAN installée puis un lien vers le site : aucun bouton Play ; sur ordinateur, le lien ouvre la fiche Web de Google Play.
- **GA4** : vérifier dans la propriété que « Clics sortants » est actif et déclarer `link_id` en dimension personnalisée si l'on veut lire les emplacements.
- **Publication** : rien n'est déployé par ce chantier. Le site en ligne ne change qu'après fusion dans `main` et déploiement Netlify.

## 7. Fusion avec les autres branches

Branches non fusionnées touchant les mêmes fichiers (balayage de toutes les branches distantes le 26/11/2026) :

- Chaîne V1.7.x (`claude/gifted-brahmagupta-mg28j8` V1.7.7, `claude/blissful-albattani-wms5p8`, `claude/awesome-mayer-cohg7j`, etc.) : modifient `tools/build-public-docs.mjs` (versions des textes juridiques) et régénèrent `legal_*.html`. Fusion simulée de ce chantier dans `claude/gifted-brahmagupta-mg28j8` (tête `52a209bd`) : **sans conflit**. Après toute fusion, relancer `node tools/build-public-site.mjs && node tools/build-public-docs.mjs` pour que les pages générées reflètent les deux côtés.
- `feat/titan-monetisation-decision-titanplus-capacity` (PR #155, décision en attente) : sa fusion simulée conflictue sur `index.html`, `js/app/atelier.js`, `pour-les-coachs.html`, `titan-plus.html` et `tools/build-public-site.mjs` — **exactement les mêmes fichiers qu'avec `main` seul** : ce chantier n'ajoute aucun fichier en conflit. Résoudre les sources (`tools/build-public-site.mjs`), puis régénérer. `claude/titan-v131-finalization-9g6jjo` (15/11, ancienne) touche aussi ces sources.
- Ordre conseillé pour la V2.0 après la V1.9 : fusionner ce chantier dans `main` en premier (petit, indépendant), puis rebaser/fusionner la chaîne V1.x en régénérant les pages.
