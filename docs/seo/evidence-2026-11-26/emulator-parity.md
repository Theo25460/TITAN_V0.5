# Fidélité de l'émulateur Netlify — mesure du 26/11/2026

Chaque chemin est demandé à https://titan-app.fr (production, déploiement 6afec02bcf8ca878e98133e6, commit 0dae9af) et résolu par tools/lib/netlify-emulator.mjs sur le dist/ construit depuis le même commit. Comparés : statut, Location, X-Robots-Tag. Script de mesure : fetch sans suivi de redirection, 3 essais, 4 en parallèle.

```
parity: 113/114 identical
{"p":"/auth/garmin/callback","live":{"status":302,"loc":"/profile?garmin=error&garmin_reason=state","xrt":""},"emu":{"status":"fn","loc":"","xrt":"noindex, nofollow"},"rule":"netlify.toml:151"}
```

Le seul écart est une fonction serveur (/auth/garmin/callback → fonction garmin), volontairement non émulée : l'émulateur la signale au lieu d'inventer une réponse.
