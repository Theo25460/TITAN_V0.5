# V1.6.5 — Centre des sources connectées

Écrit le 23 novembre 2026. Promesse : le sportif sait ce que chaque source fournit, où elle s'est arrêtée et comment reprendre.
Source exécutable : `js/core/source-center.js` (copiée telle quelle dans Android). Serveur : migration
`20261130100500_source_center.sql`, paquet `supabase/release-v24` (**non appliqué**, décision du propriétaire).

## Contrat réel de chaque source

| Source | Collecte | Reprise | Champs transmis | Non transmis | Pilote | Validée sur appareil |
|---|---|---|---|---|---|---|
| Santé Connect | lue sur le téléphone, à l'ouverture ou à la demande ; rien en arrière-plan | oui, explicite et bornée : 30 jours au plus, et jamais plus de 30 jours avant la première autorisation (règle Android) ; un jour de recouvrement | sport (type d'exercice sans ambiguïté), début, durée ; pas par jour | distance (pas encore envoyée, limite V1.6.2), fréquence cardiaque, tracé, note | oui | **non** (aucun S23 attaché) |
| Garmin | envoi (« push ») de chaque activité, une fois, quand la montre se synchronise | **impossible** : l'accès Garmin n'a pas d'historique ; une activité faite pendant une coupure ne revient pas | sport, début, durée, distance | fréquence cardiaque, tracé | non (aucune activité réelle autorisée) | **non** |
| Fichier GPX | lu quand le sportif choisit un fichier | réimport reconnu par l'empreinte (V1.6.2) | sport choisi, début, durée, distance, dénivelé, note | tracé (statistiques seulement) | oui | non |
| Historique importé | lots de 100 lignes (V1.6.4) | lot reprenable à la ligne attendue | voir `docs/V164_MIGRATION_HISTORIQUE.md` | — | oui | non |

## États distingués

| État | Quand | Libellé | « Connecté » ? | Action |
|---|---|---|---|---|
| `off` | aucun consentement | Non connecté | non | Autoriser / Connecter Garmin |
| `withdrawn` | consentement retiré dans TITAN (`revoked_by = user`) | Retirée | non | Autoriser de nouveau, Archiver |
| `provider_withdrawn` | retrait signalé par Garmin (`revoked_by = provider`) | Retirée chez Garmin | non | Connecter Garmin |
| `expired` | consentement TITAN donné, mais la source ne l'accorde plus (permission Android absente ; liaison Garmin non terminée ou terminée) | Autorisation expirée / À terminer / Liaison expirée | non | Redonner l'accès, Ouvrir Santé Connect / Terminer la liaison |
| `failed` | dernière tentative en échec (Santé Connect sans réponse, refus de lecture, réseau) | Synchronisation en échec | non | Reprendre la période manquante |
| `interrupted` | lecture partielle, ou restée « running » plus de 15 minutes | Interrompue | non | Reprendre la même période |
| `gap` | dernière réussite il y a plus de 3 jours (ou jamais) | À reprendre | oui | Reprendre la période manquante (bornée, partie perdue dite) |
| `empty` | dernière lecture réussie sans nouvelle séance ; Garmin silencieux depuis 14 jours | Aucune nouvelle séance / activité | oui | Relire maintenant |
| `ok` | dernière lecture réussie avec des séances | Connecté | oui | Relire maintenant |

Exclusions affichées avec leur motif (type ambigu, sans identifiant, moins d'une minute, plus de 24 h, date invalide, sport inconnu,
hors limites). Conflits : liens « à vérifier » de V1.6.2 non tranchés, avec « Vérifier dans le journal ». Une séance déjà au journal
n'est jamais réécrite par une source : les corrections restent (`private.titan_import_core`).

## Retrait

`titan_set_source_consent_v1(source, false)` : le serveur refuse tout import (`CONSENT_REQUIRED`) et toute lecture rapportée par le
téléphone (seul l'enregistrement du refus est accepté) ; le téléphone relit le consentement juste avant chaque lecture et ne demande
rien à Santé Connect s'il est retiré. Avant de confirmer, l'écran dit : plus rien n'est lu, N séances déjà importées restent avec les
corrections et les récompenses, « Archiver » les retire sans les supprimer (`titan_archive_imported_v1`, action existante).

## Mesure

`TitanSources.measure(runs, activités)` : pour chaque lecture interrompue (échec, partielle, restée ouverte), la première lecture
réussie suivante dont la période la couvre donne le délai de reprise ; la lecture compte comme « retrouvée » si une séance de cette
période est visible au journal. Mesurée ici sur des jeux synthétiques uniquement (voir le compte rendu du lot).
