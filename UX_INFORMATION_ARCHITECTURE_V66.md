# TITAN OS - Architecture d'information v66

Objectif: conserver le contenu et l'identite visuelle, mais separer les intentions par audience. Une page doit annoncer clairement si elle sert a convaincre, utiliser l'app, consulter une ressource ou gerer un module secondaire.

## index.html

Structure actuelle:
- Hero + boutons utilitaires visibles immediatement.
- Signatures produit, lien algorithme, CTA connexion.
- Dashboard XP/Credits/Missions visible meme pour un visiteur invite.
- Modules essentiels et secondaires exposes directement.
- Guide, FAQ et pages documentaires melanges au QG.

Structure proposee/appliquee:
- Hero block en premier: identite TITAN OS + accroche existante.
- Features cles immediates: 4 signatures maximum.
- CTA principal invite: `CONNECTER UN COMPTE POUR SYNCHRONISER`.
- Visiteur non connecte: dashboard masque, remplace par un apercu statique sans donnees personnelles.
- Utilisateur connecte: dashboard QG complet affiche apres connexion.
- Modules secondaires: regroupes dans un tiroir `MODULES SECONDAIRES`.
- Guide, Premiers pas, Transmissions et Installer: deplaces en scroll profond.
- FAQ/documentation: conservees en bas de page.

Gain de lisibilite mesurable:
- CTA visibles au-dessus du dashboard invite: 1 au lieu de 5.
- Dashboard dynamique visible pour invite: 0 bloc au lieu de 1 bloc complet.
- Features visibles en haut: 4 maximum.
- Modules secondaires visibles par defaut: 0 lien direct, accessibles via un groupe dedie.

## service.html

Structure actuelle:
- Hero service.
- Statuts sync/compte/version.
- Liens utilitaires.
- Les fonctionnalites produit restent eparpillees entre menu, guide et pages.

Structure proposee/appliquee:
- Hero service conserve.
- Statuts systeme conserves.
- Liens utilitaires conserves.
- Ajout d'une carte des fonctionnalites: QG, Sport OS, Aventure, Progression, Social/guildes, Boutique, Elite, Bestiaire, Beta publique.
- Chaque entree indique un statut: actif, Elite ou bientot.

Gain de lisibilite mesurable:
- Une entree unique pour decouvrir les modules au lieu de chercher dans la navigation.
- Statut gratuit/Elite/bientot visible en un coup d'oeil.
- Les fonctionnalites secondaires sont orientees sans devenir une page marketing.

## boutique.html

Structure actuelle:
- Solde et statut Elite.
- Clarification Gratuit/Elite.
- Catalogue d'objets.
- Regles economie seulement implicites dans les prix et cooldowns.

Structure proposee/appliquee:
- Solde et statut Elite conserves.
- Ajout d'un panneau economie: plafond semaine, charges combat, primes pub, cosmetiques.
- Catalogue conserve par categories.
- Details par objet enrichis avec limite et note economie.
- Cosmetiques Elite gardes visuels uniquement.
- Charges combat comptees globalement par semaine, pas seulement par objet.

Gain de lisibilite mesurable:
- Les 4 regles economie principales sont visibles avant le catalogue.
- Chaque objet affiche son statut `Regule` quand une limite existe.
- Les limites hebdo/daily sont visibles avant l'achat.

## Regle pour les pages suivantes

- Marketing: convaincre et donner un seul prochain geste.
- Applicatif: montrer l'etat utilisateur seulement si un compte est connecte.
- Documentation: guide, FAQ, explications longues en scroll profond ou page dediee.
- Modules secondaires: regroupes derriere un menu, details ou carte dediee.
- Mobile: lecture verticale, 1 action principale, 2 actions secondaires maximum par section visible.
