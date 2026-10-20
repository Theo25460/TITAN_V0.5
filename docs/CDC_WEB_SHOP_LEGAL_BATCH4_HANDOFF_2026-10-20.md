# Handoff — boutique saine et brouillons de conformité (Claude, 20/10/2026)

| Point | Statut | Preuve |
|---|---|---|
| SHOP03 — pas d'achat de monnaie contre argent réel | [x] | `tests/no-currency-purchase.test.mjs` : le webhook de paiement ne lit ni n'écrit crédits, XP ou niveau ; aucune offre d'achat de pièces ou d'XP dans les pages et scripts ; `sql/tests/300_shop_policy.sql` : aucune colonne de prix en monnaie réelle, aucun prix négatif |
| SHOP11 — jamais d'avantage vendu | [x] | `300_shop_policy.sql` : le catalogue actif ne contient que des cosmétiques ; chaque article (actif ou non) est tenté par un joueur riche : les non-cosmétiques et inactifs sont refusés, aucun achat ne rapporte crédits, XP ou niveau, aucun remboursement ; production lue en lecture seule : 20 cosmétiques actifs (6 autres cosmétiques inactifs), les 9 articles « charge », « upgrade » et « ad » sont inactifs |
| SHOP17 — ajouter un objet sans toucher au code | [x] | `300_shop_policy.sql` : une simple ligne `shop_items` apparaît dans l'Atelier et s'achète |
| SHOP20 — économie atteignable sans pub ni Premium | [x] | `300_shop_policy.sql` : une séance ordinaire paie un joueur gratuit, son plafond hebdomadaire couvre le cosmétique gratuit le plus cher, plus de la moitié du catalogue (16 sur 20 cosmétiques actifs en production, hors réservés Premium ou Elite) lui est ouverte ; aucune publicité n'est active |
| LEG26 — registre des traitements | [~] | squelette dans `docs/LEGAL_PROCEDURES_DRAFT.md` §1 ; base légale, durées : à valider |
| LEG30 — transferts hors EEE | [~] | §2 : Supabase en eu-west-1 confirmé ; Netlify, Paddle, Resend et sauvegardes à confirmer |
| LEG32 — procédure d'exercice des droits | [~] | §3 : moyens techniques en place (export, suppression testée, rectification, refus de mesure) ; adresse, vérification d'identité, délais, registre : à définir |
| LEG33 — violation de données | [~] | §4 : déroulé en cinq étapes ; responsable, contact de l'autorité, modèle, registre : à désigner |

Non traité : SHOP04 (les pièces viennent surtout de la progression : vrai aujourd'hui, mais sans publicité récompensée pour le plafonner), PREM13 (Premium validé côté serveur : webhook signé et droits fermés prouvés ; synchro Android attend la cible Android).

Revue indépendante : aucun bloquant ; corrigés : chiffre des articles ouverts (16 et non 14), détecteur d'offres élargi (chiffres, « Acheter 500 crédits », prix en euros, tous les scripts et fonctions, avec auto-contrôle sur des exemples), contrôle de la fonction SQL d'habilitation de Paddle, code mort retiré du test. Limite : le contrôle du webhook reste lexical (pas d'effet de bord prouvé par exécution).

## BLOQUANT À CORRIGER MAINTENANT
Aucun.
## NON BLOQUANT – BACKLOG FINITION
Retirer les articles hérités inactifs du catalogue (charge, upgrade, ad) après décision ; raretés (SHOP12) ; aperçu des récompenses à venir (SHOP19).
## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE
Relecture humaine des brouillons légaux ; BOT06 après Q-005 ; formulaire de recours joueur ; premier build Android.
