# Checkpoint d’intégration web — 18 octobre 2026

## Objectif et trois points

**A07 / A08 / QA05**. Appliquer la nouvelle consigne : arrêter la série de micro-corrections, vérifier l’ensemble une fois sur une branche isolée, puis passer à la progression/RPG. A07 ferme une exigence partielle ; A08 et QA05 avancent directement le bloc « intégration finale » autorisé par la consigne, en vérifiant ensemble la chaîne jusque-là testée surtout par lots. Aucun des trois points n’est un polissage UX. Ce checkpoint ne fusionne ni ne déploie l’application.

- **A07** : stratégie de branches/commits explicitée dans CONTRIBUTING.md pour Android, monétisation, RPG, anti-triche et UX ; dépendances exactes, espaces isolés, commits cohérents, plafond de huit PR et checkpoint, retour arrière. Exigence satisfaite pour la mise en place de cette stratégie ; les macro-blocs eux-mêmes ne sont pas déclarés achevés.
- **A08** : vérifications communes exécutées sur la chaîne et PR de checkpoint contre main pour déclencher les trois jobs existants. Reste partiel : les contrôles JavaScript de syntaxe/assets ne sont pas un type-check statique.
- **QA05** : suite navigateur commune, parcours desktop/mobile et scénarios de cache/hors ligne existants. Reste partiel : Android et appareils/PWA installés non certifiés.

## Sources et intégration

Branche isolée `codex/web-integration-checkpoint-20261018`, issue de la chaîne #94. Parent publié : `cdfc586c4f668af629606a1dc7fb00cfb308864c` ; son arbre `73c3a43726f61315f2449e35c85926f93f330968` est identique à celui du parent local `e949e59`.

Comparaison GitHub main → tête #94 : `ahead`, `behind_by = 0` ; main et ancêtre commun `e903ac317b44c9648daaa3ba124a3e607c470c31`. L’ascendance locale confirme cette base. Il s’agit d’une chaîne linéaire contenant main : pas de conflit à résoudre, ni de cherry-pick nécessaire. Le checkpoint agrège la chaîne complète, pas seulement les neuf dernières PR. Le plafond de huit PR de la nouvelle consigne a déjà été dépassé par la série historique : l’empilage est arrêté maintenant.

Têtes récentes relues sur GitHub, toutes ouvertes et non fusionnées :

| PR | Tête publiée | Dépendance |
| --- | --- | --- |
| #86 | c8fc9b68a0dd77c383933ce902292425a49e0ea0 | #85 |
| #87 | 2e91ce36bb39f43426becc7e2cfedb2cbfa36894 | #86 |
| #88 | 7eed057141b0ef555f58e8075c09224e6c044ebf | #87 |
| #89 | fcdf41fb575dc473328890272d20a25fe1c4f2a8 | #88 |
| #90 | fc7e003cff740514f5bdc9950d9167faf2fd0773 | #89 |
| #91 | 27d430c970407152e37c49c9875a70f29a3ec654 | #90 |
| #92 | 6bb5aa39531ae98bb63395faddb5c2f548ded714 | #91 |
| #93 | e1015702d2bd923f83ee9724283d8aa7022b5471 | #92 |
| #94 | cdfc586c4f668af629606a1dc7fb00cfb308864c | #93 |

La PR de checkpoint cible **main**, car `.github/workflows/ci.yml` déclenche les pull requests seulement contre main. Les PR sources restent ouvertes ; leur fusion séparée n’est pas nécessaire à cette validation. La CI existante couvre verify, Playwright et les deux voies SQL sur bases jetables PostgreSQL16.

## Vérifications et limites

- `pnpm verify` : exit 0 ; 188/188 tests, 62 scripts analysés, build de 103 fichiers hors ligne, audit sans erreur et 16 avertissements préexistants.
- Suite navigateur commune et CI : résultats consolidés, nombre de cas et HEAD exact à consulter dans la description de la PR de checkpoint et son handoff du cahier. Ce document conserve les preuves locales déjà acquises à sa publication ; il ne préjuge pas du résultat distant.
- Incident de lancement : verify et test:e2e lancés en parallèle ont reconstruit le même dist. Le journal du serveur atteste ENOENT sur dist/index.html à 17:35:21 UTC, suivi des refus de connexion Atelier. Relance Atelier seule : 15/15 réussis, exit 0. Aucune correction produit justifiée par cet incident. Exécuter désormais verify puis test:e2e séquentiellement ; les jobs CI disposent de checkouts distincts.
- SQL local non exécuté : binaires PostgreSQL absents. Les résultats de la CI distante doivent être vérifiés avant de déclarer ce volet réussi.
- Les fixtures navigateur utilisent des propriétaires et gateways synthétiques ; les scénarios locaux existants ne certifient pas les comptes réels, les autres moteurs, lecteurs d’écran physiques, Android ou une installation PWA sur appareil réel.

## BLOQUANT À CORRIGER MAINTENANT

À la publication documentaire, aucun nouveau défaut produit important confirmé. Le checkpoint exige encore la vérification du résultat final commun dans la PR et le cahier : ne pas le déclarer validé si un job reste rouge ou inconnu. Corriger seulement un échec fonctionnel, sécurité ou données démontré, pas les avertissements éditoriaux.

## NON BLOQUANT – BACKLOG FINITION

Voir [BACKLOG_FINITION.md](BACKLOG_FINITION.md). Les limites de recette finale et obligations de type-check/Android restent distinctes des finitions facultatives. Aucune nouvelle exigence pour du confort supplémentaire.

## EXIGENCE OU MACRO-BLOC SUIVANT

**Progression/RPG**. Récupérer le livrable du chantier RPG01 (statut et note de handoff incohérents), puis choisir trois exigences utiles de ce macro-bloc. Aucun nouvel audit transversal web sans régression, changement substantiel ou risque concret. A07 peut être fermé ; A08/QA05 restent partiels pour les raisons précises ci-dessus, sans autoriser une boucle de polissage.

## Périmètre et retour arrière

Trois fichiers documentaires uniquement. Aucun changement applicatif, de dépendance, de schéma, de règle XP/crédits/récompense ou d’activation. Profil et smoke partagés sont lus/exécutés mais pas modifiés ; WORK/Android et RPG01 réservés respectés. Les fichiers étrangers du checkout initial sont exclus. Pour abandonner ce checkpoint : fermer sa PR ; aucune opération de base, fusion ou déploiement à annuler. Avant une mise en production future, appliquer la stratégie de sauvegarde/rollback de DEPLOYMENT.md.

## Addendum de coordination — validation non clôturée

Première suite commune locale : **650/665** réussis, exit1. Quatorze échecs Atelier viennent de la reconstruction concurrente déjà documentée et passent en relance isolée15/15. Le quinzième est reproductible seul : `smoke.e2e.mjs:3912`, test « checkout attribution: older RPC and compatibility-profile reads cannot overwrite a newer Free status », attend deux RPC simultanées au même client. Le contrat de la PR86 déduplique désormais ces lectures : l’attente de la deuxième ne peut aboutir. Aucun défaut produit démontré par cet échec ; le contrôle CI reste néanmoins bloqué.

Le fichier smoke est explicitement réservé au chantier actif de validation du nom Profil. Il demeure **inchangé**. Proposition minimale vérifiée sur une copie temporaire (deux gateways RPC/profil, test ciblé1/1 puis15/15 checkout/consentement réussis, exit0) : remplacer le client entre les lectures, pour garder la vérification d’une réponse obsolète sans contredire la déduplication dans le même contexte. Aucun skip, suppression d’assertion ou changement produit. Les15 tests Atelier vérifient déjà le partage des lectures dans le contexte courant.

```diff
--- a/tests/e2e/smoke.e2e.mjs
+++ b/tests/e2e/smoke.e2e.mjs
@@ -3912 +3912 @@
-test("checkout attribution: older RPC and compatibility-profile reads cannot overwrite a newer Free status", async () => {
+test("checkout attribution: older RPC and compatibility-profile reads from a replaced client cannot overwrite a newer Free status", async () => {
@@ -3939 +3939,5 @@
-    await page.evaluate(() => { dispatchEvent(new Event("online")); });
+    // Same-client reconnects share one read; replace the client to invalidate the old one.
+    await page.evaluate(() => {
+      window.titanClient = { ...window.titanClient };
+      dispatchEvent(new Event("online"));
+    });
```

Application de cette adaptation en attente de coordination explicite, conformément au cahier. Le checkpoint n’est pas déclaré stable tant que la suite commune n’est pas entièrement verte. La PR et le cahier portent les résultats distants finaux sur le HEAD publié ; cet addendum ne vaut pas autorisation de toucher le fichier réservé.

CI distante sur 18868733fd51fbe0b9bd248477b8edf511c0e474 : tests/build réussis (188/188), deux voies SQL réussies sur répliques jetables PostgreSQL16 ; navigateur encore en cours au moment de cet addendum. Aucune validation finale verte revendiquée. Résultats actualisés dans la PR95 et le cahier.
