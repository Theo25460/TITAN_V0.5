# TITAN Ascent — Point de départ de la campagne (J0 = 24 novembre 2026)

Source : base Supabase de production `oubmftfufwwzwpgvrcag` (confirmée : c'est l'URL utilisée par `js/config.js` et
`mobile/app.config.ts`). Requêtes agrégées en lecture seule, exécutées le 24/11/2026. Aucune adresse e-mail ni donnée
personnelle n'a été exportée.

## Chiffres vérifiés

| Indicateur | Valeur | Définition |
| --- | --- | --- |
| Comptes créés (total) | **23** | lignes de `auth.users` |
| dont comptes au nom du créateur / de sa famille | 2 | e-mail contenant le nom de famille du créateur (heuristique) |
| dont comptes de test identifiables | 0 | aucun motif test/demo/yopmail/+alias détecté |
| Comptes créés sur les 30 derniers jours | 16 | `created_at` ≥ 25/10/2026 |
| Comptes créés sur les 7 derniers jours | **0** | dernier compte créé le 31/10/2026 |
| E-mail confirmé | 16 / 23 | 7 comptes jamais confirmés (créés les 29-31/10) |
| Connexion dans les 30 derniers jours | 11 | `last_sign_in_at` |
| Connexion dans les 7 derniers jours | 2 | |
| Comptes ayant enregistré au moins une séance | **5** (dont 2 au nom du créateur) | `training_logs` / `training_receipts` |
| Séances enregistrées (total) | 19 (`training_logs`), 11 reçus serveur | |
| Séances sur les 30 derniers jours | 6 | |
| Accès premium | 1 ligne `premium_access` (21/10/2026) | probablement offert : à confirmer par le créateur |

Répartition des inscriptions : 1 en avril, 1 en septembre, **21 en octobre** dont **10 le 29/10** et 15 entre le 29 et le
31/10 (pic probablement lié à une diffusion dans l'entourage : à confirmer). Depuis le 1er novembre : aucune inscription.

Événements analytiques internes (`analytics_events`, 379 lignes) : très peu exploitables — `signup` 4, `first_session` 1,
`second_session` 1, `onboarding_completed` 6 (2 comptes). Le suivi produit existe mais capte peu.

## Lecture honnête

- La base réelle d'utilisateurs actifs est **de l'ordre de 3 personnes hors créateur** ayant fait au moins une séance.
- **Taux d'activation** (compte → première séance) : 5/23 ≈ **22 %**, et 3/21 ≈ 14 % hors comptes du créateur. C'est le
  premier problème à traiter : multiplier le trafic sans améliorer ce taux produit surtout des comptes vides.
- 7 comptes sur 23 n'ont jamais confirmé leur e-mail : friction d'inscription à vérifier.

## Données manquantes (non accessibles depuis cette session)

| Donnée | Pourquoi elle manque | Comment l'obtenir |
| --- | --- | --- |
| Installations Android, visiteurs de la fiche, taux de conversion | Pas d'accès Play Console (aucun connecteur) | Export Play Console → voir `07-actions-createur.md` |
| Trafic du site et sources | Pas d'accès Google Analytics / Search Console dans cette session | Idem |
| Désinstallations, rétention J1/J7 côté Play | Play Console | Idem |
| Statistiques des réseaux sociaux | Aucun compte connecté | Connexion Buffer |

## Métrique principale de la campagne

**Nouveaux « athlètes activés »** : comptes créés pendant la campagne qui ont au moins **une séance confirmée par le
serveur** (`training_receipts`) dans les 7 jours suivant l'inscription. Mesurable chaque jour dans Supabase, résistante
aux faux signaux (une installation ou un compte vide ne compte pas).

- Point de départ : **5 comptes activés au total** (3 hors créateur).
- Objectif x5 sur 30 jours (25/11 → 24/12/2026) : **25 comptes activés au total**, soit **+20 nouveaux athlètes activés**.
- Métriques suivies à part : comptes créés (départ 23 → cible ambitieuse 115, soit +92), installations Play (départ
  inconnu), visites de la fiche, retour J1 et J7 (au moins une 2e séance), clics par contenu (liens `?utm_…`).

Cet objectif est une cible, pas une promesse. Avec 0 inscription sur les 3 dernières semaines, +20 activés en 30 jours
suppose une audience sociale construite de zéro : c'est ambitieux.

## Requête de suivi (à relancer, lecture seule)

```sql
select
  count(*) filter (where u.created_at >= '2026-11-25') as comptes_campagne,
  count(*) filter (where u.created_at >= '2026-11-25' and exists (
    select 1 from public.training_receipts r where r.user_id = u.id and r.created_at < u.created_at + interval '7 days'
  )) as actives_campagne,
  count(*) filter (where exists (select 1 from public.training_receipts r where r.user_id = u.id)) as actives_total,
  count(*) as comptes_total
from auth.users u;
```
