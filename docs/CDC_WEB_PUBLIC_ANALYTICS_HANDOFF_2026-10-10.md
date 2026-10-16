# Handoff — analytics des contenus publics CMS

Branche `codex/web-public-analytics-cdc`, suite de la PR #32 ouverte/non fusionnée. Base locale `b1bb6d78ad619050344100e9677239329441c29e`, parent publié `0f78b66179edcc4bb485211cde709516a47bebd8`, même arbre parent `de9c33651bfa539718d5b0bbf56ffcd3ff4c06d9`. Unique revue du code `2971e7d9d45a13e421200bb853e29783b04394f1` ; seul ajout ultérieur : couverture du clic Accueil pendant une mesure en attente et ce handoff.

## Résultat

L’ancien `titanTrackEvent` de `js/content.js` insérait directement des analytics malgré le refus et transmettait identité, slug, référent et UTM. Il délègue désormais au collecteur partagé ; absence ou exception de celui-ci retourne `false`, sans transport de secours. Le CMS et son rendu restent indépendants de la mesure.

`dynamic_page_opened` garde son nom et son unité historique : chaque contenu CMS publié chargé avec succès puis rendu, sans déduplication des ouvertures. Page absente ou lecture échouée : aucun événement. Toutes les propriétés du caller, même celles permises pour les autres événements, et l’attribution UTM sont retirées ; enveloppe minimale avec `metadata.consent`, `metadata.v = 300`, pathname sans paramètres et référent nul. Les anciennes lignes ne sont pas réécrites ; la différence de payload et la perte de ventilation par slug sont explicites dans le contrat.

Refus : aucun dispatch. Sans réponse : identité nulle et clé anonyme au transport HTTP, même avec un compte connecté. Accord : session capturée lorsque disponible. Le public hérite des protections consentement/préférence/auth/client/époque jusqu’au dernier dispatch réel du SDK. Aucun nouveau tracker, stockage ou replay.

Analytics `300.4` sur quatorze pages d’application et `dynamic-page` ; content `300.1` sur cette dernière. Le contrat couvre vingt-deux noms, soit vingt et un événements d’app et un nom public historique : [ANALYTICS_EVENTS_V300.md](ANALYTICS_EVENTS_V300.md). Les autres pages publiques ne sont pas déclarées auditées.

## Preuves et revue

- Socle frais : 130/130 tests. Avant toute correction de production : six nouvelles régressions unitaires rouges ; quatre nouveaux défauts navigateur et la première visite avec cache précédent rouges. Deux cas protecteurs CMS indisponible/mesure en attente étaient déjà verts.
- La première assertion de titre utilisait `innerText` et rencontrait le uppercase CSS ; passage à `textContent` avant la preuve RED confirmée. Ce défaut d’assertion n’est pas compté comme défaut produit. Rapport navigateur confirmé : sept cas, cinq échecs fonctionnels et deux succès.
- Vérification finale : `pnpm run verify` 136/136, build/audit sans erreur, seize avertissements SEO préexistants ; suite navigateur complète 92/92 ; `git diff --check` réussi.
- Vraie page publiée, caller/entrée historique/collecteur et SDK Supabase vendored ; seuls HTTP et auth sont synthétiques. CMS et analytics réels ne sont pas contactés. Cas de refus, absence de réponse avec compte connecté, accord minimal, retrait/restauration pendant préparation native du jeton, collector manquant, contenu absent/erreur et mesure lente/échouée.
- PWA : anciens caches analytics300.0/300.1/300.2/300.3 et content300.0 ; scripts actualisés dès la première visite en ligne. Les contrôles de cache des lots précédents restent présents.
- Unique revue indépendante GPT-6.1 Sol, effort high, sur b1bb6d78..2971e7d9 : aucun Critical/Important, un Minor de couverture. Le reviewer a exécuté 35/35 tests analytics et vérifié les logs et le diff sans mutation.
- Minor accepté : l’ancien test libérait la mesure avant de cliquer Accueil. Un cas distinct clique pendant que la promesse réelle reste non résolue, sans libérer sa frontière HTTP ; navigation vérifiée, 1/1 ciblé vert puis inclus dans la suite finale. Aucun changement de production demandé et aucune seconde revue.
- Publication conditionnée aux trois jobs verts de la CI du HEAD GitHub final, arbre identique au local. SHA, URL de PR et run final sont consignés dans la PR de cette branche et le [cahier](https://docs.google.com/document/d/1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M). La CI rejoue les deux voies SQL existantes sur répliques ; aucun test SQL local ni recette réelle revendiqués.

## Neuf comportements écartés : décisions de l’exécuteur

1. Autres surfaces publiques d’acquisition : suivi séparé maintenu ouvert. Ce lot corrige l’unique caller historique CMS trouvé dans le dépôt ; il n’ajoute pas de suivi à toutes les pages marketing. DATA09 reste partiel.
2. Consentement, validation de payload et prévention d’abus côté serveur : suite encore ouverte. Les RLS existantes restent compatibles, mais le filtre client n’empêche pas une insertion fabriquée hors du collecteur. Aucun durcissement SQL revendiqué.
3. Android, contrats natifs et régies : hors du patch, restent ouverts ; aucun contrat absent n’est inventé.
4. Dashboard DATA08 et rapprochement des historiques : restent ouverts. Suppression du slug acceptée pour réduire le payload, sans changer le compteur ni réécrire le passé. Un futur dashboard doit tenir compte de cette transition documentée.
5. Livraison globale exactement-une-fois : non garantie et non requise pour chaque ouverture. Pas de déduplication ONCE, replay automatique, queue ou ledger ; l’événement décrit l’usage, jamais une preuve comptable.
6. Paiements, droits Premium et transactions de production : inchangés, recette réelle encore ouverte. Les tests synthétiques analytics ne prouvent aucun paiement ni droit financier.
7. Assainissement HTML du CMS et correction générale du rendu : rendu existant conservé, audit CMS séparé toujours nécessaire. La revue a validé la frontière rendu/succès/absence avant mesure, sans conclure à un audit de sécurité de tout le contenu.
8. Identité et slug des lectures CMS : nécessaires au parcours existant et distincts des analytics. Les requêtes de contenu restent celles du client partagé ; la suppression d’identité/jeton concerne l’envoi analytics sans accord, pas une refonte du lecteur CMS.
9. Clients hors ligne et onglets exécutant déjà l’ancienne génération : versions nouvelles vérifiées sur navigation actualisée en ligne, aucune mise à jour rétroactive du code déjà exécuté ou des ressources réseau indisponibles. Cette limite reste explicite.

Aucun finding bloquant reporté. Trois PNG étrangers préservés et exclus : avatar_1 `6c86828561cda015dcac2cb9f2b95486fb080083826474def604c1093a52029b`, avatar_2 `591984a1f7a7722bf0ec9d3d3d33c32e067f85598d5373d60ef0f71f68ac2581`, mob_9 `d4e744f9bffa0430cce91e44207d023fc34b0d0f4052e27b9e85063e48838c2f`.

## Cahier et reprise

257 formulations conservées : 29[x], 21[~], 207[ ]. DATA07/DATA09 restent [~], DATA08 [ ]. WORK Play Console intact. Claim Codex libéré après lecture de la CI finale, sans fusion ni déploiement. Reprendre les exigences ouvertes ; le CDC global n’est pas terminé.

Retour arrière : retrait du patch et de ses versions de cache, sans migration ni donnée à restaurer. Cela rétablit l’ancienne insertion CMS et son défaut de consentement ; ce retour arrière ne constitue pas une garantie de confidentialité. Aucun prix/droit/paiement/récompense, Android, Play Console ou contenu CMS réel modifié. Livraison réversible couverte par l’autonomie du cahier.
