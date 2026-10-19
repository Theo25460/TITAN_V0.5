# Passation — DATA11, métadonnées Assistance web

## Résultat et périmètre

Le formulaire Assistance préparé et le rapport Communauté émettent trois noms stables dans le collecteur existant : `support_opened`, `support_category_selected`, `support_submission_result`. Ces compteurs exigent un consentement analytics explicite et restent anonymes, même avec un compte connecté : aucun identifiant utilisateur ni jeton de compte, attribution URL, texte de ticket, référence/UUID, adresse, diagnostic, fichier ou valeur sportive. Catégorie et résultat utilisent uniquement des listes fermées. Les événements antérieurs gardent leur comportement.

Ouverture = montage du formulaire avec client disponible, pas toutes les visites publiques d’Assistance. Le HTML garde le support désactivé : aucun SDK ou compteur ne se charge pour une page d’aide inactive. Catégorie = choix explicite. Résultat = tentative volontaire, sans compter des tickets uniques : un retry peut ajouter un compteur de tentative, sans transmettre la clé du ticket. La métrique hors ligne est abandonnée, sans stockage/replay. Le délai de traitement équipe reste ouvert, sans substituer le temps HTTP à la résolution du ticket. DATA11 reste `[~]`.

Le support ne dépend pas de la collecte : promesse lente, erreur ou absence du collecteur ne bloque ni contrôle, ni ticket, ni référence, ni navigation. Les changements de consentement/préférence/compte/client/génération/SDK pendant la préparation annulent le dispatch obsolète. Aucun tracker tiers ou boucle automatique ajouté. Le formulaire conserve son contrat HTTP à quatre champs et les protections de PR #48.

La migration `20261013074320_analytics_support_metadata_v300.sql`, créée avec `supabase migration new` (CLI 2.75.0), étend le prédicat de validation à trois noms sans modifier le contrat des vingt-deux noms préexistants. Une seule policy restrictive supplémentaire impose l’absence d’identité pour le support. Les policies de propriété et de lecture admin restent en place. Les tests SQL exécutent de vraies insertions anonymes/authentifiées et refusent les contenus, champs supplémentaires, valeurs/coercitions inconnues, pages/attributions et compteurs liés au compte ; réapplication et conservation des anciennes lignes sont aussi couvertes.

## Isolation et limites

- Branche `codex/web-support-analytics-cdc`, checkout lié propre `titan-support-reports` réutilisé avec une branche distincte.
- Parent PR #48 prêt/ouvert/non fusionné : publié `1258e4691d13076732e033e25b00305580693e49`, local `76c00dd69452c178db3f24b4d0095bec0dd46329`, arbre commun `9afd088aef3c0cac240bf088b12dfd466a1cf4b0`.
- Dix fichiers : collecteur/formulaire, `service.html`/`social.html`, tests unitaires/E2E, migration/test SQL et contrat/passation. Cache analytics 300.5 et Assistance 300.2 sur les deux consommateurs support ; anciens consommateurs analytics 300.4 compatibles. Service worker source et dépendances/lockfile inchangés.
- Aucun compte/donnée métier réel, base/provider/secret réel, migration en production, activation support, fusion de main, déploiement, Android, paiement, économie, suppression de compte, contenu juridique ou PNG étranger modifié. Q-002/conservation, délais agrégés équipe et qualification réelle restent ouverts.
- Le serveur vérifie un format et une déclaration de consentement ; il ne certifie ni le choix réel du navigateur ni l’exactitude d’un compteur fabriqué. Pas de garantie exactement-une-fois, de registre durable, de rétention nouvelle ou de limite de débit ajoutée.

## Preuves locales

- Baseline `pnpm test` : 170/170. RED confirmé : six nouveaux tests analytics échouent avant le support des événements ; scénario navigateur d’ouverture mesurée échoue avant les hooks. Le refus sans réponse était déjà protégé. Le premier sélecteur de navigation visait deux logos ; corrigé vers le lien Accueil nommé, sans changement produit.
- `pnpm verify` : 183/183, build 101 ressources hors ligne, audit 0 erreur/16 avertissements préexistants.
- `pnpm test:e2e` : 230/230, zéro échec. Treize tests unitaires ajoutés dont six avec le vrai SDK vendored ; neuf scénarios navigateur ajoutés, dont un rapport Communauté avec transport analytics SDK réel intercepté. Consentement, minimisation/anonymat, collecte absente/lente/levée en exception, retry/double clic, retrait/restauration et changement de compte couverts. Les 39 scénarios Assistance/rapport antérieurs sont conservés.
- Pas de test SQL local revendiqué : PostgreSQL absent et installation OS refusée par les capacités du runtime. La remise exige les deux relectures SQL de la CI existante sur réplique vide, en plus de Tests/build et Playwright, sur le HEAD publié exact. Aucune base réelle utilisée.
- Revue indépendante unique GPT-6.1 Sol sur `76c00dd..556b249` : aucun bug concret ou bloquant, aucun correctif demandé. Treize tests support analytics vérifiés par le réviseur, dont six avec le SDK réel. Seul cet enregistrement documentaire est ajouté après son avis ; validation SQL maintenue comme condition de remise.

La PR est remise prête uniquement après revue indépendante et CI réussie ; leurs références exactes sont consignées dans la description de PR et le CDC natif. Les 307 formulations, les 42 tâches juridiques et les claims WORK/Play Console et RPG01 sont préservés. Seule DATA11 passe de `[ ]` à `[~]`, DATA09/QA18 gardent `[~]` avec notes associées. La réservation est libérée après relecture native.
