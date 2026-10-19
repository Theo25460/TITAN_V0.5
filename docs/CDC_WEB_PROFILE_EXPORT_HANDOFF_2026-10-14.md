# Export JSON du profil — isolation du compte

Lot SEC01/SEC03/QA08, repris le 15 octobre 2026 après suppression automatique du workspace local. Parent publié : PR #59, `98ac94efb1834d141a9aa67351c138fe07100a95`. La réservation Drive du 14 octobre reste le périmètre de référence. Le correctif non publié a été reconstruit, avec de nouvelles preuves exécutables ; les anciennes preuves locales ne sont pas revendiquées comme disponibles.

## Comportement corrigé

Un export réserve son opération avant le premier await, désactive son bouton et annonce sa préparation. Les doubles activations, y compris synthétiques, ne déclenchent qu’une requête. Le JSON conserve un snapshot des données de cet appareil pris au départ.

Chaque opération capture propriétaire, client et epoch de transition. Une réponse devenue obsolète ne produit aucun fichier et ne libère pas la réservation du compte suivant. Une session du même propriétaire est nécessaire avant la requête ; son bearer est fixé par `rpc(...).setHeader("Authorization", ...)`. Le champ `userId` de la réponse cloud doit correspondre au propriétaire capturé. Une seconde lecture de session précède toute livraison commencée en ligne, y compris le repli local après erreur serveur : un changement silencieux du SDK ne peut donc livrer le résultat sous un autre compte.

Une panne RPC sous session toujours valide conserve l’export local, avec l’avertissement explicite « Le fichier contient seulement les données de cet appareil. ». Le mode découverte garde son export local. L’export commencé hors ligne reste local et soumis au contexte public observé. Suppression de compte et CSV inchangés.

## Preuves locales de cette reprise

- Avant correction : 13 échecs attendus et un positif découverte sur 14 scénarios export. Exemples : quatre RPC au lieu d’un ; nom modifié pendant l’attente présent dans le fichier ; livraison après bascule ; absence d’avertissement local.
- Après correction : 14 scénarios export, 11 radios Profil et la navigation PWA exécutés sur le site construit ; résultat final à recouper avec la CI du commit publié.
- `pnpm verify` : 183 tests unitaires, build et audit ; zéro erreur, 16 avertissements de métadonnées préexistants.
- Le transport RPC utilise le vrai builder du SDK épinglé 2.111.0, intercepté dans Chromium au niveau HTTP. Les assertions lisent le bearer réellement transmis et le JSON du Blob réellement téléchargé. Comptes/tokens synthétiques, aucun appel provider/base réelle. Les erreurs JavaScript de page sont également contrôlées.
- Ressource Profil 300.4 ; ancien cache 300.3 ajouté au test PWA en conservant les générations des autres modules.

Scénarios : réservation, snapshot, changement de propriétaire, retour A→B→A avec transition observée, remplacement client, epoch du même propriétaire, réponse obsolète face au nouvel export, session différée, session initiale étrangère, rollover SDK sur succès et erreur RPC, réponse cloud étrangère, panne serveur et découverte.

## Limites

La requête déjà partie n’est pas annulée ; son résultat est abandonné. Un aller-retour entièrement silencieux qui restaure toutes les valeurs avant chaque point d’observation n’est pas détectable par ces gardes. Le hors-ligne et le client absent ne consultent pas Auth. Ce lot ne prouve pas la sécurité globale des exports ni l’exhaustivité RGPD. SEC01/SEC03/QA08 restent partiels ; aucune clôture globale, fusion, mise en production ou migration.

La CI exacte et la revue indépendante sont consignées dans la PR et le cahier des charges après publication. Elles doivent réussir avant passage de la PR en prête.

## Références consultées

- Contrat existant : `sql/titan_privacy_account_rpc.sql`, `export_own_data`, `userId` lié à `auth.uid()`.
- Pattern existant : wrapper RPC de `js/app/communaute.js`.
- Sources locales SDK : PostgrestBuilder.setHeader et supabase-js fetchWithAuth (Authorization explicite conservée).
- Documentation officielle RPC : https://supabase.com/docs/reference/javascript/rpc
- Documentation setHeader liée depuis le menu officiel : https://docs-supabase.vercel.app/docs/reference/javascript/using-modifiers-setheader
- Index changelog relu le 15/10/2026 ; aucune rupture pertinente pour cette utilisation du SDK épinglé.
