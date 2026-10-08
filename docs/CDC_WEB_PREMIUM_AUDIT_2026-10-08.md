# Audit Titan+ web — PREM01

Base : PR #24, tête distante `b3430bcc80b6ac58ce4bb436d69427dbd25e42f5`. Audit du code de la branche intégrée ; aucun achat, changement de prix, migration ou accès aux données personnelles en production.

## Ce que l’offre fournit réellement

| Usage | Classique | Titan+ actuel | Source technique |
|---|---|---|---|
| Journal, historique, exports CSV/JSON, records, objectifs | Inclus | Identiques | `js/app/journal.js`, `js/app/records.js`, `js/app/profil.js` |
| Récap et analyses de volume, répartition, allure, force, escalade, charge et cadence | Inclus | Identiques | `js/app/semaine.js`, `js/core/questions.js` |
| Routines de musculation nommées | 5 | 20 | `js/app/seance.js`, `routineSheet` ; limite de création client, pas une protection serveur suffisante pour un nouveau service payant |
| Sportifs suivis par coach | 3 | 20 | `js/app/coaching.js`, migration `20260913134828_renaissance_coaching_workspace.sql` ; quota, expiration et remboursement contrôlés dans le RPC |
| Campagnes | Aube et Marées, 18 chapitres | Obsidienne et Aurores en plus, 18 chapitres | `js/renaissance-catalog.js`, `js/app/aventure.js` |
| Quatre styles Atelier | Acquisition par crédits d’activité | Acquisition identique, plus accès temporaire | Migration `20261008120931_web_cosmetic_fairness.sql`, `js/app/atelier.js` |
| Publicités actuelles | Absentes | Absentes | Aucun avantage de suppression d’annonces actif à présenter aujourd’hui |

Le tarif web affiché reste 5 €/mois. Le paiement définit les taxes et conditions finales. Ce lot ne valide ni l’économie du prix, ni le parcours de paiement réel, ni Android Billing.

## Pourquoi la valeur perçue risque d’être faible

Ces raisons sont des **hypothèses produit fondées sur les fonctions disponibles**, pas des résultats d’une enquête ou des mesures de conversion :

1. L’écart principal demandé par la doctrine, la profondeur des analyses, n’existe pas encore : `/stats` rend les mêmes questions pour Free et Titan+. Un utilisateur qui vient surtout comprendre son sport n’a actuellement aucun outil d’analyse supplémentaire à acheter.
2. Les routines intéressent surtout la musculation et le quota coach surtout les entraîneurs. Ces bénéfices ne répondent pas au même besoin récurrent pour un coureur, un grimpeur ou un pratiquant multisport individuel.
3. Les deux campagnes apportent du contenu fini. Elles peuvent attirer, mais ne constituent pas à elles seules une raison durable de renouveler. La campagne principale gratuite et des boss battables sans paiement doivent rester protégés dans la future refonte RPG.
4. Des styles gagnables gratuitement avec les crédits ne peuvent pas servir de promesse d’exclusivité payante. Il faut distinguer accès temporaire et possession permanente.
5. Une liste de quotas décrit mal le gain quotidien. Les exemples visuels doivent expliquer à quel usage correspond chaque capacité.
6. Le générateur pouvait réintroduire une promesse d’objets payants et annoncer la perte de styles acquis à expiration. Cette incohérence technique fragilise la confiance même si la page HTML avait été corrigée.

## Correction livrée dans ce lot

`/tarifs#concret` présente les capacités 5→20 et 3→20, les vrais visuels des deux mondes et les parcours explicatifs. Une zone séparée confirme la gratuité des analyses existantes. L’Atelier donne accès à cette explication dans les deux états d’abonnement.

La source du générateur, le contenu visible, la FAQ structurée et les pages générées sont cohérents sur la possession permanente et l’accès temporaire. Des tests exécutent réellement le générateur dans un dossier temporaire puis vérifient la régénération et la correspondance des deux pages d’offre.

Ce travail améliore la clarté de l’offre actuelle ; **il n’ajoute pas de fonctionnalités d’analyse Premium** et ne ferme donc pas PREM02/PREM04.

## Suite recommandée pour PREM04, à construire puis tester

Priorité : une comparaison personnelle de périodes complètes, à la demande depuis Progrès, sans créer un nouvel onglet principal.

| Option | Valeur et faisabilité | Décision proposée |
|---|---|---|
| Comparer 4, 12 ou 26 semaines, tous sports ou un sport | Moteurs purs déjà présents ; séances sources disponibles. Volume, fréquence, jours actifs, données estimées distinctes des données déclarées | Premier lot d’analyses avancées. Comparer des périodes égales et complètes, gérer les semaines sans données, les dates locales et les divisions par zéro |
| Comparer des performances | Records sourcés déjà présents, mais sports/unités/exercices/cotations ne sont pas interchangeables | Étape suivante ; mêmes contextes uniquement, pas de score sportif global ni de somme de kilomètres et kilogrammes |
| Rapport mensuel/annuel personnel | Réutilisable à partir du moteur de comparaison ; export basique existant à conserver gratuit | Après la comparaison fiable ; aperçu fidèle avant export, sources et période explicites, aucune nouvelle copie distante des données sans besoin |
| Vues et filtres sauvegardés | Préférences et stockage déjà présents | Après validation des analyses ; quelques vues utiles, réinitialisation possible, pas de constructeur de dashboard complexe |
| Favoris avancés et accueil personnalisable | Favoris de sports déjà livrés gratuitement | Préserver ces favoris. Étudier les presets d’analyse et modules masquables ; ne pas paywall les raccourcis essentiels |

Avant tout nouveau droit payant, utiliser un état serveur lié à l’utilisateur avec expiration/remboursement et contrôle du propriétaire après chaque attente. Le seul booléen `titanIsElite()` ou le fallback de profil de l’Atelier ne suffit pas pour autoriser un nouveau service. PREM13/PREM14 restent ouverts ; aucun nouveau droit n’est ajouté dans ce lot.

Les campagnes payantes actuelles doivent aussi être réévaluées dans le lot RPG : ne pas construire l’offre future autour d’une restriction supplémentaire de la progression principale gratuite.

## Mesure et limites

`js/app/analytics.js` prévoit `premium_checkout_started` et `premium_activated`, avec consentement et propriétés limitées. Il ne démontre ni que les bénéfices sont compris, ni la conversion par usage, ni la rétention de l’abonnement. Aucun taux n’a été inventé et aucune nouvelle collecte n’est ajoutée ici.

La suite PREM15 devra relier, avec consentement, consultation des bénéfices, utilisation des nouveaux outils, checkout confirmé et rétention, sans notes, santé, GPS ou textes libres. Les événements du navigateur ne constituent pas une preuve de revenu ni d’abonnement.

PREM01 peut être fermé sur cet audit vérifiable. PREM10 concerne la page web des bénéfices existants. PREM02 reste partiel jusqu’à une proposition réellement enrichie en profondeur sportive ; PREM03–PREM09 et PREM11–PREM15 ne sont pas déclarés terminés par ce lot.
