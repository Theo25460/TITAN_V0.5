# Plan d’exécution — UX14 Communauté

1. Vérifier le parent, isoler le travail et déclarer le chantier natif. Baseline : 158 tests unitaires réussis ; fichiers étrangers exclus.
2. Écrire puis exécuter les tests de minimisation et les scénarios navigateur avant l’implémentation ; conserver une preuve RED.
3. Implémenter le constructeur pur, extraire le montage Assistance avec nettoyage et garde de contexte, ajouter le dialogue volontaire et l’entrée d’erreur.
4. Garder les indicateurs désactivés ; versionner les ressources HTML ; vérifier l’aperçu littéral, les limites totales et les cas d’identité/incertitude.
5. Exécuter tests unitaires, navigateur, build/audit et inspection visuelle mobile/desktop. Une seule revue indépendante finale ; traiter ses défauts éventuels et refaire les vérifications pertinentes.
6. Publier une PR isolée, vérifier la CI sur son HEAD exact, écrire la passation puis mettre à jour le CDC avec contrôle de révision et relecture exhaustive des 307 tâches. Laisser la PR ouverte, sans fusion ni déploiement.

Fichiers réservés : `js/core/support-diagnostics.js`, `js/app/support-report.js`, `js/app/assistance.js`, `js/app/communaute.js`, `social.html`, `service.html`, `css/assistance.css`, `tests/support-diagnostics.test.mjs`, `tests/e2e/smoke.e2e.mjs`, `package.json`, ce plan, la spécification et la passation du même lot.
