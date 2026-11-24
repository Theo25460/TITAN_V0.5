# Paquet de production v26 (généré) — NON APPLIQUÉ

V1.8.6 — Agenda et rendez-vous d’équipe (`docs/V186_AGENDA_CLUB.md`). Généré par
`node tools/db/build-production-bundle.mjs --bundle v26` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
`tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source. Décision du propriétaire requise avant application,
**après les paquets v21 à v25** (V1.8.1 à V1.8.5, pas encore appliqués non plus).

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` agenda du club | Agenda privé d’un club : rendez-vous uniques ou hebdomadaires (2 à 12, même heure de Paris), lieu général, lieu précis et plan de repli facultatifs, capacité facultative avec file d’attente ; réponses « Je viens », « Peut-être », « Je ne viens pas » ; déplacement, plan de repli, annulation et rétablissement d’une occurrence, annulation et reprise d’une série sans doublon ; historique ; lien d’invitation `?rdv=` qui ne dit rien une fois expiré ou à un ancien membre ; rappels facultatifs ; fiche du rendez-vous terminé (présence déclarée, séance confirmée du jour associée par son auteur seulement, totaux à partir de 3 séances associées) ; clé `agenda` du récap `titan_social_digest_v1` ; déclencheurs (départ du club, place libérée) ; export `clubAgenda` ; mesure `private.titan_club_agenda_measure()` | Seulement quand `screens.club_agenda` est ouvert (fermé par défaut). « Je ne viens pas », la présence, l’association d’une séance et les annulations restent toujours possibles |

Répétition sur une réplique construite depuis le dépôt (24 novembre 2026), migrations jusqu’à `20261128090000` enregistrées (146) :
`00-check-before` à `ok = true` (private 166/550d46c5de65/3f3e1401b571, public 332/44ce47c36337/978b18a6a81f, état de fin du paquet v25),
`01` appliqué, `99-check-after` à `ok = true` (private 175/123f4f781013/2bbe668c12c0, public 335/5837421547a7/f1cf55fb57c9), second passage
de `01` refusé (« already registered »), postflights v11 (328/328), v13 (42/42) et v131 (54/54) vrais.

## Procédure

1. Les paquets v21 à v25 doivent être appliqués (`20261128090000` enregistré).
2. Publier le Web et l’application Android qui contiennent V1.8.6 (les anciens clients n’appellent pas `titan_club_agenda_v1` et ignorent
   la clé `agenda` du récap : rien ne casse s’ils restent en service).
3. `00-check-before.sql` : deux lignes `ok = true`.
4. `01-20261129090000_club_agenda.sql` (garde d’ordre : refusé s’il est rejoué ou si `20261128090000` manque).
5. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
6. Ouvrir `screens.club_agenda` pour les comptes d’un ou deux clubs pilotes seulement.

Retour arrière : décrit dans l’en-tête de la migration (déclencheurs, fonctions et tables nouvelles supprimés,
`public.titan_social_digest_v1` re-créée depuis `20261126090000` et `private.titan_social_export_v1` depuis `20261128090000`).
