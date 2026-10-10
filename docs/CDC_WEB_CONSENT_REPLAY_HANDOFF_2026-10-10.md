# Handoff — consentement et reprise analytics

Branche `codex/web-consent-replay-cdc`, suite de la PR #31 ouverte/non fusionnée. Base locale `5e1ddf56eac282384c6dce3f79e4a7fa58a96b3c`, parent publié `c4fc12704b4630d20b3ca677a7b9666598b83652`, même arbre `10fd046d87ae25a4668f17119711377c1bbebf13`. Revue unique du code `cbad1819335fc6695b79439cee4a82e4237dee9f`. Corrections de revue vérifiées au commit `f24e2f269d4f40cc7a3c4fbe6d299105792e6659` ; aucune seconde revue. Ce dernier ajout est documentaire.

## Résultat

Un refus puis un nouvel accord ne réanime plus une ancienne conversion checkout en attente. Chaque choix possède une révision locale distincte, même au même milliseconde. Le receipt v3 capture la préférence avant l’attente du SDK ; le collecteur compare la préférence persistée jusqu’au dispatch HTTP réel. Les cas entre confirmations, pendant SDK/ack, après navigation et dans un autre onglet sont couverts. Une nouvelle souscription sous le nouvel accord reste mesurable. Le marqueur v2 conserve sa confirmation fonctionnelle sans inventer de consentement passé.

Une préférence illisible ou malformée interdit l’envoi. Un choix non enregistré vaut en mémoire tant que sa valeur persistée de départ reste identique ; une nouvelle préférence enregistrée ailleurs prend le dessus. `setConsent` retourne son résultat de persistance. Profil avertit sur échec ; inscription et onboarding montrent l’avertissement avant navigation automatique et laissent un lien Continuer. Le refus reste effectif dans la page, mais ne peut être garanti après navigation/rechargement si l’ancien accord reste lisible. Aucune seconde mémoire persistante n’est créée.

Les mutations de receipt emploient le même Web Lock exclusif par compte entre onglets actualisés, avec gardes compte/époque et contenu exact. Aucune attente auth/HTTP ne tient ce verrou. Une écriture de notification impossible ne supprime pas la confirmation du serveur : garde en mémoire pour ce marqueur dans cette page. Sans Web Locks, paiement et droits restent disponibles ; confirmation d’un receipt existant en lecture seule, sans mutation ni mesure d’activation. Une ancienne version ouverte ne participe pas au verrou.

Événements, unité du clic checkout, metadata.v300, SDK, API/table/grants/RLS, droits, prix et récompenses inchangés. Analytics300.3 sur quatorze pages ; Atelier300.6 ; Profil/Auth300.2 ; Onboarding300.1. Main300.2 inchangé. Contrat : [ANALYTICS_EVENTS_V300.md](ANALYTICS_EVENTS_V300.md).

## Preuves et revue

- Socle frais 123/123 tests. Cinq nouveaux scénarios navigateur réellement rouges sur le parent, après réparation de leur préparation de compte ; stockage/JSON/formes/dispatch reproduits séparément en unitaires. Puis 128/128 tests et 76/76 E2E sur l’implémentation initiale.
- Binaire Chromium conservé tronqué : les premiers essais échouaient avant les tests et ne constituent pas une preuve RED. Le navigateur restauré exécute les suites. L’installation globale signalait un échec FFmpeg ; le headless-shell complet fonctionne. Aucun affaiblissement d’assertions.
- Unique revue indépendante GPT-6.1 Sol, effort high : zéro Critical, quatre Important, zéro Minor. Le reviewer a exécuté 27/27 tests analytics et reproduit les défauts complémentaires en VM. Son verdict With fixes porte sur cbad181, pas sur les corrections ultérieures.
- Important 1 corrigé : un accord en mémoire masquait un refus persisté ailleurs. Deux nouveaux cas actual SDK rouges puis 29/29 analytics verts ; test supplémentaire avec un vrai second onglet. Lecture indisponible avec accord en mémoire également refusée.
- Important 2 corrigé : Profil promettait un succès malgré un échec de persistance. Test réel Profil rouge puis vert ; inscription avec/sans session et onboarding affichent désormais le risque avant de quitter la page. Ces deux nouveaux parcours échouent sur les scripts initiaux servis dans le build.
- Important 3 corrigé : l’échec d’écriture de `notified` supprimait le toast fonctionnel. Test réel rouge puis vert, notification unique dans la page et deux retries analytics légitimes après échec d’ack.
- Important 4 corrigé : la suppression avant dispatch pouvait effacer un nouveau receipt. Reproduction rouge par remplacement à la comparaison de préférence, puis verte. Verrou partagé appliqué à création, notification, rejet et consommation ; tests avec verrou réellement tenu dans un autre onglet, ainsi que navigateur sans verrou. Les tests supplémentaires de verrou sur ancien code n’ont pas tous fourni un rapport complet ; aucune preuve de trois échecs complets n’est revendiquée à partir de ce log.
- Vérification finale après toutes corrections : `pnpm run verify` 130/130, build/audit sans erreur, seize avertissements SEO préexistants ; `pnpm run test:e2e` 85/85 ; `git diff --check` réussi. Tests UI/helper/Atelier/SDK Supabase réels, frontières auth/HTTP/serveur/Paddle SDK simulées. La préparation attend les vraies opérations de verrou, sans remplacer leur comportement.
- PWA : anciens caches analytics300.0/300.1/300.2, Atelier300.0/300.4/300.5, Profil/Auth300.0/300.1 et Onboarding300.0 ; vérification de la première visite des pages actualisées.
- Publication conditionnée aux trois jobs verts de la CI du HEAD GitHub final, avec arbre identique au local. SHA, URL de PR et run final sont consignés dans la PR de cette branche et le [cahier](https://docs.google.com/document/d/1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M). La CI rejoue les deux voies SQL existantes sur répliques vides ; aucun test SQL local ou paiement réel revendiqué.

## Cinq limites écartées : décisions de l’exécuteur

1. Révocation durable après écriture impossible et destruction de page : impossibilité acceptée sans second stockage. L’utilisateur est désormais averti dans les trois callers ; cette limite ne justifie plus un faux succès. Le refus reste effectif en mémoire et l’absence de lecture refuse l’envoi.
2. Ack perdu, duplication entre onglets et renouvellements : restent ouverts. Le verrou protège les mutations de marqueur, pas une transaction analytics atomique avec le serveur. Déduplication historique une fois par clé locale, pas ledger financier ou par renouvellement. DATA07 reste partiel.
3. Anciennes versions ouvertes, suivi public historique, Android, appareils multiples et dashboard DATA08 : restent ouverts, documentés sans prétendre à une couverture globale. La garantie de receipt concerne des onglets actualisés coopérant au même verrou.
4. Paiement réel, règlement Paddle, webhook et autorisation financière : recette encore ouverte. Aucun débit ni compte/donnée réelle utilisé ; les droits restent confirmés par le serveur.
5. Trois PNG modifiés étrangers : préservés, contrôlés et exclus du patch.

Aucun finding bloquant reporté. Si le stockage de notification reste indisponible après rechargement, le toast peut se répéter. L’overlay déjà ouvert et les erreurs SDK après invocation restent des suites de la PR #31 ; le helper true indique une invocation revenue, pas un règlement.

## Cahier et reprise

257 formulations conservées : 29[x], 21[~], 207[ ]. DATA07/DATA09 restent [~], DATA08 [ ]. WORK Play Console intact. Claim Codex libéré après lecture de la CI finale, sans fusion ni déploiement. Reprendre ensuite les exigences ouvertes, dont conversion financière complète, suivi public et dashboard. Le CDC global n’est pas terminé.

PNG étrangers conservés : avatar_1 `6c86828561cda015dcac2cb9f2b95486fb080083826474def604c1093a52029b`, avatar_2 `591984a1f7a7722bf0ec9d3d3d33c32e067f85598d5373d60ef0f71f68ac2581`, mob_9 `d4e744f9bffa0430cce91e44207d023fc34b0d0f4052e27b9e85063e48838c2f`.

Retour arrière : retirer ce patch et ses références de cache ; aucune migration/donnée à restaurer. Les anciens receipts v3 ne sont plus lus par l’ancien Atelier ; un éventuel rollback n’invente pas leur attribution. Aucune fusion, production, Android, Play Console ou connexion d’activité. La livraison réversible relève de l’autonomie autorisée au cahier.
