# Handoff — lot de onze points : moteur modulaire, analytics stables, SEO vérifié (Claude, 20/10/2026)

| Point | Statut | Preuve |
|---|---|---|
| CHEAT01 — validations côté serveur | [x] | un joueur ne peut ni insérer ni supprimer une séance (droits : lecture et mise à jour administrateur seulement), ni modifier XP/état de revue (`sql/tests/300_client_writes.sql`, 31 écritures) ; le gain est calculé par `titan_submit_training_session` (champs de récompense forgés ignorés, `300_economy_attacks.sql`) ; la validité d'une performance est décidée par le garde et le moteur de risque en base |
| CHEAT02 — moteur modulaire par sport/métrique | [x] | signaux indépendants (chevauchement, saut de vitesse, allure impossible, série, volume du jour) et plafonds d'allure **par sport en données** (`private.titan_sport_limits`) ; test : sport sans ligne non jugé, ligne ajoutée = effet sans code |
| CHEAT03 — références humaines maximales | [x] | trois disciplines comparables (course, marche, natation) avec la référence officielle qui justifie chaque borne généreuse (records du monde 5 000 m, 10 000 m, 20 km marche, 800 m et 1 500 m nage) ; autres disciplines : insérer une ligne ; borne de marche corrigée à 20 km/h (16 km/h était sous le record du 5 000 m marche en salle) et borne de nage portée à 9 km/h (7 km/h n'avait que 9 à 13 % de marge sur les records : courant, marée, palmes) |
| BOT10 — évolution vers des modèles plus fins | [x] | `docs/adr/ADR-002-moteur-de-risque-evolutif.md` (statut proposé) et contrat de signal testé (`300_risk_signals_extra.sql` : code stable, gravité connue, points = poids partagé, score = somme) ; aucune dépendance à une IA externe |
| DATA09 — événements d'analyse stables | [x] | `tests/analytics-contract.test.mjs` + `docs/analytics-events.snapshot.json` : aucun événement publié ne peut disparaître ou être renommé, tout nouvel événement doit être au snapshot, à la doc et au contrat SQL ; test ajouté à `pnpm test` |
| SEO03 — favicon, icônes tactiles, manifeste | [x] | `tests/seo-meta.test.mjs` : icônes du manifeste présentes en 192 et 512 dont une maskable, favicon, apple-touch |
| SEO04 — title, description, canonical | [x] | mêmes tests sur les 23 pages publiques : longueurs, unicité, canonical égal à l'URL du plan du site |
| SEO05 — Open Graph | [x] | og:title/description/image/url et twitter:card sur chaque page publique, image existante sur le domaine du produit, og:url cohérente |
| SEO06 — données structurées | [x] | JSON-LD valide sur chaque page ; accueil : Organization, WebPage, WebApplication |
| SEO07 — sitemap, robots, indexabilité | [x] | plan du site : pages existantes et indexables ; robots.txt : sitemap déclaré, aucune page publique bloquée |
| SEO08 — rien de privé indexé | [x] | `tests/seo-index.test.mjs` : toute page hors plan du site est noindex (fichier de vérification Search Console et ancienne console exemptés, bloqués par robots/404) |

Non traité : SEO01 (aperçu Google jugé mauvais) et SEO02 (ancien logo) dépendent de ce que Google a en cache : la vérification des métadonnées est faite, pas le résultat chez Google.

Revue indépendante : aucun bloquant. Remarque d'exploitation : `20261019180000_session_risk.sql` est modifiée en place parce qu'**aucune base ne l'a appliquée** (la production s'arrête à `20261005230000`) ; dès qu'une migration est appliquée quelque part, toute évolution passe par une nouvelle migration datée. Corrigés après revue : borne de nage, commentaire de record, droits de la table des limites testés pour anon et authenticated en écriture, extraction d'événements robuste (guillemets, mots entiers), détection du noindex indépendante de l'ordre des attributs. Non couvert : un noindex posé par en-tête HTTP (aucune page du plan du site n'en reçoit).

## BLOQUANT À CORRIGER MAINTENANT
Aucun.
## NON BLOQUANT – BACKLOG FINITION
Plafonds d'allure pour d'autres disciplines (avirons, kayak d'eau calme, patinage…) ; réglage des seuils de gravité en données ; vérification manuelle de l'aperçu Google après publication.
## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE
BOT06 (après Q-005) ; formulaire de recours joueur ; premier build Android.
