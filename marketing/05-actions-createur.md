# Ce que toi seul peux faire (par ordre de priorité)

Temps total estimé : environ 1 h 15, dont 25 min pour débloquer la publication automatique.

## 1. Créer les trois comptes TITAN Ascent (15 min) — bloquant
Je ne peux pas créer de compte à ta place (vérification par téléphone, conditions des plateformes).
- TikTok, Instagram (compte professionnel « Créateur » ou « Entreprise »), chaîne YouTube.
- Nom « TITAN Ascent », identifiant `@titanascent` si libre. Photo : `production/out/profil/avatar-1080.png` ;
  bannière YouTube : `production/out/profil/banniere-youtube-2560x1440.jpg`. Bios et liens : en haut de
  `03-calendrier.md`.

## 2. Connecter Buffer à Claude (10 min) — débloque la programmation par moi
1. Crée un compte gratuit sur https://buffer.com (offre Free : 3 canaux, 10 publications en attente par canal, 0 €).
2. Dans Buffer, connecte les trois comptes du point 1.
3. Sur claude.ai → Paramètres → Connecteurs, ajoute **Buffer** et autorise-le.
4. Ouvre une nouvelle session Claude Code et écris : « Buffer est connecté, programme le lot J1-J7 ». Je ferai d'abord
   une publication test, je te montrerai son statut réel, puis je programmerai le reste.
Pourquoi : sans ce connecteur, je n'ai aucun moyen de programmer ni de publier.
Ne me donne jamais de mot de passe : l'autorisation se fait dans ton navigateur.

## 3. Me dire si l'app Android peut être annoncée (2 min)
Le dépôt indique : 1.2.1 en test fermé, 1.4.0 en examen, aucune fiche publique. La campagne pointe donc vers
titan-app.fr. Dès que la fiche est publique, dis-le-moi : j'ajouterai le badge Google Play au calendrier et au site
(dans une branche, sans déployer sans ton accord).

## 4. Ouvrir un test Android « ouvert » ou un groupe de testeurs (10 min) — si ton compte développeur est personnel
Google exige 12 testeurs pendant 14 jours avant la production pour les comptes personnels récents. Crée un Google
Group (ex. titan-testeurs) ou passe la piste en test ouvert, puis envoie-moi le lien d'inscription : le message de
recrutement est prêt (`04-messages-partenaires.md` §4).

## 5. Corriger trois contradictions du site avant le trafic (je peux préparer les changements dans une branche)
- FAQ /fonctionnalites : « application web installable » alors qu'une app Android existe (en test).
- /titan-plus : « Bientôt disponible » alors que la vente Play est ouverte côté serveur, et prix Play affichés
  5,99 / 23,99 / 47,99 € au lieu de 4,99 / 19,99 / 39,99 € prévus (TVA probablement ajoutée deux fois).
- Le nom public « TITAN Ascent » n'apparaît nulle part (site, manifeste, app : « TITAN »).
Réponds simplement « prépare les corrections du site » et je fais une branche avec les modifications à valider.

## 6. Exporter les chiffres Play Console (5 min, puis chaque lundi)
Play Console → Statistiques → choisir « Installations sur des appareils actifs » et « Visiteurs de la fiche » →
Exporter (CSV) → dépose le fichier dans le dossier Drive de la campagne (sous-dossier « Données »). Je l'analyse.

## 7. Me donner l'accès à Google Analytics et Search Console (optionnel)
Aucun connecteur n'est disponible ici. À défaut : export « Acquisition du trafic » (GA4) et « Performances »
(Search Console) chaque lundi dans le même sous-dossier.

## 8. Au moment de publier (si tu publies à la main avant Buffer)
Pour chaque jour : ouvrir la vidéo du jour depuis Drive sur ton téléphone → TikTok « + » → ajouter un son tendance
calme, volume bas → coller la légende → publier. Puis Instagram (Reel, même fichier, même son) et YouTube (Short).
Environ 6 minutes par jour.

## À confirmer quand tu as un moment
- Le pic de 10 inscriptions le 29/10 : diffusion dans ton entourage ? (pour ne pas le compter comme acquisition)
- L'accès premium du 21/10 est-il ton compte ou le compte de revue Google Play ?
