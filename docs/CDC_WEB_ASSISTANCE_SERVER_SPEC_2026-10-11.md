# Réception Assistance serveur — contrat du 11 octobre 2026

## Intention et choix

Suite de PR #45, pour SEC12/UX15/QA18 : recevoir réellement une demande avec une référence stable, puis notifier l’équipe côté serveur, sans exposer les clés ni promettre un e-mail livré. Le compte est vérifié par Supabase Auth ; aucune identité ni adresse déclarée dans le JSON n’est utilisée. Ce lot livre le backend versionné et ses preuves. Le formulaire, la prévisualisation de diagnostics et les rapports volontaires suivent séparément.

Netlify est retenu car le dépôt utilise déjà une fonction moderne `.mts` et une implémentation Node portable pour le webhook. Supabase conserve la demande dans un schéma privé et applique la concurrence en transaction. Un mailto seul ne fournit pas de réception vérifiable ; un envoi e-mail sans stockage ne protège pas des résultats incertains. Resend est un adaptateur serveur explicite, désactivé par défaut avec le canal.

## Contrat

POST `/functions/assistance` (route Netlify existante), Content-Type application/json et Authorization Bearer du compte. Corps maximal 24 KiB ; clés exactes `request_id` (UUID v4), `category` (bug, compte, titanplus, donnees, communaute, autre), `message` (10–4000 caractères, 16 KiB UTF-8 au plus, texte seul, hors contrôles sauf tabulation/nouvelle ligne), `reply_allowed` (booléen). Pas de pièce jointe, diagnostic, token, identité, URL ni champ analytics accepté. Aucun contenu du ticket dans les logs ou compteurs.

Configuration Functions : `TITAN_SUPPORT_ENABLED=true`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `TITAN_SUPPORT_FROM` (adresse du domaine vérifié). Sans activation et configuration valides : 503, aucune demande ni tentative de mail. La valeur d’activation ne sera pas changée dans ce lot ; provider, domaine et rétention réels restent à valider avant activation.

Auth `/auth/v1/user` vérifie le bearer en réseau avec la clé publique. Refus compte anonyme, inexistant/non confirmé et identité invalide. Une adresse vérifiée peut devenir reply-to uniquement si `reply_allowed=true`. L’API appelle ensuite une RPC réservée à service_role ; aucune RPC ni table Support accessible à anon/authenticated. La RPC revérifie existence, confirmation, anonymat et suspension du compte. Service_role reste un acteur privilégié ; ses clés ne quittent pas le serveur.

Une transaction verrouille le compte par advisory lock. Clé `(user_id, request_id)` : répétition identique retourne la même référence UUID et ne compte pas deux fois ; contenu différent sous la même clé est refusé (409). Même request_id chez un autre compte ne révèle rien. Trois nouvelles demandes au plus dans l’heure glissante par compte ; refus 429, retry identique autorisé au quota. Ce seuil initial est une limite opérationnelle à réévaluer, pas une règle juridique. Suppression du compte cascade seulement ses demandes.

Notification : claim exclusif avec bail 120 s et lease_id, destinataire fixe `titanteam.app@gmail.com`, sujet catégorie/référence et texte seul. Reply-to provient uniquement du compte vérifié et du choix consenti. Idempotency-Key Resend stable par référence ; aucune pièce jointe/HTML/CC/BCC. Après confirmation Resend et confirmation SQL du même bail, `notification=sent` signifie accepté par le fournisseur, sans garantie de livraison en boîte. Sinon `notification=pending`, et le ticket reste reçu. La réception retourne seulement `accepted`, `reference`, `notification` et le repli public `/service#help-contact`. Aucun mailto n’est ouvert/envoi déclenché automatiquement.

Après panne fournisseur ou résultat incertain, reprise uniquement sur nouvelle requête explicite avec la même clé. Bail et fenêtre de reprise distincts : toute émission cesse 23 h après la première tentative, avant expiration des 24 h d’idempotence Resend. Au-delà, réconciliation opérateur requise ; aucun réenvoi automatique susceptible de doubler l’alerte. Pas de cron/worker dans ce lot. Payload e-mail stable même si le domaine émetteur change pendant une reprise : l’enveloppe émetteur est figée en base lors du premier claim.

Erreur de réception SQL/réseau : 503 sans référence et sans affirmation de refus définitif ; le client futur devra conserver la même request_id et afficher un résultat incertain avant choix manuel de secours. Panne après réception : réponse 202 avec référence et notification pending. On ne propose pas silencieusement une deuxième demande par mail.

## Plan d’implémentation et preuves

1. Ajouter les tests Node sur le contrat HTTP, vérification d’identité, consentement reply-to, contenu minimal, réponses fournisseur/DB, clés modernes/legacy, répétitions et secrets exclus. Observer RED sur une fonction neutre renvoyant 503, puis remplacer la base par l’implémentation réelle.
2. Générer une migration : table privée, RLS sans policy publique, index compte/date, fonctions accept/claim/finish réservées à service_role et search_path vide. Tests SQL sur données fictives et rollback : validation, quota, identités, permissions, isolation, retries, expiration de bail/fenêtre, notification et cascade.
3. Ajouter une sonde PostgreSQL à deux connexions, gardée par nom titan_test_ : répétitions concurrentes, dernière place du quota et un seul bail. La brancher aux deux voies CI migrations et release historique + correctifs.
4. Implémenter la fonction portable et l’entrée `.mts` sans dépendance runtime supplémentaire. Les appels externes sont bornés à 8 s ; toutes les réponses sont no-store et sans CORS, secrets ou corps brut d’erreur.
5. Vérifier suites Node, build/audit, E2E existants, SQL et bundling. Une revue indépendante unique, puis trois jobs et logs de la CI du HEAD final. Handoff/PR/CDC doivent distinguer code testé, fournisseur synthétique, absence de recette réelle et absence d’activation.

## Reprise et limites

Transport réservé aux comptes confirmés ; utilisateurs déconnectés/anonymes conservent le mailto public. Aucun remboursement accordé par un ticket. Conservation des tickets et mails côté fournisseur/équipe, purge, exposition juridique, traitement opérateur et réception réelle restent à finaliser ; ne pas activer avant ces décisions. Aucun déploiement, envoi e-mail réel, migration réelle, fusion main, Android, règle sportive/économique ni modification des chantiers WORK/RPG01.

Références primaires consultées : [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [clés Supabase](https://supabase.com/docs/guides/getting-started/api-keys), [changement des grants publics](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically), [API Resend](https://resend.com/docs/api-reference/emails/send-email), [idempotence Resend](https://resend.com/docs/dashboard/emails/idempotency-keys), [fonctions Netlify](https://docs.netlify.com/build/functions/overview/).
