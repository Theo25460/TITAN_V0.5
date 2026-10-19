# Plan de rotation des secrets (SEC08)

Document de préparation écrit le 19/10/2026. **Aucune rotation n'a été faite, aucune valeur n'a été lue ni affichée** : cet état se vérifie avec `node tools/scan-git-history.mjs` (historique complet) et `pnpm run release-check` (arbre et `dist/`). Les valeurs vivent dans les gestionnaires de secrets (Netlify, GitHub Actions, Supabase, Paddle, Resend), jamais dans le dépôt.

## 1. État de l'exposition (pourquoi il n'y a pas de rotation urgente)

- Arbre courant, `dist/` : aucune valeur secrète (contrôle de publication, SEC07).
- **Historique git** (2807 versions de fichiers, toutes branches, 19/10/2026) : aucun secret serveur ; les seules occurrences sont des valeurs factices citées par `tests/` (outil `tools/scan-git-history.mjs`, 0 échec).
- Le dépôt publie volontairement la clé **anon** Supabase (`js/config.js`) : c'est une clé publique protégée par les politiques RLS, pas un secret. Ne pas la faire tourner pour cette seule raison.
- Limites de ces garanties : l'outil cherche des formes connues, ne voit pas ce qui a pu être copié hors du dépôt (messages, captures, journaux de build, historique d'un ancien dépôt), et ne lit pas les variables Netlify ni les secrets GitHub.

**Déclencheurs de rotation immédiate** : `history-scan` ou `release-check` signale une valeur ; une clé apparaît dans un message, un ticket, un journal ou une capture ; départ d'une personne ayant eu accès aux gestionnaires ; alerte du fournisseur. Sinon : rotation planifiée (§4).

## 2. Inventaire

| Secret | Où il vit | Sert à | Si compromis | Rotation |
|---|---|---|---|---|
| `SUPABASE_SECRET_KEY` (ou `SUPABASE_SERVICE_ROLE_KEY`, ancien nom) | Netlify (fonctions) | écrire côté serveur en contournant la RLS (webhook de paiement, assistance) | **critique** : lecture/écriture de toutes les données | Créer une nouvelle clé secrète dans Supabase, la poser dans Netlify, redéployer, vérifier, **puis** révoquer l'ancienne |
| `PADDLE_WEBHOOK_SECRET` | Netlify | vérifier la signature des webhooks de paiement | faux événements « payé » acceptés (TITAN+ offert) | Générer un nouveau secret de destination de notification chez Paddle, poser dans Netlify, redéployer |
| `RESEND_API_KEY` | Netlify | envoi des e-mails d'assistance | envoi de mails au nom de Titan | Nouvelle clé chez Resend, poser dans Netlify, redéployer, révoquer l'ancienne |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD` | GitHub Actions | signer l'application Android | publication d'une application usurpée | **Ne se fait pas librement** : la clé de signature se remplace par la procédure Play Console (clé d'envoi / Play App Signing). À décider avec Q-001 |
| Mot de passe base / `SUPABASE_DB_URL` | poste local de la personne qui sauvegarde | `tools/supabase-backup.ps1` | accès SQL direct | Réinitialiser le mot de passe de la base dans Supabase, mettre à jour le poste |
| Secret JWT du projet Supabase | Supabase | signe toutes les sessions et les clés historiques anon/service | toutes les clés et sessions forgeables | **Dernier recours** : change aussi la clé anon publique (`js/config.js`) et déconnecte tous les joueurs |
| Jeton d'API Netlify / identifiants de déploiement | Netlify, GitHub | déployer le site | publication d'un site piégé | Révoquer et recréer le jeton |
| Non secrets (à ne pas faire tourner) | `SUPABASE_URL`, clé anon / `SUPABASE_PUBLISHABLE_KEY`, `TITAN_SUPPORT_FROM`, `TITAN_SUPPORT_ENABLED`, `PADDLE_ELITE_*_IDS` | configuration | — | — |

## 3. Procédure type (sans coupure)

1. **Prévenir** et choisir une fenêtre calme. Garder l'ancienne valeur active jusqu'à la fin de l'étape 5.
2. Créer la nouvelle valeur chez le fournisseur (ne pas supprimer l'ancienne).
3. La poser dans le gestionnaire (Netlify : variables d'environnement du site ; GitHub : secrets du dépôt). Jamais dans un fichier du dépôt, un message ou une capture.
4. Redéployer la fonction concernée et vérifier :
   - webhook : un événement de test Paddle (bac à sable) est accepté, un événement à signature fausse est refusé ;
   - assistance : une demande de test arrive, l'état « indisponible » n'apparaît pas ;
   - serveur Supabase : un achat de test et la lecture admin répondent.
5. **Révoquer l'ancienne valeur** chez le fournisseur, puis refaire la vérification pour confirmer qu'aucun service n'utilisait encore l'ancienne.
6. Relancer `node tools/scan-git-history.mjs` et `pnpm run release-check` ; noter la date de rotation (sans valeur) dans le cahier.

Cas de compromission avérée : faire 2 → 5 **d'abord**, enquêter ensuite ; consulter les journaux du fournisseur pour la période d'exposition ; si la clé de rôle serveur est en cause, examiner le journal d'économie (`titan_economy_journal_v1`) et la file de modération pour les écritures anormales.

## 4. Calendrier proposé (à valider par une personne)

- Clés de rôle serveur, secret webhook, clé e-mail : tous les 6 mois, et à chaque changement de personne ayant accès.
- Contrôle automatique : exécuter `node tools/scan-git-history.mjs` avant chaque publication majeure (non branché sur la CI : voir handoff).
- Clé de signature Android : jamais sans procédure Play Console.

## 5. Ce que ce plan ne fait pas

Il ne vérifie pas les valeurs réellement posées chez Netlify, GitHub ou les fournisseurs, ne fait aucune rotation et ne remplace pas un audit des accès humains.
