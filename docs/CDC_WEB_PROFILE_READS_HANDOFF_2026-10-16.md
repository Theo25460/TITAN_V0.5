# Profil — isolation des lectures de carte publique et titres

Lot SEC01/QA08. Parent PR #60, HEAD publié `a5a4ce02bbb9cede7ed93d346bf2987f884ff2f2`, arbre `635a81ad749931bfde2743fe3c29850f9643876e`. Travail dans un worktree distinct ; l’image avatar_9.png modifiée dans le checkout initial n’appartient pas à ce lot.

## Problème et comportement

La carte publique, les titres d’expédition, le marqueur RPC indisponible et le verrou de chargement étaient communs à toute la durée de vie de la page. Une réponse A pouvait rester visible sous B ; un chargement A en attente empêchait B de démarrer. Les deux RPC consultaient aussi la session SDK indépendamment, sans bearer fixé.

Chaque contexte de lecture est désormais lié au propriétaire, à l’instance de client et à l’epoch public. Une transition invalide immédiatement les données visibles et le chargement ; un changement observé au prochain démarrage reconstruit le contexte. Le nouveau compte démarre ses propres lectures sans attendre les anciennes. Les réponses, erreurs et finally d’un ancien job ne modifient plus l’état courant.

Une session du propriétaire est requise avant les deux RPC. Son bearer est fixé sur les vrais builders SDK via setHeader. La session est relue avant d’appliquer les résultats, pour bloquer un rollover silencieux. Une erreur courante garde le message existant et la reprise existante au prochain rafraîchissement. Un résultat partiel valide (titres malgré erreur carte) reste affichable. Les timers des deux lectures bornées à huit secondes sont libérés après résolution.

## Vérification

- Baseline : pnpm verify, 183 tests réussis, build/audit sans erreur, 16 avertissements préexistants.
- Premier essai E2E bloqué par Chromium absent après nettoyage de l’environnement : ce résultat n’est pas une preuve RED. Installation de la version Playwright verrouillée, puis rejeu.
- RED réel : huit échecs attendus et deux positifs sur dix scénarios. État A encore affiché ; seules deux requêtes au lieu de quatre pendant la bascule ; seconde requête sous bearer B lors du rollover.
- Les fixtures utilisent le vrai builder/transport SDK, intercepté au niveau HTTP. Elles lisent les deux Authorization transmis et les liens/titres rendus. Comptes et tokens synthétiques, trafic tiers coupé, erreurs JavaScript contrôlées.
- Les anciennes fixtures d’export arment désormais leur attente/rollover après les lectures initiales de Profil. Le premier contrôle élargi avait trois échecs de préparation (attente de session capturée par ces lectures ; bascule avant l’export) ; les assertions produit et le transport d’export restent intacts.
- Ciblage final : dix lectures, quatorze exports, onze radios Profil et un parcours de cache PWA. Résultat final/CI et revue indépendante consignés dans la PR avant passage en prête.
- Profil 300.5 ; génération précédente 300.4 ajoutée au test PWA, autres générations conservées.

Scénarios : succès courant et bearer des deux RPC ; A pending puis B charge et A répond tard ; cache A retiré en B ; découverte sans titres hérités ; nouvel epoch ; client remplacé ; A→B→A avec ancienne erreur PGRST202 ; session initiale étrangère ; rollover silencieux ; panne courante et reprise avec titres partiels.

## Périmètre et limites

Ce lot modifie les lectures uniquement. Les mutations de carte publique (saveCard et ses consommateurs) ne sont pas sécurisées par ces gardes de lecture : leur isolation doit faire l’objet d’un lot distinct. Export JSON/CSV, suppression de compte, règles/économie, SQL/backend et providers réels sont inchangés.

Les requêtes déjà parties ne sont pas annulées. L’epoch et les changements observés empêchent les retours A→B→A ; un aller-retour entièrement silencieux restauré avant chaque observation n’est pas détectable. Le timeout de huit secondes vise les RPC, pas l’attente Auth préalable. La reprise après erreur reste celle de la page : pas de nouveau bouton, de polling ni de changement du cache serveur. Ce lot ne clôture ni SEC01 ni QA08, ni l’audit global sécurité/accessibilité.

Contrats relus : `20261005220000_ascension_public_card.sql` (carte où user_id = auth.uid()), `20261005200000_ascension_social.sql` (titres liés à auth.uid()), wrapper RPC Communauté et sources SDK épinglées 2.111.0. Aucune nouvelle dépendance, collecte, journalisation de token ou mutation de données réelles. Aucune fusion ni mise en production.
