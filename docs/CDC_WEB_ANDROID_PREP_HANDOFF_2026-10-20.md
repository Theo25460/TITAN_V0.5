# Handoff — préparation Android vérifiable sans SDK (AND03, AND10, AND11, Claude, 20/10/2026)

Contexte : le SDK Android n'est pas téléchargeable depuis cet environnement (`dl.google.com` bloqué), et aucune clé de signature ne doit être créée ici. Rien n'est donc construit ; tout ce qui peut être vérifié sans construire l'est.

| Point | Statut | Preuve |
|---|---|---|
| AND10 — icônes depuis le logo actuel | [x] | `tests/android-assets.test.mjs` décode les icônes : lancement `image/logo-512.png` (512×512, opaque, moins de 1 Mo, glyphe à 175 px du centre, cercle de sécurité de 80 % : 205 px) ; **icône masquable dédiée** `image/logo-maskable-512.png` et `-192.png` (même logo réduit à 85 %, glyphe à 149 px pour une zone garantie visible d'environ 61 % : 156 px) utilisée par le TWA et le manifeste PWA (revue : le logo plein cadre dépassait cette zone) ; icônes des raccourcis présentes |
| AND11 — écran de démarrage cohérent | [x] | même test : couleurs de fond, de thème et de navigation du TWA = couleur du fond de l'icône (`#05070a`), fondu court ; l'écran de démarrage d'un TWA est l'icône sur ce fond |
| AND03 — compilation reproductible debug et release | [~] | deux workflows manuels à versions identiques et épinglées (Bubblewrap 1.23.0, Java 17, Node 22) : release avec clé d'envoi (secrets) et **nouvel essai sans secret** (`.github/workflows/android-twa-debug.yml`, clé jetable, artefact « NE-PAS-PUBLIER ») ; garde `tests/android-workflows.test.mjs` ; **jamais exécutés** : à surveiller au premier lancement |

Non traité (nécessite le SDK, un appareil ou une décision) : AND01, AND04 à AND09, AND12 à AND16, AND17 à AND20, GP.

Revue indépendante : aucun bloquant ; corrigés : icône masquable trop grande pour la zone adaptative d'Android (variante dédiée), regex des gardes de workflows assouplies. Connu : le test lit les icônes du dépôt alors que Bubblewrap télécharge celles du site déployé (à recontrôler après publication) ; l'APK d'essai est téléchargeable par toute personne qui lit le dépôt pendant 3 jours (clé jetable, aucun secret).

## BLOQUANT À CORRIGER MAINTENANT
Aucun.
## NON BLOQUANT – BACKLOG FINITION
Lancer l'essai sans secret et lire ses journaux ; empreintes `assetlinks.json` après création de la clé d'envoi et de Play App Signing (Théo) ; capture d'écrans Play (GP03).
## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE
Premier APK d'essai (action de Théo : « Run workflow ») ; Q-005 (BOT06) ; relecture humaine des brouillons légaux.
