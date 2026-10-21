# Objectifs personnels des chapitres

RPG08/RPG12/RPG15 : le serveur fige une cible personnelle au départ de chaque nouveau chapitre. Les chapitres actifs conservent exactement leurs anciennes conditions, sans toucher aux insignes, sources, routes, dates, XP ou crédits.

## Contrat

Colonne `adventure_progress.main_objective` JSONB : version 1, days, effort, frozen_at. Réutiliser le profil serveur des 28 jours admissibles déjà figé pour les mini-quêtes : jours 1/2/3 et effort 15–45 minutes (moitié de la médiane quotidienne plafonnée). Chapitres 1–8 : minimum entre cible catalogue et jours du profil. Gardien : maximum entre 2 et jours du profil ; effort = jours × effort du profil (30–135 minutes). Le minimum de deux jours impose le retour ; aucun volume sur une journée ne le remplace. Aucun sport imposé, mêmes insignes quelle que soit la cible, aucun bonus économique.

Migration : pour chaque chapitre actif sans objectif, version 0 avec jours catalogue et effort 150 au gardien. Aucun recalcul d'un objectif existant. Chapitres achevés : aucun objectif nécessaire. Trigger existant étendu : nouveaux chapitres seulement, profil et objectif figés ensemble. Snapshot version 4 expose `target`, `effort_target`, `main_objective`. Claim utilise exclusivement ces mêmes nombres sous verrou et révision existants. Fonctions privées non exécutables directement par les clients.

Client : lire la cible actuelle dans la mission, les détails et le gardien. Une étape future n'annonce pas de cible personnalisée avant son départ ; une étape passée ne reconstruit pas sa cible. Expliquer l'historique de 28 jours, les cibles figées, le plafond quotidien et l'absence de pénalité. Découverte/ancien serveur gardent leurs conditions fixes explicites. Messages d'erreur sans chiffre obsolète. Offre publique distingue nouveau contrat serveur et découverte/chapitres déjà engagés.

## Validation

PostgreSQL jetable : nouveau profil, profil régulier, plafond, gel après archivage, refus puis vraie confirmation avec deux jours et 30 minutes, pas de monnaie/XP, préservation des acquis et réapplication de migration. Matrice multisport conserve la parité et lit le nouveau contrat. Navigateur 360/1280 : cible atypique 2/70 lisible dans mission/détails/gardien/règles, pas de 150 contradictoire, futur sans faux chiffre et ancien contrat conservé. Suite complète et une revue indépendante.

## Limites

Pas d'objectif médical, pas de progression physiologique déduite des déclarations, pas de recette sur compte réel. Le profil mesure une cadence récente, sans obligation de battre un record. Les trois exigences restent partielles tant que les autres systèmes d'objectifs n'ont pas une recette globale. Aucun déploiement ni base réelle.
