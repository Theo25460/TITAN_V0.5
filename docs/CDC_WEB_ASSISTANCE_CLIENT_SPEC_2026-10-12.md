# Formulaire Assistance web — contrat du 12 octobre 2026

## Intention et périmètre

Suite de PR #46 : parent local bc2d4a9ac07f61c95c5f36dab4e2990cf6a04071, publié fc9d4813f0a824379592a964062d23d642b0aa59, arbre 06f4b4c21f4ebfc561ca599cadbc345b84abf6ab. UX13/UX15/QA18 restent partiels. Ajouter au contact public canonique /service un formulaire pour les comptes confirmés non anonymes : catégorie, description volontaire, choix explicite de réponse, aperçu puis confirmation. Une référence reçue reste visible pendant une panne de notification ; une réception incertaine se réessaie avec la même demande.

Périmètre de sept fichiers : service.html, css/assistance.css, js/app/assistance.js, tests/e2e/smoke.e2e.mjs et ces documents SPEC/PLAN/HANDOFF. Le contrat API et la migration PR #46 restent intacts. Pas de diagnostics UX14, pièces jointes, analytics support, canal anonyme, dashboard opérateur, rétention/purge ni configuration réelle. Aucun changement Profil/auth/suppression, règles/économie, Android, source sw.js ou images ; aucune fusion/déploiement.

## Activation et continuité

Le conteneur porte data-support-enabled="false" dans le fichier versionné. Aucun formulaire, session, import Auth ou appel API en mode désactivé ; les six catégories, neuf FAQ, actions existantes et sept liens mailto continuent de fonctionner sans JavaScript. Activation future seulement après conservation/purge, accès opérateur, domaine/fournisseur et recette réelle validés, avec le canal serveur PR #46 lui aussi activé. Ne pas créer cette configuration réelle pendant le lot.

L’activation charge à la demande le SDK local Supabase 2.111.0 et le config.js existant, réutilisant titan_supabase_auth_v1. Pas de changement global des options Auth. Les dépendances statiques sont déjà disponibles dans le cache app ; le script Assistance versionné est automatiquement précaché depuis le HTML. Styles limités à Assistance, tokens Ascension/public conservés.

## Compte et confidentialité

getSession fournit le bearer ; getUser(bearer) vérifie en réseau l’identité. UUID et bearer ont les types/formats attendus. Compte confirmé, is_anonymous=false, adresse vérifiée. Réserver l’action avant les attentes Auth ; avant POST et avant rendu de la réponse, vérifier la session actuelle contre l’identité figée. Le serveur vérifie indépendamment le compte et les permissions.

onAuthStateChange reste synchrone ; pas d’appel SDK dans son callback. Changement d’identité, déconnexion ou modification utilisateur : invalider l’époque, effacer immédiatement brouillon/aperçu/choix/référence, interrompre l’attente HTTP quand possible, ignorer anciennes continuations ; revérifier hors callback avant de rouvrir un formulaire vide. Un renouvellement de jeton du même compte conserve le brouillon et le verrou. Si le client change, refuser la continuation. Après pagehide/BFCache : effacement et contrôle frais, jamais d’envoi automatique.

Description et référence seulement en mémoire de l’onglet et dans le DOM courant ; aucun stockage de contenu, log, événement analytics, lecture des autres sauvegardes ou capture automatique de URL/UA/données de sport. Remplissage par liens de catégorie à valeurs fixes, jamais via paramètres URL. Prévenir la fermeture si la réception reste incertaine ou l’envoi en cours. Reload/onglets/appareils multiples ne disposent pas d’une reprise durable dans ce lot : ne pas revendiquer une garantie globale de déduplication.

## Parcours et contrat API

Le formulaire apparaît seulement après vérification du compte. Catégories exactes : bug, compte, titanplus, donnees, communaute, autre. Message trimé de 10 à 4 000 points Unicode, au plus 16 KiB UTF-8, aucun contrôle ASCII/C1 sauf tabulation/LF ni surrogate isolé ; textarea 8 000 unités UTF-16 au plus. Étiquette/compteur/erreurs accessibles, choix de réponse décoché. Pas de champ identité/adresse/diagnostic/fichier.

« Voir l’aperçu » ne transmet rien. Aperçu lisible : catégorie, texte rendu comme texte, choix de réponse et adresse vérifiée seulement si choisi ; « Modifier » revient au brouillon. « Confirmer l’envoi » transmet précisément {request_id: UUIDv4, category: string, message: string, reply_allowed: boolean} à POST /functions/assistance, bearer figé dans Authorization, Content-Type application/json, cache no-store, redirect error et referrerPolicy no-referrer. Pas de transfert vers messagerie automatique. Une requête à la fois dans la page, y compris répétitions synthétiques et phase Auth ; contrôles figés, aria-busy sur formulaire, annonce d’attente hors de ce formulaire.

Clé créée par crypto.randomUUID au premier envoi ; texte/choix/catégorie figés dès que POST a pu partir. Avant toute tentative HTTP, hors ligne ou Auth indisponible conserve un brouillon modifiable. Après réception incertaine, modification et nouvelle demande sont interdites ; seul « Réessayer cette demande » répète le même payload/UUID. Jamais de retry réseau automatique, timer d’envoi ou retry à la reconnexion.

Accepter uniquement 200 + accepted=true + UUID string + notification=sent, ou 202 + mêmes preuves + notification=pending. Référence existante doit rester identique sur retry. Afficher « Demande reçue » et référence copiable/sélectionnable ; sent indique alerte acceptée, pas livraison en boîte. pending indique demande reçue et alerte encore en attente ; « Vérifier à nouveau cette demande » reprend le même ticket. Un échec ultérieur conserve la réception et sa référence. Une nouvelle demande n’est possible qu’après une réception prouvée, sur action explicite.

400/401/403/429 bornés lors du premier envoi sans incertitude antérieure : erreur humaine adaptée, aucune référence inventée. Un rejet sur retry ne réfute jamais une réception antérieure incertaine : clé, contenu et verrou restent conservés. 409, panne réseau, 5xx, redirection/JSON/réponse invalide : résultat incertain, même clé conservée, avertissement contre un doublon par e-mail et garder cet onglet ouvert. Timeout Auth 8 s, POST 45 s ; un timeout HTTP n’annule pas le travail serveur. Liens mailto statiques et adresse publique conservés ; aucun contenu privé ajouté aux liens.

## Vérification exigée

Chromium isolé, transports Auth/Assistance fictifs, tiers bloqués. RED sur le parent sans interface, puis comportement du vrai script. Couvrir activation désactivée/sans JS, six catégories/solutions, compte anonyme/non confirmé/mal typé, aperçu/choix sans appel, Unicode/validation/XSS, succès/pending, répétitions pendant Auth et HTTP, panne/retry stable, payload minimal/no leaks, erreurs bornées/réponse invalide, réception conservée après retry raté, changement de compte pendant Auth/HTTP et refresh même propriétaire, offline/retour réseau sans retry, fermeture/BFCache et clavier/rendus 360/1280/PWA.

158 tests baseline ; suite complète pnpm verify et E2E existants plus nouveaux, rendu inspecté, revue indépendante unique Sol 6.1 high et CI finale trois jobs/logs HEAD/base exacts. CDC : conserver 265 formulations, tous les statuts actuels et WORK/RPG01 ; notes d’avancement ciblées UX13/UX15/QA18, aucun statut terminé global. Source SDK consultée : https://supabase.com/docs/reference/javascript/auth-getuser et https://supabase.com/docs/reference/javascript/auth-onauthstatechange ; changelog lu, aucun changement Auth pertinent imposant de modifier la version locale épinglée.
