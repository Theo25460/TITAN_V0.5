# Vallée : rencontres et missions personnelles — 18 octobre 2026

Trois points : RPG02 / RPG04 / RPG08. Premier ajout aux aventures après l’audit et le guide de départ du lot96. Ces trois exigences avancent directement le macro-bloc RPG et restent partielles : une seule région reçoit ici des missions facultatives ; ni les objectifs obligatoires ni les récompenses serveur ne sont modifiés.

## Conception et résultat

Le parcours Aventure existant accueille une rencontre propre à chacun des neuf chapitres de l’Aube. Son récit réagit aux préparatifs réunis. Un volet à ouvrir présente trois mini-quêtes : retrouver des jours actifs, rassembler de l’effort et laisser une note sur une séance citée parmi les preuves du chapitre.

La source reste celle de la campagne : jours/effort du snapshot et identifiants de séances admissibles. La note est lue seulement sur ces séances du journal courant, hors éléments archivés/signalés. Le modèle est pur, sans écriture, nouvelle récompense, stockage, bouton de réclamation ou mécanique de combat fictive. Le panneau vérifie le propriétaire du snapshot, refuse une transition active et se retire immédiatement à account-changing. Son état ouvert survit aux rendus du même chapitre.

Les cibles personnelles utilisent les28jours avant started_at du chapitre :

- 1jour si au plus4jours de pratique,2si5–12,3au-delà.
- Effort : moitié de la médiane des efforts journaliers antérieurs, arrondie à5minutes et bornée de15à45minutes. Pour ce calcul, chaque date est limitée à90minutes ; multiplier les lignes du même jour ne crée pas de nouveaux jours.
- Historique insuffisant :1jour/15minutes. Comptes : historiques confirmés (booléen serveur ou reçu de soumission confirmé), hors lignes provisoires, rejetées, suspectes ou historiques. Découverte : historique local indiqué comme tel.
- Les séances et imports dont created_at est postérieur au départ n’augmentent pas les cibles calculées depuis l’historique complet. Les objectifs ne sont pas décrits comme définitivement figés : correction/suppression du passé et restauration d’un cache compact peuvent modifier les données disponibles.

Le texte explique que ces missions sont facultatives, se renouvellent au chapitre suivant, n’ajoutent ni XP ni coins et ne conditionnent pas la balise. Les comptes historiques sans mesure d’effort voient cette mesure explicitement indisponible. Autres régions, départ et campagne terminée restent hors de ce module.

## Vérification

- 8tests unitaires du modèle : RED observés avant implémentation, puis verts. Sources réelles de campagne, plafonds/jours distincts, import tardif, lignes rejetées/provisoires, reçus confirmés, annotation sourcée, découverte et contrat historique.
- 4nouveaux parcours navigateur : rencontres/missions360/1280, annotation et volet conservé au refresh, propriétaire différent, retrait synchrone à transition. RED observés après réparation de l’environnement Chromium manquant ; cet incident n’est pas une preuve RED produit.
- Relance finale : pnpm verify199/199,63scripts,build105ressources offline,audit0erreur/16avertissements préexistants.11/11 navigateur :4nouveaux,4progression/départ du lot96,2confirmations Aventure et1ancien cache PWA.0échec/cancelled/skipped. Scripts ajoutés aux commandes habituelles.
- Revue indépendante bornée : aucun Critical/Important confirmé ;7tests du modèle rejoués par le reviewer, puis reçus et transition relus. Le8e test et tous les autres sont verts dans verify.
- Rendus360/1280 inspectés, trois missions visibles et aucun débordement horizontal. Diff check sur les fichiers du lot.

## BLOQUANT À CORRIGER MAINTENANT

Aucun Important confirmé restant dans ce lot. Les gains, balises et droits restent décidés par les règles existantes ; ce module ne vaut pas nouvelle validation serveur.

## NON BLOQUANT – BACKLOG FINITION

Les cibles personnelles peuvent temporairement utiliser le profil doux pendant la restauration d’un cache compact, puis se recalculer sur l’historique complet. Les dates du profil utilisent le préfixe ISO du journal, qui peut différer du fuseau mémorisé par la campagne près de minuit ; cela n’affecte pas ses compteurs officiels ou récompenses. Ces deux limites doivent être traitées lors de la consolidation serveur du modèle, sans rouvrir un audit global ou une série de retouches visuelles.

## EXIGENCE OU MACRO-BLOC SUIVANT

Rencontres/obstacles et boss en phases (RPG03/RPG09/RPG10), puis consolidation des quêtes et cibles autoritaires dans la campagne. Le verrou Titan+ existant sur deux régions reste un écart à la doctrine à résoudre côté client ET serveur. Ne pas présenter ces préparatifs facultatifs comme la campagne adaptative complète ou comme des récompenses déjà implémentées.

## Limites et dépendance

Snapshots synthétiques, vrai rendu/calcul client ; aucun compte/backend réel. Pas de nouvelle validation SQL, suite navigateur entière, CI distante, lecteur d’écran physique, autres moteurs ou Android/PWA installé certifiés. Aucun total de suite globale n’est utilisé comme preuve du lot : seules les11exécutions ciblées ci-dessus le sont.

Parent PR96 HEAD86507cb0cbf46a60de6035ac909017cfc759094d, arbre96f2a8d6c7bc2de808e404da78ae45320fc675f7 identique au localab057ddcc5d541b4c65452e8be3d7f2f0210f052 ; branche codex/rpg-valley-quests-cdc. Sept fichiers propres au lot. Fichiers étrangers préservés et exclus, aucun moteur/RPC/SQL/économie/Profil/smoke/WORK/Android modifié, aucune fusion ni aucun déploiement. Abandonner le lot ne nécessite aucune annulation de données ; fermer sa PR suffit.
