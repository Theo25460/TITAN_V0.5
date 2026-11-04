# Contrôle Search Console après une release Titan

Procédure SEO10 établie le 17 octobre 2026. Elle décrit une opération à effectuer après un déploiement validé ; aucune soumission ni demande d'indexation n'a été effectuée pendant sa rédaction.

## Avant toute demande

1. Relever le commit et l'identifiant du déploiement réellement publié. Vérifier les parcours critiques selon le runbook de release ; ne pas déployer uniquement pour actualiser Google.
2. Lire en HTTP anonyme `https://titan-app.fr/robots.txt` et `https://titan-app.fr/sitemap.xml`. Exiger une réponse 200, un XML valide et une déclaration Sitemap vers ce domaine HTTPS. Comparer les URL au sitemap du commit déployé. Aucun doublon, URL de preview, paramètre de suivi, page privée ou page `noindex` ne doit y figurer.
3. Pour chaque URL du sitemap, contrôler le statut final 200, la canonical vers l'URL publique attendue, l'absence de `noindex` dans le HTML initial et les en-têtes, ainsi que l'absence de blocage par robots.txt. Contrôler séparément les redirections des anciennes URL si elles ont changé ; une réponse finale 200 ne prouve pas la qualité des redirections intermédiaires.
4. Pour les pages applicatives, de compte, d'administration, les cartes d'athlète et les pages CMS exclues, contrôler l'exclusion du sitemap et `noindex` dans le HTML initial ou `X-Robots-Tag`. Tester les routes concernées, leurs variantes `.html` et les réécritures de partage avec une fixture dédiée, sans recopier de lien réel privé dans les preuves.
5. Confirmer qu'une URL inexistante répond 404 ou 410 et que les ressources internes exclues ne sont pas publiées. `robots.txt` et `noindex` ne remplacent jamais les contrôles d'accès aux données.
6. Vérifier les dates `lastmod` à partir des dernières modifications significatives. Ne pas remplacer toutes les dates par la date du jour : utiliser une date justifiée par page ou omettre ce champ facultatif si elle n'est pas connue.

Le 17/10/2026, deux écarts restent à résoudre avant de solder SEO07 : sitemap public à 22 URL contre 23 sur la branche PR #64 (Partenariats manquant en ligne) et dates uniformes `2026-10-05` dans le générateur. Le site courant n'a pas été modifié pour cet audit.

## Dans Search Console

1. Ouvrir la propriété vérifiée qui couvre `https://titan-app.fr/`. Utiliser un compte propriétaire ou utilisateur avec accès complet pour demander une indexation. Si la propriété ou les droits manquent, noter le blocage ; ne pas modifier DNS ou propriété pour contourner ce contrôle.
2. Dans **Sitemaps**, ouvrir le sitemap existant. Après modification du sitemap ou pour une première soumission, envoyer `https://titan-app.fr/sitemap.xml` et relever la date de dernière lecture, l'état et les éventuelles erreurs. Ne pas confondre soumission, téléchargement réussi et indexation effective.
3. Inspecter en priorité les URL publiques effectivement modifiées : `/`, `/fonctionnalites`, `/tarifs`, `/service`, `/partenariats`, puis les guides concernés. Lire les informations de la version indexée : dernière exploration, canonical déclarée et canonical choisie par Google, autorisation d'exploration et d'indexation.
4. Exécuter **Tester l'URL en direct** ; examiner le HTML reçu par Google et les ressources utiles. Comparer aux résultats HTTP et au contenu attendu du déploiement. Un test direct accessible ne prouve pas que la page est déjà indexée.
5. Demander l'indexation uniquement des quelques URL publiques corrigées lorsque le test direct est cohérent. Pour l'ensemble du site, s'appuyer sur le sitemap. Ne pas demander l'indexation de Profil, Connexion, Administration ou de cartes privées/partagées exclues ; répéter la même demande n'accélère pas l'exploration.
6. Inspecter un échantillon de pages exclues, notamment `/profile`, `/login`, `/admin` et `/athlete`. Vérifier l'état enregistré par Google et le `noindex` du test direct. Une page privée déjà présente dans les résultats nécessite une investigation et, si urgence, la procédure de suppression Search Console appropriée ; ne jamais la rendre indexable pour faire disparaître un avertissement.

## Suivi et preuve de recette

Consigner après l'exécution : date, commit/déploiement, propriété utilisée (sans identifiants de connexion), état et dernière lecture du sitemap, URL inspectées, résultats indexés et directs, canonical choisie, demandes envoyées et erreurs à corriger. Conserver les preuves sans token de carte publique ni information de compte.

Contrôler ensuite le rapport **Indexation des pages** et les URL prioritaires après quelques jours, puis selon les nouvelles dates d'exploration observées. Cette cadence est une règle de suivi interne, pas un délai garanti par Google. Distinguer exclusion voulue par `noindex`, redirection, URL inconnue, erreur serveur et page explorée non indexée. Suivre aussi les impressions/clics sans attribuer automatiquement une variation à une seule release.

Clôturer la recette distante lorsque le sitemap du déploiement a été lu sans erreur, que les URL publiques prioritaires sont correctement explorables et que les exclusions restent cohérentes. Documenter séparément les décisions d'indexation de Google : une soumission ne garantit ni indexation, ni classement, ni titre/extrait précis.

## Sources officielles relues le 17/10/2026

- [Demander une nouvelle exploration](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl) : inspection pour quelques URL, sitemap pour un ensemble, droits et quotas ; délais variables et aucune garantie d'indexation.
- [Bloquer l'indexation avec noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing) : HTML ou en-tête ; Google doit pouvoir explorer une page publique pour lire sa directive. Ne pas bloquer cette lecture via robots.txt.
- [Créer et envoyer un sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) : URL canoniques et dates de modification significative exactes. Google ignore `priority` et `changefreq`.
