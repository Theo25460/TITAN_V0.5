# Points qui demandent une validation humaine avant publication (LEG13, LEG56, LEG57)

Liste unique, tenue à partir du comportement réel du code et des documents de travail (état technique corrigé le 21/10/2026). **Rien ici n'est un avis juridique.** Chaque ligne dit ce que le code fait déjà, ce qu'il reste à trancher, et où le détail se trouve. Ces points **ne bloquent pas le développement** : ils conditionnent la publication (LEG57, gate juridique avant production majeure). Une ligne est retirée quand une personne compétente l'a validée et que la décision est inscrite dans le cahier.

| # | Sujet (LEG) | Ce que le code fait aujourd'hui | À trancher par une personne compétente | Détail |
|---|---|---|---|---|
| 1 | Éditeur et mentions légales (LEG16) | Page `/legal_mentions` générée ; identité de l'éditeur non inventée | statut réel de l'éditeur, dénomination, adresse, directeur de publication, hébergeur | `tools/build-public-docs.mjs` |
| 2 | Vendeur et facturation (LEG25, LEG19–LEG24) | V1 WEB sans vente ni abonnement ; Paddle, checkout et publicité désactivés. Qualification du vendeur à reprendre avant toute commercialisation | qui est vendeur par canal, TVA, mentions précontractuelles, rétractation, résiliation, médiateur de la consommation, garantie légale | `docs/PLAY_CONSOLE.md` §3, `docs/adr/ADR-004-google-play-billing-titan-plus.md` |
| 3 | Bases légales (LEG27, LEG26) | registre-squelette rédigé | base légale de chaque traitement (contrat, consentement, intérêt légitime) | `docs/LEGAL_PROCEDURES_DRAFT.md` §1 |
| 4 | Durées de conservation (LEG31, LEG03, Q-002) | durées préparées par le code candidat, page publique de suppression prête ; migrations non appliquées en production | validation des durées et de leur fondement ; durée comptable si TITAN est vendeur ; durée des sauvegardes (A11) et des journaux d'hébergement | `docs/DATA_RETENTION.md` |
| 5 | Transferts hors EEE (LEG30, LEG29) | base en Irlande (`eu-west-1`) ; flux effectivement actifs à confirmer sur le déploiement visé | pays et garanties pour Netlify, Resend, Paddle, Google ; sous-traitants ultérieurs | `docs/LEGAL_PROCEDURES_DRAFT.md` §2, `docs/PRIVACY_TECHNICAL_INVENTORY.md` §1 |
| 6 | Âge et mineurs (LEG08, LEG38, LEG39) | politique décidée par le fondateur le 21/10/2026 : ouvert dès 13 ans, accord d'un adulte (représentant légal) pour les mineurs ; profils privés par défaut ; aucune publicité | politique d'âge définitive, vérification d'âge, public cible Google Play (13+ ou 18+) | `docs/PLAY_CONSOLE.md` §3 |
| 7 | Mesure d'audience (LEG41, LEG42, LEG40) | refus : rien n'est envoyé ; sans choix : comptage anonyme ; accord : rattaché au compte ; aucun cookie ; aucun traceur tiers | le comptage anonyme avant tout choix est-il bien exempté de consentement ? | `docs/PRIVACY_TECHNICAL_INVENTORY.md` §2–3 |
| 8 | Décisions automatisées (LEG54) | l'anti-triche informe seulement ; la retenue de récompense est bornée à 24 h puis libérée seule ; exclusion, suspension et bannissement restent des décisions d'administrateur ; recours joueur | une retenue automatique de 24 h est-elle une « décision automatisée » à encadrer ? information du joueur | `docs/adr/ADR-002-moteur-de-risque-evolutif.md`, `docs/CDC_WEB_REWARD_HOLDS_HANDOFF_2026-10-19.md` |
| 9 | Communauté et DSA (LEG45–LEG49, LEG47, LEG48) | signalement de contenu, modération, recours ; messages limités à 48–72 h | qualification au regard du DSA, point de contact, règles de communauté publiées, licence des contenus publiés | — |
| 10 | Données de santé et sources connectées (LEG14, LEG36, LEG37) | aucune source externe aujourd'hui ; tracé GPS non conservé (seules des statistiques d'un GPX importé) ; règles posées avant tout branchement | classification des données Health Connect, Garmin, Samsung ; permissions minimales ; AIPD | `docs/adr/ADR-003-provenance-des-sources-d-activite.md` |
| 11 | Concours, influenceurs, ambassadeurs (LEG50, LEG51, LEG44) | table `influencers` (nom et e-mail de personnes externes) **sans durée ni purge** ; `contest_entries`, `contest_draws` | règlement des concours, base légale et durée pour les contacts d'influenceurs, séparation messages transactionnels / prospection | `docs/PRIVACY_TECHNICAL_INVENTORY.md` §3 |
| 12 | Droits RGPD et violations (LEG32, LEG33) | export JSON/CSV, suppression en un geste, procédure de réponse rédigée en brouillon | validation de la procédure, délais, vérification d'identité, registre des violations, 72 h | `docs/LEGAL_PROCEDURES_DRAFT.md` §3–4 |
| 13 | AIPD et DPO (LEG34, LEG35) | non évalué | obligation d'AIPD (traitement de données sportives à grande échelle, profilage anti-triche) ; désignation d'un DPO | — |
| 14 | Accessibilité (LEG52) | tests automatisés de défilement latéral, focus, étiquettes sur de nombreux parcours | applicabilité du cadre d'accessibilité et déclaration | `tests/e2e/accessibility-axe.e2e.mjs`, `tests/e2e/viewports.e2e.mjs` |
| 15 | Santé ≠ service médical (LEG53) | l'application ne donne aucun conseil médical | formulation de la mention dans les CGU et la fiche Play | `docs/PLAY_CONSOLE.md` §3 |
| 16 | Pays visés (LEG55) | site en français, vendeur à confirmer | pays réellement ciblés et règles impératives de consommation | — |
| 17 | Fiche Google Play et Sécurité des données (GP05, GP06, LEG04) | réponses proposées, tableau des données | validation avant saisie ; cohérence avec la politique de confidentialité | `docs/PLAY_CONSOLE.md` §4–5 |
| 18 | Achats par Google Play (PREM12) | conception prête, désactivée | lecture des règles Google officielles à jour ; conditions de remboursement ; mentions | `docs/adr/ADR-004-google-play-billing-titan-plus.md` |
| 19 | Dossier de preuve (LEG56) | historique git versionné ; textes générés avec numéro de version et date | conservation des versions acceptées des CGU, preuves de consentement, registre, AIPD | — |

## Comment lever un point

1. La personne compétente lit la ligne et le document cité.
2. Elle tranche ; la décision est écrite dans le cahier (question Q-XXX résolue) avec la date.
3. Si la décision change le comportement, un lot de développement l'applique, avec ses tests ; sinon la ligne est retirée de ce tableau.


## Ajouts du 21/10/2026

- **LEG52 — accessibilité** (`docs/ACCESSIBILITY_ASSESSMENT.md`) : qualifier les obligations du service gratuit réellement lancé, sans tenir pour acquis une vente Paddle ni une exemption ; décider des justificatifs et d’une éventuelle déclaration.
- **LEG47 — règles de la communauté** (`/regles-communaute`) : relire les mesures décrites (retirer un contenu, demander une vérification, mettre une séance à l'écart, suspendre, bloquer), la mention « pas de délai de réponse garanti » et la retenue automatique de 24 heures des récompenses à risque élevé, qui doit rester vraie au moment de la mise en ligne (migrations 19 à 26 appliquées avant la page).
- **GP12 à GP15 — lien Google Play** : valider que le lien texte remplace le badge officiel, et la bande « TITAN existe aussi sur Android » sur le web mobile Android.
