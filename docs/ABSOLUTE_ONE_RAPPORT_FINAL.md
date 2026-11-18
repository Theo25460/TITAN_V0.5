# TITAN — ABSOLUTE ONE — RAPPORT FINAL DE RELEASE

Clôture des chantiers V1.3.1 → TITAN ONE · 18 novembre 2026 · PR https://github.com/Theo25460/TITAN_V0.5/pull/163

Ce rapport distingue toujours : **implémenté** (dans le code), **validé** (tests, réplique), **fusionné** (sur `main`),
**en production** (constaté sur `titan-app.fr`, sur la base `oubmftfufwwzwpgvrcag` ou dans l'artefact Android).

---

## 0. Livrables

| Livrable | État | Preuve |
|---|---|---|
| Web sur `titan-app.fr` | voir § D | déploiement Netlify, SHA servi, contrôles en production |
| Supabase | **EN PRODUCTION** | registre 141 migrations, dernière `20261122090000_play_notification_inbox` ; contrôles avant/après et postflights v11 (328), v13 (42), v131 (54) tous vrais |
| AAB Android signé `upload` | voir § E | artefact GitHub Actions, signature, SHA-256 |
| Incident `play-notifications` | cause trouvée, correctif en base, fonction publiée avec le Web (§ D) | logs Netlify avant/après |

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

- Branche de release : `claude/eloquent-rubin-ar73ww` → PR #163. SHA final : voir § D.
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
- Drapeaux : voir § D (ouverture après publication du Web).

## D. État Netlify

_Complété après publication (voir la section « Publication » ajoutée en fin de mission)._

## E. État Android

_Complété après génération de l'AAB._

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
| Web / cache / SEO | VERT | voir § D pour la production |
| Android | voir § E | |
| Textes juridiques | ORANGE | publicité et versions corrigées ; identité de l'éditeur, médiateur et âge minimal à fournir par le propriétaire |
| Illustrations | ORANGE | blasons intégrés après revue, approbation propriétaire en attente ; trois objets Atelier contiennent du texte peint |

## G. Avant / après

| Sujet | Avant | Après |
|---|---|---|
| `play-notifications` | ~38 800 réponses 503 / 24 h (logs Netlify du 18/11), notifications perdues après la rétention Pub/Sub | voir § D |
| Base | 130 migrations | 141 migrations, V15-V18 + V20 |
| Site public | build du 5 novembre (`761340d`, PR #140) | voir § D |
| Sitemap | 25 URL, `/suivi-velo` et `/defis-sportifs` en 404 | 27 URL, toutes en 200 (vérifié sur la preview) |
| Blasons | 4 sculptés + 3 écus plats | 7 sculptés |
| Fonctions cachées par drapeau | `screens.live`, `friendlinks`, `cordee`, `digest` absents (fermés) | voir § D |

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
10. Améliorations non bloquantes relevées par les audits : ciblage par compte des drapeaux, interrupteurs Android pour clubs/classement, réponses 404 mises en cache 7 jours, préchargement de 1,2 Mo sur les pages publiques, `_redirects` obsolète, CSP Paddle.

## I. Verdict

_Complété en fin de mission, après les preuves de production._
