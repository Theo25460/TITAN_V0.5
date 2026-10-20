# Mini-quêtes confirmées — 19 octobre2026

Lot RPG04 / RPG08 / RPG13 après PR98. PR99 vers main rassemble les lots96–99 pour la recette commune, sans fusion ni déploiement. Architecture et décisions : docs/superpowers/specs/2026-10-19-rpg-server-quests-design.md ; plan associé exécuté inline selon l’autonomie demandée.

## Résultat

- Trois mini-quêtes facultatives dans les quatre campagnes : jours actifs, effort normalisé et annotation d’une source du chapitre. Le serveur fournit leurs cibles/progrès dans le snapshot version3. Aucune mission ne demande un sport particulier ou ne bloque la balise principale.
- Cibles figées au départ de chaque chapitre : fenêtre précédente28jours, jours distincts dans le fuseau choisi, cible1/2/3jours selon0–4/5–12/13+jours ; effort quotidien plafonné90, moitié de la médiane arrondie par5, bornée15–45. Sans historique admissible :1jour/15minutes. Les séances tardivement importées ou supprimées pendant le chapitre ne réécrivent pas ces cibles.
- Trois souvenirs de carnet : Éclat de constance, Éclat d’élan, Éclat de mémoire. Le panneau annonce le gain prévu ; seuls les gains renvoyés et stockés côté serveur apparaissent comme confirmés. Souvenirs distincts par région/chapitre/mission ; ni XP, ni crédits, ni puissance ni checkout modifié.
- Confirmation dans la transaction existante de balise, après les contrôles de preuve/révision : insigne, missions complètes et chapitre suivant sont atomiques. Une mission incomplète peut être laissée ; pas de gain rétroactif après le passage. Deux validations concurrentes sont sérialisées par les verrous existants, la seconde révision périmée est refusée.
- Migration20261019053123_adventure_quests_v3.sql créée via CLI : colonne de profil, trigger invoker de gel, helper privé révoqué aux rôlesAPI, nouvelle table adventure_quest_rewards en RLS et SELECT propriétaire, helper public invoker et snapshot/action étendus. Signature RPC de mutation conservée, search_path vide, aucune écriture directe des rôlesAPI.
- Quatre régions gratuites conjointement dans le catalogue, le moteur découverte et le serveur. Ancien serveur : message de mise à jour pour Forge/Aurores sans achat présenté comme solution. Offres publiques/Atelier alignées ; mentions de déploiement serveur, aucun changement de prix/Paddle/limite XP/crédits.
- Missions et souvenirs personnels retirés à la transition de compte. Version3 incomplet/malformé : aucune mission inventée, campagne principale encore utilisable. Ancien serveur/découverte : préparatifs indicatifs de l’Aube conservés, sans nouveaux souvenirs ; pas de fausse parité avec un compte serveur.

## Préservation et migration

Les campagnes existantes gardent exactement chapitre, route, fuseau, départ, fin, insignes et sources. Une campagne active sans profil reçoit le départ doux1/15 avec marque legacy. Aucun souvenir rétroactif ; une campagne terminée reste terminée. La migration réappliquée deux fois préserve les profils/soldes et la transaction appelante. Les gains déjà confirmés restent après archivage/correction d’une séance.

## Vérification

- Contrats unitaires RED puis GREEN sur autorité serveur, absence de fallback version3, régions libres ; régression supplémentaire du vieux refus payant. Revue : entrée null, profil invalide, cible contradictoire et completion incohérente reproduits avant correction ; dix variantes unitaires, plus un parcours navigateur réel laissant la campagne utilisable.
- Offre : testRED sur la promesse payante résiduelle puis correction du générateur et régénération ; pages visibles et FAQ structurées cohérentes, reproductibilité testée.
- pnpm verify final :212/212tests,64scripts, build108ressources hors ligne, audit0erreur/16avertissements préexistants. Aucun test ignoré pour faire passer le lot.
-18/18parcours navigateur RPG ciblés, dont5nouveaux : cibles figées360/1280, gain prévu/acquis, refus, confirmation/rafraîchissement sans duplication, retrait propriétaire/transition, région gratuite/ancien serveur, contrat malformé. Rendus360/1280 inspectés sans débordement horizontal.
- SQL RED observé sur la PR de tests avant implémentation : run39205041006, assertion snapshot version3 dans les deux voies. SQL GREEN : run39205514107, tête publiée f9be349ca90c66ad0541d3da375b93f50150fbef, migrations individuelles ET bundle historique/suitescorrectives, tests de profil/RLS/legacy et tous les contrats concurrents passés. Les modifications suivantes concernent uniquement client, offre, testsJS et documentation ; fichiersSQL inchangés. Logs SQL lus.
- Concurrence Aventure : deux vraies connexions, attente de verrou observée via pg_stat_activity, une balise, un avancement et trois souvenirs uniques. Runner refuse toute base sans préfixe titan_test_ avant création des identités. Autres contrats concurrence économie/vues/support conservés.
- Revue indépendante unique : aucun Critical, deux Important corrigés en une passe RED→GREEN.39tests rejoués par le reviewer avant correction. Il n’a pas exécuté de navigateur/PostgreSQL indépendamment ; preuves ci-dessus produites par le coordinateur. La recette CI agrégée finale se consulte dans les checksPR99 ; son résultat sur la tête finale est consigné dans le cahier vivant.

## Statuts

RPG04[x] : mini-quêtes présentes dans les quatre campagnes existantes, confirmées pour les comptes. RPG13[x] : récompenses cosmétiques de chaque mission visibles avant et après confirmation dans le carnet. RPG08 reste[~] : les mini-quêtes s’adaptent ; les objectifs principaux et gardiens demeurent fixes. Les autres exigences ne sont pas clôturées par déduction.

## BLOQUANT À CORRIGER MAINTENANT

Aucun Critical/Important confirmé restant après la passe de correction. Les migrations doivent être appliquées lors d’un déploiement coordonné pour rendre les nouveaux contrats disponibles ; aucune base réelle n’a été modifiée dans ce lot. Ne pas assimiler un gain prêt à un gain acquis.

## NON BLOQUANT – BACKLOG FINITION

- Espace manquant «et4gardiens» dans la carte de bénéfice publique : défaut typographique relevé, différé conformément à la consigne anti-polissage.
- Profil appartient au chantier de validation du nom : sa courte accroche «Confort, campagnes et cosmétiques» et ses versions de scripts communes sont laissées à son propriétaire. Aucun accès Aventure ne dépend de cette accroche.
- Présentation/narration de trois familles seulement, pas de nouvel équipement personnalisable ; découverte sans souvenirs de quêtes et ancien serveur sans cibles figées. Pas de garantie de recette compte réel, Android/PWA installé, lecteur d’écran physique ou performance à forte volumétrie.

## EXIGENCE OU MACRO-BLOC SUIVANT

RPG05 / RPG06 / RPG07 : consolider et fermer l’équité multisport des contrats de quête, notamment natation/course/force et volume plafonné, à partir des invariants déjà livrés. Ensuite adapter les objectifs principaux/gardiens pour finir RPG08 plutôt qu’ajouter de la finition aux panneaux. Intégration de la chaîne complète selon checkpoint95, avec conservation des acquis ; pas de nouvelle boucle de micro-polissage web.

## Périmètre et décisions

Exécution autonome inline ; une revue finale, testsSQL dans CI jetable car le namespace local ne permet que uid0. Extension de copie publique/Atelier nécessaire : les tests de reproductibilité ont détecté l’ancien argument de vente payant. Coût possible de ces arbitrages : révision produit/copie avant intégration et dépendance à la latenceCI, sans impact sur des données réelles. Pas de suppression, fusion, déploiement, donnée réelle, économie, WORK/Android, formulaireProfil/smoke ou image étrangère modifié. Revenir avant ce lot demanderait de préserver/exporter les nouveaux souvenirs si la migration a déjà été appliquée ; aucune annulation destructive proposée.
