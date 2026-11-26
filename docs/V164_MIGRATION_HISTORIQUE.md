# V1.6.4 — Migration de l’historique

Lecture des fichiers : `js/core/history-migration.js`, copié tel quel dans Android (`mobile/src/core/web/history-migration.js`,
manifeste de hachages vérifié par les tests). Serveur : `supabase/migrations/20261130100300_history_migration.sql` (paquet
`supabase/release-v2-01` (ancien paquet du lot `release-v23`, remplacé par la séquence canonique V2.0, voir `docs/v2/MIGRATIONS_V2.md`), **non appliqué**). Web : « Journal › Importer un historique » (`js/app/migration.js`). Android :
« Profil › Sources › Importer mon historique » (`mobile/src/screens/settings/HistoryImportScreen.tsx`).

## Les deux formats pilotes

### 1. Export TITAN

- **CSV du journal** (« Exporter (CSV) » du site, export du compte Android) : `Date;Sport;Valeur;Unité;Durée (min);Ressenti (1–10);Note;État;Référence`,
  BOM, séparateur « ; ». Le sport est le libellé du catalogue ; il est relu en identifiant.
- **JSON « Exporter toutes mes données »** : `trainingLogs` (identifiant de sport, valeur, unité, `details`).

| Colonne exportée | Champ JSON | Réimporté ? | Ce que devient la valeur |
|---|---|---|---|
| Date | `date` | oui | début de la séance, à la seconde, avec le fuseau de l’export |
| Sport | `sport` | oui | identifiant du catalogue (libellé, alias ou identifiant) |
| Valeur | `val` | oui | km et m : distance ; kg et répétitions : valeur gardée ; min : durée |
| Unité | `unit` | oui | km et m gardés tels quels (une nage reste en m) ; mi converti en km |
| Durée (min) | `details.duration` | oui, **obligatoire** | durée ; sans elle la ligne est ignorée (`invalid_duration`) |
| Ressenti (1–10) | `details.bio.rpe` | oui | ressenti |
| Note | `details.note` | oui | note, 500 caractères au plus |
| État | `archived_at` | lu | une ligne « Archivée » n’est pas importée (`archived_in_export`) |
| Référence | `client_event_id` | provenance | identifiant d’import `titan-<référence>-<début>` ; la séance recréée a sa propre référence |
| — | `details.exercises`, `details.extras`, `gpxPath`, `details.match` | non | absents du CSV ; présents dans le JSON mais non relus |
| — | XP, crédits | non | une séance d’historique compte 0 XP (règle serveur, plus de 30 jours) |

Preuve (`tools/db/test-history-migration.mjs`, P4) : 241 séances d’un compte de test, exportées en CSV et en JSON puis importées dans
deux comptes isolés ; 239 recréées (1 archivée et 1 de moins de 30 jours écartées avec leur motif), 7 champs identiques sur 239/239.

### 2. Profil CSV « TITAN historique v1 »

| Colonne (en-têtes acceptés) | Obligatoire | Formats lus |
|---|---|---|
| `date` (date, jour, activity date, start date) | oui | `JJ/MM/AAAA`, `MM/JJ/AAAA` (choix ou détection), `AAAA-MM-JJ`, ISO avec fuseau |
| `heure` (heure, time) | oui, sauf choix « placer à midi » | `07:15`, `7h15`, `07:15:30`, `6:05 PM` |
| `sport` (sport, activité, activity type, type) | oui | libellé, alias ou identifiant TITAN ; types Strava ; sinon « à classer » |
| `durée` (durée, durée (min), durée (s), duration, moving time) | oui | `52`, `52 min`, `0:52:10`, `1:05` (h:mm), `1h05`, `3120 s` |
| `distance` (distance, distance (km), (m), (mi)) | non | décimale « , » ou « . » |
| `unité` (unité, unit) | non | km, m, mi (sinon l’unité de l’en-tête, sinon km) |
| `ressenti` | non | entier de 1 à 10 |
| `note` (note, commentaire, description) | non | texte |
| `identifiant` (id, référence, activity id) | non, conseillé | identifiant d’import `csv-<identifiant>` (sinon début + sport) |

Ordre des colonnes libre, séparateur « ; », « , » ou tabulation. Les heures sans fuseau sont lues dans le fuseau choisi (celui de
l’appareil par défaut) : une heure sautée au passage à l’heure d’été est avancée d’une heure, une heure répétée en octobre prend
sa première occurrence. Le site permet de choisir chaque colonne ; Android lit les en-têtes reconnus et renvoie vers le site sinon.
Préréglage **Strava** (`activities.csv` de l’archive) : dates UTC, temps en mouvement (sinon temps écoulé), colonne « Distance » en
mètres quand elle existe.

## Déroulé et règles

1. **Aperçu** sur l’appareil : chaque ligne est « à ajouter », « déjà au journal », « à vérifier » ou « ignorée » avec son motif,
   avec la règle V15 du serveur (`js/core/session-match.js`) contre le journal de l’appareil et les lignes plus haut dans le fichier.
2. **Sports à classer** : chaque libellé inconnu se classe dans un sport TITAN ou s’ignore.
3. **Exécution par lot** : `titan_import_batch_open_v1` ouvre (ou reprend) le lot du fichier (empreinte FNV-1a 64 bits) ;
   `titan_import_batch_rows_v1` reçoit 100 lignes par appel et enregistre un résultat par ligne. Une ligne déjà enregistrée n’est
   jamais retraitée (réponse perdue, appel rejoué). Sur le budget quotidien d’historique (300 séances par jour, règle existante),
   l’appel s’arrête proprement et indique la ligne suivante ; rouvrir le même fichier, ici ou sur un autre appareil, reprend là.
4. **Provenance** : chaque séance ajoutée ou associée porte `batch_id` et `batch_row` sur sa ligne d’import (source `archive`).
5. **Règles du journal** : création par `titan_submit_training_session` (séance d’historique : 0 XP, 0 crédit) ; une séance déjà au
   journal n’est jamais modifiée (lien V1.6.2, « À vérifier » si incertain) ; un réimport répond « déjà importée ».
6. **Rapport** : `titan_import_batch_v1` (paginé, par résultat), `titan_import_batches_v1` (20 derniers lots).
7. **Retrait** (`titan_import_batch_withdraw_v1`, aperçu puis application) : seules les séances ajoutées par le lot et jamais
   touchées (révision inchangée, aucune récompense, aucune autre source rattachée) sont supprimées avec leur reçu ; un lien vers une
   séance déjà présente est défait sans toucher la séance ; une séance corrigée, archivée, séparée ou rejointe par une autre source
   est gardée et listée. Le fichier peut ensuite être réimporté.

Motifs : `unknown_sport`, `sport_ignored`, `invalid_date`, `missing_time`, `invalid_duration`, `invalid_distance`, `recent`,
`future`, `too_old`, `archived_in_export`, `duplicate_in_file`, `empty`, `server_invalid`.

## Mesure

Taux de lignes importées ou expliquées = (ajoutées + associées + déjà importées + ignorées avec motif) / lignes du fichier ;
doublons évités = associées + déjà importées ; temps jusqu’au rapport final = `finished_at − created_at` du lot. Les trois sont
affichés dans le rapport (Web et Android) et calculés par `TitanMigration.measure`.
