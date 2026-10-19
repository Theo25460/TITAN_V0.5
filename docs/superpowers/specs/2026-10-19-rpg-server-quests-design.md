# Quêtes de campagne confirmées — RPG04 / RPG08 / RPG13

## Intention et périmètre

Poursuivre le cahier vivant et la PR98 avec trois points : mini-quêtes, adaptation et récompenses visibles. Le sport reste la source des preuves ; les quatre campagnes et leurs gardiens deviennent gratuits. L’utilisateur a explicitement demandé une exécution autonome sans nouvelle demande d’autorisation.

## Choix

Retenir les trois missions facultatives existantes (jours actifs, effort, annotation) et les confirmer dans la transaction de balise existante. Un bouton de récompense séparé créerait un second protocole de concurrence inutile ; des crédits modifieraient l’économie. Les gains de ce lot sont donc trois souvenirs de carnet cosmétiques, sans puissance, XP ou crédits. Une mission incomplète n’empêche jamais de passer le chapitre ; les récompenses manquées ne sont pas attribuées rétroactivement.

## Contrat serveur

Ajouter adventure_progress.quest_profile, figé à l’insertion et à chaque changement de chapitre. Historique admissible : 28 jours avant started_at, date et création strictement antérieures au départ, propriétaire auth.uid(), activité canonique serverReward=true, valeur positive, non historique/archivée/suspecte/modérée. Grouper par jour dans le fuseau de la campagne ; effort normalisé plafonné à90/jour. 0–4 jours donnent une cible1,5–12 une cible2,13+ une cible3. Cible d’effort : moitié de la médiane quotidienne, arrondie au multiple de5 (demi supérieur), bornée15–45. Sans historique :1jour/15minutes. Annotation :1note de10caractères minimum sur une des sources représentatives du chapitre. Ce choix conserve la sémantique existante de la mission personnelle.

Les campagnes actives avant migration reçoivent les cibles douces1/15, marquées legacy ; aucune réécriture de chapitre, route, départ, insigne, source ou solde. Les campagnes terminées restent terminées. Aucun gain rétrospectif. Le prochain chapitre utilise le vrai profil de départ.

Snapshot version3 : campagnes[].quests={version:1,profile,items:[{id,target,value,complete}]}. Le profil contient days,daysTarget,effortTarget,windowDays:28,frozen_at et éventuellement legacy. Les ids sont days/effort/note. Le calcul des progrès utilise les preuves actuelles, jamais les données du client. Ajouter quest_rewards:[{world,chapter,quest_id,earned_at}] à la racine. Les gains persistés sont uniques par propriétaire/région/chapitre/mission et conservés après édition des séances.

Dans private.titan_adventure_action, après contrôles de propriétaire/révision/objectifs, insérer les seules missions complètes, puis l’insigne et le chapitre suivant dans la même transaction. Les verrous profil et adventure_profiles sérialisent deux validations. Aucun nouvel RPC de mutation. Le snapshot est en security invoker ; les écritures restent dans la fonction privée existante. Nouvelle table RLS, SELECT propriétaire seulement, aucune écriture directe authenticated/anon. Helpers privés sans EXECUTE public ; trigger invoker exécuté par l’écriture privilégiée. search_path vide.

## Client et compatibilité

Le module campaign-quests lit les quêtes serveur sans recalcul de l’historique pour les comptes version3 ; contrat absent/invalide => pas de missions inventées. Ancien serveur et découverte conservent les missions indicatives de l’Aube, clairement locales et sans nouveaux gains. Les quatre régions sont gratuites dans catalogue/moteur découverte et serveur. Avec un ancien serveur qui verrouille encore forge/aurores, afficher l’indisponibilité de cette évolution, sans upsell. Les souvenirs confirmés sont visibles dans le carnet Aventure, bornés au propriétaire et retirés à la transition de compte. Gain annoncé avant validation ≠ gain acquis. Les missions serveur sont disponibles dans les quatre régions ; seul le texte existant de l’Aube est réutilisé.

## Validation et limites

Tester le gel des cibles après modification de l’historique, plafonds/parité multisport/fuseau, exclusion des preuves invalides, absence de mission obligatoire, confirmation atomique, doublon et deux connexions concurrentes, refus d’écriture directe/isolation/suspension, conservation d’une campagne et d’insignes préexistants. Vérifier migrations individuelles et bundle historique sur PostgreSQL16 jetable, puis tests navigateur et verify. Aucun accès à la base réelle, fusion, déploiement ou modification des images/Profil/Android/économie.

RPG04/08/13 restent partiels à l’échelle du produit : pas de progression passive, variété de quêtes limitée à ces trois types, pas de nouvelle personnalisation équipable ni de combat séparé. Ce lot livre leur contrat serveur, sans certifier une recette compte réel ou appareil installé.
