# TITAN — ABSOLUTE ONE — RAPPORT FINAL DE RELEASE

Clôture des chantiers V1.3.1 → TITAN ONE · 18-19 novembre 2026 · PR #163 et #164 (Theo25460/TITAN_V0.5)

Ce rapport distingue toujours : **implémenté** (dans le code), **validé** (tests, réplique), **fusionné** (sur `main`),
**en production** (constaté sur `titan-app.fr`, sur la base `oubmftfufwwzwpgvrcag` ou dans l'artefact Android).

---

## 0. Livrables

| Livrable | État | Preuve |
|---|---|---|
| Web sur `titan-app.fr` | **EN PRODUCTION** | déploiement `6afeab78f177d84c3561c584`, commit `2bcd07888fa49fac6f2814768ca7e447db4f22da`, publié le 19/11/2026 07:56:07 UTC (release `24f7094` publiée le 18/11 à 20:06:14 UTC) |
| Supabase | **EN PRODUCTION** | registre 141 migrations, dernière `20261122090000_play_notification_inbox` ; contrôles avant/après et postflights v11 (328), v13 (42), v131 (54) tous vrais |
| AAB Android signé `upload` | **GÉNÉRÉ ET REMIS** | `titan-1.4.0-1400-upload.aab`, SHA-256 `7988fcc778df205b647df785dd9dc15134ff7fb9cff71cd6ac5f9ccbf161e99d`, certificat d'envoi `8E:35:9E:DE:…:20:5C` |
| Incident `play-notifications` | **RÉSOLU** | 16 830 × 503 sur les 12,2 h précédant la publication → 0 × 503 sur les 11,8 h suivantes |

---

## A. Rétrospective (V1.3.1 → TITAN ONE)

| Domaine | Ce qui a été fait | Intérêt pour l'utilisateur |
|---|---|---|
| Sport | Contrats de mesure par discipline pour 260 sports, imports dédoublonnés entre sports voisins (V15), natation Garmin en mètres, archivage de l'historique Strava (y compris au-delà de 120 séances), brouillon GPS protégé contre « Refaire cette séance », distance Strava lue dans la colonne en mètres (comptes en miles), séances refusées exclues des graphiques Android, plausibilité des corrections Android | Une séance enregistrée reste juste, unique et retrouvable sur Web et Android |
| RPG | Ascension (7 grades, 4 mondes), cadence sans série qui se brise (l'Android affichait de nouveau « N semaines d'affilée » : retiré), séances au-delà du plafond d'XP désormais soumises à la vérification anti-triche | Progression lisible, aucune pression artificielle, aucun gain sans effort réel |
| TITAN LIVE | 20 Voies, 3 intentions, Camp, missions (seed v2 aligné sur les contrats de mesure), règlement Web immédiat et jamais perdu sur une erreur réseau | La séance en direct récompense le monde sans dépendre de la page rouverte |
| Social | Liens d'amitié personnels (usage unique, 7 jours), blocages listables, séances confirmées seules dans tous les comptes collectifs, La Grande Cordée (invité silencieux ne bloque plus le sommet), « Depuis ta dernière visite », totaux de club masqués sous 3 membres, classement entre amis sur séances confirmées | Jouer ensemble sans s'exposer |
| Coaching | Places appliquées à chaque action coach (V18), côté sportif d'un lien en pause toujours lisible et signalable | Un sportif garde ses outils de sécurité même si l'offre du coach change |
| Paiements | Vérification Google à chaque achat, droits atomiques, restauration sans repayer, rapprochement horaire, fin d'accès sans événement (V18), boîte de réception des notifications (V20), vente ouverte seulement sur un serveur à jour, achats de licence acceptés en production (PR #154, a7e5375) | Un achat payé n'est jamais perdu ; aucune vente ne s'ouvre si le serveur ne peut pas la confirmer |
| UX et design | Signature Web (#156), six espaces, Archivo, couleurs par espace ; recette visuelle de la preview (320 → 1440 px) et corrections (lien de marque, consentement, coupures à 320 px) | Interface cohérente, premium, sans débordement |
| Illustrations | 260 sports / 262 glyphes, même source Web et Android, couleur des glyphes Android corrigée (têtes et balles étaient noires) ; blasons sculptés Champion, Titan et Légende intégrés | Un sport se reconnaît d'un coup d'œil ; les grades supérieurs ne paraissent plus « au rabais » |
| Android | 54 routes, 1 010 tests Jest, garde de version (au-dessus de 1304), AAB publié seulement après le parcours émulateur, signature de l'AAB lui-même contrôlée, `AD_ID` absent d'un build sans publicité | Un paquet envoyé à Play est vérifié, cohérent avec ses déclarations |
| Web | Empreinte `rev=` étendue aux ressources chargées par le code (classe de l'incident CSS de 7 jours), drapeaux relus au retour sur l'onglet | Après une mise à jour, chacun reçoit la bonne version |
| SEO | PR #162 intégrée : titres désambiguïsés, 27 URL au sitemap (+ `/suivi-velo`, `/defis-sportifs`), 61 JSON-LD valides, 1 554 liens internes résolus | Pages trouvables et cohérentes avec le produit |
| Sécurité | RLS et droits de toutes les nouvelles tables et fonctions vérifiés, aucune erreur d'advisor, textes juridiques versionnés avec empreinte (un texte modifié sans nouvelle version fait échouer les tests) | Confiance |
| Infrastructure | Cause de ~38 800 appels 503 par jour trouvée et corrigée, réplique émulateur alignée sur la vraie production | Coûts Netlify maîtrisés |

## B. État GitHub

- Branche de release : `claude/eloquent-rubin-ar73ww` → PR #163 (release, `24f7094`) puis PR #164 (correctif de recette, `2bcd078`). `main` = `2bcd07888fa49fac6f2814768ca7e447db4f22da`.
- **Intégré** (vérifié par ascendance et par contenu) : #150 (via #156), #151, #152, #153, #154 (y compris le correctif a7e5375), #156, #157, #158 (10 commits absents de #160 ajoutés), #160, #162 (3 conflits résolus, pages régénérées par leurs générateurs).
- **Exclu volontairement** : #155 (décision commerciale non tranchée), #159 et #161 (previews, têtes identiques à #156/#160 : rien n'a fui), #147 (candidats : seuls les blasons Champion/Titan/Légende, déjà présents dans la branche, ont été activés après revue).
- Déjà fusionnées avant la mission : #142, #148, #149.
- Contrôle de régression historique (agent indépendant) : aucune ligne perdue lors des fusions ; protections #142/#148 présentes et testées ; mécaniques abandonnées (RPG V42-V89, TWA, anciennes variantes OAuth, pictogrammes génériques, ventes Web Lemon Squeezy) non réintroduites ; seule exception corrigée : la série hebdomadaire Android.
- Tests : 782 tests Node, 1 010 tests Jest, réplique Postgres locale et CI 17.6 (toutes les migrations + tests SQL + concurrence), Playwright et émulateur Android en CI.

## C. État Supabase (production `oubmftfufwwzwpgvrcag`)

- Avant : 130 migrations, dernière `20261117170000` (V1.3.1 et V14 déjà présents).
- Copie logique préalable de toutes les tables `public`/`private` : schéma non exposé `titan_backup_20261118` (157 tables, 157/157). À supprimer après la période d'observation (décision propriétaire ; il ajoute des avis INFO « no primary key »).
- Appliqué le 18/11/2026, un appel par fichier, sans erreur : **v15** (imports), **v16** (seed LIVE v2), **v17** (social : 4 fichiers), **v18** (monétisation : 4 fichiers), **v20** (boîte de réception Play).
- Après : **141 migrations**, dernière `20261122090000`. Chaque `00-check-before` et `99-check-after` à `ok = true`. Postflights v11 (328), v13 (42), v131 (54) : tous vrais. Données : 17 séances, 24 profils, 24 comptes, inchangés.
- Non appliqué : **v19** (PR #155) — décision commerciale.
- Advisors : 0 ERROR. Restent : protection contre les mots de passe divulgués désactivée (réglage Auth du tableau de bord), avertissements attendus sur les fonctions `SECURITY DEFINER` exposées par conception.
- Drapeaux : `screens.live`, `screens.friendlinks`, `screens.cordee`, `screens.digest` ouverts à 100 % le 18/11/2026 après publication du Web (détail § D).

## D. État Netlify

- **Release** : `main` avancé (avance rapide, PR #163 fusionnée) jusqu'à `24f7094995085e6c608f4f5c24c6ce4b5e47d478` après un CI entièrement vert (782 tests, 1 093 parcours Playwright, réplique Postgres 17.6, 1 010 tests Jest, APK/AAB, parcours émulateur). Garde de publication respectée : `TITAN_APPROVED_RELEASE_SHA` posé sur ce SHA exact avant la poussée. Déploiement de production `6afe051ac2fe119736de6ebd`, publié le **18/11/2026 à 20:06:14 UTC**, 6 fonctions, scan de secrets : 0.
- **Correctif de recette** (PR #164) : deux défauts visuels relevés en production (marqueur des FAQ publiques, sous-titre de `/seance-live` sous le drapeau à 390-414 px) ; CI verte ; déploiement `6afeab78f177d84c3561c584`, commit `2bcd07888fa49fac6f2814768ca7e447db4f22da`, publié le **19/11/2026 à 07:56:07 UTC** ; vérifié sur `titan-app.fr` (FAQ `::after` = « + » sans rotation sur `/`, `/titan-plus`, `/service` ; drapeau dégagé à 390 et 1 440 px).
- **Recette de production** (trois vérifications indépendantes, lecture seule, sans compte) :
  - SEO : `tools/check-seo-live.mjs https://titan-app.fr` **38/38** (29/38 avant) ; sitemap 27 URL toutes en 200, canonique unique, indexables ; 27 JSON-LD valides ; `robots.txt` identique au dépôt ; `/suivi-velo` et `/defis-sportifs` en 200 (404 avant) ; `/guide` et `/algorithme` toujours en 301.
  - Interface : 17 pages × 320/390/1 440 px, 3 passages, 0 erreur de page, 0 erreur console, 0 réponse 4xx/5xx, 0 débordement horizontal ; chaque CSS/JS porte un `rev=` égal à l'empreinte des octets servis ; 164 entrées du service worker en 200 ; 7 blasons sculptés sur `/carriere`.
  - Serveur : `play-notifications` non authentifié → **401** (503 avant) ; `GET play-billing` → 503 « unavailable » (vente fermée, `PLAY_BILLING_ENABLED` absent, voulu) ; Garmin 4xx ; contrôles bloquants de `probe-prod.yml` verts ; en-têtes de cache, CSP, HSTS conformes ; `config.js` servi = PKCE, identique au dépôt ; Google + e-mail présents.
  - Textes juridiques servis : CGU **version 10**, confidentialité **version 14**, suppression **version 4**, datés du 18 novembre 2026 ; aucune page n'annonce de publicité actuelle dans l'application Android.
- **Drapeaux** ouverts à 100 % le 18/11 (lecture confirmée par la fonction publique `titan_feature_flags_v1`) : `screens.live`, `screens.friendlinks`, `screens.cordee`, `screens.digest`. Restent fermés : `screens.garmin_dailies` (qualification Garmin Health absente), `auth.anonymous` (connexions anonymes désactivées).
- **`play-notifications`** : 16 830 × 503 sur les 12,2 h précédant la publication, **0 × 503** ensuite (8 requêtes en 11,8 h, toutes issues de nos sondes : 6 × 401, 2 × 405). Les trois messages que Google renvoyait en boucle ont été acquittés (202) et gardés dans `private.titan_play_notification_inbox` : un seul jeton d'achat, notifications « remboursé » (voided), « révoqué » (12) et « expiré » (13), toutes authentifiées par Google. Ils ne seront traités qu'à l'ouverture de la facturation (et seront alors ignorés, ce jeton n'ayant jamais été rattaché à un compte).
- **`play-reconcile`** : 12 exécutions horaires, toutes en 200 (les 4 réponses 403 sont des `POST` de sondes, refusés par Netlify sur une fonction planifiée).
- **Consommation** : environ 33 000 invocations en erreur par jour supprimées sur `play-notifications`. Les crédits Netlify ne sont pas lisibles avec l'accès disponible ici ; le compteur d'invocations ci-dessus en est la cause principale.

## E. État Android

| Élément | Valeur |
|---|---|
| Fichier | `titan-1.4.0-1400-upload.aab` (67 229 581 octets), remis en pièce jointe |
| SHA-256 | `7988fcc778df205b647df785dd9dc15134ff7fb9cff71cd6ac5f9ccbf161e99d` |
| Artefact | `titan-android-1400-upload` (id 14469786308, empreinte ZIP `sha256:fb09af57946ecfcad44ec99100ec616de2be7000fa5e1940fda3f5359e5dece4`, conservé jusqu'au 18/12/2026) — https://github.com/Theo25460/TITAN_V0.5/actions/runs/44387420970 |
| Source | `main` à `24f7094995085e6c608f4f5c24c6ce4b5e47d478` (le correctif `2bcd078` ne touche que deux feuilles CSS du Web) |
| Identifiant / version | `fr.titanapp.app`, versionCode **1400**, versionName **1.4.0** (au-dessus de 1301 distribué et de 1302/1303/1304 signés) |
| SDK | cible 36, compilation 36 |
| Signature | AAB et APK signés par `CN=TITAN, OU=Android upload key` — SHA-256 du certificat `8E:35:9E:DE:A7:2E:48:F0:76:0D:1B:7F:F6:64:94:43:9B:BA:4B:5F:73:85:DE:44:C7:CF:A5:92:9D:EC:20:5C` (vérifié par le CI puis indépendamment avec `keytool`) |
| Options | `ads=off`, `billing=true`, `google_signin=true`, `partial_release=true`, `e2e=true` |
| Permissions | localisation précise + service de premier plan « localisation », Santé Connect (`READ_STEPS`, `READ_EXERCISE`), `ACTIVITY_RECOGNITION`, `BILLING`, notifications ; **`AD_ID` absent** (build sans publicité) |
| Contenu | adresse Supabase de production présente ; aucune adresse de test ; seul jeton embarqué : la clé publique `anon` |
| Preuves CI | types et 1 010 tests Jest, compilation signée, contrôles du paquet, parcours réel sur émulateur Android 14 (réplique du schéma de production) et vérifications serveur : tous verts ; l'AAB n'est publié qu'après ce parcours |

Préparation Play Console : déclarations conformes à ce build dans `mobile/docs/PUBLIER_PLAY_CONSOLE.md` § 4 et § 4 bis (annonces : non ; identifiant publicitaire : non ; achats intégrés : oui). Envoi recommandé : piste de test interne d'abord. Après l'envoi, porter `mobile/docs/last-version-code.txt` à 1400.

## F. Qualité

| Domaine | Statut | Justification |
|---|---|---|
| Sport | VERT | 122 tests sport, contrats partagés Web/Android octet pour octet, défauts de l'audit corrigés et prouvés par tests |
| RPG / LIVE | VERT | une seule récompense par séance (clé primaire + verrou), plafonds serveur, tests SQL et moteur |
| Social | VERT | confidentialité vérifiée (résultats, invitations, totaux de club), limites serveur, tests SQL |
| Coaching | ORANGE | code et tests verts ; règle des places TITAN+ (20) / Coach (5) / Coach Ultra (15) à trancher (#155) |
| Paiements (code) | VERT | chaîne testée (simulée), vente fermée tant que le serveur n'est pas à jour |
| Paiements (réel Google Play) | ORANGE | aucun achat de licence constaté sur appareil ; dépend du propriétaire (§ H) |
| Supabase | VERT | appliqué, postflights vrais, advisors sans erreur |
| Web / cache / SEO | VERT | en production : SEO 38/38, 0 erreur sur 17 pages × 3 largeurs, empreintes de cache vérifiées, deux défauts visuels corrigés et republiés |
| Incident `play-notifications` | VERT | 0 × 503 après publication, notifications gardées en base |
| Android | VERT | AAB signé vérifié, parcours émulateur et 1 010 tests Jest ; achat réel et appareil physique non testés par l'agent |
| Textes juridiques | ORANGE | publicité et versions corrigées ; identité de l'éditeur, médiateur et âge minimal à fournir par le propriétaire |
| Illustrations | ORANGE | blasons intégrés après revue, approbation propriétaire en attente ; trois objets Atelier contiennent du texte peint |

## G. Avant / après

| Sujet | Avant | Après |
|---|---|---|
| `play-notifications` | ~38 800 réponses 503 / 24 h (logs Netlify du 18/11), notifications perdues après la rétention Pub/Sub | 0 × 503 ; notifications gardées et acquittées |
| Base | 130 migrations | 141 migrations, V15-V18 + V20 |
| Site public | build du 5 novembre (`761340d`, PR #140) : ni V1.3, ni V1.3.1, ni TITAN ONE | `2bcd078` : V1.3 → TITAN ONE complet |
| SEO servi | 29/38 contrôles conformes au dépôt | 38/38 |
| Sitemap | 25 URL, `/suivi-velo` et `/defis-sportifs` en 404 | 27 URL, toutes en 200 (vérifié sur la preview) |
| Blasons | 4 sculptés + 3 écus plats | 7 sculptés |
| Fonctions cachées par drapeau | `screens.live`, `friendlinks`, `cordee`, `digest` absents (fermés) | ouvertes à 100 % |
| Android | 1.3.2 (1304) signé, non distribué | 1.4.0 (1400) signé, vérifié, sans `AD_ID` |

## H. Dette résiduelle et décisions du propriétaire

1. **Builds Android V1.2.x (1301)** : ils ouvrent la feuille de paiement sans demander au serveur. Désactiver `titan01/02/03` ou retirer 1301 des pistes tant que la vente n'est pas ouverte ; vérifier le remboursement automatique de la commande 1301.
2. **Ouverture de la vente** : `PLAY_BILLING_ENABLED=true` sur Netlify ouvre aussi la vente aux vrais clients. Préalables juridiques : identité de l'éditeur, responsable de traitement, médiateur de la consommation (mentions, confidentialité § 2, CGU § 13).
3. **Places coach** (#155) : TITAN+ seul donne 20 places, Coach 5, Coach Ultra 15 ; un passage de TITAN+ à Coach met des liens en pause.
4. **Prix France** : 4,99 / 19,99 / 39,99 € visés ; 5,99 / 23,99 / 47,99 € observés dans Play Console.
5. **Âge minimal** : 13 ans annoncés, aucune vérification à l'inscription.
6. **Secrets Netlify** lisibles en clair (clé `service_role`, URL Neon, secret Lemon Squeezy) : les faire tourner et les marquer secrets.
7. **Auth Supabase** : activer la protection contre les mots de passe divulgués.
8. Recettes physiques impossibles à l'agent : achat de licence sur téléphone, Santé Connect réel, Garmin réel, UMP publicitaire (si `ads=live` un jour).
9. Légende : le centre reprend le château de Gardien ; une variante peut être demandée. Objets Atelier (coffre, relique, sceau) : texte peint à faire retirer.
10. À 320 px exactement, l'étiquette invité « Découverte » de l'en-tête du QG est tronquée de 3 px (« Découve… ») ; dès 330 px elle est entière.
11. Améliorations non bloquantes relevées par les audits : ciblage par compte des drapeaux, interrupteurs Android pour clubs/classement, réponses 404 mises en cache 7 jours, préchargement de 1,2 Mo sur les pages publiques, `_redirects` obsolète, CSP Paddle.

## I. Verdict

1. **TITAN ONE est-il entièrement consolidé ?** Oui : une seule branche, fusionnée dans `main`, contient #150-#154, #156-#158, #160, #162 et le correctif a7e5375 de #154 ; aucune PR utile n'est restée à côté, sauf #155 (décision) et #147 (candidats, blasons retenus intégrés).
2. **Les développements V1.3.1 sont-ils préservés ?** Oui, vérifié par un audit indépendant : protections de #142/#148 présentes et testées, aucune ligne perdue lors des fusions.
3. **Sport, RPG, social et Android intégrés ?** Oui, avec les correctifs des audits (brouillon GPS, distances Strava, anti-triche au-delà du plafond, cordée, clubs, coaching en pause, règlement LIVE).
4. **Retours en arrière respectés ?** Oui ; la seule régression trouvée (série hebdomadaire Android) a été retirée et le garde-fou couvre désormais l'Android.
5. **Design cohérent ?** Oui, constaté en production sur 17 pages et 3 largeurs ; deux défauts trouvés en production ont été corrigés et republiés ; reste un détail de 3 px à 320 px.
6. **Illustrations intégrées ?** Oui pour l'essentiel : 260 sports / 262 glyphes, couleur Android corrigée, 7 blasons sculptés. Non intégrés volontairement : le reste de #147 (qualité ou usage insuffisants). Approbation du propriétaire attendue pour les trois blasons ajoutés.
7. **Migrations appliquées ?** Oui : 141, dernière `20261122090000`, postflights vrais. v19 non appliquée (décision).
8. **Site publié sur Netlify ?** Oui : `2bcd078`, déploiement `6afeab78f177d84c3561c584`, vérifié sur `titan-app.fr`.
9. **Incident `play-notifications` résolu ?** Oui : 0 × 503 depuis la publication, notifications gardées.
10. **Paiements prêts pour une ouverture commerciale ?** Pas encore. Le code est prêt et la vente reste fermée par sécurité (`PLAY_BILLING_ENABLED` absent). Il manque : l'identité légale de l'éditeur, un achat de licence constaté sur téléphone, la décision sur les places coach, et le retrait des builds 1301.
11. **SEO en production ?** Oui : 38/38, sitemap 27 URL. Le classement dépend ensuite de Google.
12. **AAB officiel généré et récupérable ?** Oui : remis en pièce jointe et disponible en artefact jusqu'au 18/12/2026.
13. **Parcours fondamentaux fonctionnels ?** Oui pour ce qui est vérifiable sans compte réel : 1 093 parcours navigateur, parcours émulateur Android sur le schéma de production, recette de production publique. Non testés par l'agent : inscription réelle, achat réel, Garmin et Santé Connect sur appareil.
14. **Bug bloquant connu ?** Aucun bloquant pour l'usage gratuit. Pour la vente : les éléments du point 10.
15. **Clôture de V1.3.1 / TITAN ONE ?** Oui sur le plan technique : tout le travail est fusionné, en production (Web et base) et l'AAB est prêt. L'ouverture commerciale reste une décision séparée, listée au § H.
