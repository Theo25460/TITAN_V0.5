# Visuels Google Play (GP03)

Générés depuis l'application web réelle (build `dist/`), avec des données **synthétiques** : trois sports (course à pied, musculation en salle, natation) sur environ huit semaines, aucun nom ni e-mail réel, aucun accès réseau (tout hôte externe est refusé pendant la capture).

Régénérer (depuis la racine du dépôt) :

```
node tools/build-public.mjs && node tools/play-screenshots.mjs
```

Prise de vue : fenêtre 360×640, facteur 3, agent utilisateur Android, `fr-FR`, `Europe/Paris`, thème sombre. Vérification : `node --test tests/play-screenshots.test.mjs`.

| Fichier | Taille | Contenu |
|---|---|---|
| `phone-01-qg.png` | 1080×1920 | QG : « Bonjour », nouveau record de course (12,1 km) et accès aux records |
| `phone-02-seance.png` | 1080×1920 | Enregistrer une séance : tes sports, « Refaire » une séance récente, sports par famille |
| `phone-03-stats.png` | 1080×1920 | Progrès : « Tes questions » (minutes par semaine sur 12 semaines, répartition endurance/force) |
| `phone-04-aventure.png` | 1080×1920 | Aventure : le gardien du monde et le carnet des chapitres |
| `phone-05-journal.png` | 1080×1920 | Journal : liste des séances multisports du mois, avec un insigne Record |
| `phone-06-records.png` | 1080×1920 | Records par sport : course à pied (30 min sur 5 km, 12,1 km, 1 h 08) |
| `feature-graphic-1024x500.png` | 1024×500, RGB sans transparence | Image de présentation : logo, « Ton sport réel. Une progression qui dure. », décor de l'aventure (`image/og-titan.jpg`, `image/logo-512.png`, police Archivo) |

Limites Play : 2 à 8 captures téléphone, côtés 320 à 3 840 px, 8 Mo maximum par fichier ; image de présentation 1024×500, JPEG ou PNG 24 bits sans alpha. Les captures sociales et Atelier ne sont pas incluses : ces pages exigent un compte connecté et le serveur, que ce script n'utilise jamais.

Pas de capture tablette : à produire à part si la fiche tablette est voulue.

## Textes de la fiche (V1.3.1)

Ces textes remplacent ceux de `docs/PLAY_CONSOLE.md` § 2, écrits avant la publicité et les abonnements dans l'application : « sans pub » et « TITAN+ se gère sur le site » n'y sont plus vrais. Vocabulaire : [`../v131/vocabulaire.md`](../v131/vocabulaire.md). Contrôle complet de la fiche et de la déclaration « Sécurité des données » : [`../v131/lot6-textes-juridique.md`](../v131/lot6-textes-juridique.md) § 6.

- **Nom** (30 caractères au plus) : `TITAN — Ton sport réel` (22).
- **Description courte** (80 au plus) : `Journal multisport : séances, records et une aventure qui avance avec toi.` (74).
- **Description complète** :

  > TITAN est un journal sportif pour tous tes sports. Enregistre ce que tu fais vraiment, comprends tes progrès et fais avancer une aventure avec tes séances.
  >
  > TON JOURNAL
  > • 260 sports, chacun avec ses mesures : distance et allure, séries et charges, cotations d’escalade.
  > • Saisie en quelques secondes, même hors ligne, ou enregistrement GPS de ta sortie. Tes parcours restent privés.
  > • Tes pas du jour, depuis le capteur du téléphone ou Santé Connect, si tu le choisis.
  >
  > TES PROGRÈS
  > • Un récap de ta semaine qui répond à de vraies questions, avec les séances sources.
  > • Des records par sport et des objectifs datés.
  >
  > TA PROGRESSION
  > • L’XP vient de ton effort : la durée et ton ressenti, avec les mêmes plafonds pour tout le monde.
  > • Sept rangs, de l’Éclaireur à la Légende, et une maîtrise par sport.
  > • Quatre mondes, trente-six balises et quatre gardiens, gratuits, qui avancent avec tes jours actifs.
  >
  > ENSEMBLE, SI TU LE VEUX
  > • Amis par consentement, Moments, défis sans mise, TITAN Duo, guilde.
  > • Le même compte ouvre titan-app.fr : analyses détaillées, exports et espace coach, où un coach ne voit que ce que tu acceptes de partager.
  >
  > GRATUIT, AVEC DES ABONNEMENTS FACULTATIFS
  > • L’application gratuite affiche des publicités, jamais pendant une séance.
  > • TITAN+ retire la publicité et ajoute, sur titan-app.fr, des comparaisons de périodes, des bilans détaillés et des vues sauvegardées, ainsi que plus de routines. Coach et Coach Ultra permettent d’accompagner 5 ou 15 sportifs, avec TITAN+ pour eux.
  > • Aucun abonnement ne donne d’XP, de crédits ni d’avance : la progression ne s’achète pas.
  >
  > TES DONNÉES
  > • Privé par défaut. Tu peux exporter ton journal et supprimer ton compte depuis l’application.
  > • TITAN n’est pas un dispositif médical.

Avant d'envoyer la fiche : retirer la ligne des abonnements tant que les produits ne sont pas actifs dans la Play Console ; ne pas ajouter Garmin tant que la connexion n'a pas été validée avec un compte réel ; ne citer aucun prix (Google Play l'affiche).
