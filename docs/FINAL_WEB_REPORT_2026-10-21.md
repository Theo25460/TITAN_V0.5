# TITAN WEB — rapport de clôture technique du 21 octobre 2026

**Décision : NO-GO pour la production.** Une candidate unique est préparée dans [la PR #115](https://github.com/Theo25460/TITAN_V0.5/pull/115). Aucun déploiement, aucune migration de production et aucune suppression de fonctionnalité pour masquer un défaut.

Le périmètre V1 fixé dans le cahier est le WEB complet, hors publicité et vente/abonnement TITAN+. Les droits manuels existants restent à préserver. Android natif reste un chantier distinct. Les reports autres que ces exclusions ne sont pas acceptés implicitement.

## 1. Exigences et fonctionnalités livrées

Le cahier initial a été relu intégralement (2341 paragraphes), puis ses décisions et handoffs suivants jusqu'à la fermeture Claude `02311a5`. La [matrice exhaustive](FINAL_WEB_REQUIREMENTS_2026-10-21.md) conserve **319 identifiants**, dont 285 WEB/partagés et 34 initialement Android. Elle distingue case documentaire, code candidat, preuves ciblées et production. Aucun pourcentage de complétude n'est calculé.

| Parcours | Comportements livrés dans la candidate | Preuves principales / limite |
|---|---|---|
| Inscription, connexion et récupération | Formulaires, attente/refus/reprise, consentement, redirections locales, reprise d'onboarding | Suites `auth-*`, `onboarding-*`, `account-*` ; vraies boîtes e-mail et sessions fournisseur non recettées |
| Séances et journal | Saisie multisport, liste/calendrier, édition, export, file persistante, reçus confirmés ou retenus, reprise après réponse perdue | `session-*`, `training-*`, `first-session-confirmation`, contrats SQL de rejeu/concurrence ; API réelle et second appareil non validés |
| Objectifs et planification | Objectifs datés, filtres et progression, réservation avant sauvegarde, isolation de contexte, clavier | PR114 et suites `goals-*`, `planner-*` ; conservation exacte des fichiers Work |
| Statistiques, records et maîtrise | Navigation multisport, agrégats, source du record, comparaisons, bilans, vues sauvegardées | Tests unitaires, SQL et navigateur dédiés ; accès avancés manuels existants préservés, aucun nouvel abonnement vendu |
| RPG | Quatre mondes, 36 chapitres, objectifs personnels figés, obstacles et gardiens à phases, journal de quêtes, progression sans compétition obligatoire | RPG03/08/09/14/15/20 ; SQL des objectifs et claims, `rpg-server-quests`, `rpg-guardian-phases` ; recette humaine et migration des contrats actifs ouvertes |
| Boutique et coins | Cosmétiques en crédits gagnés, achats et progression autoritaires côté serveur, prochaines récompenses, titres gagnés et portés | SHOP02/04/05/06/19, IDEA07 ; SQL économie/achats/titres, E2E Atelier/Profil ; aucune conversion monétaire |
| Communauté | Amis par consentement, Moments, défis, expéditions, guilde, signalement, modération et recours | Suites `community-*`, SQL de confidentialité et concurrence ; recette avec plusieurs vrais comptes ouverte |
| Profil et assistance | Export/suppression, carte publique optionnelle, titre porté et confidentialité, animations réduites, aide depuis Profil/menu/erreurs | IDEA08, UX12 partiel ; formulaire Assistance préparé mais désactivé, repli e-mail actif |
| TITAN+ | `/titan-plus` « Bientôt disponible », anciens tarifs redirigés, aucun prix, achat ou publicité ; droits manuels conservés | Tests de décision de lancement/offre et entitlements ; aucune promesse de commercialisation active |

Ces comportements sont livrés et couverts par des contrôles techniques ; **ils ne constituent pas une recette intégrée réelle du site publié**. Les 17 clôtures fonctionnelles Claude et SEC05 sont conservées comme clôtures de code. ACT04, UX12, sécurité/QA globales restent partiels.

## 2. Coordination et corrections réalisées

L'audit des 94 PR initialement ouvertes commence par #105. L'ascendance prouve que #105 inclut #19–103 et que #114 inclut toutes les autres sources observées sauf #105. La RC réunit #114 `95d9015` et #105 `02311a5`, garde leurs branches intactes et ne ferme aucune PR source avant publication. La nouvelle branche Android indépendante n'est pas intégrée.

Préservés : les suites des deux parents, le contrôle TypeScript de Work, `data.js300.1`, PostgreSQL17.6 immuable et les deux voies de migration. Les fichiers Work `sessions.js`, `journal.js`, `data.js` sont inchangés par la consolidation finale. Les pages publiques sont régénérées depuis les générateurs fusionnés.

Défauts démontrés et corrigés :

- Migration24 : `BEGIN/COMMIT` interne rompait la transaction appelante. Reproduction rouge dans les deux voies PG17.6, puis suppression de cette frontière interne et test de conservation/rollback de l'enveloppe.
- Droits TITAN+ : deux nouveaux propriétaires concurrents d'une même clé pouvaient laisser la seconde requête modifier le droit du premier. Reproduction réelle sur les deux voies PG17.6 ; l'UPSERT vérifie désormais aussi le propriétaire et refuse explicitement le second appel avant toute projection de profil.
- Profil : une lecture de titre privé pouvait être publiée après basculement silencieux de session SDK. Test rouge puis trois cas verts après revalidation de session avant affichage.
- Cache partagé : Profil appelait encore une ancienne version de coque et de CSS. Versions communes alignées et test de cohérence des 15 consommateurs de coque.
- Onboarding360px : le bouton sticky recouvrait le statut des sports. Navigation remise dans le flux, contrôle géométrique et interaction à360/390/1280 ; lien TITAN+ inactif du Profil dirigé vers la page « Bientôt disponible ».
- Préflight ambigu et rollback22 dangereux : pré/postflight séparés ; refus d'historique partiel ou futur inconnu ; contrôles de droits effectifs, fonctions et search_path ; rollback22 ne promet plus de supprimer les retenues ni de réduire le contrat RPC17colonnes via un simple remplacement.
- Test SQL des bilans : le motif texte `9999` pouvait correspondre à un UUID aléatoire. La fixture contient désormais volontairement ces chiffres et le contrôle recherche une valeur numérique JSON, tout en refusant toujours l'effort forgé.

## 3. Tests exécutés et preuves

Les SHA et résultats du **dernier passage complet** sont consignés dans les contrôles et le commentaire de validation de [#115](https://github.com/Theo25460/TITAN_V0.5/pull/115). Ce rapport n'anticipe pas le succès d'une CI encore en cours au moment de son écriture.

| Contrôle | Résultat déjà observé | Portée |
|---|---|---|
| `pnpm run verify` | 332/332 tests, typecheck/build/audit/release-safety réussis localement et CI sur `fef923c` | Code applicatif final ; avertissements d'audit conservés, aucune certification globale |
| Historique de secrets | CI verte sur `fef923c` | Deux faux positifs d'expansions de variables dans une branche distincte revus par contenu exact ; aucune valeur secrète publiée |
| Activation + titre Profil | 12/12 localement | Chromium141 adapté au conteneur ; navigateur CI officiel séparé |
| Régression de transaction24 | RED initial sur run39581765028 ; GREEN dans la première voie de run39624750323 | Transaction appelante conservée, rollback vérifié |
| Course des entitlements | RED deux voies run39623763173 ; GREEN première voie run39624750323 | Attente de verrou réellement observée, refus42501, droit complet et deux profils inchangés |
| Pré/postflight réel | Deux fixtures positives + mutations négatives en CI | Ledger, privilèges table/colonne, RLS, signatures/résultats/grants des RPC, search_path ; toutes mutations annulées |
| SQL complète `fef923c` | Première voie verte ; deuxième arrêtée sur le test aléatoire des bilans | Ne pas présenter le run39624750323 comme tout vert ; correction ciblée du test à revalider |
| Navigateurs : union initiale | 786/786 CI sur `a74e3b4` | Preuve historique ; ne remplace pas le passage final après handoff Claude |
| Captures | 135 captures initiales et48 sur le code `fef923c` | Données et RPC synthétiques, 360/390/1280, tiers bloqués ; vues réellement inspectées, dont quatre gardiens et aperçu Atelier |
| Accessibilité | Axe A/AA découverte prévu dans la CI ; cinq contrôles de contraste additionnels sans violation détectée | Résultats incomplets sur4contrôles de contraste ; pas d'audit RGAA ni de lecteur d'écran réel |
| Performance | 24 mesures Lighthouse locales | Variance d'hôte élevée ; login mobile à vérifier sur préproduction stable, aucun PASS performance production |
| Production Supabase | Préflight29contrôles,21bloquants favorables, lecture seule | 0/29migrations appliquées,2dons actifs ; aucune garantie de restauration |

Certains premiers essais locaux ont été interrompus ou ont échoué au lancement du navigateur ou dans le script de capture (sélecteur ambigu, attente d'un menu masqué sur desktop, timeout de capture). Ils ne sont pas comptés comme réussites. Les reprises ciblées et résultats CI sont séparés. Aucun test absent n'est remplacé par le nombre de tests verts.

## 4. Fonctionnalités manquantes, propositions de report

| Sujet | État et décision requise |
|---|---|
| Assistance intégrée | Backend/formulaire préparés mais désactivés. Configurer environnement Netlify et envoi e-mail sur cible isolée ; tester réception, référence, reprise et refus avant activation. Ne pas déclarer UX12–15/QA18 entièrement clos. |
| SHOP10/12, RPG16/21, IDEA01–06/09 | Missions achetables, raretés, événements extensibles, activité quotidienne, favoris/showcase/collections/quêtes hebdomadaires/boss coopératifs/streak souple/cache : reports proposés et motivés dans le handoff Claude, pas acceptés implicitement. Certaines bases existent sans fermer l'exigence complète. |
| CHEAT16 | Motif créer-effacer-recréer non détecté explicitement ; plafonds et limites existants bornent les gains. Suffisance V1 à valider. |
| Feature flags | Infrastructure préparée, pas de consommateurs pour chaque future surface. Aucun déploiement progressif RPG entier prouvé. |
| ACT05–12 | Découverte progressive, compréhension et tests humains8–12personnes, mesure avec consentement et itération sur les trois frictions restent ouverts ; des captures automatisées ne simulent pas des humains. |
| Sources santé/activité quotidienne | Aucune intégration externe active ; périmètre conditionnel à trancher, pas présenté comme disponible. |
| Texte « après mise à jour serveur » | Environ66mentions transitoires à retirer dans le lot de publication une fois le schéma cible vérifié. Les retirer aujourd'hui ferait promettre un serveur qui n'est pas installé. |
| Publicité / vente TITAN+ / Android | Exclusions explicites V1 ; code dormant conservé et désactivé, aucune tâche Android effectuée pour cette mission. |

## 5. Risques et portes bloquant la publication

1. **Sauvegarde et restauration non exécutées.** Projet Supabase Free observé ; ne pas supposer une sauvegarde fournisseur exploitable. Préparer dumps rôles/schéma/données/historique, objets Storage et paramètres utiles, chiffrés hors dépôt, puis restaurer vers une cible distincte. Connexion DB sécurisée et cible de restauration non disponibles dans cette session. Le banc vide CI ne restaure pas la production.
2. **29 migrations non appliquées**, historique arrêté à20261005230000. Migration25 purge effectivement des données ; contrats de chapitre actifs à conserver ; effets sur catalogue et gratuité à constater sur copie restaurée. Préflight favorable ≠ compatibilité complète. Plan détaillé : [procédure de publication](CDC_WEB_PRODUCTION_RELEASE_PLAN_2026-10-19.md).
3. **Préproduction intégrée absente.** Aucune branche Supabase de développement observée. Aucune copie avec Auth/Storage/cron/Netlify/e-mail réels testée. Contrôler les quatre jobs cron (commande, calendrier, base, rôle, activité) et leur première exécution. Compensation des récompenses retenues après exposition encore à éprouver.
4. **Recette réelle non effectuée** : compte neuf/ancien/manuellement Elite/multisport, deux comptes et deux appareils, emails de confirmation/récupération/support, synchronisation et résultat réseau incertain, installation/mise à jour PWA, Safari/iOS/Firefox et lecteurs d'écran.
5. **Qualification juridique et données éditeur ouvertes.** Mentions actuelles citent « Théo et son cofondateur » et un statut étudiant ; identité/adresse/statut ne sont pas établis. Âge, mineurs, conservation/logs/sauvegardes, audience avant consentement, bases légales/transferts, communauté et recours demandent validation. L'hypothèse erronée de vente Paddle a été retirée des notes de validation. Aucun avis de conformité ni exemption d'accessibilité revendiquée.
6. **Sécurité production à finaliser.** Avis Supabase lu : search_path d'une fonction privée corrigé dans migration1, protection contre mots de passe compromis désactivée, avis de fonctions SECURITY DEFINER à qualifier. Requête de catalogue sans table publique exposée sans RLS observée, mais ce contrôle n'est pas un audit de toutes les règles métier.
7. **Performance mobile à confirmer.** Login mobile LCP médian4,43s dans les mesures locales anciennes ; serveur local sans compression et hôte fortement variable. Mesurer le build final sur hébergement de préproduction stable et corriger les causes confirmées.

## 6. Critères objectifs de GO

| Porte | Condition mesurable |
|---|---|
| Candidate unique | Parents Claude/Work inclus par ascendance ; aucun test source perdu ; aucune modification non intégrée ; SHA et build déployés identifiés |
| Automatisation | Tous les tests répertoriés, typecheck, build, contrôle de secrets et deux voies SQL17.6 réussis ; aucun échec ou abandon non expliqué |
| Métier et isolation | Chaque parcours de la matrice V1 recetté sur la préproduction ; deux comptes/deux appareils ; lecture et écriture croisées refusées ; une mutation/reprise produit une seule séance, dépense, récompense et référence |
| Conservation | Restauration réelle distincte ; contrôles de volumes, propriétaires, droits manuels, contrats de chapitre et retenues rapprochés avant/après ; zéro perte inexpliquée ; procédure de compensation répétée |
| Exploitation | Préflight/postflight sans contrôle bloquant défavorable ; quatre jobs cron vérifiés et première exécution sans erreur ; support réellement reçu ; monitoring et retour arrière exercés |
| UX/accessibilité | Aucun Critical/Important ; aucun chevauchement ou débordement320–1280 ; parcours clavier et lecteur d'écran recettés ; aucune violation axe A/AA non traitée ; anomalies manuelles consignées |
| Performance | Mesures sur hébergement stable du build final ; cibles p75 LCP≤2,5s, CLS≤0,1, INP≤200ms lorsque des données représentatives sont disponibles ; mesures de laboratoire distinctes, toute exception motivée explicitement |
| Vérité et décisions | Aucune promesse indisponible ou fausse confirmation ; textes conformes aux fonctionnalités activées ; validation juridique, identité éditeur et reports acceptés par écrit |

## 7. Décision et prochain lot concret

**NO-GO déploiement public.** La consolidation peut être revue ; elle n'autorise pas une migration ou une publication. Aucun défaut démontré ne doit être masqué en retirant sa fonctionnalité. Les contrôles encore rouges ou en attente doivent d'abord être verts sur la tête finale.

Ordre de sortie : contrôle CI complet de la RC → sauvegarde restaurée et migrations sur copie isolée → activation/test de l'Assistance et recette comptes/API/PWA réels → décisions juridiques et reports explicites → mesures finales mobile/accessibilité → retrait coordonné des textes transitoires et nouvelle recette → GO écrit → migrations et déploiement contrôlés → monitoring. La décision GO exige des preuves pour chaque porte ; aucune reconstruction Android ne précède cette référence WEB.
