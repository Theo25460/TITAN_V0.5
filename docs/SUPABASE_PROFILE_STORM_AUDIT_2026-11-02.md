# Incident Supabase — contre-expertise des PR #129 / #130

## Diagnostic confirmé (lecture seule)

Sur la fenêtre de logs 24 h consultée : 85 428 `PROFILE_VERSION_CONFLICT` / SQLSTATE 40001, dans `titan_save_profile_state`, parmi environ 85 433 logs PostgreSQL. La session ou l’appareil d’origine n’est pas identifié. La fonction serveur verrouille la ligne et refuse correctement une version périmée : son contrôle de concurrence est conservé. Base mesurée : 28 421 267 octets (~27,1 Mio).

Le déploiement public Netlify reste `6ad9c1f1a3cb26a466c44bc5`. Les fichiers publics `js/state.js` (66 200 octets) et `js/main.js` (59 982 octets) sont identiques à la référence V1 `8102c176`. Le `sw.js` servi est généré par le build et n’est pas comparé comme un fichier source identique. Le hotfix reste strictement basé sur cette V1, sans embarquer les fonctions V1.1.

## Défauts du premier correctif et corrections

| Point vérifié | Constat / correction |
|---|---|
| Conflits | Le verrou en mémoire était perdu au rechargement, et un seul propriétaire pouvait être mémorisé. Circuit par compte, persistant sur l’appareil ; aucune réécriture automatique après conflit. |
| Sauvegardes identiques | Les appels d’interface pouvaient encore réémettre le même profil, y compris après succès. Comparaison canonique des seules préférences enregistrables, sans horodatages ni XP ; aucune RPC si rien n’a changé. |
| Rechargement | `forceCloud:false` ne signifiait pas local seulement : une lecture pouvait déclencher une nouvelle écriture. Chemin `localOnly` explicite et lectures simultanées fusionnées. |
| Réponses tardives | Propriétaire/client/transition capturés ; session vérifiée et jeton fixé sur la requête réelle. Une réponse A n’altère pas B. Version retournée conservée dans le cache sans effacer les nouvelles saisies. |
| Protection des préférences | Copie durable, distincte par compte et par contenu dès saveState, avant même le délai d’envoi, et avant remplacement cloud. Historique et XP restent serveur ; séances en attente dans leur file existante. Si la copie locale ne peut pas être écrite, envoi refusé. |
| Reprise | Carte de récupération : comparaison, téléchargement JSON, réapplication volontaire après une lecture cloud fraîche et CAS (comparaison à trois versions quand une base confirmée est connue, pour garder les champs modifiés indépendamment sur un autre appareil), retrait explicite après confirmation. Aucun remplacement aveugle du cloud. |
| Transport et refus permanents | Attentes 30–300 s, six échecs maximum ; pas de boucle immédiate, pas de tentative réseau hors ligne, reprise espacée au retour de connexion, pas de retry automatique sur refus d’autorisation/validation. Les copies restent accessibles. |
| RPC après sauvegarde | Lecture de progression superflue retirée : le reçu de profil fournit déjà XP/niveau/crédits, inchangés par une préférence. |
| Port V1.1 | Bloc de synchronisation et événement `history-updated` dupliqués dans la PR #130, corrigés. |
| Cache / livraison | Identifiant de cache changé dans les deux variantes, test correspondant actualisé. Les anciens onglets en mémoire doivent néanmoins être rechargés ; aucune purge distante de données. |

## Autres sources examinées

- Logs : hors conflit, un reset de connexion et une lecture d’une mauvaise relation `public.titan_feature_flags` ; rien n’indique une autre tempête d’erreurs sur la fenêtre observée. Les logs ne sont pas une mesure exhaustive de tous les appels réussis.
- Cron : 24 + 24 + 1 + 1 + 1 exécutions, toutes réussies, durée maximale observée 0,459 s. Aucun cron en échec répété ni modification de cron.
- Transactions : aucun deadlock dans le compteur consulté ; un instantané montrait une transaction inactive ouverte, sans preuve de boucle ou de blocage durable. Aucun processus tué en production.
- `pg_stat_statements` et statistiques de base remontent à novembre 2025. Les énormes compteurs cumulés de transactions/temporaire ne sont PAS des volumes du jour. La préparation PostgREST, la réplication et les introspections de catalogue existent dans les dépenses historiques ; aucune causalité CPU du jour chiffrée depuis ces seuls compteurs.
- Les cinq FK sans index, 22 policies permissives multiples et 65 index déclarés inutilisés ne démontrent pas la cause de cette tempête. Les cinq FK sont déjà traitées dans le lot V1.1 prévu. Aucun index/policy supprimé ou migration appliquée.
- Android V1.1 : mutations sans retry générique ; la sauvegarde des préférences contient une seule relecture/réapplication sur conflit (au plus deux écritures par action), pas de relance illimitée constatée. Les files de séances demeurent séparées.

## Validation

- Seize régressions exécutent le vrai module `state.js` : single-flight/réentrance, contenu identique, changement pendant envoi, version en cache, conflit persistant multi-comptes, reload, relectures fusionnées, jeton, réponse tardive, backoff borné, refus permanent, stockage refusé et récupération.
- Chromium avec vrai SDK Supabase et serveur HTTP simulé : 360/1280 px, 100 sauvegardes inchangées = 0 écriture, 100 sauvegardes après conflit = une seule écriture refusée, reload = aucune réécriture, reprise volontaire avec version fraîche et XP conservés.
- Parcours associés : timeout/503, accusé perdu, mode hors ligne et reprise de séance ; 9 tests navigateur réussis par variante, sans contacter les données réelles.
- `pnpm run verify` sur chaque variante : types, tests, build, audit et garde de livraison réussis ; avertissements éditoriaux existants conservés. Suites unitaires complètes : V1 349/349 ; port V1.1 467/467. La CI doit porter sur les têtes exactes publiées dans les PR.

## Mise en service à autoriser

1. Contrôler les SHAs et résultats CI des PR #129 et #130 ; la branche de développement doit contenir le correctif V1.1 sans remplacer ses autres travaux.
2. Recette humaine V1 sur backend isolé (ou compte de test production seulement après autorisation explicite) : deux appareils, modifications concurrentes, copie exportable, panne réseau, reprise, suppression/édition de séances et compte changé pendant une réponse.
3. Après autorisation explicite seulement : publier le `dist/` vérifié de #129 sur Netlify, jamais le bundle V1.1 pour ce hotfix. La CI conserve l’archive du frontend, sans déploiement. Utiliser le checkout V1 et sa configuration Netlify complète pour préserver les fonctions existantes ; le ZIP statique seul ne vaut pas validation du déploiement backend. Ne pas fusionner vers main pour contourner cette séparation.
4. Recharger les anciens onglets/appareils. Mesurer avant/après sur fenêtres égales : 40001/h, requêtes de sauvegarde, CPU et Disk I/O. Attendre un cycle de métriques suffisant ; objectif : quasi-zéro conflit répété, aucun RPC pour simple rendu/rechargement sans changement. Aucune réduction CPU/I/O de production n’est revendiquée avant publication.
5. Retour arrière frontend : déploiement Netlify précédent si nécessaire, avec connaissance que la boucle reviendrait ; ne jamais vider les caches de données, files ou copies de récupération. Aucun rollback SQL nécessaire.

Aucun déploiement, écriture SQL, migration, nettoyage de données, dépense ou changement Auth de production effectué par cette intervention.

## Environnement CI corrigé pendant la contre-expertise

La première CI a bloqué avant Playwright : `ubuntu-latest` avait changé vers Ubuntu 26.04, non pris en charge par Playwright 1.56.1. Le job navigateur est fixé sur Ubuntu 24.04, sans changer ni retirer ses tests. Le scan historique V1 a aussi retrouvé cinq contenus déjà explicitement classés dans la V1.1 : quatre exports de variables de signature (aucune valeur littérale) et un ancien fichier de métadonnées du scanner. Les quatre lignes ont été relues indépendamment ; seuls leurs hashes exacts et celui du fichier de métadonnées sont reconnus, sans modifier le détecteur ou exclure des répertoires. Les nouvelles raisons ne citent plus la syntaxe qui provoquait le faux positif. Les résultats finaux de la CI sont à lire sur les têtes des PR ; une ancienne exécution rouge n’est pas présentée comme verte.

Les copies et le circuit de profil survivent à la déconnexion/au nettoyage de cache comme les séances en attente. L’effacement explicite d’un propriétaire retire ses copies et invalide ses envois en vol ; une réponse tardive ne recrée pas ses données. La suppression d’un compte ne touche pas les copies d’un autre compte. Régressions sur le nettoyage réel et sur la réponse tardive après effacement.
