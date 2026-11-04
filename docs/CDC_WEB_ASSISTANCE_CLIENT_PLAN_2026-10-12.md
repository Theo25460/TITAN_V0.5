# Formulaire Assistance web — plan d’implémentation

> Exécution native par Codex, test-driven-development et executing-plans ; une seule revue indépendante du lot final, pas d’agents d’implémentation.

**Goal :** préparer le formulaire /service avec aperçu volontaire, réception et reprise stable sous identité vérifiée.

**Architecture :** script public isolé, activation HTML désactivée par défaut, Auth partagée chargée à la demande. Époque d’identité et verrou de mutation protègent le brouillon/aperçu/référence ; API PR #46 inchangée.

**Tech Stack :** HTML/CSS/JavaScript existants, Supabase local 2.111.0, Node/Playwright Chromium.

**Spec :** docs/CDC_WEB_ASSISTANCE_CLIENT_SPEC_2026-10-12.md.

## Global Constraints

- data-support-enabled="false" reste la valeur versionnée ; aucune configuration réelle ni déploiement.
- Payload quatre champs précis ; texte 10–4 000 points /16 KiB, catégories six slugs fixes.
- Aucun contenu en stockage/log/analytics ; reprise en mémoire seulement, garde de fermeture.
- Backend, source sw.js, autres écrans, règles et images intacts ; 265 formulations et statuts du CDC préservés.

## Review Focus

- Identité changée pendant chaque attente : aucun brouillon/référence/POST attribué au compte suivant.
- Refresh du même propriétaire pendant envoi : conserver le verrou et ignorer répétitions.
- Réponse reçue puis retry raté/invalide : garder la référence et la preuve de réception.
- Unicode/HTML/paramètres URL : texte rendu littéralement, validation bornée et payload minimal.
- Reconnexion/reload/BFCache : pas de retry automatique ni réapparition du contenu privé précédent.

### Task 1 : Formulaire, session et reprise

**Files :** service.html, css/assistance.css, js/app/assistance.js ; tests/e2e/smoke.e2e.mjs.

**Interfaces :** conteneur #help-form[data-support-enabled], six boutons data-support-category ; session via initTitanSupabaseClient/auth.getSession/getUser/onAuthStateChange ; API figée dans la Spec.

- [x] Écrire les cas navigateur support form : absence de transmission lors de l’aperçu ; faux compte refusé ; 200/202 avec référence ; répétitions sous attente ; retry identique ; invalidation de compte ; erreur/quota/Unicode/clavier/offline/fermeture.
- [x] Construire le parent puis exécuter node --test --test-name-pattern='support form:' tests/e2e/smoke.e2e.mjs ; vérifier RED par assertions DOM/comportement, pas échec d’import.
- [x] Ajouter conteneur, boutons de catégories cachés et script versionné. Initialisation différée uniquement si enabled=true ; montage après getUser vérifié.
- [x] Implémenter états editing/preview/sending/uncertain/received, payload figé et UUID au premier POST, refus des changements d’identité et anciennes continuations, verrou immédiat et annonces hors aria-busy.
- [x] Implémenter réponses strictes, référence conservée, reprise explicite et erreurs bornées ; aucune reprise automatique. Effacement sur compte/pagehide et avertissement beforeunload en cas d’incertitude.
- [x] Exécuter ciblés puis pnpm verify et pnpm test:e2e ; tous passent, rendre 360/1280 et inspecter. Si défaut détecté : test RED du comportement puis correctif et suite verte.
- [x] Écrire HANDOFF avec preuves et limites ; git diff --check, staging précis des sept fichiers et commit.

### Task 2 : Livraison vérifiable

- [x] Revue indépendante unique read-only Sol 6.1 high sur parent/HEAD/arbre exacts ; reproduire/corriger les défauts qui empêchent une livraison sûre.
- [ ] Publier arbre identique et branche dédiée, PR cumulative depuis #46 ; aucune fusion/déploiement.
- [ ] Lire les trois logs CI du HEAD/base exacts ; Node/E2E, deux voies PostgreSQL16, suites/concurrence/gardes/transaction passent.
- [ ] PR prête après vérifications ; notes UX13/UX15/QA18 et propre claim livré dans CDC avec révision gardée ; relire 265 formulations/statuts/claims étrangers et styles.

Pré-flight : un composant d’interface intégré, pas d’interface de tâche parallèle. Choix et preuves seront consignés dans HANDOFF ; logs temporaires hors commit. Aucun écart produit à ce contrat nécessaire à ce stade.
