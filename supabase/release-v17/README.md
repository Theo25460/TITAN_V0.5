# Paquet de production v17 (généré) — NON APPLIQUÉ

Généré par `node tools/db/build-production-bundle.mjs --bundle v17` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
`tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source. Décision du propriétaire requise avant application.

Contenu : le chantier social « Opération Connexion » (`docs/SOCIAL_EXCELLENCE.md`). Tout est additif : aucune ligne de compte
n'est supprimée, aucune XP ni aucun crédit n'est accordé, aucune signature existante ne change.

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` amis | Lien d'invitation personnel (un usage, 7 jours, révocable), demandes d'ami expirées après 30 jours, liste de ses blocages, six limites anti-spam qui ne s'appliquaient pas, export | Oui dès que les clients sont publiés : bouton « Créer un lien », « Comptes bloqués », demandes envoyées annulables |
| `02` groupes | **Séances confirmées seulement** dans tous les comptes collectifs (une séance dont la récompense est retenue ou annulée par l'anti-triche, ou jamais tamponnée par le serveur, ne compte plus nulle part ; elle compte dès sa libération) ; résultat d'un défi terminé sans nom d'inconnu ; résultat du TITAN Duo conservé ; objectif hebdomadaire de club | Oui : une séance retenue ne fait plus avancer Duo, défis, guilde, quête commune, saison, objectif mondial, « semaine tenue » (crédits cosmétiques) tant qu'elle est retenue |
| `03` Grande Cordée | Expédition coopérative entre amis de sports différents (mode des défis entre amis) : longueurs par jour, part plafonnée, variété des familles, quatre camps, sommet unique, titre de route ; réglage serveur `screens.cordee` | Seulement quand `screens.cordee` est ouvert (fermé par défaut) |
| `04` retour | « Depuis ta dernière visite » : lecture seule (Moments partagés par des amis, encouragements, demandes, amis actifs s'ils l'autorisent, cordées, Duo, défis terminés, souvenirs, une allure de cordée adaptée) ; réglage client `screens.digest` | Seulement quand `screens.digest` est ouvert |

Corrections d'audit (18 novembre 2026, avant toute application) :

- `01` : les compteurs des neuf limites sociales que le limiteur écrit lui-même sont gardés 30 jours (règle `social_action_limits` du job quotidien de rétention, `docs/DATA_RETENTION.md`) ; le changement de contrainte du journal attend son verrou 5 s au plus.
- `02` : l'objectif de club ne donne le total de minutes et le nombre d'actifs qu'à partir de 3 membres (seuil des trophées de saison) ; en dessous, l'objectif seul (totaux `null`, affichés « le total s'affiche à partir de 3 membres » sur le Web et Android).
- `03` : une invitation sans réponse ne compte dans l'objectif et dans les « deux contributeurs » que pendant les 48 premières heures ; ensuite seuls les membres encordés comptent, un invité silencieux ne rend plus le sommet impossible.
- `03` : l'export du compte liste les titres de route gagnés (`cordeeTitles`, en plus de `friendInvites`).
- `02` : toute séance non historique passe l'analyse de risque à l'enregistrement, même au-delà du plafond d'XP du jour ou de la semaine ; une séance invraisemblable sans XP est retenue (montants nuls) et ne compte dans aucun objectif collectif avant sa libération (`titan_submit_training_session`, corps de `20261020000000`, une condition changée).
- `03` : le classement équitable entre amis (`private.titan_fair_score`) lit les mêmes séances confirmées que tous les comptes collectifs (ni retenue, ni annulée, ni jamais tamponnée par le serveur).

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v16).
2. Les fichiers numérotés dans l'ordre (garde d'ordre : chacun est refusé s'il est rejoué ou si le précédent manque).
3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.

Réglages serveur (fermés par défaut, à ouvrir d'abord sur le compte du propriétaire) : `screens.friendlinks` (création des liens personnels), `screens.cordee` (création des cordées), `screens.digest` (« Depuis ta dernière visite »).

Prérequis : les paquets v14, v15 et v16. Le paquet v14 est appliqué en production ; v15 et v16 ne l'étaient pas au 20 novembre 2026.

Retour arrière : chaque migration décrit le sien dans son en-tête (fonctions re-créées depuis leur migration précédente, tables
nouvelles supprimées).
