# Passation — UX01, audit de navigation web

## Livraison

Inventaire des 42 pages utilisateur construites et des groupes de navigation principaux, Plus, secondaires, locaux et publics. Rapport, preuves JSON et outil de reproduction en lecture seule. Les ambiguïtés de vocabulaire sont séparées des faits de code/rendu. Un défaut clavier est confirmé sur les tablists Coaching/Atelier aux deux formats ; il est remis à UX09, sans correction implicite.

UX01 peut passer de `[ ]` à `[x]` pour l'audit du frontend actuel après revue et CI. UX04/UX06 restent ouverts, UX09/QA13 restent partiels. Aucun résultat de recherche utilisateurs, conformité d'accessibilité, Android ou publication en production revendiqué.

## Isolation

- Branche `codex/web-navigation-audit-cdc`, checkout lié `titan-support-reports` propre réutilisé avec branche distincte.
- Parent PR #49 ouvert/prêt/non fusionné, HEAD publié `0a1feec31867c7f1506cdf1f27498fb5331fe8f4`, parent local `1b5ecd063be571f7f80d2163631da608892b2ffb`, arbre identique `177b21b115d196f440a578a03c616197d1ef6d2f`.
- Quatre fichiers seulement : `tools/audit-navigation.mjs`, rapport `CDC_WEB_NAVIGATION_AUDIT_2026-10-13.md`, preuve `CDC_WEB_NAVIGATION_AUDIT_EVIDENCE_2026-10-13.json`, présente passation.
- Code produit/HTML/CSS, tests existants, schéma/backend/provider, analytics/assistance, récompenses/économie, Android/Play Console, images étrangères, main, fusions et déploiements inchangés. Captures/logs intermédiaires hors du diff. Aucun compte, token, CMS ou donnée réelle utilisé.

## Vérification locale

- Baseline `pnpm verify` exécutée dans ce lot : 183/183, build 101 ressources hors ligne, audit 0 erreur/16 avertissements existants.
- `node tools/audit-navigation.mjs` exécuté sur ce build : 44 HTML, 42 interfaces utilisateur, 118 observations à 360/1280 px, 29 groupes distincts, 307 formes de contrôles `main`, 113 hashes de sources et 184 marqueurs. Aucun débordement du document, exception de page ou ancre visible manquante ; 33 destinations dont le HTML canonique existe, toutes HTTP 200. Le fallback du serveur renvoyant 200, l'existence des fichiers est vérifiée indépendamment. Les 113 fichiers servis sont comparés aux sources épinglées. Ces résultats ne couvrent que les états simulés explicités dans le rapport.
- Quatre sondes ArrowRight conservent le focus sur le premier tab Coaching/Atelier ; il s'agit d'un constat d'audit, pas d'un correctif ni d'un test de régression RED/GREEN.
- Réseau tiers bloqué et service workers désactivés. Variantes membre synthétiques : profil avec Public, Communauté vide, Atelier avec catalogue vide, Coaching sportif/coach avec serveur indisponible. Aucun accès à un catalogue payant ou partage réel.
- Inspection visuelle ciblée à partir des captures : QG desktop, Profil/Prévoir/Coaching/Atelier mobile. Les bandes défilantes locales restent distinguées du débordement global.
- Ajustements de l'outil avant la dernière exécution : attente de présence du tabbar desktop caché, rafraîchissement Coaching par `online` conformément au composant existant, `reducedMotion` pour stabiliser les captures pendant le fade. Ce sont des défauts de sonde résolus, sans changement produit ni faux constat de défaut dans l'application. Source publiée épinglée et hashes élargis à tous les JS première partie et CSS racine.
- La suite E2E complète et SQL n'a pas été rejouée localement dans ce lot documentaire. Le parent #49 possède 230 E2E et les deux relectures SQL réussis ; ces résultats hérités ne remplacent pas la CI du nouveau HEAD. La remise exige la CI existante complète sur ce HEAD exact.

## Revue et remise

Revue indépendante unique GPT-6.1 Sol en lecture seule sur `1b5ecd0..97cda50` : aucun Critical ni Important, prête sous CI complète réussie. Le réviseur a reproduit intégralement la sonde finale : mêmes comptes, hashes et 33 fichiers cibles ; quatre ArrowRight identiques, captures Coaching/Atelier mobiles cohérentes. `node --check` et `git diff --check` réussis. Il n'a pas rejoué verify/E2E/SQL.

Les remarques de robustesse ont été traitées avant cette validation finale : source comparée aussi à `dist`, existence des cibles avant HEAD malgré fallback 200, réseau limité par origine exacte. Un point Minor reste documenté : l'instantané `/stats` desktop peut inclure ou non « Tous les sports » pendant la fin du rendu asynchrone ; ce contrôle est déjà recensé ailleurs, sans changement de groupe, destination ou conclusion. La sonde finale et ces précisions sont celles validées par le réviseur. Seul cet enregistrement documentaire est ajouté après son avis.

La PR sera remise prête seulement après revue et CI réussie ; SHA, PR et run exacts seront ajoutés à sa description et au CDC natif.

Les 307 formulations et 42 ajouts juridiques restent inchangés. Seul le statut UX01 est prévu `[ ]` → `[x]`, avec notes associées conservant les statuts UX06/UX09/QA13. Les claims WORK/Play Console et RPG01 restent intégralement préservés ; la réservation UX01 sera libérée après lecture native de contrôle.
