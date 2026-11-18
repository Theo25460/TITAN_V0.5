# Paquet de production v18 (généré) — NON APPLIQUÉ

Généré par `node tools/db/build-production-bundle.mjs --bundle v18` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
`tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source. Décision du propriétaire requise avant application.

Contenu : le chantier « Monétisation fiable » (`docs/MONETISATION.md`). Tout est additif : aucune ligne de compte n'est supprimée,
aucun lien coach n'est révoqué, aucune XP ni aucun crédit n'est accordé, aucune signature existante ne change.

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` cycle de vie | Balayage horaire qui retire le drapeau TITAN+ d'un compte dont plus aucune source n'est valable (échéance passée sans événement) ; accès offerts sans échéance jamais touchés. Le rapprochement Google relit aussi, toutes les six heures, les achats en attente, suspendus ou en pause. Catalogue `titan01/02/03 → titan_plus/coach/coach_pro` semé (identique à la production, lignes existantes conservées) | Oui : un abonnement terminé n'affiche plus TITAN+ ; un paiement en attente confirmé plus tard s'ouvre même sans notification |
| `02` places coach | Les places de l'offre en cours (3, 5, 15 ; 20 avec TITAN+ seul, règle publiée) s'appliquent à **toutes** les actions coach ; au-delà, les liens les plus récents sont **en pause** des deux côtés (ni séances, ni propositions, ni messages, ni check-ins), sans suppression ; reprise automatique | Oui pour un coach au-delà de ses places. **Aucun lien coach n'existe en production au 21 novembre 2026** |
| `03` routines | Le serveur refuse d'agrandir la bibliothèque de routines au-delà de 5 (20 avec TITAN+) ; une bibliothèque plus grande laissée par un TITAN+ terminé est conservée | Non, sauf pour un client qui contournait la limite du site |
| `04` économie | Les succès ne comptent plus que les séances confirmées (ni historiques, ni retenues, ni exclues) ; la libération horaire des récompenses retenues ne paie plus une séance archivée, exclue ou rejetée, et attend une séance en cours de revue | Seulement pour un compte qui exploitait ces chemins |

Corrections d'audit (18 novembre 2026, avant toute application) :

- `02` : sur un lien en pause, l'athlète lit toujours le fil déjà là, le marque lu et peut signaler un message (`private.titan_coach_link_read_role`) ; personne n'envoie rien de nouveau ; le compteur de non-lus du coach ignore les liens en pause qu'il ne peut pas ouvrir (plus de pastille bloquée).
- `04` : une séance en cours de revue (`flagged`, `pending_review`) n'occupe plus de place dans le lot de 500 retenues libérées chaque heure ; la relecture verrouillée dans la boucle est conservée.

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v17).
2. Les fichiers numérotés dans l'ordre (garde d'ordre : chacun est refusé s'il est rejoué ou si le précédent manque).
3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.

Prérequis : les paquets v15, v16 et v17 (non appliqués au 21 novembre 2026 : registre de production à 130 migrations, dernière
`20261117170000`). Aucune fonction de v18 n'est modifiée par v15 à v17 : l'ordre est conservé pour que chaque contrôle d'empreinte reste
exact. Si la monétisation doit ouvrir avant le chantier social, recouper le paquet (`--after 20261117170000`) et remesurer les empreintes.

Retour arrière : chaque migration décrit le sien dans son en-tête.

Répétition : `tools/db/test-migrations.sh` (chaîne complète sur réplique vierge) ; empreintes mesurées sur une réplique construite
jusqu'à `20261120120000` (avant) puis jusqu'à `20261121130000` (après).
