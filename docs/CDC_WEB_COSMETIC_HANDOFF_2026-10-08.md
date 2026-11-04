# Atelier : acquisition gratuite et permanente des cosmétiques

## Périmètre et décision

Le cahier vivant impose que tous les cosmétiques restent gagnables gratuitement. La lecture du catalogue et des fonctions Supabase le 8 octobre 2026 confirme 20 pièces actives, dont quatre réservées à Titan+ ; six anciennes pièces de combat restent retirées du catalogue. Aucun compte réel ni historique individuel n'a été lu ou modifié.

La correction ouvre un achat permanent par crédits d'activité. Elle conserve l'accès temporaire déjà inclus dans Titan+ ; ce confort ne rend aucun objet exclusif au paiement. Les prix reprennent le haut de la fourchette déjà pratiquée pour chaque support, sans augmenter le plafond ni créer de monnaie.

| Pièce | Acquisition permanente pour Free ou Titan+ | Accès inclus dans Titan+ |
| --- | --- | --- |
| Cadre Aegis | 1 400 crédits | Temporaire |
| Cadre Givre | 1 400 crédits | Temporaire |
| Aurores | 1 000 crédits | Temporaire |
| Obsidienne | 800 crédits | Temporaire |

Les quatre coûtent ensemble 4 600 crédits, soit cinq semaines si le plafond existant de 960 crédits est atteint chaque semaine. Ce calcul n'est pas une promesse de rythme réel. Le catalogue reste permanent ; aucune publicité ni souscription n'est nécessaire. Les trois pièces initiales et les cinq récompenses de rang gardent leurs conditions ; les huit achats existants gardent leurs prix.

## Comportement et compatibilité

- Un non-abonné peut acheter, porter et garder chacune des quatre pièces.
- Un abonné peut porter immédiatement ces pièces. « Garder la pièce » reste disponible, même pour une pièce déjà portée ; le prix et la confirmation indiquent le coût en crédits. Seul cet achat crée une acquisition permanente.
- Après expiration, une pièce achetée reste portée. Une pièce seulement empruntée revient au style initial, avec conservation de la préférence stockée existante.
- `titan_atelier()` ajoute `owner`, `permanent`, `plus_access` et `plus.refunded_at` sans retirer de champ. Le front prend en charge l'ancien contrat : les achats historiques restent permanents et les anciennes pièces encore marquées `plus` annoncent la mise à jour du catalogue en attente.
- Au chargement d'un compte, le bootstrap commun lit l'Atelier pour séparer la préférence brute stockée dans le profil de l'apparence effectivement autorisée. Le shell, le profil, la carte d'aventure et les images partagées utilisent cette résolution. Le cache d'autorisation reste en mémoire, lié à l'utilisateur ; il n'est pas envoyé dans `game_state` ni dans une écriture de profil. Une réponse tardive d'un autre utilisateur est ignorée. Si la lecture échoue, le fallback reste conservateur ; un achat Free de ces quatre pièces peut alors être temporairement masqué jusqu'au retour du serveur.
- L'accès temporaire exige un flag actif, aucune date de remboursement et une fin future ou absente, comme le contrat existant de l'aventure. Une date passée ou un remboursement avec flag encore vrai ferme l'emprunt, sans retirer les acquisitions. Le shell applique aussi l'échéance aux styles empruntés déjà chargés.
- La page Tarifs et l'Atelier distinguent acquisition permanente et accès temporaire. L'équipement, l'achat, le débit et le reçu restent validés par les RPC existantes ; aucun crédit, XP, rang, avantage sportif ou paiement réel n'est ajouté par le client.

## Migration et données

`20261008120931_web_cosmetic_fairness.sql` contient une seule instruction `DO`, sans transaction interne. Elle modifie quatre lignes du catalogue et deux fonctions, avec `search_path` vide, objets qualifiés et droits existants conservés. Les identifiants, autres clés de métadonnées, autres pièces, historiques d'achat et profils restent inchangés. Une pièce manquante provoque un refus atomique, sans mise à jour partielle. Le délai d'attente des verrous est borné à cinq secondes et celui du transactionnaire appelant est restauré.

La migration est préparée, **pas appliquée à la production**. Ne pas rejouer les neuf migrations historiques sur la production actuelle : leur présence dans le dépôt ne prouve pas qu'elles restent à appliquer. Vérifier l'historique Supabase et les définitions effectives avant toute intervention.

Le bundle historique `release-300.sql` reste inchangé. Cette migration doit être appliquée comme correctif séparé après les prérequis Atelier. Cette branche reprend à l'identique le petit rejeu des correctifs absents du bundle et le second step CI de la PR #21 ; elle ne dépend donc pas de sa fusion pour tester les deux voies. Les autres tests de concurrence et contraintes économiques restent propres à #21. Ne pas régénérer le bundle ni ajouter un `BEGIN/COMMIT` interne à ce correctif.

Déploiement préparé : front compatible d'abord, puis migration suivant le processus validé de sauvegarde, revue et vérification. Aucune publication ni migration automatique dans ce lot. Après acquisition par des utilisateurs, ne pas revenir à l'ancien helper d'appartenance : il supprimerait l'affichage des pièces achetées lors d'une expiration. Privilégier une correction compatible ; un rollback du front conserve les données mais masque temporairement aux abonnés la possibilité de garder une pièce empruntée. Vérifier les acquisitions et l'expiration après toute reprise.

## Preuves et limites

- RED SQL : commit `6281386f47bd9bf953885b17cc5b7a13362a263f`, [CI 37774668591](https://github.com/Theo25460/TITAN_V0.5/actions/runs/37774668591). Échec attendu : `every active piece needs a free acquisition path`.
- RED navigateur : les trois nouveaux parcours échouent sur la permanence absente, le bouton d'acquisition absent pour un abonné et l'absence de notice pour l'ancien contrat.
- Vérification locale finale : 60 tests, build et audit ; 11 E2E verts. Achat Free à 360/1280 px, acquisition par un abonné puis expiration, ancien contrat, absence de débordement et d'erreur JavaScript. Les RPC navigateur sont synthétiques ; cela ne remplace pas une recette connectée réelle.
- SQL : acquisition/équipement des quatre pièces par Free, prix serveur, reçu unique, pas d'XP ni niveau, impossibilité de falsifier l'accès ou le solde, expiration après achat et accès seulement emprunté. Le rejeu vérifie profils/reçus/métadonnées/droits inchangés, restauration du timeout, rollback du transactionnaire et refus atomique hors transaction.
- CI de la correction : [37775989334](https://github.com/Theo25460/TITAN_V0.5/actions/runs/37775989334), 60 tests, 9 E2E, dix migrations et huit suites SQL, trois jobs verts. L'erreur `COSMETIC_CATALOG_PREREQUISITE_MISSING` est provoquée intentionnellement puis vérifiée dans la suite de refus atomique ; le job SQL se termine bien par `OK`.
- Contrôle visuel : 360/1280 px. Un test ciblé a reproduit le débordement du long libellé d'acquisition chez un abonné ; « Garder la pièce » et la mise en ligne flexible le corrigent. La confirmation conserve le prix, le caractère permanent et l'action « Débloquer et porter ».
- Relecture indépendante Sol 6.1 : trois findings Important acceptés (filtre du shell, expiration/remboursement avec flag vrai, correctifs absents dans la voie bundle). Le scénario ancien serveur, signalé Minor, est aussi corrigé : aucun nouveau champ, quatre pièces encore `plus`, achat historique conservé. Une seule passe de correction, sans seconde revue.
- RED après revue : commit `6b5189e2df05ccedebdb8d5ac32c2f4d83080a1d`, [CI 37777533755](https://github.com/Theo25460/TITAN_V0.5/actions/runs/37777533755). Les E2E échouent sur le cadre acheté absent du shell ; SQL sur l'accès temporaire conservé après la date de fin ; la voie bundle sur `NOT_FOR_SALE`, faute de rejeu du correctif. Un test supplémentaire reproduit localement le solde/apparence écrasés après changement de compte pendant une réponse.
- Les tests navigateur couvrent maintenant le vrai rendu du profil et de la navigation après achat puis navigation/reconnexion simulée, la préférence empruntée expirée non réautorisée, les réponses tardives après changement de compte, l'ancien contrat sans nouveaux champs et l'expiration d'un style déjà chargé.
- GREEN après corrections : commit `026a2f0e0e55bb11a809ff805b3e76635ae9a8b5`, [CI 37778761599](https://github.com/Theo25460/TITAN_V0.5/actions/runs/37778761599). Trois jobs verts : 60 tests, 11 E2E, dix migrations et neuf suites SQL ; les neuf suites sont également vertes avec bundle historique puis correctif. L'expiration par date et le remboursement sont testés avec flag resté vrai. Le contrôle de refus atomique produit son erreur attendue puis `OK` dans chacune des deux voies.
- La CI du commit de documentation doit rester verte avant passage de la [PR #22](https://github.com/Theo25460/TITAN_V0.5/pull/22) en revue. Le lot est livré sur cette branche, sans fusion ni déploiement ; le chantier global reste ouvert.

## Audit de la boucle boutique et suites du cahier

SHOP01 : la boucle existante est séance validée → crédits → achat serveur → collection → équipement/prévisualisation. Les pièces de rang donnent aussi un objectif de progression. L'exclusivité payante des quatre pièces était un écart concret ; ce lot la corrige. La prévisualisation existe déjà, l'inventaire sépare maintenant accès temporaire et possession permanente.

Restent à concevoir : avatars et titres achetables/déblocables (SHOP05/06), récompenses reliées à des quêtes/boss/exploits (RPG13/SHOP12), inventaire plus complet, découverte des prochaines récompenses et équilibrage à partir d'usage réel. Le RPG Premium comporte encore des campagnes séparées : PREM09/RPG et l'offre Premium globale ne sont pas validés par ce lot. La source principale de crédits est encore la séance ; le travail sur les quêtes et l'appoint publicitaire volontaire reste ouvert. SHOP20 doit rester partiel, même après suppression de toute exclusivité cosmétique du catalogue actuel.

PR #19 (navigation), #20 (isolation) et #21 (intégrité économique) restent indépendantes et non fusionnées. Faire une validation de leur intégration avec ce lot avant un déploiement. Android/Play Console restent au chantier WORK. La passe transversale Astra au niveau maximal requise par le cahier appartient à la version complète destinée au déploiement, pas à cette PR isolée.
