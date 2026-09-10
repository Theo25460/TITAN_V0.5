# TITAN OS - Audit nouvel utilisateur V67

Date: 2026-05-20  
Objectif: auditer trois fois le site comme un nouvel utilisateur, puis simplifier la lecture sans supprimer de contenu.

## Passe 1 - Arrivee visiteur public

Constat:
- La page d'accueil melangeait encore marketing, app et documentation.
- Les modules applicatifs donnaient l'impression qu'il fallait tout comprendre avant de commencer.
- Le guide de premiere connexion pouvait arriver trop tot pour un visiteur non connecte.

Action appliquee:
- Le guide de premiere connexion est maintenant reserve aux comptes cloud connectes.
- Les ressources longues restent accessibles en profondeur ou via Doctrine.
- Le dashboard reste masque pour les visiteurs non connectes, avec un apercu statique a la place.

Gain de lisibilite:
- Le visiteur public voit une intention unique: comprendre TITAN OS et entrer dans le parcours.
- Le bruit applicatif est reduit avant connexion.

## Passe 2 - Premiere connexion compte cloud

Constat:
- Le joueur pouvait voir les bons modules, mais pas l'ordre logique.
- L'aide expliquait la philosophie, pas assez le chemin d'usage.
- Le contenu social, boutique, sante et talents pouvait sembler obligatoire.

Action appliquee:
- Guide de premiere connexion V2: 8 etapes courtes, ordre QG -> Sport -> Economie -> Aventure -> Progres -> Reseau -> Armurerie -> Aide.
- Bouton "Guide complet" vers `guide.html#guide-demarrage`.
- `guide.html` contient maintenant un parcours pas a pas retrouvable depuis l'aide.

Gain de lisibilite:
- Le nouveau joueur sait quoi ouvrir en premier.
- Les modules secondaires sont presentes comme utiles mais non obligatoires.

## Passe 3 - Mobile PWA

Constat:
- Sur mobile, les cartes, boutons et modules pouvaient former un bloc trop dense.
- La DA froide/cyan de la reference etait affaiblie par des tons chauds.
- Le guide modal pouvait occuper trop d'espace vertical.

Action appliquee:
- Nouvelle couche CSS V67: fond sombre industriel, cyan/acier, typographie Rajdhani, suppression visuelle des accents brun/orange dominants.
- Grilles importantes forcees en 1 colonne sur tablette/mobile.
- Guide modal mobile avec liste scrollable et actions empilees.
- Cards et modules harmonises avec bordures 8px et contraste plus calme.

Gain de lisibilite:
- Lecture verticale plus naturelle.
- Moins de concurrence visuelle entre CTA, cartes et modules.
- DA plus proche de l'affiche QR: noir, acier, cyan, energie gym.

## Pages traitees

### `index.html`

Structure actuelle observee:
- Hero public.
- Features et CTA.
- Dashboard app potentiellement visible selon l'etat.
- FAQ, guide, ressources et modules applicatifs proches.

Structure proposee/appliquee:
- Hero public.
- Features cles.
- Un CTA principal.
- Dashboard seulement apres connexion.
- FAQ/guide en scroll profond ou page dediee.

Justification:
- Une page = une intention. Le visiteur public n'a pas besoin de comprendre XP, credits, missions et modules avant de se connecter.

### `guide.html`

Structure actuelle observee:
- Doctrine, piliers, indicateurs, methode, FAQ.

Structure proposee/appliquee:
- Doctrine conservee.
- Ajout d'un bloc "Demarrage pas a pas" directement apres les piliers.
- Relance possible du guide d'ouverture depuis l'aide.

Justification:
- Le guide devient a la fois philosophique et operationnel, sans supprimer le contenu existant.

### `service.html`

Structure actuelle observee:
- Hub d'aide, liens utilitaires, carte des fonctionnalites.

Structure proposee/appliquee:
- Ajout d'un lien discret "Partenariats" dans les liens utilitaires.
- La page entreprise reste hors navigation principale.

Justification:
- La demande partenaire existe sans polluer le parcours joueur.

### `partenariats.html`

Structure creee:
- Hero discret entreprises/partenariats.
- Statistiques publiques agregees.
- Histoire courte.
- CTA contact.

Justification:
- Donne une page reservee aux partenaires sans exposer de donnees personnelles ni alourdir le site principal.

### Couche globale CSS

Structure actuelle observee:
- Couleurs chaudes encore presentes dans la DA.
- Plusieurs composants avec densite differente.

Structure proposee/appliquee:
- Couche V67 globale.
- Palette acier/cyan.
- Harmonisation des cards, boutons, nav, guide, boutique et modules.
- Mobile prioritaire avec grilles 1 colonne.

Justification:
- La coherence visuelle reduit la charge cognitive: le joueur reconnait mieux les niveaux d'information.

## Supabase

Action appliquee:
- Migration `titan_public_partnership_stats_v67`.
- RPC publique `public.titan_public_partnership_stats()`.
- La RPC retourne uniquement des agregats: agents, Elite, seances, combats, guildes, boss, messages actifs, date de generation.
- `webVisitors` reste `null` tant que l'analytics de production n'est pas branche.

Justification securite:
- Pas d'ID utilisateur.
- Pas de message.
- Pas d'historique individuel.
- Grants limites a l'execution de la fonction.
