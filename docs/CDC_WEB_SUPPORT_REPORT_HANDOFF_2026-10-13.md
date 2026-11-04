# Passation — UX14, rapport volontaire Communauté

## Résultat remis

Une erreur exploitable de chargement de Communauté propose Assistance et, lorsque le déploiement l’autorise, un rapport volontaire. Le dialogue monte le même formulaire que `/service` : compte vérifié, description, aperçu littéral, confirmation explicite, contrat HTTP inchangé à quatre champs. Les diagnostics sont séparément consentis, visibles, retirables et minimisés sur une liste fermée. Ils sont ajoutés au message uniquement après ce choix. Le serveur de PR #46 reste inchangé.

Les envois simultanés sont bloqués. Une tentative incertaine conserve en mémoire son UUID et son message exact, diagnostics compris, et bloque la fermeture manuelle jusqu’à réception confirmée. Une reconnexion ne soumet rien. Une transition d’identité ferme et efface le formulaire ; le nettoyage retire événements et abonnement Auth et ignore les réponses tardives. Un dialogue fermé sans tentative peut être rouvert vide.

Le HTML livré garde `data-support-enabled="false"` dans Communauté et Assistance. Aucune activation, notification réelle, configuration de fournisseur, migration, fusion de main ou publication de site. Q-002 sur la conservation reste ouverte. UX14 reste `[~]` : autres écrans, captures et qualification complète en production hors périmètre. La déduplication ne couvre que le même rapport conservé en mémoire ; ne pas promettre une reprise après fermeture/rechargement.

## Références et isolation

- Branche : `codex/web-support-reports-cdc`, répertoire isolé `titan-support-reports`.
- Parent fonctionnel : PR #47, SHA publié `6d6c9d748d41a80ca9868b62dfc177db7bcd4781` ; parent local équivalent `805d58aa8e5314389f179af40fc6bae067b46b39`, arbre `c9abcfa0c59046b924894cb4c62c873cf8655757`.
- 13 fichiers réservés dans le plan. Aucun fichier SQL, backend, dépendance, service worker source, Android, paiement, économie, analytics, contenu juridique ou PNG étranger modifié.
- Cahier des charges natif : 307 tâches, dont les 42 ajouts juridiques conservés ; autres chantiers réservés intacts. La remise native consigne le numéro de PR, le HEAD publié et les preuves de CI sans refaire le document.

## Vérification locale

- Baseline : 158 tests unitaires réussis avant changement. RED : 12 tests diagnostics échouent avant le module ; le scénario navigateur d’ouverture échoue avant le bouton de rapport.
- `pnpm verify` : 170/170 tests réussis ; build avec 100 ressources hors ligne ; audit sans erreur, 16 avertissements préexistants.
- `pnpm test:e2e` : 221/221 tests réussis, zéro échec. 13 scénarios rapport ajoutés et 26 régressions du formulaire existant conservées.
- Consentement et retrait, aperçu sans HTML exécuté, limites totales, quatre champs, retry identique, fermeture pendant HTTP/incertitude, fermeture avant Auth, abonnements nettoyés, changements de compte durant Auth/HTTP, mismatch SDK silencieux, identité applicative silencieuse, hors ligne sans envoi automatique, accès anonyme et clavier 360/1280 px couverts.
- Captures d’aperçu mobile/desktop inspectées. Versions vérifiées dans le précache généré : assistance 300.1, Communauté 300.4, CSS Assistance 300.3, diagnostics/rapport 300.0. Indicateurs de déploiement désactivés et `git diff --check` vérifiés.
- Revue indépendante unique GPT-6.1 Sol sur `805d58a..c5850c2` : aucun défaut bloquant ou bug concret identifié, aucun correctif demandé. Le réviseur a vérifié les 12 tests diagnostics et le diff ; aucune seconde suite complète ou écriture distante. Seul cet enregistrement documentaire est ajouté après son avis.

La PR est remise prête uniquement après revue indépendante et succès des jobs Tests/build, Playwright et deux relectures SQL sur réplique vide, sur son HEAD exact. Les preuves publiées sont consignées dans sa description et dans le CDC natif ; la PR reste ouverte et non fusionnée.
