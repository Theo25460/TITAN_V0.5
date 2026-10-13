# Handoff — attribution du checkout TITAN+

Branche `codex/web-checkout-attribution-cdc`, suite de la PR #30 ouverte et non fusionnée. Base locale `85dbb76ed213420ac57ecf84b7723fff2cf12b08`, parent publié `7e00fecb7c73a3ec9f4543aa36f547b8b83161bc`, même arbre `e2ce0308539ac2ab1c0629a8ad50b522682c2a31`. Code relu `10b8219f20eeda0f1f16fef0e0500ee106daaf8a` ; les compléments après revue portent seulement sur tests et documentation.

## Correction

Le timestamp global v1 était créé avant de savoir si le paiement pouvait être ouvert, partagé entre comptes, puis supprimé avant l’ack de mesure. Le marqueur v2 appartient au compte et au navigateur ; le helper doit retourner strictement `true` dans le contexte initial avant sa création. La v1 sans propriétaire est supprimée sans conversion attribuée. Version/propriétaire/instant/notification sont validés ; marqueurs futurs, malformés ou vieux d’au moins trois jours rejetés. Le marqueur d’un autre compte n’est pas consommé.

Le helper garde compte, client et époque de transition jusqu’à l’appel SDK ; A→B→A invalide une attente. L’Atelier garde ces mêmes éléments et l’ordre des lectures RPC/profil. Seul un statut actif frais du serveur permet la confirmation et la mesure : le marqueur ne donne aucun droit. La notification est donnée une fois par marqueur, indépendamment du consentement. Le refus observé à la confirmation ne transmet rien et supprime le marqueur.

Après échec analytics, une nouvelle confirmation fraîche peut retenter la mesure jusqu’à expiration. Un ack accepté ne consomme que le contenu exact encore courant ; il n’efface pas un checkout plus récent. Les tentatives simultanées de ce compte dans l’onglet sont regroupées. `premium_checkout_started` garde son sens historique de clic d’intention, y compris en cas d’ouverture impossible. Noms d’événements, SDK, schéma, RPC, droits, prix et récompenses inchangés. Main 300.2 sur treize pages ; Atelier 300.5. Contrat détaillé : [ANALYTICS_EVENTS_V300.md](ANALYTICS_EVENTS_V300.md).

## Vérification et revue

- Socle frais : 123/123 tests. Huit scénarios checkout sur ancien code : six échecs attendus reproduisent les défauts, deux protègent des comportements déjà corrects. Après correction : 8/8.
- Premier passage complet : pnpm verify 123/123, build réussi, audit sans erreur avec seize avertissements SEO préexistants ; 69/69 E2E. Assertions ack/PWA renforcées : 9/9 ciblés.
- Unique revue indépendante GPT-6.1 Sol sur 85dbb76..10b8219 : zéro Critical/Important, deux Minor. Le reviewer a relu le contexte et exécuté 9/9 ciblés. Son premier essai sans le chemin Chromium échouait avant les tests ; l’essai avec le chemin explicite est vert.
- Deux recommandations acceptées : ordre des réponses RPC/profil de compatibilité et échec du SDK configuré. Ajout de deux scénarios paramétrés : SDK load rejeté et open throws ; ancien résultat actif après résultat Free plus récent, par RPC puis profil. Le test initial d’ouverture impossible est renommé pour préciser la configuration absente. UI, helper, Atelier, collecteur et SDK Supabase réels ; seules frontières auth/HTTP/serveur/Paddle SDK simulées. Aucune seconde revue.
- Après ces compléments : 11/11 checkout/PWA ciblés, pnpm verify final 123/123 avec build/audit réussis, pnpm test:e2e final 71/71 et git diff --check réussi. Attribution entre comptes testée à 360/1280 px ; PWA chargée avec les anciennes générations main 300.0/300.1 et Atelier 300.0/300.4 en cache.
- CI du dernier HEAD GitHub obligatoire avant passage de la PR en ready. SHA/arbre identique et résultats des trois jobs sont consignés dans la PR de cette branche et le [cahier](https://docs.google.com/document/d/1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M) après lecture. Les résultats du parent ne valent pas validation du nouveau livrable. Aucune recette SQL locale ou paiement réel revendiqué ; la CI rejoue les deux voies SQL existantes sur répliques vides.

## Onze limites examinées : décisions de l’exécuteur

Chaque ligne « Declined to judge » de la revue a une décision explicite :

1. Transaction précise et checkout abandonné : reste ouvert. Le marqueur ne relie pas une transaction à l’abonnement ; un autre changement de statut actif peut le satisfaire. DATA07 reste partiel, aucun chiffre comptable certifié.
2. Paiement réel et webhook de production : recette encore ouverte. Aucun débit, compte réel ou mutation de droits testé dans ce lot.
3. Appareils/onglets multiples et ack perdu après commit : limite acceptée et documentée. Le lock est local à l’onglet ; aucune garantie globale exactement-une-fois. Une réponse perdue peut produire un doublon.
4. Déduplication premium_activated et renouvellements : contrat historique conservé, mémoire locale bornée et sans ledger durable. Ce correctif ne mesure pas chaque renouvellement ; un nouveau marqueur peut rester jusqu’à TTL. À compléter sous DATA07.
5. Overlay déjà ouvert lors d’un changement ultérieur de compte : reste une suite significative pour appareil partagé. La garde protège l’invocation après attente ; elle ne ferme pas un overlay déjà ouvert. Aucun transfert de droits par le navigateur.
6. Échec SDK asynchrone après invocation : limite acceptée. Retour true signifie appel open revenu, pas écran chargé ni paiement terminé ; documentation explicite, aucun succès financier revendiqué.
7. Historique complet de révocation de consentement : différé explicitement. Refus observé à la confirmation/au retour supprime le marqueur ; refus→accord entre confirmations ou pendant un ack échoué peut permettre une nouvelle tentative sous accord. Le collecteur continue de garder les attentes pré-dispatch. La suppression persistante après toute révocation passée nécessite un chantier dédié ; la limite est ajoutée au contrat, sans garantie générale de non-reprise.
8. Whitelist serveur, suivi public et dashboard : restent ouverts dans leurs chantiers ; aucun filtre client présenté comme garantie serveur. DATA09 partiel, DATA08 ouvert.
9. Mutations cosmétiques avec gardes owner-only : hors de cette correction d’attribution ; durcissement des transitions à poursuivre séparément. Les achats/équipements existants et leurs vérifications sont conservés.
10. Trois PNG étrangers : préservés, hashes contrôlés, jamais ajoutés au patch.
11. Déploiement et propagation du cache en production : non effectués. Le test valide la PWA construite avec un ancien cache synthétique ; recette déployée et audit global Astra maximal restent requis avant le déploiement majeur.

Les recommandations de tests ne sont pas écartées : elles sont intégrées. Aucun finding bloquant reporté.

## Cahier et reprise

257 formulations préservées, dont les dix ajouts sources/activité quotidienne : 29 [x], 21 [~], 207 [ ]. DATA07/DATA09 restent [~] ; le chantier WORK Play Console est conservé. Le claim Codex est libéré seulement après lecture de la CI du HEAD final. Reprendre ensuite les exigences ouvertes du cahier, dont conversion financière complète, consentement révoqué, suivi public et dashboard, sans marquer le CDC global terminé.

Trois PNG étrangers conservés et exclus : avatar_1 `6c86828561cda015dcac2cb9f2b95486fb080083826474def604c1093a52029b`, avatar_2 `591984a1f7a7722bf0ec9d3d3d33c32e067f85598d5373d60ef0f71f68ac2581`, mob_9 `d4e744f9bffa0430cce91e44207d023fc34b0d0f4052e27b9e85063e48838c2f`.

Retour arrière : retirer ce patch et ses versions de cache ; aucune migration ni donnée à restaurer. Aucune fusion, production, action Android/Play Console ou connexion d’activité. Les PR précédentes restent ouvertes. Ce lot réversible relève de l’autonomie autorisée dans le cahier ; la livraison de la PR n’est pas une autorisation de déployer.
