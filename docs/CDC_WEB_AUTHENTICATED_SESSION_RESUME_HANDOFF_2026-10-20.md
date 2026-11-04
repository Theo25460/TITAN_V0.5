# Reprise authentifiée d’une séance en attente — 20 octobre 2026

Priorité ACT08 / QA08 / UX10. Base figée PR109 `02b30e2cfa0d1a833282e94f7e78015747ee0488`. Ce lot ajoute une preuve de parcours manquante ; aucune régression produit n’a été constatée avec cette recette, donc aucun code produit n’est modifié. Trois fichiers : suite dédiée, son raccordement test:e2e, cette passation.

## Recette automatisée

Le vrai SDK Supabase local2.111.0 relit une session synthétique depuis la clé persistée configurée en production. Aucun remplacement de titanClient, de getSession, du formulaire, de logActivity, de la file ou de la synchronisation. Le vrai formulaire running5km/30min écrit dans IndexedDB avant le récapitulatif ; les requêtes HTTP de l’application portent le jeton de cette session.

Six cas, largeurs360 et1280, chacun comportant navigation au journal puis vrai rechargement avant reprise :

- Serveur de confirmation indisponible : HTTP interrompu avant enregistrement distant.
- Accusé perdu après enregistrement distant : le serveur synthétique conserve la séance mais coupe la réponse.
- Navigateur réellement hors ligne via BrowserContext.setOffline : formulaire déjà chargé utilisable, sauvegarde locale et envoi échoué ; réseau rétabli pour naviguer/recharger, confirmation encore interrompue jusqu’au retry explicite.

Les XP/crédits ne sont pas crédités provisoirement. Propriétaire et identifiant restent stables après les nouveaux documents ; une seule ligne est affichée malgré la réconciliation cloud/file. Le bouton Réessayer envoie exactement le même payload complet. Reçu accepté : file vide, séance confirmée, compteurs autoritaires307XP/35crédits, une seule séance durable. Dernier rechargement : l’historique confirmé revient sans entrée supplémentaire.

La CSP exacte est appliquée aux documents. Toutes les requêtes Supabase sont interceptées et tous les autres réseaux externes bloqués. Le serveur synthétique ne permet qu’un crédit pour cette séance : cette partie sert à vérifier l’identité/payload transmis par le navigateur, pas à prouver l’idempotence du vrai serveur. Les contrats natifs SQL concurrents hérités fournissent séparément cette preuve serveur.

## Preuves et limites

Six cas verts. Sensibilité : une mutation jetable supprimant l’entrée durable après échec HTTP fait échouer le cas serveur indisponible ; original restauré puis suite relancée. Le contrat de registre générique échoue avant raccordement, puis passe après ajout. verify278/278, build/audit/garde verts avec16 avertissements éditoriaux préexistants. Revue indépendante bornée sans Critical/Important ; deux précisions de formulation intégrées (XP/crédits testés, un seul crédit synthétique pour cette séance). CI du HEAD publié à lire avant PR prête.

Pas de compte réel, de mot de passe, de login interactif, de renouvellement/expiration de jeton, de bascule vers un autre compte, de serveur Supabase réel ni d’appareil installé. Le service worker est désactivé ; cette recette ne prouve donc pas un rechargement PWA entièrement hors ligne. Les RPC annexes non nécessaires à cette recette sont déclarées indisponibles ; aucune campagne ni économie n’est simulée comme livrée. Aucun SDK détourné pour forcer l’état connecté après chargement.

ACT08, QA08 et UX10 progressent dans leurs réserves de reprise web automatisée, restent partiels pour comptes/appareils réels et périmètre transversal. Les23migrations héritées restent non appliquées en production. Profil/smoke, SQL, règles RPG/économie et Android intacts. Aucun merge main ni déploiement.

Prochain macro-bloc : compréhension des évolutions de niveau/record/objectif (ACT05), après vérification des claims, ou recette appareil/compte réel lorsque les moyens seront disponibles ; ne pas répéter cette couverture automatique sans défaut nouveau.
