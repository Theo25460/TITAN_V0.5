## Bouclier SEO — PASS

Cible : `https://titan-app.fr` · contexte `production` · périmètre `full` · 176 routes · 8.2 s
Référence : production du 2026-11-26 (commit `0dae9af`, déploiement `6afec02bcf8ca878e98133e6`)

| P0 bloquant | P1 à approuver | P2 avertissement | approuvés | non concluants |
|---|---|---|---|---|
| 0 | 2 | 5 | 0 | 0 |

| Gravité | Règle | URL | Attendu | Obtenu | Piste |
|---|---|---|---|---|---|
| **P1** | duplicate-host-indexable | `https://main--titano-app.netlify.app/` | 301 → https://titan-app.fr/ | 200, canonique vers la production | Ajouter la 301 de domaine dans netlify.toml (voir docs/seo/SEO_GUARD.md). |
| **P1** | duplicate-host-indexable | `https://titano-app.netlify.app/` | 301 → https://titan-app.fr/ | 200, canonique vers la production | Ajouter la 301 de domaine dans netlify.toml (voir docs/seo/SEO_GUARD.md). |

<details><summary>5 avertissement(s) P2</summary>

| Règle | URL | Attendu | Obtenu |
|---|---|---|---|
| pending-route | `/build-info.json` | 200 | 404 |
| title-long | `/carnet-musculation` | ≤ 65 | 67 |
| title-long | `/comprendre-mes-donnees` | ≤ 65 | 70 |
| title-long | `/progression-sportive` | ≤ 65 | 68 |
| title-long | `/service` | ≤ 65 | 67 |

</details>
