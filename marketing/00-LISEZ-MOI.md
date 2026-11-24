# TITAN Ascent — Campagne « Rallume le monde. Pour de vrai. » (30 jours)

Dossier de la mission marketing, créé le 24 novembre 2026. Copie partagée dans Google Drive :
« TITAN — Campagne Rallume le monde (30 j) ».

| # | Livrable | Emplacement |
| --- | --- | --- |
| 1 | Point de départ chiffré et métrique principale | `01-point-de-depart.md` |
| 2 | Analyse TITAN, concurrents, positionnement, concept, stratégie | `02-strategie-et-campagne.md`, `research/concurrents.md` |
| 3 | Audit fiche Play et site | `research/audit-fiche-play-et-site.md` |
| 4 | Synthèse des documents Drive (audit V2, observatoire SEO, budget) | `research/synthese-docs-drive.md` |
| 5 | Calendrier 30 jours + textes prêts J1-J7 | `03-calendrier.md` |
| 6 | Vidéos et carrousels finaux | `production/out/` (fichiers non versionnés ; copies dans Drive) |
| 7 | Messages créateurs, clubs, testeurs | `04-messages-partenaires.md` |
| 8 | Actions qui demandent ton intervention | `05-actions-createur.md` |
| 8 bis | Concours « Les 20 premiers » : vidéo héro, fiche, règlement | `06-concours-20-premiers.md` |
| 9 | Tableau de suivi | Google Sheet « TITAN — Suivi campagne Rallume le monde » |

## Système de production (réutilisable)

Tout part des **vrais écrans** de l'application Android (banc d'aperçu React Native du dépôt, compte de démonstration
« Camille », données fictives — chaque visuel l'indique).

```bash
cd mobile && npm ci && TITAN_PREVIEW=1 EXPO_OFFLINE=1 npx expo export --platform web --output-dir /tmp/preview
cd ../marketing/production
PLAY_STORE=1 node ../../mobile/scripts/preview-shots.mjs /tmp/preview screens   # captures fixes 1080×2160 (carrousels)
node capture-frames.mjs /tmp/preview /tmp/clips            # parcours défilés, horloge virtuelle, 30 i/s
node capture-live.mjs /tmp/preview /tmp/live "xp-record=SessionResult?eventId=record|wait=5000"   # animations temps réel
./extract-clips.sh /tmp/clips && ./extract-clips.sh /tmp/live 0.3:xp-record
node render-video.mjs out [J01-…]                          # vidéos 1080×1920 depuis videos.mjs
node carousels.mjs out/carrousels                          # carrousels 1080×1350 depuis carousels.mjs
```

## Tableau des outils (24/11/2026)

| Outil | Utilité | Coût | Installé | Connecté | Capacités vérifiées | Limites | Action de ta part |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Plugin Marketing (Anthropic) | Cadres campagne, relecture marque, rapports | 0 € | Oui (user) | — | Reconnu par Claude Code | Ses connecteurs (Canva, HubSpot…) ne sont pas actifs | Aucune |
| Marketing Skills (coreyhaines31, 17 skills) | Positionnement, social, vidéo, ASO, analytics… | 0 € (MIT) | Oui (`~/.claude/skills`) | — | Chargés par Claude Code | Markdown uniquement | Aucune |
| Supabase (lecture) | Point de départ, suivi des activations | 0 € | Connecteur claude.ai | Oui | Requêtes agrégées en lecture | Le connecteur autorise aussi l'écriture : je ne l'utilise qu'en lecture | Aucune |
| Google Drive / Docs / Sheets | Livrables, suivi | 0 € | Connecteur | Oui | Lecture, création de fichiers | Les Google Docs existants sont en lecture seule pour moi | Aucune |
| GitHub (dépôt TITAN) | Code, captures, branche de travail | 0 € | Oui | Oui | Lecture, commit/push sur la branche dédiée | Pas de déploiement | Aucune |
| Playwright + Chromium | Captures des vrais écrans, rendu des visuels | 0 € | Oui | — | Captures 1080×1920 / 1080×2160 | — | Aucune |
| FFmpeg | Montage, encodage H.264 | 0 € | Oui | — | Vidéos verticales finales | Pas de musique sous licence | Aucune |
| Buffer | Programmation TikTok / Instagram / YouTube | 0 € (Free) | Non | **Non** | Annuaire : outils create_post, get_post, métriques | 3 canaux, 10 posts en attente par canal | **Action 2** ([buffer.com](https://buffer.com) puis claude.ai → Paramètres → Connecteurs) |
| Metricool | Alternative à Buffer | Free limité | Non | Non | — | Non nécessaire si Buffer marche | Aucune |
| Canva | Édition graphique | 0 € | Connecteur installé | **Non connecté** | — | Inutile pour ce lot (rendu fait par code) | Optionnel |
| Gmail | Envoi des messages clubs | 0 € | Connecteur | Oui | Brouillons possibles | Je n'envoie rien sans ton accord | Aucune |
| Google Play Console | Installations, fiche, tests | — | Aucun connecteur | Non | — | play.google.com bloqué par le réseau de cette session | **Action 6** (export CSV) |
| Google Analytics / Search Console | Trafic, sources | — | Aucun connecteur | Non | Chiffres Search Console lus dans l'observatoire SEO Drive | — | **Action 7** (optionnel) |
| Comptes sociaux TITAN | Publication | 0 € | — | **Inexistants** | — | — | **Action 1** |
| Buzzy (génération IA) | Images / vidéos IA | Crédits payants probables | Connecteur | Oui | Non utilisé | Contraire à la consigne « pas de visuels IA génériques » et au budget 0 € | Aucune |

Autorisations vraiment nécessaires, par priorité : 1) créer les comptes sociaux, 2) connecter Buffer, 3) dire si
l'app Android peut être annoncée, 4) ouvrir le test Android, 5) exports Play Console hebdomadaires.
