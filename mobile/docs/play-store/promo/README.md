# Visuels promotionnels Google Play (fiche téléphone)

Six images **1080 × 1920**, PNG 24 bits sans transparence, prêtes à importer dans la Play Console (Fiche principale › Captures d'écran du téléphone), dans cet ordre :

| Fichier | Phrase | Écran réel montré |
|---|---|---|
| `01-ascension.png` | Ton sport. Ton ascension. | QG : niveau et XP, chapitre prêt, « Ma semaine » |
| `02-multisport.png` | Tous tes sports au même endroit | Journal multisport + encart « Mon programme sur 12 semaines » (Progrès › Tendances) |
| `03-aventure.png` | Tes séances font avancer ton aventure | Séance confirmée : +830 XP, niveau, record battu |
| `04-progres.png` | Visualise tes progrès | Progrès › Tendances, « Tes questions » + encart d'un record (Records) |
| `05-defis.png` | Relève de nouveaux défis | Communauté › Défis : défi entre amis, expédition collective |
| `06-amis.png` | Avance avec tes amis | Communauté › Amis + encart d'un Moment (Communauté › Moments) |

Palette : noir #05070A, bleu-noir #0E141A, surface #1B2530, cyan #3DD9E8 (l'ambre #F4BB54 vient des records dans les écrans). Police : Archivo (`css/fonts`).

## D'où viennent les écrans

Des **vrais écrans React Native** de l'application, affichés par le banc d'aperçu (`TITAN_PREVIEW=1`) avec les données fictives du dépôt (compte « Camille », `preview/fixtures.ts`, `test-fixtures/data.ts`). Aucun compte réel. Ce ne sont pas des captures d'un téléphone. Rien de ce qui est montré n'est derrière un drapeau serveur fermé au 17/11/2026 (`tools/visual/flags-production.json`) : la Grande Cordée et les liens d'ami personnels n'apparaissent pas.

## Régénérer

```bash
cd mobile
TITAN_PREVIEW=1 EXPO_OFFLINE=1 npx expo export --platform web --output-dir /tmp/preview
CLOCK=2026-11-29T11:00:00 node scripts/preview-shots.mjs /tmp/preview /tmp/shots/dimanche QG Journal Records Adventure "SessionResult?eventId=record" "Progress|click=Tendances"
CLOCK=2026-10-28T19:00:00 node scripts/preview-shots.mjs /tmp/preview /tmp/shots/communaute Community "Community|click=Défis" "Community|click=Moments"
node scripts/play-promo.mjs /tmp/shots /tmp/promo
python3 -c "import glob; from PIL import Image; [Image.open(f).convert('RGB').save(f, optimize=True) for f in glob.glob('/tmp/promo/*.png')]"
```

Le premier jeu est pris un dimanche pour que la semaine soit remplie ; le second à la date des données sociales de test (28 octobre), pour que les échéances des défis restent cohérentes. La dernière ligne retire le canal alpha (exigé par Play). Le texte et le placement de chaque visuel sont dans `spec.json`.
