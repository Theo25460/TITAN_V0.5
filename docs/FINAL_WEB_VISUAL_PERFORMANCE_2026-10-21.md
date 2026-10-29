# TITAN WEB — visuel, accessibilité et performance

Audit du 21/10/2026. Le rendu conserve l'identité Ascension : Archivo pour les titres, Manrope pour les textes, fond sombre, accents cyan/or, cartes et navigation communes. Les pages publiques, l'app, l'authentification et l'aide utilisent les composants existants ; pas de refonte générique.

## Captures et interactions

135 captures initiales sur `a74e3b4` puis48captures ciblées sur l'app finale `fef923c` à360/390/1280px. Données synthétiques, API réelles et tiers bloqués ; titres/Atelier authentifiés simulés. La découverte et les gardiens utilisent aussi des snapshots synthétiques clairement identifiés. Les états de panne réseau sont inspectés, pas présentés comme des parcours connectés réussis.

Parcours couverts visuellement : vitrine, offre, fonctionnalités, confiance/confidentialité/règles/suppression ; connexion/inscription/erreur ; quatre étapes d'onboarding ; QG, séances, journal/calendrier, statistiques, records, objectifs/éditeur, planification ; Profil et ancres, Communauté, Atelier/onglets/aperçu ; Assistance. Reprises de captures nécessaires après sélecteurs ambigus et timeouts d'hôte conservées dans l'audit, pas comptées comme PASS produit.

Constats corrigés : bouton sticky de l'onboarding360px recouvrant le statut ; lien et promesse TITAN+ du Profil ; ancienne version de coque/CSS dans Profil. Contrôle géométrique avec clic à360/390/1280 et confidentialité de titre verts localement. Les48captures finales n'indiquent pas de débordement horizontal ni d'erreur JavaScript enregistrée. Aucune nouvelle incohérence critique/importante identifiée dans les vues inspectées ; cela ne qualifie pas toutes les combinaisons de données, traductions, appareils ou états.

[Planche mobile](qa/final-web-20261021/visual-360.jpg) · [planche desktop](qa/final-web-20261021/visual-1280.jpg) · [mesures visuelles](qa/final-web-20261021/visual-results.json).

Un détail typographique reste visible à360px : le point d’interrogation du titre de choix des sports peut revenir seul à la ligne. Correction de finition à traiter avant publication ; ce constat mineur ne retire pas la navigation vérifiée.

## Accessibilité

La suite axe contrôle les pages joueur et publiques en découverte, mobile390px, règles WCAG A/AA ; navigation clavier, focus des dialogues et reprise d'erreur ont leurs suites dédiées. Cinq sondes complémentaires de contraste : aucune violation détectée, mais quatre résultats incomplets. Ce n'est ni une certification WCAG/RGAA ni une validation VoiceOver/TalkBack/NVDA. Recette avec données connectées, zoom, ordre de lecture et lecteur d'écran restent ouvertes.

## Performance

Lighthouse12.8.2, Chromium141, copie statique locale de l'union initiale, trois passages mobile et desktop, tiers bloqués. Ce n'est pas le serveur Netlify de production ni une mesure finale après le dernier handoff. [Les24résultats](qa/final-web-20261021/performance-results.json) sont conservés.

| Page | Score desktop médian | LCP desktop | Score mobile médian | LCP mobile |
|---|---:|---:|---:|---:|
| Accueil |95|0,87s|73|2,66s|
| Fonctionnalités |100|0,54s|98|2,15s|
| Anciens tarifs |100|0,61s|93|2,12s|
| Connexion |99|0,79s|59|4,43s|

Hôte fortement variable : benchmark27–942, cas Fonctionnalités mobile LCP2,13–9,96s et temps de layout muraux très supérieurs au CPU réel. Aucune conclusion de régression produit déduite d'un score isolé. Compression absente du serveur local, donc ses avertissements ne prouvent pas un défaut CDN. Signal à vérifier : connexion mobile systématiquement4,21–4,89s, SDK Supabase et CSS partagés peu utilisés au premier rendu. Sur cible stable : mesurer trois passages du même build, relever LCP/CLS/INP et coûts réseau, vérifier compression/cache réels ; corriger seulement les causes reproduites. Aucun PASS performance production déclaré.

## Vérification finale complémentaire

CI39626675553 sur le code `14f8bbb` :801/801 parcours navigateur, dont la suite axe, 0 échec/annulation/ignoré. La dernière modification applicative est `fef923c` ; le delta vers14f8bbb comporte seulement documentation et fixture SQL des bilans.

Trois nouvelles mesures de connexion mobile sur le build final : scores82/83/83, LCP3758/3753/3753ms, TBT0ms sur les trois, benchmark2596–2776. Le signal de chargement lent demeure malgré la disparition de la forte contention d'hôte initiale. [Résultats finaux connexion](qa/final-web-20261021/performance-final-login.json). Le transport statique reste non compressé et les tiers bloqués ; ne pas extrapoler un score Netlify ou une mesure INP réelle.
