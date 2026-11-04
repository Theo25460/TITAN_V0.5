# UX14 — Rapport volontaire depuis une erreur de Communauté

## Périmètre et décision

Lot web autonome du 13 octobre 2026, basé sur PR #47 (publication `6d6c9d748d41a80ca9868b62dfc177db7bcd4781`, arbre `c9abcfa0c59046b924894cb4c62c873cf8655757`). UX14 reste partiel : ce lot prépare uniquement les erreurs de chargement de Communauté, derrière un indicateur désactivé dans le HTML livré. UX12 et QA18 sont associés. Aucune fusion, activation, migration, configuration Resend ou notification réelle.

## Parcours accepté

- Une erreur réelle de chargement garde Réessayer et un lien canonique vers `/service#help-communaute`. Un bouton de rapport apparaît seulement si le déploiement autorise explicitement le formulaire. Une fonction serveur attendue mais absente, le mode invité et le mode hors ligne ne proposent pas de rapport.
- Le bouton ouvre un unique dialogue Assistance lié au compte et au client courants. Le formulaire réutilise la vérification Auth, l’aperçu, la confirmation et le transport existants. Catégorie initiale : bug. Aucun envoi lors de l’ouverture, d’une reconnexion ou d’un changement de case.
- Description, autorisation de réponse et diagnostics restent distincts. Les deux cases sont décochées. Le choix diagnostics capture uniquement version, version du module, plateforme, famille du navigateur, type d’appareil, écran Communauté, horodatage ISO, disponibilité réseau et code local fermé. La capture intervient après ce choix, s’affiche littéralement et peut être retirée avant confirmation.
- Aucun user-agent brut, URL, paramètres, adresse, identifiant de compte, token, erreur brute, pile, information sportive, santé, GPS ou fichier n’est ajouté. Les champs sont revalidés sur une liste fermée. Un seul instantané en mémoire est réutilisé pour l’aperçu et les tentatives du même rapport.
- Le bloc technique fait partie du message existant : contrat inchangé à quatre champs, message total ≤ 4 000 points Unicode et ≤ 16 Kio UTF-8, description ≥ 10 caractères. Aucun raccourcissement silencieux.
- Double clic et tentatives incertaines gardent les protections de PR #47 : UUID constant pour cette demande en mémoire, absence de retry automatique, avertissement de sortie. Fermeture du dialogue bloquée pendant un envoi ou après une réception incertaine sans référence ; une réception confirmée autorise la fermeture. Aucun engagement de déduplication après fermeture/rechargement.
- Changement de compte, client ou génération invalide le contexte, ferme le dialogue, efface le brouillon et ignore les résultats tardifs. Un renouvellement de token du même compte conserve le brouillon. Fermer un formulaire sans envoi nettoie ses abonnements et événements.

## Livrables et validation

Modules diagnostics et dialogue, formulaire Assistance réutilisable, entrée d’erreur Communauté, styles locaux, versions statiques cohérentes. Tests purs de minimisation ; tests navigateur du consentement, contrat HTTP, double envoi, incertitude, fermeture, identité, nettoyage et clavier/mobile ; régression Assistance et suite web complète, build/audit, revue fraîche et CI sur le commit final. Le précache est généré depuis les références HTML, sans changer la source du service worker.

Le cahier des charges natif garde ses 307 formulations, ses 42 tâches juridiques et ses autres chantiers. Seule UX14 passe de `[ ]` à `[~]` après vérification. Q-002 sur la conservation reste ouverte. Backend et SQL de PR #46 inchangés.
