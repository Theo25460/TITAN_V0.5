# TITAN OS - Checklist QA publique

Date de derniere mise a jour: 2026-05-05

## Auth

- [ ] Inscription avec email valide.
- [ ] Confirmation email puis premiere connexion.
- [ ] Login compte existant.
- [ ] Mot de passe oublie et reset via `update-password.html`.
- [ ] Logout puis retour login.
- [ ] Compte suspendu: acces refuse avec message lisible.
- [ ] Suppression compte via `profile.html`, puis verification que la reconnexion echoue ou donne un compte vide.

## Entrainement

- [ ] Enregistrer une seance simple sans duree optionnelle.
- [ ] Enregistrer une seance distance + duree.
- [ ] Enregistrer une seance musculation avec plusieurs exercices.
- [ ] Importer un GPX valide.
- [ ] Importer un GPX invalide: erreur lisible.
- [ ] Verifier que la seance apparait dans l'historique local et cloud.
- [ ] Verifier mobile 360px: champs lisibles, bouton visible, pas de chevauchement.

## Adventure

- [ ] Verifier phase mobs: compteur et jauge visibles.
- [ ] Tuer un mob: victoire, recompense, passage cible suivante.
- [ ] Arriver au boss apres le nombre de mobs requis.
- [ ] Verifier phase boss: signal visuel rouge, libelle Boss alpha, HP coherents.
- [ ] Tuer un boss: niveau boss +1, retour phase mobs.

## Stats Et Profil

- [ ] Stats chargees apres sync Supabase.
- [ ] Profil affiche pseudo/avatar/niveau sans fuite email.
- [ ] Export donnees personnelles.
- [ ] Reglages RGPD visibles.

## Boutique Et Elite

- [ ] Boutique chargee sans erreur.
- [ ] Achat objet gratuit/credits.
- [ ] Checkout Elite ouvre la bonne URL.
- [ ] Webhook test: abonnement actif applique une seule fois.
- [ ] Annulation/expiration retire Elite sans casser le profil.

## Social Et Chat

- [ ] Ajouter ami par matricule valide.
- [ ] Matricule invalide: message lisible.
- [ ] Envoyer message chat.
- [ ] Rate limit chat: spam bloque.
- [ ] Signaler puis bloquer un utilisateur.
- [ ] Utilisateur bloque masque localement.

## Offline Et PWA

- [ ] Chargement app sans reseau apres premier passage.
- [ ] Message offline clair quand Supabase ne repond pas.
- [ ] Installation PWA desktop.
- [ ] Aide installation iOS/Safari.
- [ ] Nouvelle version disponible: recharge proposee.

## Securite Et Build

- [ ] `npm run check` passe.
- [ ] Redirections Netlify prod: `/sql/*`, `/tools/*`, `/*.md`, `/.env*`, `/.git/*`, `/sys_core_override_99.html`.
- [ ] Aucun secret service-role dans HTML/JS.
- [ ] Audit RLS Supabase analyse.
