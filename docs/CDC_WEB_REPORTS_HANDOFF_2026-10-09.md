# Bilans personnels — handoff PREM07

Branche `codex/web-reports-cdc`, suite de PR #26, sans fusion de main. Modèle GPT-6.1 Sol. Cahier vivant : `1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M` ; 247 formulations et trois images locales étrangères au lot préservées.

## Résultat

Le panneau secondaire « Mon bilan de pratique » dans Progrès propose le mois ou l’année courants et précédents. Total personnel de séances, jours actifs distincts, minutes recalculées et durées estimées, répartition par sport, calendrier et cinq liens vers le journal. La période courante est provisoire, arrêtée à l’instant serveur, sans cases futures présentées comme observées. Recherche et vingt sports par page ; l’export conserve toutes les lignes.

Le CSV agrégé est recalculé à chaque téléchargement avec le propriétaire et le droit serveur actuels. Il contient les totaux, les sports, le calendrier, les bornes, le fuseau et l’instant de calcul ; aucun détail de séance, note, GPS ou donnée santé. BOM UTF-8, cellules citées, CRLF, séparateur point-virgule et protection contre formules. Journal et exports CSV/JSON de base restent gratuits.

Résultats uniquement en mémoire : fermeture, paramètres, session, hors ligne et masquage les retirent immédiatement. Annulation, délai de quinze secondes, garde propriétaire/époque/séquence/client, revalidation au retour et chaque minute. Le serveur ancien affiche honnêtement l’attente de sa mise à jour. Le générateur public et sa FAQ décrivent la même disponibilité conditionnelle ; prix et checkout inchangés.

## Vérifications et régressions

- SQL RED : `report RPC must exist`, puis contrat réel vert sur PostgreSQL WASM jetable chargé avec baseline/migrations. Horloges SQL réellement vérifiées `2024-03-01T12:00Z` et `2025-03-01T12:00Z` : février bissextile, mois de 28/29/30/31 jours, dernières soirées mensuelles à Paris et deux changements DST.
- SQL : isolation/RLS, Premium frais, Free, faux drapeau client, expiration, remboursement, suspension, sans auth et privilèges anon ; archives/futur, effort forgé ignoré, jour multisport distinct, sources bornées, lecture sans mutation. Fixture future à +1 minute dans la tolérance d’ingestion existante : aucun bypass du guard.
- JS RED module absent, puis calendrier/options/types/invariants/sources, totaux et arrondis, données vides, 200 sports et CSV ; FAQ RED absente, puis vrai générateur exécuté et sortie reproductible.
- E2E RED panneau absent, puis vrais navigateurs : quatre choix, estimations, sources, mobile/desktop, export frais et 200 sports, invité/Free/ancien serveur/réseau, expiration avant export, requête muette à quinze secondes, filtres obsolètes, vrais callbacks auth A→B→A/SIGNED_OUT, fermeture/hors ligne/historique, zéro explicite et signal d’annulation.
- Le boot invité réel de l’aventure est attendu avant remplacement du gateway dans les fixtures bilans et comparaisons. Son événement différé relançait légitimement le bilan pendant un clic et une comparaison après résolution de ses faux callbacks ; les deux échecs sont reproduits avant synchronisation de la fixture, sans changement produit pour masquer ce comportement.
- `pnpm run verify` (tests/build) et audit public séparé : seize avertissements préexistants, aucune erreur. Rendu inspecté à 360/1280 px, sans débordement horizontal ; les tables restent lisibles.
- Suite locale au commit d’interface : 93/93 unitaires, 44/44 E2E et contrat SQL verts.

PR [#27](https://github.com/Theo25460/TITAN_V0.5/pull/27), premier candidat `d10d92a9c83757b017f51b15df06128105d01265`, arbre `5bc7dad6981e6922acb6fc60abf0cb9c3e877e34` identique au local. CI [37991943468](https://github.com/Theo25460/TITAN_V0.5/actions/runs/37991943468) : trois jobs verts, 93 tests, 44 E2E ; PostgreSQL 16 natif, quatorze migrations individuelles ou bundle historique + cinq correctifs, quatorze suites SQL dans chaque voie, rollback appelant, refus sur base non-test et deux cas concurrents. Les deux étapes du job natif sont vérifiées dans leurs logs.

Ce commit finalise uniquement le handoff et le plan, après cette preuve complète. La tête finale publiée, sa CI et l’état prêt de la PR sont attestés dans la description de PR et le cahier vivant ; leur dernière version fait foi. Le lot reste sans fusion/déploiement. PREM07 livré côté web sur branche après ces gates ; PREM06/PREM08 restent partiels.

## Décisions et coût

- Exécution native autonome du plan autorisée par le cahier et « Continue ». Une seule revue indépendante du lot ; aucun sous-agent implémenteur ni seconde revue. Coût si choix erroné : revoir le design avant production.
- Quatre périodes calendaires bornées à un an, pas de plage arbitraire. Coût : une autre période personnalisée exige un lot futur ; le bilan courant est explicitement provisoire.
- RPC stable invoker, search_path vide, grants limités et index existant propriétaire/date. Coût : migration et déploiement web doivent être intégrés avant disponibilité réelle.
- Aucun résultat Premium depuis le cache local. Coût : bilan indisponible hors ligne et séances en attente non incluses ; journal/analyses de base continuent.
- Résultat retiré pendant chaque recalcul, export demandant une nouvelle RPC. Coût : attente courte et recherche/pagination réinitialisées ; pas de téléchargement d’un ancien aperçu après expiration ou changement de compte.
- Jours actifs distincts au total ; ceux par sport peuvent se recouvrir. CSV documente les mêmes totaux et chaque sport sans fausse addition.
- Pas de PDF, envoi automatique/mail, partage public, rapport sauvegardé, widgets ou personnalisation libre de dashboard. PREM06/PREM08 restent partiels.
- Fixture future bornée à la tolérance d’ingestion existante ; au-delà de dix minutes, le rejet d’ingestion est couvert, sans fixture spécifique du bilan.
- Attente du boot invité avant gateway artificiel de test ; coût : cette course artificielle sort du test, les revalidations produit restent présentes et testées.
- PR isolée préparée selon le cahier sans menu de fusion ; coût : intégration des branches empilées requise avant production.

## Revue et parties non jugées

Une revue indépendante Sol 6.1 sur `2e3c3f4..7ae742f` : aucun Critical/Important confirmé, aucune passe de correctifs ni seconde revue. Vérifications indépendantes : 11/11 tests bilans/offre, 9/9 E2E bilans et SQL réel aux deux horloges 2024/2025. Reproduction du Minor contrôlée également par l’exécuteur.

Minor différé : `TitanReports.valid` ne vérifie pas le tri minutes décroissantes puis sport. La RPC actuelle trie correctement ; calculs et isolation ne changent pas. Une régression serveur de cet ordre pourrait produire un classement/CSV mal ordonné. Le futur correctif doit définir un ordre commun aux égalités compatible avec la collation PostgreSQL, puis ajouter son RED→GREEN.

Chaque partie considérée mais non jugée reçoit cette décision :

| Partie | Décision de l’exécuteur | Coût / limite |
|---|---|---|
| Trois images locales | Préserver et exclure les fichiers étrangers au lot ; hashes contrôlés | Leur contenu reste non audité ici |
| Deux voies PostgreSQL natives | Exiger leur CI verte avant livraison ; WASM ne suffit pas | Livraison bloquée si la réplique échoue |
| Auth et abonnements réels | Callbacks réels de l’app et serveur SQL testés, projet réel exclu | Recette de vrais comptes/abonnements obligatoire avant production |
| Production, déploiement, main | Livrer une PR isolée, aucune fusion ni publication | Fonction indisponible en production avant intégration autorisée |
| Android, paiements, pub, récompenses | Conserver les limites du lot ; suites existantes seules pour les modules concernés | Pas de certification de ces parcours complets |
| PDF, mail, partage, sauvegarde, dashboard | Livrer aperçu et CSV agrégé seulement | Ces variantes nécessitent des lots ultérieurs |
| Résolution journal des sources | Conserver le chemin propriétaire de PR #26 ; ses E2E de résolution sont rejoués dans la suite complète | Pas de vérification manuelle de chaque séance réelle |
| Autres navigateurs/mobile natif | Chromium mobile/desktop vérifié, autres moteurs laissés à la recette appareil | Safari/Firefox et téléchargements natifs restent non certifiés |
| Charge/plan natif | Scan d’un an indexé, 200 sports testés, sans benchmark | Performance à mesurer avant montée en charge réelle |
| Lecteur d’écran complet | Labels, régions et statuts contrôlés par code ; audit assistif laissé à la recette | Accessibilité complète non certifiée |

## Intégration et retour arrière

Migration additive `20261009205151_practice_reports_v300.sql`, créée par CLI Supabase 2.120.0, non appliquée à un projet réel. Dépend de l’effort v300, profils/entitlements/RLS existants et des PR empilées #19–#26. Les grants, tables, règles de récompense et paiements antérieurs ne changent pas. Aucune opération de production, Android, Play Console ou déploiement.

Avant déploiement majeur : intégration des PR empilées, recette de vrais comptes et abonnements, audit global Astra maximal. Pour retrait après déploiement autorisé : retirer le panneau/scripts et les mentions publiques puis supprimer uniquement `public.titan_practice_report(text,integer,text)` ; aucune donnée créée par ce lot à migrer ou effacer. Le client tolère l’absence de RPC.
