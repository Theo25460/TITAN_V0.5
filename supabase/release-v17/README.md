# Paquet de production v17 (généré) — NON APPLIQUÉ

Généré par `node tools/db/build-production-bundle.mjs --bundle v17` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
`tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source. Décision du propriétaire requise avant application.

Contenu : le chantier social « Opération Connexion » (`docs/SOCIAL_EXCELLENCE.md`). Tout est additif : aucune ligne de compte
n'est supprimée, aucune XP ni aucun crédit n'est accordé, aucune signature existante ne change.

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` amis | Lien d'invitation personnel (un usage, 7 jours, révocable), demandes d'ami expirées après 30 jours, liste de ses blocages, six limites anti-spam qui ne s'appliquaient pas, export | Oui dès que les clients sont publiés : bouton « Créer un lien », « Comptes bloqués », demandes envoyées annulables |

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v16).
2. Les fichiers numérotés dans l'ordre (garde d'ordre : chacun est refusé s'il est rejoué ou si le précédent manque).
3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.

Prérequis : les paquets v14, v15 et v16. Le paquet v14 est appliqué en production ; v15 et v16 ne l'étaient pas au 20 novembre 2026.

Retour arrière : chaque migration décrit le sien dans son en-tête (fonctions re-créées depuis leur migration précédente, tables
nouvelles supprimées).
