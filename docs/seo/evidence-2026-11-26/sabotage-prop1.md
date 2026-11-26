## Bouclier SEO — FAIL

Cible : `dist/ (dist) via netlify.toml` · contexte `production` · périmètre `full` · 172 routes · 0.5 s
Build servi : commit `0dae9af9b32d7cf7ec3ceca7b1dee52e92544f39`, contexte `deploy-preview`
Référence : production du 2026-11-26 (commit `0dae9af`, déploiement `6afec02bcf8ca878e98133e6`)

| P0 bloquant | P1 à approuver | P2 avertissement | approuvés | non concluants |
|---|---|---|---|---|
| 29 | 0 | 4 | 0 | 0 |

| Gravité | Règle | URL | Attendu | Obtenu | Piste |
|---|---|---|---|---|---|
| **P0** | noindex-unexpected | `/` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/aventures-sportives` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | build-context | `/build-info.json` | production (ou un build local) | deploy-preview | Un build de preview (noindex) va être, ou a été, publié sur le domaine de production. |
| **P0** | noindex-unexpected | `/carnet-musculation` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/changelog` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/comprendre-mes-donnees` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/debuter-titan` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/defis-sportifs` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/fonctionnalites` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/journal-course-a-pied` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/journal-entrainement` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/legal_cgu` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/legal_hub` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/legal_mentions` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/legal_privacy` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/motivation-sport` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/niveaux-et-xp` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/partenariats` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/pour-les-coachs` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/progression-sportive` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/regles-communaute` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/service` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/sports` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/suivi-escalade` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/suivi-sportif` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/suivi-velo` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/supprimer-mon-compte` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-unexpected | `/titan-plus` | sans noindex | meta=index, follow, max-image-preview:large header=noindex | Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml). |
| **P0** | noindex-propagation | `dist/_headers` | pas de _headers noindex | noindex présent | Le noindex de preview a fui dans un build de production : vérifier CONTEXT dans tools/build-public.mjs. |

<details><summary>4 avertissement(s) P2</summary>

| Règle | URL | Attendu | Obtenu |
|---|---|---|---|
| title-long | `/carnet-musculation` | ≤ 65 | 67 |
| title-long | `/comprendre-mes-donnees` | ≤ 65 | 70 |
| title-long | `/progression-sportive` | ≤ 65 | 68 |
| title-long | `/service` | ≤ 65 | 67 |

</details>
