# TITAN OS - Backlog integrations sport

Objectif: garder les integrations externes hors du chemin critique public tant que la securite, la sync et les RLS Supabase ne sont pas entierement valides.

## Phase 1 - Apres public-ready

- Strava OAuth: lecture activites, import manuel controle, mapping sport TITAN, aucun gain serveur automatique sans verification.
- Export GPX propre depuis activites internes si utile.

## Phase 2 - Backlog long terme

- Garmin: etudier faisabilite API et conditions d'acces.
- Apple Health: priorite mobile/app native ou PWA bridge si un jour disponible.
- Google Fit / Health Connect: etudier uniquement apres stabilisation Android.

## Regles produit

- Toute activite importee doit etre marquee comme source externe.
- Les recompenses critiques doivent rester verifiees cote serveur.
- L'utilisateur doit pouvoir supprimer les donnees importees.
- Aucun classement public par defaut.
