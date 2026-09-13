# TITAN Renaissance — livraison 200

Préparée le 13 septembre 2026 sur `codex/titan-renaissance`, depuis la version 102 (`5de92bd`). Les demandes du propriétaire définissent le périmètre ; l’audit joint du 11 septembre sert de référence, pas d’instruction autonome.

## Expérience réalisée

La séance relie maintenant trois espaces : le journal et ses mesures, le personnage et ses niveaux, la campagne et ses insignes. L’accueil public présente cette boucle avec un univers original. Le QG, Aventure, Séance, Progrès et Profil constituent les cinq destinations principales.

| Domaine | Livraison concrète |
|---|---|
| Univers | 4 régions illustrées, 36 chapitres écrits, 4 gardiens, 36 insignes, 2 chemins de progression par campagne. |
| Personnage | 7 rangs, 6 avatars débloqués par niveau, XP officielle issue du serveur, prochain palier et collection. Choix conservé dans le QG, le profil et la navigation. |
| Aventure | Carte de 9 étapes par région, récits, pratiques utiles, progression calculée sur les séances admissibles et liens sources. Une contribution par jour, sans échéance punitive. |
| Fin de séance | Mesures enregistrées, état de sauvegarde, progression du personnage, repères remarquables et mission active. Le mode découverte est explicitement distinct du compte. |
| Objectifs | 4 modèles personnalisables ; séances, jours, minutes ou kilomètres ; dates inclusives ; filtre de sport ; édition, archives/restauration et sources contributrices. Chargement cloud paginé, 50 objectifs actifs maximum. |
| Records | Distance, durée, temps sur distances comparables, charges réellement soulevées, cotations contextualisées, filtres et séance source. |
| Analyses | Courbes et tableaux par exercice ; unités cohérentes ; cotations séparées par système et contexte ; allure/vitesse ; comparaison de deux séances du même sport. |
| Édition avancée | Charges, répétitions et RIR par série, ajout/retrait de séries, durée facultative et repères d’escalade. Recalcul des données sans recréer les récompenses. |
| Coach | Invitations à usage unique, consentement explicite, dates et sport choisis, notes/détails facultatifs, révocation, propositions datées et transitions contrôlées. Le sportif relie lui-même une activité réalisée à une proposition acceptée. |
| Sauvegarde personnelle | Export comprenant objectifs, aventure, relations et propositions. L’actualisation des fichiers de l’interface préserve séances, brouillons, objectifs et personnages locaux. |
| Visuel | 14 illustrations originales : 4 paysages, 6 portraits, 4 gardiens. WebP, variantes de paysage 800/1600 pixels, dimensions réservées et chargement différé. Iconographie SVG commune pour les nouveaux parcours. |
| Public et SEO | Accueil interactif, offres détaillées, pages fonctions/coachs réécrites ; 4 guides substantiels ; canonicals, descriptions, balisage Article, maillage, sitemap, redirections des anciens guides, exclusion des pages personnelles de l’indexation. |

Le journal, le calendrier, la file IndexedDB, le planning, le chronomètre, les routines, l’import GPX et les bilans de la version 102 restent intégrés. Les anciens avatars sociaux et accessoires sont conservés dans une section repliable du profil. Les modules communautaires existants restent disponibles ; cette livraison n’introduit pas de combat client récompensé.

## Classique et TITAN+

| Capacité | Classique | TITAN+ |
|---|---|---|
| Personnage, niveaux, 7 rangs, 6 avatars accessibles par progression | Inclus | Inclus |
| Campagnes / chapitres / insignes | 2 / 18 / 18 | 4 / 36 / 36 |
| Journal, édition, objectifs, records, analyses personnelles | Inclus | Inclus |
| CSV, export personnel, bilan personnel imprimable | Inclus | Inclus |
| Routines nommées | 5 | 20 |
| Comparaison de périodes dans le bilan | — | Incluse, calcul serveur protégé |
| Sportifs suivis côté coach | 3 | 20 |
| Personnalisation supplémentaire | Selon collection | Selon collection |

Les campagnes donnent des récompenses cosmétiques sans crédit ni XP supplémentaire. Les droits des mondes premium et la capacité coach sont vérifiés côté serveur. Les règles existantes de facturation Paddle restent utilisées. Aucun achat réel n’a été effectué pour la recette.

À expiration : les insignes et relations déjà acquis restent disponibles ; les nouveaux accès premium, récompenses de campagnes payantes et créations de relations respectent les droits actifs. Les routines existantes restent chargeables ; la création au-delà de cinq utilise le contrôle existant de capacité.

## Comparaison avec l’audit initial

| Constats | État dans cette livraison |
|---|---|
| B01–B05, intégrité des récompenses et rejeu | Socle 101/102 préservé. La nouvelle campagne utilise des étapes et récompenses uniques au serveur. Répéter une récupération ne crée pas de ressource. Les séances rejetées/archivées/futures ou antérieures au départ ne contribuent pas. |
| B06–B07, conservation et pagination | File durable et pagination de l’historique conservées. Pagination ajoutée aux objectifs et aux vues coach. Une panne du stockage local ne confirme pas une action de campagne. Un changement de compte invalide les réponses tardives. |
| B08–B09, profil et social | Contrôles existants conservés. Les données de progression nouvelles utilisent leurs propres opérations et révisions. Les propositions coach ont des transitions spécifiques à chaque participant. |
| F01/F03/F05, qualité des mesures | Édition des séries et du contexte d’escalade, valeurs absentes distinctes de zéro, unités comparables, sources et couverture des objectifs. Le volume est recalculé à partir des séries, jamais considéré comme une preuve de gain de force. |
| F04/F06/F07, données et ergonomie | Navigation unifiée, filtres dédiés, tableaux et détails progressifs, commandes accessibles au clavier, réglages responsive, états de chargement sans faux niveau initial. |
| A01/A02, maintien du code | Nouveaux modules dédiés au jeu, données, pages et coach. Les fichiers historiques globaux existent toujours : il ne s’agit pas d’une réécriture complète de leur architecture. |
| A03/A04, migrations et tests | 4 migrations SQL horodatées créées avec le CLI Supabase ; tests transactionnels ; suites de non-régression existantes préservées. |
| A05–A07, PWA/SEO/ressources | Cache versionné 200, nouvelles pages et ressources, sauvegardes locales préservées lors de l’actualisation, polices/SDK locaux conservés, contenus publics générés depuis un script reproductible. CSP existante préservée. |

## Sécurité et base

Migrations appliquées au projet `oubmftfufwwzwpgvrcag` :

1. `20260912182314_renaissance_adventure.sql` : état de campagne, preuves, récompenses, avatars, droits premium et révisions.
2. `20260912185506_renaissance_goals_and_training_edits.sql` : objectifs privés et édition détaillée des entraînements.
3. `20260913133307_renaissance_coaching_workspace.sql` : invitations privées, relations consenties et propositions.
4. `20260913183159_renaissance_foreign_key_indexes.sql` : index des clés étrangères signalées par l’advisor.

Les nouvelles opérations privilégiées vivent dans le schéma privé, avec wrappers publics invoker, contrôle `auth.uid()`, privilèges explicites et `search_path` vide. RLS sépare propriétaires et participants. Les invitations sont hachées, expirent en sept jours et ne peuvent être réutilisées. Les modifications de campagne, objectifs et relations utilisent des révisions ; les écritures coach ne donnent jamais le droit de modifier le journal du sportif.

Le partage coach exclut coordonnées et traces GPS, lieu précis, biographie, poids, sommeil et données de santé. Notes et détails sont désactivés par défaut. Chaque lecture vérifie le lien actif et son périmètre. Les données partagées restent en mémoire dans ce module, sont retirées quand la page est masquée, et ne sont pas recopiées dans l’export personnel du coach.

L’advisor final conserve **26 avertissements sur des anciennes RPC SECURITY DEFINER** : leurs droits anonymes sont absents et elles contiennent des vérifications d’identité, mais cela ne constitue pas une revue exhaustive de chaque logique métier. Trois informations « RLS sans policy » concernent des tables volontairement inaccessibles au navigateur. Les nouveaux index ont supprimé les six signalements de clés étrangères non indexées. Les policies historiques redondantes restent une dette à nettoyer séparément.

**Configuration externe restante :** Supabase signale la protection contre les mots de passe compromis désactivée. Son activation dépend des réglages Auth et d’une offre Supabase compatible (Pro ou supérieure selon la documentation). Aucun changement d’abonnement d’infrastructure n’a été effectué. Ce point empêche de présenter la sécurité comme entièrement finalisée.

## Preuves de recette

- `pnpm test` : **44 tests réussis**, dont 9 scénarios Renaissance ; 67 scripts analysés ; références d’assets vérifiées.
- `pnpm run build` puis `pnpm run audit` : build public réussi et aucun constat de l’audit statique interne.
- `pnpm audit --prod` : aucune vulnérabilité connue signalée par le registre à la date du contrôle.
- SQL exécuté dans des transactions annulées : `102_training_insights`, `104_training_edit_consistency`, `200_adventure`, `200_goals_and_edits`, `200_coaching` ; tous réussis, sans données fictives conservées.
- Les scénarios SQL couvrent propriétaires distincts, refus anonyme, absence d’écriture directe, rejeu, révision obsolète, partage optionnel, révocation et accès premium expiré. Pas de test de charge ni de concurrence HTTP réelle.
- Navigateur : campagne gratuite démarrée, séance contributrice enregistrée, récompense récupérée, passage au chapitre suivant et insigne visible ; changement de personnage retrouvé dans le QG ; export personnel local déclenché.
- Objectif créé, ajusté, archivé, restauré et retrouvé après rechargement. Sources et calculs visibles.
- Musculation : 3 × 10 à 40 kg = 1 200 kg ; correction de la première série à 45 kg et RIR vide ; résultat 1 250 kg retrouvé dans le journal et les analyses.
- Affichage à 360, 390, 768 et 1 440 pixels : accueil, aventure, objectifs, analyses, profil, records et offres contrôlés selon les parcours. Débordement du menu à 360 pixels corrigé ; comparaison des tables confinée à leur zone défilante ; aucune image cassée observée sur les pages inspectées.
- Démonstration de l’accueil utilisable par flèches/Home/End ; menu mobile ouvert et liens visibles ; focus et réduction des animations prévus dans les styles.
- Préversion `6aa6edeec9bb54dcdd90fba2` : **39/39 contrôles HTTP**, pages, canonicals de routes, redirections, noindex, CSP, illustrations, fichiers internes 404 et webhook GET 405. Les retouches de recette sont incluses dans le build final.

Les largeurs de navigateur ne remplacent pas des essais sur iPhone/Safari et Android réels. Pas de transaction Paddle réelle, de suppression de compte réel ni de parcours connecté intégral dans le navigateur ; les droits connectés sont vérifiés par les scénarios SQL. Pas de score Lighthouse ni de mesure terrain Core Web Vitals inventés.

## Exploitation

Le build `dist` est le seul contenu publié, accompagné du webhook depuis `netlify/functions`. SQL, outils, tests, document d’art et documents internes restent hors publication. `tools/build-renaissance-content.mjs` régénère les pages publiques de cette version. `RENAISSANCE_ART.json` conserve les prompts ; les assets publiés sont uniquement les WebP optimisés.

Vérification d’un déploiement : `node tools/check-deployment.mjs https://titan-app.fr`. Le rapport détaillé est écrit dans `test-results` (non versionné).

Retour arrière : republier le déploiement Netlify 102 `6aa542eb185ce4f666f181ed` si nécessaire. Les nouvelles tables peuvent rester en place ; ne pas les supprimer avec les progressions et relations des utilisateurs. Les migrations d’édition conservent la signature existante de la RPC et passent la suite 104. Une restauration complète de sauvegarde n’a pas été simulée.

## Évolutions distinctes de la présente livraison

La vision longue du plan reste plus large : campagnes coopératives nouvelles, programme coach de plusieurs semaines, invitations collectives, packs d’illustrations propres à toutes les familles sportives, notifications choisies, instrumentation des parcours, mesure Search Console et suppression progressive des anciens handlers inline. Ces éléments ne sont pas vendus comme des fonctions disponibles. Les fonctions publiées dans les offres correspondent à l’implémentation décrite ci-dessus.

Le référencement est mieux structuré, mais les impressions, clics et inscriptions issus de Google doivent encore être mesurés dans Search Console. Aucune hausse de trafic n’est démontrée à la livraison.

## Références de conception

- [Hevy — fonctions](https://www.hevyapp.com/features/) : intérêt du détail par série, des routines et de l’historique exploitable.
- [Habitica](https://habitica.com/static/home) : avatar, niveaux et quêtes reliés aux actions ; inspiration de mécanique, sans reprendre l’univers graphique.
- [Zombies, Run!](https://zrx.app/news/get-started) : continuité narrative entre les activités.
- [Google — contenu utile](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) et [Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals) : pages utiles et expérience mesurable.
- [Supabase — protection des mots de passe](https://supabase.com/docs/guides/auth/password-security), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) et [fonctions](https://supabase.com/docs/guides/database/functions).

Ces références justifient les choix de conception ; elles ne constituent pas une étude représentative des clients ni une preuve de supériorité commerciale.
