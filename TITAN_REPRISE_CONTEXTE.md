# CODEX HANDOFF - TITAN OS

Ce fichier est ecrit pour un futur Codex qui arrive dans une discussion vide.

Lis-le avant de toucher au code. Il explique ce qu'est TITAN OS, ou en est le chantier, ce qui a ete corrige, ce qui marche probablement, ce qui reste incertain, et comment reprendre sans casser les changements recents.

Derniere mise a jour: 2026-04-28, apres ajout DB sport v43, equilibrage XP, champs specifiques conditionnels et securisation des extras

Ajouts v43:

- Nouveau SQL `sql/titan_sports_specificity_balance_v43.sql`:
  - enrichit `sports` avec `extra_fields`, `xp_rules`, `validation_rules`, `balance_profile`;
  - ajoute des champs specifiques par famille sportive, dont football avec `position` et champs conditionnels gardien (`saves`, `clean_sheet`);
  - ajoute/prepare les tables et colonnes demandees dans les TODO DB v42: `weekly_quests`, champs `mobs`/`bosses` (`rarity`, `weakness`, `hp_mult`, `reward_mult`, `zone_id`), `user_bestiary`, `combat_logs`;
  - active RLS sur les nouvelles tables utilisateur et garde les logs utilisateur bornes par contraintes non validees immediatement.
- Equilibrage XP de `js/titan_features.js`:
  - nouveau calcul central `titanComputeSessionRewards`;
  - soft cap par seance et hard cap pour eviter une fin trop rapide;
  - D+ beaucoup plus valorise sur outdoor/randonnee/trail: 40 km plat ne vaut plus 40 km avec 500 m D+;
  - bonus extras plafonnes pour que les champs specifiques ajoutent du gout sans exploser la progression.
- `training.html`:
  - champs specifiques dynamiques et conditionnels;
  - rendu securise/echappe des labels/options venant de la DB;
  - collecte seulement les champs visibles.
- Securite:
  - extras nettoyes cote client selon la config sport;
  - notes/tags/GPX restent limites;
  - les donnees sport restent du confort client, pas une source anti-triche serveur.

- Nouveau module local `js/titan_features.js`:
  - score de recuperation et surcharge avec penalite XP/charge si la charge recente est trop haute;
  - records personnels par sport;
  - badges de discipline par paliers;
  - comparaison semaine actuelle vs precedente;
  - resume intelligent apres seance;
  - suggestions rapides de sport et objectif du jour;
  - calendrier visuel hebdo;
  - "spectre d'adaptation" pour mesurer la variete sportive;
  - notes courtes de seance limitees (standard 180 caracteres, Elite 600);
  - tags de seance utiles au calcul de charge: `recovery` baisse la charge, `test` et `competition` l'augmentent;
  - bestiaire local enrichi, rarete locale, faiblesses sportives, secteurs de campagne, titres joueur;
  - journal d'aventure local.
- Nouvelle page `disciplines.html`:
  - badges par discipline comme des succes dedies;
  - records personnels;
  - titres debloques et activables;
  - journal d'aventure recent.
- Pages branchees:
  - `training.html`: recovery, surcharge, penalite, suggestions rapides, tags, note limitee, GPX enrichi, calendrier hebdo.
  - `stats.html`: comparaison semaine, spectre d'adaptation, graphique standard 14 jours, centre tactique Elite garde l'analyse multi-metriques.
  - `index.html`: objectif du jour visible, aide plus visible et guide complete.
  - `adventure.html`: secteurs lore, rarete locale, faiblesse sportive, bonus de degats si le dernier type d'entrainement correspond.
  - `trophies.html`: bestiaire enrichi par les mobs vaincus.
  - `js/ui.js`: lien navigation vers `disciplines.html` et affichage du titre actif.
  - `sw.js`: cache passe a `titan-os-v42`, ajout de `disciplines.html` et `js/titan_features.js`.

Important v42:

- Les nouveautes gameplay v42 restent volontairement local-first et stockees dans `profiles.game_state`.
- Ne pas utiliser ces calculs cote client comme source de verite anti-triche.
- Le module `js/titan_features.js` doit etre charge avant `js/main.js` sur les pages qui veulent les nouvelles fonctions.
- Les notes de seance sont limitees avant insertion dans `training_logs.details` pour eviter de gonfler inutilement la DB gratuite.
- Les chemins GPX stockes dans `details.gpxPath` sont aussi limites: environ 220 points standard, 600 points Elite.

TODO DB plus tard:

- Quetes hebdomadaires:
  - creer une table/config Supabase dediee pour les quetes hebdo;
  - prevoir colonnes type/id/title/desc/target/reward_xp/reward_credits/sport/category/active_from/active_to/elite_only;
  - le front ne genere pas encore ces quetes depuis la DB, il faut le faire proprement dans une passe separee.
- Monstres et difficulte:
  - ajouter/normaliser dans la table `mobs` des champs `rarity`, `weakness`, `hp_mult`, `reward_mult`, `zone_id`;
  - ajouter/normaliser dans la table `bosses` des champs `weakness`, `zone_id`, `reward_mult`;
  - aujourd'hui la rarete/faiblesse/difficulte est derivee localement pour donner le gameplay sans bloquer la DB.
- Bestiaire serveur:
  - si on veut synchroniser les neutralisations entre appareils de maniere fiable, creer une table `user_bestiary` ou `combat_logs`;
  - actuellement le bestiaire enrichi vit dans `profiles.game_state`.

Workspace local:

`C:\Users\theoc\Downloads\TITAN_V0.5`

Il n'y a pas de depot git dans ce dossier au moment des interventions. Ne compte pas sur `git diff` ou `git status`.

## 1. Ce qu'est TITAN OS

TITAN OS est une web app fitness/gamification statique en HTML/CSS/JS.

Le concept produit:

- L'utilisateur enregistre des seances sport.
- Les seances donnent XP, credits, charge de combat.
- La charge sert a combattre des mobs puis des boss dans `adventure.html`.
- La progression globale est stockee dans un objet `window.state`.
- Le site a aussi boutique, premium, stats, talents, social, chat, profil, trophees.
- Premium s'appelle souvent `Elite` dans le code/UI.

Stack technique:

- Front statique: pages `.html`, CSS global, JS global.
- Supabase cote navigateur:
  - auth
  - profils
  - logs sport
  - donnees dynamiques
  - boutique/social/stats
- Netlify Functions:
  - `functions/webhook.js` pour Lemon Squeezy / premium.
- Service worker:
  - `sw.js`.

Le site n'est pas une SPA moderne. Beaucoup de logique est inline dans les pages HTML. Le systeme global vient surtout de:

- `js/config.js`
- `js/data.js`
- `js/state.js`
- `js/ui.js`
- `js/main.js`

Ordre de script attendu sur les pages applicatives:

```html
<script src="./js/config.js?v=41"></script>
<script src="./js/data.js?v=41"></script>
<script src="./js/ui.js?v=41"></script>
<script src="./js/state.js?v=41"></script>
<script src="./js/titan_features.js?v=42"></script>
<script src="./js/main.js?v=41"></script>
```

Puis scripts/modules specifiques a la page.

## 2. Modele mental du state

Le coeur applicatif est `window.state`.

Forme importante:

```js
window.state = {
  user: {
    id,
    name,
    level,
    xp,
    credits,
    dailyXp,
    avatar,
    buffs,
    upgrades,
    inventory,
    is_elite,
    is_tester,
    streak_count,
    last_week_id,
    friend_code,
    unlockedTalents,
    unlockedAchievements,
    records,
    disciplineBadges,
    unlockedTitles,
    activeTitle,
    purchase_history,
    cosmetics: {
      unlocked: [
        'frame-standard',
        'grenade-default',
        'victory-standard'
      ],
      active: {
        avatarFrame: 'frame-standard',
        grenadeSkin: 'grenade-default',
        victoryEffect: 'victory-standard'
      }
    }
  },
  inventory,
  game: {
    phase,
    bossLevel,
    storedDmg,
    currentEnemy,
    mobsDefeated,
    bestiary,
    adventureLog,
    zones,
    lastTrainingSport,
    lastTrainingFamily
  },
  history,
  quests,
  meta: {
    updatedAt
  }
}
```

Sauvegarde:

- locale: `localStorage[window.STATE_KEY]`
- cloud: `profiles.game_state`

`STATE_KEY` actuel dans `js/config.js`:

```js
window.STATE_KEY = 'titan_os_v12_save';
```

Important:

- `state.inventory` est garde comme alias de `state.user.inventory`.
- `is_elite` ne doit pas etre pousse librement par `saveState` vers Supabase. La source officielle est `profiles.is_elite`, mise a jour par webhook Lemon Squeezy.
- `meta.updatedAt` sert a eviter qu'un profil cloud plus ancien ecrase un etat local plus recent.
- `state.user.cosmetics` stocke uniquement des choix visuels. Ne jamais l'utiliser pour calculer XP, degats, credits, progression, limites ou acces serveur sensible.
- `state.user.records`, `disciplineBadges`, `unlockedTitles` et `activeTitle` sont des donnees de progression locale v42.
- `state.game.bestiary`, `adventureLog`, `zones`, `lastTrainingSport` et `lastTrainingFamily` supportent le bestiaire, le journal d'aventure et les faiblesses sportives.

## 3. Etat general apres les dernieres interventions

Etat logique actuel:

- Beaucoup d'URLs scripts historiques sont encore en `?v=41`; le nouveau module sport/RPG est en `?v=42`.
- `sw.js` est passe a `titan-os-v42`.
- Une couche CSS globale v40 a ete ajoutee.
- La progression aventure mobs/boss a ete corrigee.
- La boutique et les limites d'achat ont ete renforcees.
- Le premium a ete renforce cote checkout et webhook.
- Une couche de cosmetiques premium Elite a ete ajoutee sans impact gameplay.
- Le noyau sport/RPG v42 ajoute recuperation, surcharge, records, badges, titres, secteurs, faiblesses et bestiaire enrichi.
- La nouvelle page `disciplines.html` centralise badges, records, titres et journal d'aventure.
- La navigation mobile/sidebar a ete unifiee.
- Les stats fun ont un fallback local.
- Un SQL RLS de verification globale a ete ajoute.

Ce qui est verifie localement:

- Syntaxe JS OK sur les fichiers principaux.
- Scripts inline HTML OK.
- Chemins images mobs/boss OK.
- Syntaxe `js/titan_features.js`, `js/main.js`, `js/state.js`, `js/ui.js` OK avec le Node integre Codex.
- Scripts inline de `training.html`, `stats.html`, `index.html`, `adventure.html`, `trophies.html`, `disciplines.html` OK.

Ce qui n'a pas pu etre verifie completement:

- Test navigateur Playwright complet, car les navigateurs Playwright n'etaient pas installes.
- Supabase live/RLS en production, car cela depend de l'environnement et des tables reelles.
- Paiement Lemon Squeezy reel/sandbox, car cela depend du compte Lemon Squeezy et du webhook Netlify.
- Rendu visuel final navigateur des ajouts v42 non verifie dans cette passe; seule la syntaxe a ete validee.

## 4. Problemes resolus recemment

### 4.1 Progression mobs/boss et images qui retombaient sur le logo

Probleme utilisateur initial:

- L'utilisateur doutait que la progression mobs/boss se sauvegarde.
- Les images mobs/boss s'affichaient quelques secondes puis revenaient au logo TITAN.

Cause probable:

- La page adventure reconstruisait parfois les chemins depuis la DB.
- Certains chemins forces en `.png` etaient faux:
  - `mob_1` est `.jpg`
  - certains boss sont `.jpg` ou `.jpeg`
- Les sauvegardes cloud etaient debounces: une sauvegarde de victoire pouvait arriver juste apres une autre sauvegarde et ne pas partir immediatement cote cloud.

Fichiers touches:

- `adventure.html`
- `js/adventure.js`
- `js/state.js`

Correctifs:

- Ajout de `imageId` dans `game.currentEnemy`.
- Normalisation des assets locaux:
  - `mob_1.jpg`
  - `boss_8.jpg`
  - `boss_12.jpg`
  - `boss_13.jpg`
  - `boss_21.jpeg`
  - autres mobs/boss en `.png`
- Les vieux `imgOverride` casses sont repares au rendu.
- Les images DB sont reinterpretees vers les assets locaux si possible.
- Les sauvegardes apres victoire utilisent `saveState({ forceCloud: true })`.
- `saveState` peut maintenant forcer la sync cloud.

Etat attendu:

- Si un boss est entame et reste a 10% PV, son `hp` reste dans `state.game.currentEnemy.hp`.
- Si un boss est battu:
  - `state.game.bossLevel++`
  - `state.game.mobsDefeated = 0`
  - `state.game.currentEnemy = null`
  - sauvegarde forcee
- Si un mob est battu:
  - `mobsDefeated++`
  - au bout de 5 mobs, phase boss.

### 4.2 Design global trop enfant / peu premium

Demande utilisateur:

- Revoir le site visuellement.
- Le rendre moins enfant, plus creatif, plus qualitatif.
- Assurer bon rendu telephone/ecran geant.

Fichier touche:

- `css/style.css`

Correctifs:

- Ajout d'une couche finale `TITAN OS v40 - visual polish global`.
- Nouvelle palette:
  - fond graphite/noir
  - accent cyan-vert
  - gold plus sobre
  - danger/success plus nets
- Cartes plus adultes:
  - radius reduit
  - profondeur plus discrete
  - bordures plus propres
- Sidebar plus dense.
- Mobile nav scrollable et plus complete.
- Media queries pour mobile et tres grands ecrans.

Important:

- Le site garde beaucoup de styles inline, donc le CSS global est une couche de finition, pas une refonte totale.

### 4.3 Navigation et pages qui ne communiquaient pas bien

Probleme:

- Plusieurs pages avaient deja `<div class="mobile-user-bar"></div>`.
- L'ancien `injectMobileHeader` quittait si ce conteneur existait.
- Resultat: header mobile parfois vide.
- La nav mobile ne donnait pas acces a toutes les pages importantes.

Fichier touche:

- `js/ui.js`

Correctifs:

- Ajout/override de `window.TITAN_NAV_LINKS`.
- Sidebar reconstruite depuis cette liste.
- Mobile nav reconstruite depuis cette liste.
- Header mobile remplit le conteneur existant au lieu de quitter.
- `updateGlobalUI` reinjecte sidebar/header si presents.

Mobile nav actuelle:

- Q.G.
- SPORT
- CAMPAGNE
- SHOP
- STATS
- PROFIL

Sidebar actuelle:

- OPERATIONS
  - Q.G.
  - S'ENTRAINER
  - CAMPAGNE
  - ARMURERIE
- DONNEES
  - STATISTIQUES
  - JOURNAL
  - TROPHEES
- PROGRESSION
  - TALENTS
  - MISSIONS
- SYSTEME
  - SOCIAL
  - CHAT
  - SANTE
  - PROFIL

### 4.4 Boutique et limites

Probleme:

- La boutique utilisait parfois `window.PURCHASE_HISTORY`, parfois un historique local absent.
- Les limites hebdo/daily pouvaient etre incoherentes entre UI et logique achat.

Fichiers touches:

- `js/main.js`
- `js/state.js`
- `boutique.html`

Correctifs:

- Ajout `state.user.purchase_history`.
- `applyGameData` mappe `shopHistory` Supabase vers:
  - `window.PURCHASE_HISTORY`
  - `state.user.purchase_history`
- `checkPurchaseLimit(item)` lit maintenant l'historique serveur + local.
- Deduplication par `item_id + date`.
- `finalizePurchase` ajoute l'achat a `state.user.purchase_history`.
- `finalizePurchase` sauvegarde avec `forceCloud`.
- `boutique.html` compte les achats depuis historique serveur + local.

Etat attendu:

- Les limites visuelles et les limites reelles sont plus coherentes.
- Si connecte, `shop_history` serveur reste la source la plus fiable.
- Hors connexion/guest, l'historique local protege quand meme la plupart des limites.

### 4.5 Premium / Elite

But:

- Premium s'appelle `Elite`.
- Premium doit etre rattache au compte utilisateur.
- Les invites ne doivent pas partir au checkout sans identifiant.

Fichiers touches:

- `js/main.js`
- `boutique.html`
- `functions/webhook.js`

Correctifs front:

- Ajout `window.buildEliteCheckoutUrl()`.
- Ajout `window.openEliteCheckout()`.
- Si utilisateur invite:
  - notification connexion requise
  - redirection vers `login.html`
- Si connecte:
  - construit URL Lemon Squeezy avec `checkout[custom][user_id]`.

Webhook:

- Verification signature HMAC Lemon Squeezy deja presente.
- Ajout validation UUID sur `user_id`.
- Ajout garde-fou produit:
  - si un nom produit existe, il doit contenir `elite` ou `titan`.
- Update `updated_at` lors de `is_elite`.

Attention importante:

- Verifier dans Lemon Squeezy que le nom produit contient bien `Elite` ou `Titan`.
- Sinon le webhook ignorera l'event.

Etat premium attendu:

- `profiles.is_elite = true` est la source officielle.
- Au prochain sync, `state.user.is_elite` reprend la valeur du profil.
- Les pubs/locks UI regardent `state.user.is_elite`.

Limite securite:

- Comme beaucoup de logique premium est front, un utilisateur technique peut modifier localement `state.user.is_elite`.
- Cela ne doit jamais donner acces a une ressource serveur sensible.

### 4.6 Statistiques fun

Probleme:

- Le labo insolite affichait une erreur si `FUN_STATS_DB` n'etait pas charge.

Fichier touche:

- `stats.html`

Correctif:

- Ajout `getFunStatsDb()`.
- Fallback local si Supabase n'a pas `fun_stats`.

Exemples fallback:

- `un distributeur de snacks souleve`
- `un marathon de drama interieur`
- `une pizza tactique neutralisee`
- `un frigo final boss`

### 4.7 Service worker

Fichier touche:

- `sw.js`

Correctifs:

- Cache passe de `titan-os-v39` a `titan-os-v40`.
- Pages ajoutees au cache:
  - `training.html`
  - `adventure.html`
  - `boutique.html`
  - `stats.html`
  - `profile.html`

Important:

- Apres deploiement, hard refresh ou fermeture/reouverture PWA.

### 4.8 Dev mode

Fichiers touches:

- `js/main.js`
- `sys_core_override_99.html`

Correctifs:

- `devToggleElite` exige `state.user.is_tester === true`.
- `devResetShop` exige `is_tester`.
- `sys_core_override_99.html` refuse `execCmd` si non testeur.

Limite:

- C'est une barriere front. Elle evite les accidents, pas un vrai controle serveur.

### 4.9 Cosmetiques premium Elite sans desequilibre

Demande utilisateur:

- Ajouter des avantages premium qui restent dans la DA TITAN.
- Appliquer notamment:
  - badge Elite ameliore
  - cadres d'avatar premium
  - animations de notification premium
  - effet visuel autour de l'avatar Elite
  - icones premium social/chat
  - historique d'activite plus style
  - section cosmetiques Elite en boutique
  - skins de grenades purement visuels
  - effets de victoire/reussite purement visuels

Fichiers touches:

- `js/state.js`
- `js/ui.js`
- `js/main.js`
- `css/style.css`
- `profile.html`
- `boutique.html`
- `activities.html`
- `adventure.html`
- `js/adventure.js`
- `js/chat.js`
- `js/social.js`

Etat ajoute dans `state.user`:

```js
cosmetics: {
  unlocked: ['frame-standard', 'grenade-default', 'victory-standard'],
  active: {
    avatarFrame: 'frame-standard',
    grenadeSkin: 'grenade-default',
    victoryEffect: 'victory-standard'
  }
}
```

Logique globale ajoutee dans `js/ui.js`:

- `window.TITAN_PREMIUM_VISUALS`
- `window.TITAN_COSMETIC_ITEMS`
- `window.titanIsElite(user)`
- `window.titanIsCosmeticUnlocked(id, user)`
- `window.titanActivateCosmetic(slot, id)`
- `window.titanUnlockCosmetic(id)`
- `window.titanGetShopCatalog()`
- `window.titanGetAvatarFrameClass(user)`
- `window.titanGetGrenadeSkin()`
- `window.titanRenderPremiumIcon(user)`
- `window.titanRenderEliteMark(user)`
- `window.triggerTitanVictoryEffect(kind)`

Cosmetiques disponibles actuellement:

- Frames avatar:
  - `frame-standard`
  - `frame-aegis`
  - `frame-neon`
  - `frame-frost`
  - `frame-crimson`
- Skins grenades:
  - `grenade-default`
  - `grenade-plasma`
  - `grenade-gold`
  - `grenade-glitch`
  - `grenade-frost`
- Effets victoire:
  - `victory-standard`
  - `victory-ion`
  - `victory-orbital`

UI/UX ajoutee:

- Sidebar et header mobile:
  - badge Elite plus visible
  - frame avatar active
  - effet autour de l'avatar Elite
- Profil:
  - nouvelle section `PROTOCOLES ELITE`
  - choix des cadres avatar
  - choix des skins grenades
  - choix des effets de victoire
- Boutique:
  - section `COSMETIQUES ELITE`
  - articles cosmetiques gratuits mais reserves Elite
  - activation directe des cosmetiques si deja Elite
- Activites:
  - filtre `PRIME`
  - cartes avec trace visuelle Elite quand `log.eliteTrace === true`
- Aventure:
  - rendu visuel des grenades selon le skin actif
  - animation de victoire premium si effet actif
- Chat/social:
  - icone premium a cote du pseudo lorsque disponible.

Important gameplay:

- Aucun de ces ajouts ne modifie:
  - `earnedXp`
  - `earnedCredits`
  - degats des grenades
  - degats de l'arme principale
  - recompenses boss/mobs
  - limites d'achat boutique
  - progression aventure
- Les skins de grenades changent seulement icone/couleur/classe CSS.
- Les effets de victoire sont purement DOM/CSS et temporaires.
- `eliteTrace` dans les logs sert a styliser l'historique, pas a recompenser.

Verification faite apres ajout:

- `node --check` OK via runtime Codex sur:
  - `js/ui.js`
  - `js/state.js`
  - `js/main.js`
  - `js/chat.js`
  - `js/social.js`
  - `js/adventure.js`
- Scripts inline HTML parse OK via `vm.Script` sur:
  - `boutique.html`
  - `profile.html`
  - `activities.html`
  - `adventure.html`

Limites connues:

- Pas de test visuel navigateur complet apres cet ajout.
- Les cosmetiques sont controles cote front. Ils ne doivent jamais proteger une ressource serveur sensible.
- Le dossier n'a toujours pas de depot git local.

## 5. Fichiers importants a connaitre

### Globaux

- `js/config.js`
  - Supabase URL/key publique
  - `STATE_KEY`
  - `CACHE_KEY`
  - `ELITE_PAYMENT_URL`
  - containers globaux

- `js/data.js`
  - garde les globals historiques
  - ne doit pas ecraser les donnees chargees par Supabase

- `js/state.js`
  - load/save state
  - sync Supabase profil
  - loadServerData
  - applyGameData
  - RLS/status DB visible via `window.TITAN_DB_STATUS`

- `js/ui.js`
  - notifications
  - sidebar/mobile nav/mobile header
  - avatars
  - definitions et helpers cosmetiques premium Elite
  - renderSports/renderHistory
  - news
  - pubs/adblock wall

- `js/main.js`
  - moteur economie/XP
  - logActivity
  - addCharge
  - shop
  - achat/deblocage des items cosmetiques via catalogue fusionne
  - premium checkout
  - social/wagers
  - marketing ads
  - dev tools

### Pages critiques

- `training.html`
  - enregistrement des seances
  - recovery monitor elite
  - construit les formulaires sport

- `adventure.html`
  - moteur combat inline principal
  - utilise aussi logique similaire dans `js/adventure.js`

- `boutique.html`
  - rendu shop inline
  - bouton premium
  - UI limites
  - section cosmetiques Elite

- `stats.html`
  - KPIs
  - chart premium
  - labo insolite

- `profile.html`
  - pseudo/avatar
  - selection cosmetiques Elite
  - export donnees
  - logout
  - reset cache
  - suppression compte via RPC

- `social.html` + `js/social.js`
  - amis/defis/social challenges

- `chat.html` + `js/chat.js`
  - chat realtime

### Backend / SQL

- `functions/webhook.js`
  - webhook Lemon Squeezy premium

- `sql/titan_rls_hotfix_training_logs.sql`
  - hotfix profiles/training_logs/RLS

- `sql/titan_rls_site_integrity_check.sql`
  - hotfix shop_history/user_achievements/social_challenges/grants

## 6. Base de donnees attendue

Tables publiques/config lues par le front:

- `mobs`
- `bosses`
- `talents`
- `sports`
- `achievements_config`
- `global_config`
- `fun_stats`
- `shop_items`
- `news_updates`

Tables utilisateur:

- `profiles`
- `training_logs`
- `shop_history`
- `user_achievements`
- `social_challenges`
- `messages`

Storage:

- bucket `avatars`

RPC:

- `delete_own_account()`

## 7. SQL a lancer / verifier

### 7.1 Premier SQL: training/profiles

Fichier:

`sql\titan_rls_hotfix_training_logs.sql`

Sert a:

- creer/reparer `profiles`
- creer/reparer `training_logs`
- activer RLS
- grants authenticated
- policies:
  - profiles select/insert/update
  - training_logs select/insert/update/delete own

Si Supabase affiche un warning "Potential issues detected":

- Le warning vient probablement des `drop policy if exists`.
- Le script ne doit pas supprimer les donnees utilisateur.
- Choix conseille lors de l'intervention precedente: `Run and enable RLS`.

### 7.2 Deuxieme SQL: integrite site

Fichier:

`sql\titan_rls_site_integrity_check.sql`

Sert a:

- creer/reparer `shop_history`
- creer/reparer `user_achievements`
- grants select sur tables publiques
- policies:
  - `shop_history` own select/insert
  - `user_achievements` own select/insert
  - `social_challenges` involved select/update, challenger insert

Action prioritaire:

- Lancer ce SQL dans Supabase SQL Editor apres relecture.

### 7.3 Troisieme SQL: sports/specifiques/equilibrage v43

Fichier:

`sql\titan_sports_specificity_balance_v43.sql`

Sert a:

- ajouter les champs DB `extra_fields`, `xp_rules`, `validation_rules`, `balance_profile` sur `sports`;
- remplir chaque sport/famille sportive avec plusieurs donnees specifiques;
- creer les tables config `weekly_quests`, `user_bestiary`, `combat_logs`;
- normaliser mobs/boss avec rarete/faiblesse/difficulte;
- activer RLS/policies sur les nouvelles tables utilisateur.

Action prioritaire:

- Lancer apres les SQL 7.1 et 7.2, puis verifier dans Supabase que `sports.extra_fields` contient bien des tableaux JSON.

## 8. Ce qui marche probablement

Avec les corrections locales:

- `window.state` se charge et se repare mieux.
- L'inventaire est unifie.
- La progression aventure ne devrait plus perdre les PV ou images.
- Les images mobs/boss ne devraient plus revenir au logo sauf vraie image manquante.
- La boutique garde un historique local des achats.
- Les limites boutique sont plus coherentes.
- Le checkout premium refuse les invites.
- Le webhook premium est plus strict.
- La nav mobile affiche les pages importantes.
- Le header mobile n'est plus vide.
- Les stats fun ont un fallback si DB indisponible.
- Le CSS global rend le site plus mature.
- Les cosmetiques Elite sont initialises dans le state et restent visuels.
- Les cadres avatar, skins grenades, icones premium et effets victoire s'activent sans toucher a l'equilibrage.

## 9. Ce qui est encore incertain

Incertitudes liees a Supabase:

- Toutes les tables existent-elles en production ?
- RLS est-il bien actif partout ?
- `training_logs` accepte-t-il bien l'insert avec `auth.uid()` ?
- `shop_history` existe-t-il deja et son schema correspond-il ?
- `social_challenges` a-t-il bien les colonnes attendues ?
- `messages` a-t-il `sender_id`, ou le fallback sans `sender_id` est-il necessaire ?
- Realtime est-il active pour chat/social ?

Incertitudes liees a premium:

- Le webhook Netlify recoit-il bien les events Lemon Squeezy ?
- La variable `LEMONSQUEEZY_WEBHOOK_SECRET` est-elle configuree ?
- Le nom produit Lemon contient-il `Elite` ou `Titan` ?
- `checkout[custom][user_id]` arrive-t-il bien dans `body.meta.custom_data.user_id` ?

Incertitudes visuelles:

- Pas de test Playwright complet.
- A verifier sur:
  - mobile reel
  - desktop large
  - PWA/cache

## 10. Tests a faire en reprise

### Test 1: session Supabase

Dans console navigateur:

```js
await window.titanClient.auth.getSession()
```

Attendu:

- `session.user.id` existe.

Si `session === null`:

1. `profile.html`
2. logout
3. `login.html`
4. reconnexion
5. hard refresh
6. retest

### Test 2: seance sport

1. Se connecter.
2. Aller `training.html`.
3. Enregistrer une seance.
4. Verifier:
   - UI donne XP/credits/charge.
   - `window.state.history` contient la seance.
   - Supabase `training_logs` recoit la ligne.
   - `profiles.game_state` est mis a jour.

Si message "sauvegarde locale uniquement":

- verifier `auth.getSession()`
- verifier erreur console Supabase
- verifier RLS `training_logs`

### Test 3: aventure

1. Avoir de la charge `state.game.storedDmg`.
2. Aller `adventure.html`.
3. Tirer sur un mob/boss sans le tuer.
4. Reload.
5. Verifier PV restants.
6. Tuer 5 mobs.
7. Verifier phase boss.
8. Tuer boss.
9. Verifier `bossLevel++`.

Console utile:

```js
window.state.game
```

### Test 4: images aventure

Verifier dans le DOM:

```js
document.getElementById('boss-visual').src
document.getElementById('boss-visual').naturalWidth
document.getElementById('boss-visual').getAttribute('data-active-src')
```

Attendu:

- `src` pointe vers `image/mob/...` ou `image/boss/...`.
- `naturalWidth > 0`.
- pas de retour au logo apres 3-4 secondes.

### Test 5: boutique

1. Se connecter.
2. Aller `boutique.html`.
3. Acheter un item.
4. Verifier:
   - credits modifies
   - `state.user.purchase_history`
   - `window.PURCHASE_HISTORY`
   - table Supabase `shop_history`
5. Tester limite daily/weekly.

Console utile:

```js
window.state.user.purchase_history
window.PURCHASE_HISTORY
window.checkPurchaseLimit(window.SHOP_DB[0])
```

### Test 6: premium

1. Connecte: aller `boutique.html`.
2. Cliquer `PASSER ELITE`.
3. Verifier URL contient `checkout[custom][user_id]`.
4. Simuler/tester webhook Lemon Squeezy.
5. Verifier `profiles.is_elite = true`.
6. Recharger app.
7. Verifier:
   - badge Elite profil/sidebar/header
   - stats premium deverrouillees
   - recovery monitor dans training
   - pubs desactivees

Test invite:

1. Se deconnecter.
2. Aller boutique.
3. Cliquer premium.
4. Attendu: notification connexion requise + redirection login.

### Test 7: navigation

Sur mobile:

- Header mobile non vide.
- Nav mobile affiche:
  - Q.G.
  - SPORT
  - CAMPAGNE
  - SHOP
  - STATS
  - PROFIL
- Pas de gros debordement.
- Les pages chargees gardent sidebar/header coherents.

### Test 8: cosmetiques Elite

1. Se connecter avec un profil `is_elite = true`.
2. Aller `profile.html`.
3. Dans `PROTOCOLES ELITE`, activer:
   - un cadre avatar
   - un skin grenade
   - un effet victoire
4. Verifier:
   - sidebar/header mobile affichent le cadre avatar
   - `window.state.user.cosmetics.active` contient les choix
   - sauvegarde locale OK
5. Aller `boutique.html`.
6. Verifier section `COSMETIQUES ELITE`.
7. Cliquer un cosmetique:
   - si Elite: activation
   - si invite/non Elite: acces Elite/checkout/login
8. Aller `adventure.html`.
9. Verifier:
   - les grenades gardent les memes quantites et degats
   - seul le rendu visuel change
   - victoire affiche l'effet choisi
10. Aller `activities.html`.
11. Verifier filtre `PRIME` et style des sessions Elite.

Console utile:

```js
window.state.user.cosmetics
window.titanGetGrenadeSkin()
window.titanGetAvatarFrameClass()
```

### Test 9: service worker

Apres deploiement:

```js
navigator.serviceWorker.getRegistrations()
```

Verifier:

- `sw.js` a cache `titan-os-v40`.
- hard refresh si ancien cache.

## 11. Controle securite actuel

OK / ameliore:

- Webhook Lemon Squeezy signe via HMAC.
- `SUPABASE_SERVICE_ROLE_KEY` uniquement cote Netlify Function.
- Validation UUID du `user_id` webhook.
- Premium officiel via `profiles.is_elite`.
- `saveState` ne pousse pas `is_elite` dans payload explicite.
- Dev tools reserves `is_tester`.
- Cosmetiques premium limites au visuel.
- SQL RLS fourni pour tables critiques.
- Suppression compte via RPC attendue.

A surveiller:

- Beaucoup de `innerHTML`.
- Les donnees DB affichees en HTML sont supposees admin-trustees.
- Ne pas afficher de contenu utilisateur libre via `innerHTML` sans echappement.
- `localStorage.clear()` dans `profile.html` est destructif. Ne jamais le declencher sans confirmation utilisateur explicite.
- Les liens externes premium/Discord doivent rester attendus et non injectes depuis contenu tiers non fiable.

## 12. Dette technique principale

### Dette 1: trop de JS inline

Pages tres inline:

- `adventure.html`
- `training.html`
- `boutique.html`
- `stats.html`
- `profile.html`
- `talents.html`
- `trophies.html`

Refactor recommande:

- Extraire en modules:
  - `js/page-adventure.js`
  - `js/page-training.js`
  - `js/page-shop.js`
  - `js/page-stats.js`
  - etc.

### Dette 2: pas de tests automatiques

Actuellement:

- seulement `node --check`
- verification VM des scripts inline

Recommande:

- Ajouter un petit script `scripts/verify-inline.js`.
- Ajouter Playwright ou test navigateur si possible.
- Ajouter tests de fonctions pures: purchase limits, image path, state migration.

### Dette 3: CSS global + inline

La couche v40 fonctionne par surcharge.

Risque:

- Certaines pages peuvent rester visuellement heterogenes.

Recommande:

- Migrer progressivement styles inline vers classes reutilisables.

### Dette 4: premium front-only

Premium actuel:

- UI/front principalement.

Cosmetiques premium actuels:

- UI/front uniquement.
- OK car ils n'influencent pas le gameplay.

Risque:

- spoof local.

Recommande:

- Toute future vraie ressource premium doit etre controlee cote serveur avec `profiles.is_elite`.

## 13. Commandes utiles

`rg` est parfois bloque sur cette machine. Utiliser PowerShell:

```powershell
Get-ChildItem -Recurse -File -Include *.js,*.html,*.css | Select-String -Pattern 'motif' -CaseSensitive:$false
```

Node systeme peut etre bloque. Utiliser le runtime Codex:

```powershell
& 'C:\Users\theoc\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check .\js\main.js
```

Verifier tous les scripts inline HTML:

```powershell
& 'C:\Users\theoc\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' -e "const fs=require('fs'),vm=require('vm'); for(const file of fs.readdirSync('.').filter(f=>f.endsWith('.html'))){ const html=fs.readFileSync(file,'utf8'); let i=0; for(const m of html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)){ i++; new vm.Script(m[1],{filename:file+':inline-'+i}); } } console.log('all inline scripts OK');"
```

Verifier fichiers principaux:

```powershell
& 'C:\Users\theoc\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check .\js\state.js
& 'C:\Users\theoc\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check .\js\ui.js
& 'C:\Users\theoc\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check .\js\main.js
& 'C:\Users\theoc\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check .\functions\webhook.js
```

## 14. Si le futur utilisateur donne une consigne vague

Commencer par:

1. Lire ce fichier.
2. Lire `js/state.js`, `js/main.js`, `js/ui.js`.
3. Lire la page concernee.
4. Ne pas reverter les changements recents.
5. Verifier syntaxe avec Node Codex.
6. Si la tache touche Supabase, verifier d'abord:
   - session auth
   - table
   - RLS
   - erreur console exacte

## 15. Phrase de reprise prete a l'emploi

Si une nouvelle discussion commence, l'utilisateur peut dire:

> Reprends TITAN OS depuis `TITAN_REPRISE_CONTEXTE.md`. Tu n'as pas l'historique de discussion. Ce fichier est ton etat de verite. Verifie d'abord l'etat v40/v41, puis continue les tests Supabase/premium/navigation/mobile/cosmetiques sans casser la progression aventure, la boutique et l'equilibrage.

Pour Codex:

Lis ce fichier comme source primaire de contexte local. Ensuite inspecte les fichiers avant d'agir. Le plus important a ne pas casser: `state.js` sync/sauvegarde, progression `adventure.html`, checkout premium, historiques boutique, et le principe que les cosmetiques Elite restent strictement visuels.
