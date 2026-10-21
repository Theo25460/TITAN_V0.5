# ADR-003 — Provenance des données issues de sources externes (SEC11, AND17, AND19)

Statut : proposé (Claude, 20/10/2026), non validé par Théo. **Aucune source externe n'existe aujourd'hui** (ni Health Connect, ni Garmin, ni Samsung Health) : cet ADR fixe les règles à respecter *avant* d'en brancher une, pour qu'une importation ne contourne ni l'anti-triche ni l'économie.

## Contexte
Aujourd'hui, toute séance entre par `titan_submit_training_session` et est saisie par le joueur ; le champ `details` est libre côté client. Le moteur de risque (`private.titan_session_risk`, ADR-002) ne lit aucun champ de provenance : toutes les séances sont traitées comme déclaratives. Une source externe apporte des données plus fiables (capteurs) mais aussi un nouveau risque : un client modifié pourrait **prétendre** qu'une séance vient d'une source de confiance pour échapper aux contrôles ou gagner des récompenses.

## Décision
1. **La provenance n'est jamais une déclaration du client.** Une séance n'est « importée » ou « de confiance » que si le serveur l'a établi lui-même (jeton de la source vérifié côté serveur, ou fonction réservée à un rôle de service). Le champ `details` du client ne peut ni écrire ni modifier la provenance : tout champ de provenance reçu du client est ignoré ou refusé.
2. **Provenance stockée hors de `details`**, dans une colonne ou une table privée dédiée (`private`, RLS, sans droit d'API), avec : `source` (énumération fermée : `manual`, `health_connect`, `garmin`, `samsung_health`, …), `external_id` (identifiant chez la source), `imported_at`, `source_updated_at`, et l'identifiant de connexion de la source.
3. **Déduplication multi-sources (AND19)** : clé d'unicité `(user_id, source, external_id)`. Une même activité reçue de deux sources, ou d'une source et saisie à la main, est rapprochée par chevauchement horaire et sport ; la plus fiable est conservée comme séance de référence, les autres sont liées (jamais comptées deux fois dans l'XP, les crédits, les quêtes, les records).
4. **Confiance = signal, pas passe-droit.** La provenance entre dans le moteur de risque comme un producteur de signal de plus (ADR-002), jamais comme une exemption : une séance importée reste soumise aux plafonds d'allure et au volume. Une source de confiance peut abaisser le poids de certains signaux ; elle ne les supprime pas.
5. **Les données importées sont minimales** : on ne stocke que ce que le produit affiche ou calcule (sport, début, durée, distance, dénivelé, fréquence agrégée si utilisée) ; jamais un flux brut de santé. Consentement explicite, par source, révocable ; à la révocation, on arrête les lectures et on propose de supprimer les séances importées (lien avec LEG03, LEG10, Q-002).
6. **Les jetons des fournisseurs** (OAuth, clés) restent côté serveur, chiffrés, hors du navigateur et hors du dépôt ; le client ne reçoit jamais le jeton d'un tiers.
7. **Les écritures passent par des fonctions serveur** : une importation est une fonction `SECURITY DEFINER` dédiée (limitée en débit, idempotente sur `(source, external_id)`), pas une insertion directe ; les politiques RLS empêchent toujours l'insertion directe dans `training_logs` (CHEAT01).

## Conséquences
- Avant la première source : une migration (colonne ou table de provenance), la fonction d'importation, les tests SQL (client ne peut pas forger la provenance ; rejeu idempotent ; doublon inter-sources compté une fois ; séance importée soumise au moteur de risque).
- Aucune table, fonction ni interface n'est créée par cet ADR : tant que rien n'est branché, il n'y a rien à verrouiller de plus.
- Le choix de la coque Android (ADR-001) ne change pas ces règles : elles vivent dans le code web et la base.

## Points ouverts
- Quelle source en premier (Health Connect en coque native, ou un fournisseur web) : décision produit, et la coque TWA ne lit pas Health Connect (voir ADR-001).
- Durée de conservation des séances importées et des liens de déduplication (Q-002).
