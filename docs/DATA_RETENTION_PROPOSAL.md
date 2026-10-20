# Proposition de matrice de conservation (LEG31, LEG03, Q-002)

**PROPOSITION DU DÉVELOPPEUR — NON APPLIQUÉE — À VALIDER PAR UNE PERSONNE COMPÉTENTE (LEG13, LEG57).** Théo a demandé de ne plus poser de questions et de décider ; ce document applique le « choix recommandé » de Q-002 : retenir, pour chaque catégorie, la durée minimale réellement nécessaire. Les chiffres ci-dessous sont des **ordres de grandeur prudents issus de pratiques courantes**, pas des obligations vérifiées pour Titan : ils doivent être confrontés au droit applicable, au statut de l'éditeur, au rôle réel de Paddle (marchand officiel ou non, LEG25) et aux durées offertes par l'hébergeur. **Rien n'est purgé, aucune page publique n'est publiée, aucun texte légal n'est modifié** : le comportement actuel reste inchangé (option temporaire de Q-002).

## Principes

1. À la suppression de compte, les données personnelles actives sont effacées immédiatement (c'est déjà le comportement de `delete_own_account`) ; ne subsistent que des historiques **sans identité du joueur** (détachés) ou des obligations légales.
2. Une donnée sans finalité active n'est pas conservée « au cas où ».
3. Une durée n'est publiée dans une page publique qu'une fois **appliquée par le code** (purge planifiée) et validée.

## Matrice proposée

| Catégorie | Où | Durée proposée | Après suppression du compte | Mécanisme à écrire |
|---|---|---|---|---|
| Compte, profil, séances, objectifs, social, coaching | tables du joueur | tant que le compte existe | effacé à la suppression | existant |
| Mesure d'audience | `analytics_events` | 13 mois glissants | identité déjà détachée ; événements anonymes purgés à 13 mois | purge planifiée (non écrite) |
| Assistance (demandes) | `titan_support_requests`, anciennes `contact_messages`, `bug_reports` | 12 mois après clôture, puis purge | le contenu rattaché au compte est supprimé avec lui ; le reste suit la purge | purge planifiée (non écrite) ; décision sur l'ancien usage des tables |
| Signaux de fraude et décisions de modération | `titan_suspicious_actions`, `titan_moderation_decisions` | 12 mois après la dernière activité du signal ; décisions : 24 mois | identité détachée à la suppression (déjà le cas pour les décisions) | purge planifiée (non écrite) |
| Journal d'économie | `titan_economy_journal` (immuable) | tant que le compte existe + 12 mois, identité détachée | détaché à la suppression, purge à 12 mois | décision sur la purge d'un journal immuable (garde à adapter) |
| Journal d'audit administrateur | `titan_admin_audit`, `admin_logs`, `audit_logs` | 12 mois ; 5 ans pour les actions qui touchent à l'argent ou aux sanctions (à valider) | cible détachée (`ON DELETE SET NULL`) | purge planifiée (non écrite) |
| Événements de facturation (copie locale) | `titan_billing_events` | durée comptable applicable si Titan est le vendeur ; sinon 13 mois de réconciliation (si Paddle est marchand officiel) | identifiant joueur détaché ; données de facturation selon l'obligation comptable | **dépend de LEG25** |
| Compteurs de limites de débit | `titan_rate_events` | 24 h (déjà purgé à l'usage) | effacé avec le compte | existant |
| Sauvegardes | fournisseur | selon le plan de l'hébergeur (à confirmer, A11) | disparaît à la rotation | à documenter après vérification |
| Journaux d'hébergement | Netlify, Supabase | selon les fournisseurs (à confirmer) | — | — |

## Ce que cela impose au code (non fait)

Une purge planifiée par catégorie (extension `pg_cron` ou fonction appelée par un travail planifié ; le projet n'a pas de planificateur vérifié), des tests de purge avec jeux synthétiques, une adaptation de la garde d'immuabilité du journal d'économie si l'on retient une purge, et une revue humaine avant toute publication des durées dans `legal_privacy` et la page publique de suppression (GP05, LEG10).

## Points ouverts pour la revue humaine

Statut juridique de l'éditeur ; marchand officiel ; durée comptable ; base légale de chaque traitement (LEG27) ; durée de conservation des sauvegardes ; ancien usage des tables `contact_messages`, `bug_reports`, `friends`, `items`.
