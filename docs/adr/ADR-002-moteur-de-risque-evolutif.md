# ADR-002 — Moteur de risque évolutif (BOT10, CHEAT02, CHEAT03)

Statut : proposé (Claude, 20/10/2026), non validé par Théo. Aucune dépendance à une IA externe ni payante.

## Contexte
Le risque d'une séance est calculé par `private.titan_session_risk` (migration `20261019180000_session_risk.sql`), lu par la file de modération, l'analyse périodique, la retenue des récompenses et l'écran d'administration. Il doit pouvoir s'enrichir (statistiques plus fines, un jour un modèle appris) sans casser ces consommateurs, ni coûter un appel à un modèle externe par séance.

## Décision
1. **Contrat stable** : le moteur renvoie, pour chaque séance, `score`, `state` et une liste de **signaux** `{code, severity, points, detail}`. `code` est un identifiant stable (`overlap`, `speed_jump`, `beyond_human`, `extraordinary_series`, `day_volume`), `severity` ∈ {low, medium, high, critical}, `points` = poids partagé de la gravité (`private.titan_moderation_weight`), `detail` un objet. Le score est la somme des points ; les états en découlent (3 / 8 / 20). Testé par `sql/tests/300_risk_signals_extra.sql`.
2. **Un signal = un producteur indépendant** : chaque signal est un bloc (CTE) qui lit les séances et ne connaît pas les autres. Un nouveau signal s'ajoute en un bloc et une ligne dans la liste des valeurs ; aucun consommateur ne change, car ils lisent le contrat, pas les signaux nommés.
3. **Les paramètres sont des données** : les plafonds d'allure par sport sont dans `private.titan_sport_limits` (avec la référence qui les justifie). Ajouter une discipline = insérer une ligne. Les seuils de gravité restent dans le code tant qu'ils n'ont pas besoin d'être réglés sans migration.
4. **Un futur modèle statistique est un producteur de plus** : par exemple un écart à la distribution personnelle (z-score robuste) ou à celle d'une cohorte anonymisée agrégée, calculé en base (SQL ou fonction), ou hors ligne puis déposé dans une table privée que le moteur lit. Il émet des signaux du même contrat, plafonnés à `medium` tant qu'il n'a pas été évalué sur les faux positifs (`sql/tests/300_false_positives.sql` est le garde-fou : onze profils légitimes ne doivent jamais atteindre la revue).
5. **Jamais d'effet automatique par un modèle** : le score informe (file, retenue bornée à 24 h, revue humaine). Exclusion, suspension et bannissement restent des décisions d'administrateur, motivées et annulables.
6. **Coût borné** : la fenêtre est de 120 jours et 1 000 séances par compte ; l'analyse périodique reste limitée aux comptes actifs récents.

## Conséquences
- Ajouter un signal : un bloc SQL, un libellé dans `js/admin.js`, un test de déclenchement et un test de faux positifs.
- Changer le contrat (clé, état, poids) est une migration dédiée et casse les consommateurs : à éviter.
- Les données d'entraînement d'un éventuel modèle appris ne quittent pas la base sans décision explicite (voir Q-002 pour la conservation).
