# Passation — UX09, clavier des onglets Coaching et Atelier

## Changement

Les onglets Coaching (sportif/coach) et Atelier (cadres/ambiances/cartes) suivent désormais une activation manuelle : Gauche/Droite déplacent le focus avec retour circulaire, Début/Fin atteignent les extrémités, Entrée/Espace activent le bouton par son clic natif. Les flèches seules conservent la sélection et ne lancent ni lecture serveur ni mutation. Les touches modifiées et Haut/Bas conservent le comportement du navigateur.

Un seul onglet est dans la séquence Tab ; quitter le groupe rétablit son point d'entrée sur l'onglet sélectionné. Tab atteint le panneau, Maj+Tab retrouve la sélection. Chaque bouton possède un ID et `aria-controls`, chaque panneau possède `role="tabpanel"` et `aria-labelledby`. Le panneau actif contient le rendu existant ; les panneaux inactifs sont vides et cachés. Aucun suivi, donnée sportive ou catalogue d'un autre mode n'est dupliqué.

Lors d'un remplacement du DOM, le focus est rendu au même onglet uniquement si le focus se trouve encore dans ce groupe juste avant le rendu. Cela conserve aussi un onglet parcouru mais non activé pendant une réponse différée. Un contrôle extérieur ne provoque pas de retour forcé aux onglets. Le filtre de collection conserve sa restauration de focus existante, les raccourcis de pièce portée conservent leur changement de catégorie et leur défilement.

Le conteneur actif Coaching garde la grille et l'espacement `var(--s5)` du parent pour préserver la présentation. CSS, shell, libellés, prix, droits, RPC, logique de session/partage et logique d'achat/équipement restent inchangés. Ressources Coaching `300.0` → `300.1` et Atelier `300.6` → `300.7` pour que la première visite en ligne d'une PWA utilise la nouvelle génération. Service worker source inchangé.

Choix technique fondé sur le [modèle Tabs de WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) : activation manuelle adaptée au contenu Coaching qui peut nécessiter des lectures distantes, association nommée entre bouton et panneau. Il s'agit d'un correctif ciblé ; aucune certification WCAG ou lecteur d'écran revendiquée.

## Isolation

- Branche `codex/web-tab-keyboard-cdc`, checkout lié propre `titan-support-reports` réutilisé avec nouvelle branche.
- Parent PR #50 ouverte/prête/non fusionnée, publié `1f3c4ed7007d23a590d9095917c0f932151e07a8`, local `586d255cd0134718b169851a9805c1ea2fe2135e`, arbre commun `9c540105cd5565beeecd0a40fc2e5cbf0469a551`.
- Six fichiers : deux composants JS, deux consommateurs HTML, suite `tests/e2e/smoke.e2e.mjs`, présente passation. Rapport/outillage/preuve UX01 du parent conservés comme observation historique avant correction.
- Réservation native UX09 avant modification. Claims WORK/Play Console et RPG01, 307 formulations/statuts et 42 ajouts juridiques préservés. UX09 et QA13 restent `[~]` ; suite de l'accessibilité globale, contrastes, cibles tactiles, lecteur d'écran, iOS/Android et recette réelle ouverte.
- Pas de base/compte/provider réel, SQL, code Android, économie/rewards, nouvelle collecte, main, fusion, déploiement ou modification d'images étrangères.

## Tests

Baseline `pnpm verify` réussie : 183/183, build 101 ressources hors ligne, audit 0 erreur/16 avertissements existants.

Sept nouvelles régressions navigateur à 360/1280 px, avec vrais composants et transports externes synthétiques :

- Coaching et Atelier : flèches circulaires, Début/Fin, activation native Entrée/Espace, sélection unique, focus rendu et absence d'appel distant par les flèches.
- Les deux groupes : panneaux nommés et liés, un seul point d'entrée, sortie Tab, retour Maj+Tab sur l'actif après déplacement sans activation, clic et visibilité des panneaux.
- Coaching : réponses sessions/assignments différées, snapshot différé, focus non sélectionné conservé, absence de vol depuis un bouton extérieur synthétique.
- Atelier : rafraîchissement différé conservant un onglet non sélectionné et respectant le contrôle extérieur.
- États serveur Coaching indisponible et catalogue Atelier vide : navigation/activation toujours disponibles.

RED produit confirmé avant correctif : flèche droite immobile dans les deux composants, IDs/panneaux manquants, perte de focus après rendu, erreur/vide non navigables par flèches. La régression Coaching différée a été reproduite séparément après correction de sa fixture, avec erreur d'assertion sur le focus, sans timeout. GREEN ciblé : sept nouveaux tests et régression PWA existante, 8/8, zéro erreur de page aux deux formats.

Ajustements des sondes : attente de deux réponses réellement retenues, bon texte vide du mode coach, attente du focus après la fin du remplacement DOM. Un lien QG reconstruit par le shell lors de `online` n'était pas un contrôle extérieur stable ; le test utilise un bouton synthétique en dehors du composant, pour isoler l'absence de vol de focus par ce correctif. Aucun changement shell/production pour satisfaire la fixture.

Le test PWA existant inclut l'ancienne génération Coaching et Atelier `300.6` en cache : première visite de chacun sans marqueur de ressource obsolète. Cette vérification complète les tests de clavier qui exécutent les composants courants.

Vérification complète du correctif : `pnpm verify` 183/183, build 101 ressources hors ligne, audit 0 erreur/16 avertissements existants ; `pnpm test:e2e` 237/237, zéro échec/annulation/skipped. Sept nouveaux scénarios ajoutés aux 230 du parent. Quatre captures Coaching/Atelier à 360/1280 px inspectées, présentation et repère de focus conservés.

Revue indépendante unique Sol 6.1 high sur `586d255..fb3a16b` : aucun Critical/Important/Minor concret. Syntaxe des deux composants et de la suite vérifiée, sept nouveaux scénarios + PWA rejoués 8/8 sans erreur de page. Une sonde temporaire compare les coordonnées DOM aux composants du parent : géométrie identique sur les deux pages à 360/1280 px. Dépôt inchangé par le réviseur. Seul cet enregistrement documentaire est ajouté après son avis.

La CI exacte reste exigée avant remise ; SHA publié, PR et run sont consignés dans la description de PR et le CDC natif après vérification. Aucun test SQL local revendiqué ; les deux voies de réplique de la CI existante restent nécessaires. La recette lecteurs d'écran et appareils/comptes réels reste ouverte.
