# Bilans de pratique TITAN+ — PREM07

Suite de PR #26, sans fusion ni production. Le cahier vivant autorise les choix réversibles ; exécution native Sol 6.1, une revue indépendante. Le besoin est un bilan personnel lisible et exportable à partir de données complètes, sans retirer l’export basique gratuit.

## Période et vérité des données

Quatre choix : ce mois, mois précédent, cette année, année précédente. `month`/`year`, décalage `0`/`1`, fuseau IANA du navigateur. Début local inclus, fin calendaire exclue. Un bilan courant est explicitement provisoire et arrêté à l’instant serveur `as_of` ; les séances futures sont exclues. Un bilan précédent couvre la période complète. Calendrier mensuel : jours écoulés jusqu’au jour courant inclus ou tous les jours du mois clos. Calendrier annuel : mois écoulés jusqu’au mois courant inclus ou douze mois clos. Pas de zéros présentés comme des jours/mois futurs déjà observés.

Historique synchronisé propriétaire uniquement, archives exclues, séances signalées conservées pour le suivi privé. Recalcul des minutes par `titan_effort_v300`, durées estimées explicitement comptées. Séances, jours actifs distincts, minutes et nombre de durées estimées ; répartition par sport, calendrier et cinq séances sources maximum. Les jours actifs de plusieurs sports ne se somment pas : une même date compte une fois au total. Aucun score de performance, conseil santé, GPS, note, XP ou crédit.

## Contrat serveur

Migration additive créée par CLI ; fonction stable SECURITY INVOKER, search_path vide, révocation PUBLIC/anon et exécution authenticated. Signature `titan_practice_report(p_period text default 'month', p_offset integer default 0, p_timezone text default 'UTC') returns jsonb`. Authentification et profil du propriétaire relus : Premium, expiration, remboursement, suspension ; aucun drapeau client n’autorise le bilan. Scan borné à un an et index propriétaire/date existant.

Réponse indisponible `{version:1,owner,available:false,reason:'premium_required'}`, sans agrégats. Réponse disponible `{version:1,owner,available:true,period,offset,timezone,as_of,from,to,current,sessions,active_days,minutes,estimated_sessions,sports,series,sources}`. `sports` : `{sport,sessions,active_days,minutes,estimated_sessions}`, tri minutes puis sport. `series` : `{from,to,sessions,active_days,minutes,estimated_sessions}`, tri chronologique, jours pour mois et mois pour année, cases sans séance incluses. `sources` : `{id,sport,date,minutes,estimated}`, date puis id décroissants, cinq maximum. Types/paramètres invalides refusés ; aucune écriture ni nouvelle table.

## Parcours et export

Panneau secondaire replié « Mon bilan de pratique » dans Progrès après les comparaisons ; aucune nouvelle destination principale. Sélection puis calcul explicite, résumé clair, période/fuseau/instant/estimations visibles. Répartition par sport consultable avec recherche et vingt lignes par page, même avec deux cents sports. Calendrier et sources dépliables, vrais liens vers le journal.

Module pur `TitanReports.valid(payload,options,owner)` : identité, paramètres, calendrier, ordre/continuité, nombres finis, comptes et totaux cohérents, sources dans la période observée. Tolérance de minutes limitée aux arrondis serveur à un dixième. `TitanReports.csv(payload,labelOf)` : UTF-8/BOM, séparateur point-virgule, CRLF, cellules citées et quotes échappées, protection contre formules ; totaux/sports/calendrier, période et instant explicites, aucune séance privée détaillée. Pas de nouvelle dépendance de production.

L’export provoque une nouvelle demande serveur et ne télécharge que la réponse fraîche valide. Il affiche ce même aperçu avant le téléchargement, sans copie distante ni persistance de résultat. Fermeture, changement de paramètres/session, hors ligne et masquage retirent résultats et export ; requêtes annulées, réponses anciennes ignorées même si le compte revient. Revalidation visible au retour/focus/historique et chaque minute. Attente bornée à quinze secondes, erreur et relance accessibles. Invité/Free/ancien serveur restent utilisables et les analyses/exports habituels restent gratuits.

Offre/générateur/FAQ : mention du vrai bilan et du CSV agrégé, disponibilité conditionnée à la mise à jour serveur. Prix, checkout, paiements, Android, publicités et récompenses hors lot. Rapports PDF, partage public/automatique, envoi par mail et personnalisation libre de dashboards restent hors périmètre.

## Preuves exigées

SQL sur réplique : périodes/fuseaux/DST/leap, jour actif multisport, recalcul/estimations, archives/futur/étranger, sources limitées, Free/expiré/refunded/suspendu/sans auth/anon, paramètres et absence de mutation. JavaScript : calendrier complet/cohérence de contrat, arrondis, export lisible et formules, 200 sports. E2E : quatre choix, zéro/estimations, invité/Free, réseau/serveur ancien, réponse tardive/session réelle, expiration avant export, pagination/recherche, download contenu et mobile/desktop. Suites existantes vertes, rendu 360/1280 px, une revue puis correctifs Important RED→GREEN, trois jobs CI dont les deux voies natives SQL. Préserver les 247 formulations et les trois images locales étrangères au lot.
