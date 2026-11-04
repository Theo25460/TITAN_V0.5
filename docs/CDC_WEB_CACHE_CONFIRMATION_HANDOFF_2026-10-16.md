# Confirmation du cache Profil — contexte d’ouverture

Lot SEC01/QA08, parent PR #63 ouverte/prête/non fusionnée : HEAD `867dc414cfcd92970a60b8dd75b11e4fe25d4ec0`, arbre `b313e63663ff9b3252f0f4b81afbe82b5ecb0af1`. Branche isolée ; réservation du cahier des charges avant modification.

## Défaut et correction

« Vider le cache » ouvrait une confirmation sans capturer de contexte. Une fenêtre ouverte sous A pouvait donc appeler le helper global après passage sous B puis recharger B. Les ouvertures répétées créaient plusieurs fenêtres ; un helper absent était ignoré et le rechargement donnait l’apparence d’une réussite. Une exception de stockage était affichée brute.

La confirmation capture maintenant le contexte Profil et le mode découverte à son ouverture. Son action synchrone vérifie encore propriétaire/client/epoch, identité du contexte observé et absence de transition active avant toute purge. Un changement observé A→B→A invalide aussi la fenêtre initiale. Un changement de propriétaire sans événement est détecté par comparaison directe à l’envoi.

Une seule fenêtre par contexte est réservée avant son ouverture. Annulation/fermeture libère seulement sa propre réservation ; fermer une fenêtre ancienne ne libère pas celle du nouveau compte. Une transition active empêche l’ouverture. L’action obsolète reste ouverte avec une erreur locale et peut être fermée ; elle ne purge et ne recharge pas.

Helper indisponible ou exception : message générique, aucun rechargement automatique, retry explicite par le bouton existant. Après succès, la purge et le rechargement restent synchrones et successifs, sans nouvel await. Le helper `js/training-store.js` et ses exclusions ne changent pas.

## Vérification

- Baseline `pnpm verify` :183 tests réussis, build/audit sans erreur ;16 avertissements de métadonnées préexistants.
- RED initial :9 échecs attendus et deux succès. RED final contre le module parent dans dist :12 échecs attendus/deux succès sur14 cas, par assertions de purge/rechargement/modal/message ; puis reconstruction complète.
- Scénarios : succès membre et découverte ; changement propriétaire silencieux/observé, client, epoch, A→B→A observé à epoch constant, transition active et découverte ; fenêtres répétées/annulation/réouverture ; panne/retry ; ancienne fermeture face à une réservation B ; ouverture pendant transition ; helper absent.
- Vrai écran Profil, confirmation du shell et helper de purge. Clés localStorage/sessionStorage synthétiques ; vérification des exclusions historiques des brouillons, séances en attente et identité découverte. Rechargement réel vers une réponse HTML inerte de même origine pour empêcher le démarrage de recréer des clés et masquer une purge. Auth/lectures distantes simulées par la fixture existante ; trafic tiers bloqué, aucune donnée réelle.
- GREEN final :86/86 ciblés (14 nouveaux et72 existants), zéro échec/cancelled/skipped ; `pnpm verify`183/183, build/audit sans erreur et16 avertissements préexistants. Revue indépendante et CI du HEAD publié consignées dans la PR et le cahier avant passage en prête pour revue.
- Profil300.8 ; anciencache300.7 ajouté à la matrice PWA, générations antérieures conservées.

## Limites et périmètre

La purge n’est pas transactionnelle : si le navigateur refuse le stockage après quelques suppressions, le message ne signifie pas que tout a été restauré. Le retry ne promet pas de rollback. Aucune nouvelle garantie inter-onglets, aucun verrou global ni détection d’un aller-retour entièrement silencieux restauré avant observation. Le contrôle porte sur le contexte local du Profil, sans nouvelle lecture Auth serveur.

Les clés Auth persistées font déjà partie de la purge existante ; le contrat et le texte préexistant ne sont pas redéfinis. Pas de nouvelle invalidation de JWT, suppression serveur ou appel de déconnexion. Le contenu des files IndexedDB n’est pas modifié par ce lot ; les tests nouveaux vérifient les clés conservées par le helper, pas une purge exhaustive ou un cycle réel de resynchronisation.

SEC01/QA08 restent partiels. Aucun changement du bouton Déconnexion, suppression de compte, exports, carte publique, SQL/backend, Android, claims étrangers ou images. Aucune fusion, mise en production ou manipulation de compte/provider réel.
