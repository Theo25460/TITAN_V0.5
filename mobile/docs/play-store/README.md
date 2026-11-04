# Visuels Play Store de l'application native

Six captures téléphone **1080 × 2160** (rapport 2:1, le maximum accepté par Play Console), PNG 24 bits sans transparence.

Elles sont produites par `scripts/preview-shots.mjs` à partir des **vrais écrans React Native** de l'application (le banc
d'aperçu `TITAN_PREVIEW=1` les affiche dans Chromium), avec des **données synthétiques** : un compte fictif « Camille »,
douze semaines de séances inventées. Aucun compte réel, aucune donnée de production.

Régénérer :

```bash
cd mobile
TITAN_PREVIEW=1 EXPO_OFFLINE=1 npx expo export --platform web --output-dir /tmp/preview
PLAY_STORE=1 node scripts/preview-shots.mjs /tmp/preview /tmp/shots QG "SessionResult?eventId=record" \
  "Progress|click=Tendances" "World?id=aube" Adventure Records
```

Ce ne sont pas des captures d'un appareil : avant d'envoyer la fiche, refaire au moins deux captures sur un vrai téléphone
avec l'APK d'essai si l'on veut des visuels strictement « appareil ». L'image de présentation 1024 × 500 et l'icône
512 × 512 sont celles du site (`docs/play-store/feature-graphic-1024x500.png` et `image/logo-512.png` dans la PR #115).
