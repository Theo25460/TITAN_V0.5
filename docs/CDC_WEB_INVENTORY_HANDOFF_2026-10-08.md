# Handoff — inventaire et aperçu Atelier — 8 octobre 2026

Ce lot reprend après la livraison de l’intégration [PR #23](https://github.com/Theo25460/TITAN_V0.5/pull/23), tête `6b62da7695a374469f9377cd37888681a6441894`. La [PR #24](https://github.com/Theo25460/TITAN_V0.5/pull/24) conserve cette tête dans son ascendance et donc les quatre lots précédents. Elle vise `main` pour que la CI combinée reste exécutée ; elle ne demande pas une publication et ne ferme aucune PR historique.

## Périmètre du lot

- **SHOP14** : filtres « Tout », « Acquis », « À débloquer » ; compteur d’acquisitions permanent distinct des accès temporaires Titan+ ; états vides et catégories conservées. Une pièce empruntée n’est pas présentée comme acquise. Les achats historiques sans champ `permanent` gardent leur interprétation existante.
- **SHOP14** : action « Retirer » sur une pièce portée, si une pièce de base est disponible. Le RPC `titan_set_appearance` équipe la pièce de base du même emplacement. Il ne supprime aucun achat et ne débite aucun crédit ; la pièce peut être portée à nouveau. Le serveur conserve les contrôles de propriétaire et de possession.
- **SHOP18** : aperçu agrandi d’un cadre, d’une ambiance ou d’une carte dans la fenêtre existante du shell, avec conditions d’acquisition. L’aperçu n’effectue aucun RPC, achat ou équipement. Il ne modifie pas le style courant.
- Les nouvelles ressources Atelier et CSS portent `v=300.3` dans `boutique.html`. Le précache du build est régénéré depuis les URL des pages.

Le lot ne crée pas d’avatars, titres, raretés ou catalogue supplémentaire. Il ne clôt pas SHOP15/SHOP16, l’équilibre global SHOP20 ni les autres exigences de personnalisation.

## Vérification

- Baseline reprise : 71 tests unitaires verts ; arbre initial propre, branche isolée issue de l’intégration.
- Trois nouveaux tests du vrai Atelier/shell dans Chromium : acquisition permanente et retrait à 360/1280 px ; ancien catalogue, filtre et état vide ; aperçu cadre/ambiance/carte sans modification de solde, préférence ni nombre d’appels RPC.
- **RED** : trois tests échouaient sur l’absence des filtres/aperçus avant implémentation.
- Deux attentes de fixture ont été corrigées pendant le diagnostic : le cadre inclus s’appelle `frame-standard`, et `titanShell.look()` omet intentionnellement la décoration de base. Les données des frontières RPC, état et shell ont confirmé le comportement ; aucune règle produit n’a été modifiée pour faire passer le test.
- **GREEN** : `pnpm run verify` donne 71 tests verts, syntaxe, build et audit sans erreur bloquante. `pnpm run test:e2e` donne 21/21 parcours verts. `git diff --check` est propre.
- Rendu observé à 360/1280 px, aperçus agrandis sur mobile. Les captures sont locales, avec comptes/RPC synthétiques et accès réseau externe bloqué.

## Revue et CI

Une unique revue indépendante Sol 6.1 a lu le delta et les contrats réels du shell/SQL, puis vérifié en Chromium les refus RPC, changement de propriétaire, pièces de rang, anciens serveurs, filtres et fermeture de l’aperçu. Aucun Critical ; un Important et un Minor relevés.

- **I1, Important, corrigé RED→GREEN** : au clavier, « Retirer » détruisait le bouton focalisé pendant le rendu. Le focus restait sur BODY et Tab repartait au début des commandes. Le test reproduit l’échec, puis vérifie que le focus va sur « Porter » de la pièce retirée et que Entrée la remet. La restauration commune à `wear` couvre également le retour sur « Retirer » après équipement ; elle ne déplace pas le focus si l’utilisateur l’a changé pendant l’attente du RPC.
- **M1, Minor, corrigé dans la même passe** : le toast ne promet plus un rééquipement sans limite pour une pièce empruntée. Il distingue l’acquisition permanente et l’accès temporaire. Cette correction de texte n’ajoute pas de test qui recopierait le libellé ; les règles d’accès existantes restent testées.
- La première CI `37789866796` passait les tests/build et SQL, mais échouait sur une assertion immédiate du cadre dans le DOM du shell. `refresh()` attend une animation frame : le modèle avait déjà le style de base alors que l’ancien avatar était encore rendu. Le test attend maintenant l’absence effective du cadre avant son assertion ; aucun délai fixe, assertion retirée ou contrôle de production affaibli.
- Les arbres local et distant sont comparés avant chaque mise à jour de la branche. La tête locale de l’implémentation `cfecdf9` et sa tête GitHub `2401206` avaient le même arbre `153e64e8aa3a617470d84c063aba286634788378` ; les SHA de commit diffèrent uniquement par les métadonnées de création du connecteur.

La CI finale doit confirmer les 71 tests, 21 E2E et les deux voies SQL avant sortie du brouillon. Aucune seconde revue n’est lancée : le défaut Important est vérifié par son test de régression et la suite complète. Astra maximal reste réservé à l’audit transversal de la version complète, avant toute production majeure.

## Décisions sur les limites considérées par la revue

| Comportement considéré | Décision et conséquence si elle échoue |
| --- | --- |
| Focus préexistant sur Porter et changement de catégorie | `wear` rétablit maintenant le focus sur Porter/Retirer ; le changement de catégorie reste ouvert dans UX09/QA13. Une navigation clavier plus longue peut encore être nécessaire après une catégorie. |
| Flèches/Home/End dans les onglets existants | Pas de réécriture des onglets dans ce lot ; validation d’accessibilité globale maintenue. Les interactions ARIA peuvent rester incomplètes. |
| Concurrence RPC, achat suivi d’équipement refusé et synchronisations Auth | Contrats et gardes de la PR #23 conservés ; cet aperçu ne crée pas d’opération serveur. Des cas économiques ou Auth hors tests existants peuvent rester non détectés. |
| RLS globales, suspensions, facturation, expiration/remboursement et release réelle | Pas de clôture globale ; exigences et gates des lots antérieurs maintenus. Cette revue ne garantit pas la sécurité ou la conformité de toute la version. |
| Catégories futures, catalogue incohérent, pièce de base absente/inactive, objets hors Atelier | La nouvelle interface utilise le catalogue fourni ; Retirer est masqué sans pièce de base possédée. Une extension devra valider ses contrats et l’affichage, et un catalogue incohérent peut masquer une action. |
| Fidélité des aperçus à tous les consommateurs, contrastes exhaustifs, appareils/autres moteurs, hors ligne complet | Aperçus des trois catégories et captures Chromium vérifiés ; recette réelle et UX09/QA05/QA13 restent ouvertes. Un défaut spécifique à un appareil ou consommateur peut échapper au lot. |
| Libellés généraux, comptage hors catalogue, pagination/recherche et enrichissement | Compteur limité aux pièces du catalogue Atelier actuel et acquisitions distinguées des emprunts. Les nouvelles catégories/récompenses relèvent des exigences de boutique non clôturées ; leur absence n’est pas masquée par SHOP14. |

## Limites et reprise

- Aucune migration supplémentaire, écriture de production, configuration de paiement ni modification Android/Play Console.
- Compte connecté réel et appareils réels non testés dans ce lot ; QA05/QA06/QA13 restent partiels. L’état des achats et les refus de possession reposent sur les contrats serveur déjà testés dans la PR #23.
- Les ressources nouvelles sont versionnées ; le contrôle PWA existant passe. Le rollback de ce lot vers la PR #23 garde les acquisitions en base : seuls les filtres, retrait explicite et aperçu disparaissent.
- Le cadre retiré reste dans la collection et le style de base est une préférence serveur ; aucun rééquipement implicite depuis un cache local ne doit être ajouté.
- Pour une release globale, conserver les gates des handoffs antérieurs : recette réelle, sauvegarde/restauration, migrations distinctes, conformité et audit final Astra. Le cahier reste ouvert pour les autres lots.
