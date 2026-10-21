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
| `phone-04-aventure.png` | 1080×1920 | Aventure : le gardien de la région et le carnet des chapitres |
| `phone-05-journal.png` | 1080×1920 | Journal : liste des séances multisports du mois, avec un insigne Record |
| `phone-06-records.png` | 1080×1920 | Records par sport : course à pied (30 min sur 5 km, 12,1 km, 1 h 08) |
| `feature-graphic-1024x500.png` | 1024×500, RGB sans transparence | Image de présentation : logo, « Ton sport réel. Une progression qui dure. », décor de l'aventure (`image/og-titan.jpg`, `image/logo-512.png`, police Archivo) |

Limites Play : 2 à 8 captures téléphone, côtés 320 à 3 840 px, 8 Mo maximum par fichier ; image de présentation 1024×500, JPEG ou PNG 24 bits sans alpha. Les captures sociales et Atelier ne sont pas incluses : ces pages exigent un compte connecté et le serveur, que ce script n'utilise jamais.

Pas de capture tablette : à produire à part si la fiche tablette est voulue.
