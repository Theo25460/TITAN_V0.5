# TITAN V1.1 — rapport de finalisation, 2 novembre 2026

**Décision : NO-GO pour publication grand public.** Cette intervention livre des correctifs vérifiés et une branche de consolidation supplémentaire, pas une déclaration de clôture artificielle de toute la V1.1. La production reste inchangée. Le niveau de sécurité 7,5/10 n'est pas démontré.

## A. Version et sources exactes

- Branche : `codex/v11-finalization-20261102`, issue de `6b4bcaa3ccaea247322a72b26dd8e6938ad9ec55`. Le SHA final et la PR sont ceux du commit et de la PR contenant ce rapport, à relever avec `git rev-parse HEAD` et GitHub ; aucun ancien SHA local inaccessible n'est présenté comme récupéré.
- Comparaison GitHub : `claude/titan-finition-web` à `8102c176` est entièrement ancêtre de la consolidation, avec 0 commit exclusif et 157 commits de retard. PR #105 ouverte, base main. Sources conservées.
- Production Netlify : projet `titano-app`, déploiement `6ad9c1f1a3cb26a466c44bc5`, prêt et verrouillé, contexte production, branche déclarée main, `commit_ref=null`. Publication déclarée le 29 octobre à 15 h 07 Paris. Ce déploiement manuel n'atteste pas un commit précis ni une V1.1 publiée.
- Production Supabase inspectée en lecture : 80 tables publiques sur 80 avec RLS ; 175 fonctions privilégiées dans le snapshot (dont 68 RPC publiques accessibles), fonctions exposées détenues par postgres avec bypassrls, sans superuser ; CREATE sur public fermé à anon/authenticated. Alertes : 68 grants authenticated et 3 anon sur 68 fonctions distinctes, 20 informations RLS sans politique, mots de passe compromis désactivés. Aucune correction distante appliquée.
- Lot SQL V1.1 candidat : **31 migrations, numéros 30 à 60**. Le nouveau correctif est `20261102130000_legacy_social_privacy`. Les migrations V1 déjà appliquées ne doivent pas être rejouées.
- Google Play : la version réellement installée dans le test fermé n'a pas été lue dans la console ; les numéros du dépôt et les anciennes notes ne la prouvent pas. La CI de la base `6b4bcaa` avait Qualité et TWA verts, Android natif encore en cours au dernier contrôle ; cela ne valide pas la nouvelle tête.

## B. Qualité, données et isolation Android

Défauts reproduits avant correction, puis tests verts :

1. Deux ajouts concurrents ou un ajout pendant un envoi pouvaient écraser des parcours : mutations locales sérialisées et application de chaque résultat à la liste actuelle.
2. Refus serveur après cinq essais et capacité dépassée supprimaient des traces : aucune purge automatique ; capacité annoncée par erreur explicite ; enregistrement GPS conservé si la persistance échoue. Identifiant stable pour une reprise du même enregistrement.
3. La déconnexion effaçait la boîte des parcours et leurs liens : conservation par compte, suppression complète seulement dans le parcours explicite prévu à cet effet.
4. Une erreur de lecture disque était assimilée à une boîte vide : lectures strictes des boîtes et de la file de séances ; écriture de séance interdite tant que la file n'est pas chargée.
5. La synchronisation pouvait utiliser l'identité du compte suivant : vérification du propriétaire puis fixation de son jeton dans la requête réelle pour les parcours et les séances ; lectures/suppression des parcours également liées au propriétaire.
6. Une connexion lente pouvait rétablir l'ancien compte après connexion B/déconnexion : génération de transition vérifiée après les attentes. Une ancienne lecture de file ne remplace plus la file actuelle.
7. Brouillons sauvegardés avec un état global mutable et reçus serveur non cloisonnés : snapshot de brouillon par compte, protection des lectures tardives, temporisateurs indépendants, reçus indexés par compte et événement.
8. Les parcours en attente étaient inaccessibles lorsque la bibliothèque distante échouait : export GPX local disponible dans cet état, refus d'envoi expliqué et copie conservée.

La revue indépendante a reproduit la fuite de file A vers B, puis ses corrections ont reçu une régression de concurrence, un test de jeton capturé et un test de lecture disque refusée. Pas de réécriture des règles d'XP ni d'avantage Premium introduit.

La présentation existante et ses composants sont préservés. La page escalade a été contrôlée à 320/390/1280 px. Le rendu Android physique, clavier, gestes, consommation et 60 FPS **ne sont pas validés ici**. Aucun gain de performance inventé : seul le bundle release Metro a été produit ; ce n'est pas un AAB signé ni une mesure de batterie.

## C. AdMob et achats

Les plafonds sont corrigés : première éligibilité à cinq séances confirmées, puis cinq nouvelles séances entre affichages, 30 minutes et deux par jour. Les anciens résultats, états d'un autre compte, doubles activations et écritures de compteur échouées ne doivent pas réutiliser une éligibilité. Tutoriel, chronomètre actif/en pause/non lu et GPS inconnu/en cours bloquent les annonces. Un retrait de consentement invalide une ancienne initialisation en attente.

Les réponses Google Play sont datées **avant** la lecture Google, pour qu'une réponse ACTIVE ancienne et retardée n'écrase pas une lecture EXPIRED plus récente ; tests de concurrence sur achat, RTDN et réconciliation. Les tests utilisent des services simulés, aucun paiement réel.

Limites conservées : compteur AdMob local au téléphone, fenêtre de 60 identifiants, aucune limite mondiale multiappareils ; ordre Play sans garantie monotone entre horloges d'instances ou timestamps égaux. Voir `V11_MONETIZATION_REVIEW_2026-11-02.md`.

`app-ads.txt` existe dans la candidate avec les identifiants demandés ; **404 observée sur la production**. Aucune annonce réelle activée. Aucun SDK publicitaire ajouté sur le Web. UMP natif, prix, achats de licence, restauration/remboursement et notifications réelles restent à tester.

## D. SEO fondé sur les données

Observatoire lu entièrement : 75 impressions / 3 clics contre 54 / 9 sur les fenêtres de sept jours ; échantillon trop faible pour une causalité. L'escalade n'a plus d'impression détaillée après le 3 octobre ; l'indexation réelle reste inconnue. Page enrichie avec lecture des cotations, limites des équivalences et exemples de carnet, sans nouveau script ni multiplication des routes. Sources externes inventoriées comme navigation volontaire uniquement.

`/service` reste une assistance : les rares requêtes page × requête connues (« support titan », « titan connexion ») le justifient. HTTP direct : escalade/service 200, canonical propre et index,follow. Le sitemap servi et candidat contient 25 URL ; Windsor alterne 18/36 avec des dates anciennes. L'écart est constaté, pas résolu ni transformé en nombre indexé.

Plan 30/60/90 jours, mesure de l'activation et utilisateurs actifs : `V11_SEO_FINAL_2026-11-02.md`. Mesures locales diagnostiques uniquement, sans INP ni Core Web Vitals terrain démontrés. Générateur éditorial global ancien : ne pas le relancer à la racine sans réconciliation, car il écraserait l'assistance enrichie ; le build courant copie les pages committées.

## E. Sécurité et grille d'évaluation

Le registre `V11_SQL_SECURITY_REVIEW_2026-11-02.md` examine individuellement les **68 fonctions / 71 droits**, avec empreinte de définition et garde observée. Deux défauts confirmés : recherche par code ami privée/bloquée/suspendue ; statistiques de relations non acceptées et défaut permissif d'options absentes. Le correctif conserve les signatures et restreint les données. Les cinq assertions négatives échouent sur les anciens corps et passent après la migration, avec le rôle authenticated réel sur Postgres embarqué.

La CSP des scripts ne contient **déjà pas** unsafe-inline dans la candidate ni dans les réponses HTTP de production inspectées. Aucun durcissement fictif revendiqué. Tests Chromium de CSP inclus dans la recette ciblée. Le scan de l'historique ne détecte aucun secret serveur sur 4 011 versions de fichiers ; 97 citations de test/documentation classées illustratives. Cela ne prouve pas la révocation d'un secret exposé ailleurs.

Grille proposée : évaluer la couverture et le risque résiduel selon les domaines ci-dessous, puis ne calculer une note qu'après levée des gates bloquantes. Une moyenne ne compense jamais une fuite exploitable ni un test critique manquant.

| Domaine | Pondération | État démontré / manque |
| --- | ---: | --- |
| SQL, autorisations et isolation | 25 % | Revue exhaustive des alertes historiques, correctif et tests restreints ; copie restaurée et banc natif exact encore requis |
| Authentification et secrets | 15 % | Races Android fermées, PKCE existant, scan ; protection mots de passe, MFA admin et révocation des anciens secrets non vérifiées |
| API, Web, XSS et dépendances | 15 % | CSP restrictive et tests locaux, garde de livraison ; pas de test d'intrusion complet |
| Paiements et droits | 15 % | Scénarios négatifs simulés, ordre de réponses amélioré ; vraie chaîne Play/RTDN et limites d'horloge non closes |
| Android, santé et GPS | 15 % | Types/tests/bundle, durabilité et comptes renforcés ; appareil, build signé, permissions et intégrations réelles non validés |
| Confidentialité, résilience, exploitation | 15 % | Exports/suppression existants et correctifs de confidentialité ; restauration réelle récente, configuration fournisseur et surveillance non attestées |

**Note finale : non attribuable de manière défendable sur ces seules preuves ; 7,5/10 non atteint au sens de la démonstration demandée.** L'ancien 6/10 était une estimation partielle d'un autre état. Les comparer comme des mesures exactes serait trompeur. Mots de passe compromis encore signalés désactivés ; disponibilité/forfait et activation à vérifier côté fournisseur. Rotation/révocation Google historique non confirmée. Aucun changement de configuration production effectué.

Risque mineur hérité de la liste d'amis : ordre calculé depuis niveau/nom bruts alors que les valeurs peuvent être masquées, révélant un ordre relatif. Relevé par le relecteur, non présenté comme corrigé.

## F. Anti-triche et preuves de tests

Autorité serveur, plafonds, déduplication et absence d'XP pour les pas/parcours préservés. Les corrections ne certifient pas qu'une trace provient d'un effort réel. Aucun détecteur GPS simulé ni inviolabilité annoncé.

| Contrôle exécuté localement | Résultat |
| --- | --- |
| `pnpm run verify` | Réussi : types, tests inclus, build, audit et garde de livraison ; avertissements éditoriaux non bloquants restent visibles |
| `node --test tests/*.test.mjs` | 447/447 réussis |
| Android TypeScript strict | Réussi |
| Android Jest complet | 222/222, 36 suites, avec `--forceExit` ; animations/handles Jest préexistants, pas un processus naturellement terminé sans drapeau |
| Metro Android release | Bundle produit ; aucun APK/AAB signé prétendu |
| Scan historique Git | Réussi : 4 011 versions, aucune détection de secret serveur |
| SQL ciblé PGlite | RED historique sur cinq cas → GREEN ; réapplication, catalogue V1.1 et quatre mutations négatives vérifiés |
| SQL élargi embarqué | 77/98 fichiers passent ; 21 limitations nommées dans la revue (crypto, nom de base, commandes psql, locks). Pas équivalent au banc natif |
| Chromium smoke isolé | 346/346 réussis |
| Chromium CSP + Google + parcours + Billing ciblés | 14/14 réussis |
| SEO multi-largeurs | 27 navigations, sans débordement ; contenu escalade lisible sans JS |
| Campagne navigateur complète | **Non validée** : premier essai présente une cascade de timeouts/échecs dans le groupe smoke après plusieurs centaines de succès ; le premier échec repasse isolé et le groupe smoke repasse entièrement seul. Cause globale non démontrée ; aucune revendication « tout vert » |

Les commandes couvrent les derniers changements de leur composant ; la CI doit être exécutée sur la tête distante exacte avant toute fusion. Le banc embarqué n'utilise aucune donnée réelle et ne restaure pas une sauvegarde de production.

## G. Périmètre restant et sortie

Les écrans et bibliothèques existants sont inventoriés dans `mobile/docs/INVENTAIRE.md`, les activations dans `V11_ACTIVATION_MATRIX.md`. Cette intervention n'a pas validé chacune des fonctions de bout en bout en production. Points qui empêchent de dire « toute la V1.1 terminée » :

- RPG approfondi : monstres/combats, bestiaire enrichi, embranchements et dialogues, moteur vNext et simulations demandées restent absents/partiels, décrits sans faux statut dans `RPG_AUDIT_2026-11-02.md`. Ne pas modifier les courbes non approuvées sous couvert de sécurité.
- Parité native : l'inventaire signale encore des champs sportifs, espace Coach, Garmin, rapports avancés ou messagerie de guilde absents/partiels sur Android. Leur existence Web ne prouve pas leur existence native.
- Environnement isolé représentatif : restaurer une sauvegarde récente, vérifier les 31 migrations et le banc PostgreSQL natif/concurrence, puis l'isolation réelle de deux comptes ordinaires, Coach et admin sur la candidate exacte.
- Appareil et services : GPS verrouillage/reprise/batterie, Health Connect permissions/révocation/import, Google, Garmin avec deux comptes et montre, achats testeurs/RTDN, annonces de test/UMP, suppression/export ; déclarations Play et textes légaux à valider.
- Relire l'ensemble des tests et la CI exacte, confirmer les configurations Auth, les secrets révoqués et la restauration ; préparer seulement ensuite le feu vert de publication.

Migration/rollback : plan versionné, copie d'abord, sauvegarde restaurable et vérifiée ; ne pas rejouer le lot V1 ; ne pas rétrograder vers les deux RPC de confidentialité vulnérables pour un simple retour frontend. Les drapeaux ferment les nouvelles surfaces mais ne remplacent pas les contrôles serveur.

**Aucune fusion main, migration Supabase production, publication Netlify ou Google Play, activation d'achat/publicité réelle, ni envoi à des utilisateurs n'a été effectué.** La PR est un brouillon de correctifs à intégrer et valider, pas une autorisation de publier.
