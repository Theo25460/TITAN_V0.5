# TITAN — Abonnements Google Play Console
_Mise à jour : 4 novembre 2026 — décisions communiquées par le propriétaire._

> Les IDs et montants ci-dessous remplacent les brouillons précédents (par ex. `titan_plus`, `coach`, `coach_pro`, 20 € et 40 €). La création des fiches et les tarifs sont déclarés par le propriétaire ; les forfaits de base, licences, transactions réelles et autorisations de commercialisation restent à vérifier. **Ne pas modifier la tarification sans accord.**

## Grille commerciale de référence

| Offre | ID abonnement Google Play | Nom affiché | Prix mensuel décidé | Tag(s) | Capacité et droits | Public ciblé |
|---|---|---|---|---|---|---|
| TITAN+ | `titan01` | TITAN+ | **4,99 €/mois** | `titan-plus` proposé (enregistrement non confirmé) | Offre individuelle premium, notamment sans annonces Android | Non communiqué |
| Coach | `titan02` | Coach | **19,99 €/mois** | **`titan-coach`** (renseigné dans Play Console) | Jusqu'à 5 sportifs, TITAN+ pour le coach et les sportifs rattachés | **18 ans et plus** (paramétré par le propriétaire) |
| Coach Ultra | `titan03` | Coach Ultra | **39,99 €/mois** | `coach-ultra` (**prévu**, le propriétaire indique qu'il va le saisir) | Jusqu'à 15 sportifs, TITAN+ pour le coach et les sportifs rattachés | Non communiqué |

**Important :** l'ID d'abonnement (`titan01`, `titan02`, `titan03`) est distinct de l'ID de forfait de base (base plan ID), encore non fourni. Ne pas créer de doublons avec les anciennes suggestions de product IDs. Ces prix sont les tarifs mensuels décidés, à contrôler contre les montants affichés par Google Play pour les pays/TVA concernés.

## TITAN+ — éléments de fiche

Description proposée : « Passe à TITAN+ et profite de ton aventure sportive sans publicité sur Android. Enregistre tes séances, suis tes statistiques et progresse dans l'univers TITAN sans interruption publicitaire. »

Avantages proposés :
1. Une expérience sans publicité
2. Des statistiques sportives avancées
3. Des personnalisations exclusives
4. Un suivi enrichi de ta progression

Seule l'absence de publicité pour les comptes TITAN+ est explicitement prévue dans la logique AdMob. Les autres avantages nécessitent confirmation des droits et de l'implémentation avant d'être annoncés comme disponibles.

## Coach — éléments de fiche

Avantages :
1. Jusqu’à 5 sportifs suivis
2. TITAN+ inclus pour coach et sportifs
3. Programmes et objectifs personnalisés
4. Messagerie et bilans de progression

Description proposée : « Accompagne jusqu’à 5 sportifs avec TITAN Coach : programmes, objectifs, échanges et bilans de progression, avec TITAN+ inclus pour toi et tes sportifs suivis. »

Public : **18 ans et plus** selon le réglage déclaré en Play Console. Ce réglage ne constitue pas une exemption fiscale ou une preuve de conformité de l'application et doit rester cohérent avec la déclaration des publics ciblés.

## Coach Ultra — éléments de fiche

Avantages :
1. Jusqu’à 15 sportifs suivis
2. TITAN+ inclus pour tous
3. Programmes et objectifs personnalisés
4. Messagerie et bilans de progression

Description proposée : « Accompagne jusqu’à 15 sportifs avec TITAN Coach Ultra : les mêmes outils que Coach, une capacité de suivi étendue et TITAN+ pour toi et tes sportifs rattachés. »

**Même gamme fonctionnelle que Coach** : seule la capacité de suivi passe de 5 à 15 places, sans différences arbitraires d'outils ; les sportifs doivent accepter le rattachement et consentir au partage des données concernées. Le nom commercial est **Coach Ultra** ; les mentions historiques « Coach Pro » doivent être considérées comme obsolètes dans les nouveaux écrans et documents.

## Assets GitHub

- Logo principal TITAN (cyan) : `image/logo-512.png` — **inchangé**
- TITAN+ : `image/titan-plus-logo.svg` (dégradé orange ; rendu PNG validé 1024 × 1024 inséré dans le cahier)
- Coach : `image/titan-coach-logo.svg` (dégradé vert ; rendu PNG validé 1024 × 1024 inséré dans le cahier)
- Coach Ultra : `image/titan-coach-ultra-logo.svg` (dégradé argent / blanc ; rendu PNG validé 1024 × 1024 inséré dans le cahier)

Les fichiers SVG sont des adaptations vectorielles réutilisables, **pas** des copies pixel à pixel des PNG validés. Les trois identités doivent rester séparées ; ne pas remplacer l'icône principale de l'application.

## Intégration et validation avant commercialisation

1. Relever les IDs de forfaits de base, vérifier les prix enregistrés, territoires, taxes, offres et la disponibilité dans Play Console.
2. Aligner les trois **product IDs réels** dans Android, le catalogue Google Play Billing, le backend de validation et le registre des droits Supabase. Remplacer les anciens ID candidats ; gérer le renommage commercial `Coach Pro` → `Coach Ultra` sans casser les droits déjà provisionnés.
3. Vérifier achats sous licence Google Play, jetons et accusés de réception, restauration, renouvellement, annulation, remboursement, expiration, isolation des comptes, places Coach et partage avec consentement.
4. Confirmer que les avantages affichés sont effectivement accessibles, contrôler les pages légales, la cible d'âge déclarée et la conformité avant activation du paiement réel.

Document de référence : cahier des charges vivant TITAN (Google Docs), sections Google Play Billing et fiches abonnements.
