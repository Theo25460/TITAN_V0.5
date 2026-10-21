# TITAN WEB — lot de finition du 21/10/2026 (branche `claude/titan-finition-web`)

Branche empilée sur la candidate `codex/final-web-rc-20261021` (`ba9d05f`, PR #115), qui reste
intacte. Ce lot corrige et améliore ; il ne change ni migration, ni RLS, ni contrat RPC.

## Modifications

| Domaine | Avant | Après | Preuve |
|---|---|---|---|
| Connexion (mobile) | Le formulaire attendait le SDK Supabase (210 Ko) et quatre scripts avant d'être dessiné | Formulaire dessiné d'abord, SDK chargé ensuite ; chaque action attend le client (`waitForTitanSupabase`, 10 s au plus) | LCP médian **2 712 → 1 748 ms** (5 passages, Chromium, 4× CPU, 1,6 Mb/s, 150 ms) ; l'élément LCP devient le titre `#auth-title` au premier rendu |
| QG — Ascension | Rang et niveau en texte seul | Portrait du personnage choisi dans un anneau de progression vers le niveau suivant, comme dans l'application Android | Capture locale, aucune erreur JavaScript |
| Typographie | « Qu'est-ce que tu pratiques ? » : le « ? » pouvait passer seul à la ligne à 360 px (relevé dans `FINAL_WEB_VISUAL_PERFORMANCE_2026-10-21.md`) | Espace fine insécable avant « ? » (onboarding, saisie de séance) | Rendu vérifié à 390 px |

Versions de cache montées : `auth.js` 300.6, `qg.js` 300.4, `onboarding.js` 300.6, `seance.js` 300.3,
`ascension-app.css` 300.9 (18 pages).

## Vérifications

- `pnpm run verify` : **332/332** tests, typecheck, build, audit et contrôle de publication — code 0.
- `pnpm run test:e2e` : **801/801** parcours navigateur (0 échec, 0 annulé, 0 ignoré), code 0 — le même total que la candidate #115.
- La CI du dépôt ne s'exécute que pour les PR vers `main` : ces résultats sont locaux (Chromium du conteneur).

## Constat non corrigé dans ce lot

Le QG mesure environ 5,7 s de LCP dans les mêmes conditions locales (transport non compressé) :
22 scripts synchrones, ~900 Ko non compressés, dont `titan_features.js` (220 Ko, ancien cœur aux
nombreuses fonctions globales utilisées par 14 pages) et le SDK (210 Ko). Netlify compresse en
production (Brotli), ce qui réduit fortement les octets transférés, mais pas le coût d'exécution.
Recommandation : charger à la demande les modules dont la page n'a pas besoin au premier rendu.
Refonte du découpage à mener avec l'équipe Web, avec mesures avant/après sur préproduction.

## État des conditions de mise en production (vérifié le 21/10/2026)

| Porte | État constaté |
|---|---|
| Version en ligne | `titan-app.fr` sert le déploiement Netlify `6ac3e212…` du 05/10/2026 17:44 UTC, envoyé par upload (sans commit associé). Aucune version de la candidate n'est en ligne. Scan de secrets Netlify de ce déploiement : vide. |
| Base de production | Historique de migrations arrêté à `20261005230000` ; les migrations de la candidate ne sont pas appliquées. |
| Sauvegarde restaurée | Non faite : aucune connexion base sécurisée ni cible de restauration dans cette session. Action humaine. |
| Migrations sur copie | Non faites (dépend de la restauration). |
| Recette comptes et services réels, e-mails, Assistance | Non faites : actions humaines sur préproduction. |
| Textes « après mise à jour serveur » | Conservés volontairement : ils ne doivent disparaître qu'avec les migrations appliquées. |
| Pages légales et décisions | Validation humaine (identité de l'éditeur, statut, âge, conservation). |

Décision : la candidate reste **NO-GO** pour la production tant que ces portes ne sont pas franchies.
