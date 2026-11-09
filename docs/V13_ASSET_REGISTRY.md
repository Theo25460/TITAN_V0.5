# Registre des assets V1.3

Le JSON couvre 197 fichiers physiques, 19 familles en code, 81 glyphes, 260 entrées sport du catalogue hors ligne et 149 sources d’écran. Générer avec `node tools/v13-asset-registry.mjs` et vérifier avec `node tools/v13-asset-registry.mjs --check`.

Chaque fichier indique sa provenance, version SHA, poids, dimensions et ratio. Les références littérales et les usages par catalogue sont distingués. Le registre précise cadrage, décision, statut visuel et mesures restantes. Les captures Play Store sont incluses. Les captures de recette restent dans les preuves.

## Familles et coûts

| Famille | Fichiers | Octets dépôt | Octets candidats à la distribution |
|---|---:|---:|---:|
| avatars | 38 | 44963566 | 1771536 |
| brand | 13 | 115792 | 115792 |
| guardians | 12 | 574642 | 574642 |
| legacy-encounters | 80 | 89968606 | 5771850 |
| notifications | 1 | 1382 | 1382 |
| public-auth-hero | 5 | 350839 | 350839 |
| store-listing | 15 | 6221203 | 0 |
| subscription | 4 | 154842 | 154842 |
| typography | 12 | 506691 | 506691 |
| world-map-decoration | 1 | 28400 | 28400 |
| worlds | 16 | 2273786 | 2273786 |

Le builder public écarte les originaux avatar, mob et boss lorsqu’un WebP existe. Les valeurs de distribution indiquent le coût brut des fichiers candidats. Le poids du bundle natif et le trafic du premier écran requièrent leurs propres mesures.

## Usages construits en code

| Famille | Surfaces | Source |
|---|---|---|
| public-brand | public, auth, menu, legal | `index.html` |
| icons-web | menu, tutorial, notifications, badges, sports, statistics, routines, records, social, shop, gpx, empty, dialogues, subscription, legal | `js/app/icons.js` |
| icons-native | menu, tutorial, notifications, badges, sports, statistics, routines, records, social, shop, gpx, empty, dialogues, subscription | `mobile/src/core/icons.generated.ts` |
| sport-families | sports | `js/core/sports.js` |
| onboarding | tutorial, auth | `js/app/onboarding.js` |
| shell | menu, notifications | `js/app/shell.js` |
| crest-web | ranks, badges | `js/app/crest.js` |
| crest-native | ranks, badges | `mobile/src/components/Crest.tsx` |
| profile | badges, avatars | `js/app/profil.js` |
| world-map-native | worlds, beacons, fog | `mobile/src/components/WorldPathMap.tsx` |
| world-web | worlds, beacons, guardians | `js/app/aventure.js` |
| journey-web | worlds, fog, beacons | `js/app/journey.js` |
| journey-native | worlds, fog, beacons | `mobile/src/components/JourneyCard.tsx` |
| notification-channels | notifications | `mobile/src/lib/notificationChannels.ts` |
| avatar-native | avatars | `mobile/src/components/Avatar.tsx` |
| brand-native | brand, auth, menu | `mobile/src/components/Brand.tsx` |
| atelier | shop, subscription | `js/app/atelier.js` |
| gps-native | gpx | `mobile/src/screens/session/GpsRecordScreen.tsx` |
| stats-records | statistics, records | `js/app/records.js` |

## Comparaison Web / Android

| Android | Web | Octets identiques |
|---|---|---|
| `mobile/assets/rpg/archipelago-small.webp` | `assets/renaissance/archipelago-small.webp` | oui |
| `mobile/assets/rpg/artisan-s.webp` | `assets/renaissance/artisan-s.webp` | oui |
| `mobile/assets/rpg/aurora-small.webp` | `assets/renaissance/aurora-small.webp` | oui |
| `mobile/assets/rpg/forge-small.webp` | `assets/renaissance/forge-small.webp` | oui |
| `mobile/assets/rpg/guardian-aube-s.webp` | `assets/renaissance/guardian-aube-s.webp` | oui |
| `mobile/assets/rpg/guardian-aurores-s.webp` | `assets/renaissance/guardian-aurores-s.webp` | oui |
| `mobile/assets/rpg/guardian-forge-s.webp` | `assets/renaissance/guardian-forge-s.webp` | oui |
| `mobile/assets/rpg/guardian-marees-s.webp` | `assets/renaissance/guardian-marees-s.webp` | oui |
| `mobile/assets/rpg/hero-small.webp` | `image/editorial/hero-small.webp` | oui |
| `mobile/assets/rpg/keeper-s.webp` | `assets/renaissance/keeper-s.webp` | oui |
| `mobile/assets/rpg/navigator-s.webp` | `assets/renaissance/navigator-s.webp` | oui |
| `mobile/assets/rpg/ranger-s.webp` | `assets/renaissance/ranger-s.webp` | oui |
| `mobile/assets/rpg/scout-s.webp` | `assets/renaissance/scout-s.webp` | oui |
| `mobile/assets/rpg/sentinel-s.webp` | `assets/renaissance/sentinel-s.webp` | oui |
| `mobile/assets/rpg/valley-small.webp` | `assets/renaissance/valley-small.webp` | oui |

## Inventaire physique

La décision `retain` conserve le fichier. `fix` signale une vérification ou correction de son usage avant retrait. Les licences et propriétaires visuels sont à confirmer lorsque le dépôt ne les établit pas.

| Fichier | Famille | Octets | Dimensions | Décision |
|---|---|---:|---|---|
| `assets/ascension/contours.svg` | world-map-decoration | 28400 | 800×600 | retain |
| `assets/renaissance/archipelago-small.webp` | worlds | 112454 | 800×450 | retain |
| `assets/renaissance/archipelago-xs.webp` | worlds | 44338 | 480×270 | retain |
| `assets/renaissance/archipelago.webp` | worlds | 386128 | 1600×900 | retain |
| `assets/renaissance/artisan-s.webp` | avatars | 10612 | 192×192 | retain |
| `assets/renaissance/artisan.webp` | avatars | 73826 | 640×640 | retain |
| `assets/renaissance/aurora-small.webp` | worlds | 92238 | 800×450 | retain |
| `assets/renaissance/aurora-xs.webp` | worlds | 39816 | 480×270 | retain |
| `assets/renaissance/aurora.webp` | worlds | 301100 | 1600×900 | retain |
| `assets/renaissance/forge-small.webp` | worlds | 106664 | 800×450 | retain |
| `assets/renaissance/forge-xs.webp` | worlds | 44022 | 480×270 | retain |
| `assets/renaissance/forge.webp` | worlds | 357338 | 1600×900 | retain |
| `assets/renaissance/guardian-aube-s.webp` | guardians | 18940 | 256×256 | retain |
| `assets/renaissance/guardian-aube.webp` | guardians | 113714 | 640×640 | retain |
| `assets/renaissance/guardian-aurores-s.webp` | guardians | 17652 | 256×256 | retain |
| `assets/renaissance/guardian-aurores.webp` | guardians | 108482 | 640×640 | retain |
| `assets/renaissance/guardian-forge-s.webp` | guardians | 17508 | 256×256 | retain |
| `assets/renaissance/guardian-forge.webp` | guardians | 111018 | 640×640 | retain |
| `assets/renaissance/guardian-marees-s.webp` | guardians | 16322 | 256×256 | retain |
| `assets/renaissance/guardian-marees.webp` | guardians | 100584 | 640×640 | retain |
| `assets/renaissance/keeper-s.webp` | avatars | 11606 | 192×192 | retain |
| `assets/renaissance/keeper.webp` | avatars | 78366 | 640×640 | retain |
| `assets/renaissance/navigator-s.webp` | avatars | 10130 | 192×192 | retain |
| `assets/renaissance/navigator.webp` | avatars | 66684 | 640×640 | retain |
| `assets/renaissance/ranger-s.webp` | avatars | 11200 | 192×192 | retain |
| `assets/renaissance/ranger.webp` | avatars | 82698 | 640×640 | retain |
| `assets/renaissance/scout-s.webp` | avatars | 10936 | 192×192 | retain |
| `assets/renaissance/scout.webp` | avatars | 74752 | 640×640 | retain |
| `assets/renaissance/sentinel-s.webp` | avatars | 8926 | 192×192 | retain |
| `assets/renaissance/sentinel.webp` | avatars | 57572 | 640×640 | retain |
| `assets/renaissance/valley-small.webp` | worlds | 83722 | 800×450 | retain |
| `assets/renaissance/valley-xs.webp` | worlds | 32900 | 480×270 | retain |
| `assets/renaissance/valley.webp` | worlds | 277988 | 1600×900 | retain |
| `css/fonts/archivo-latin-variable.woff2` | typography | 90104 | sans dimension raster | retain |
| `css/fonts/manrope-latin-0.woff2` | typography | 15120 | sans dimension raster | retain |
| `css/fonts/manrope-latin-1.woff2` | typography | 24836 | sans dimension raster | retain |
| `css/fonts/remixicon.woff2` | typography | 143720 | sans dimension raster | retain |
| `docs/play-store/README.md` | store-listing | 1998 | sans dimension raster | fix |
| `docs/play-store/feature-graphic-1024x500.png` | store-listing | 353883 | 1024×500 | fix |
| `docs/play-store/phone-01-qg.png` | store-listing | 171459 | 1080×1920 | fix |
| `docs/play-store/phone-02-seance.png` | store-listing | 185815 | 1080×1920 | fix |
| `docs/play-store/phone-03-stats.png` | store-listing | 205243 | 1080×1920 | fix |
| `docs/play-store/phone-04-aventure.png` | store-listing | 1215228 | 1080×1920 | fix |
| `docs/play-store/phone-05-journal.png` | store-listing | 234860 | 1080×1920 | fix |
| `docs/play-store/phone-06-records.png` | store-listing | 169892 | 1080×1920 | fix |
| `favicon.ico` | brand | 1335 | 48×48 | retain |
| `image/apple-touch-icon.png` | brand | 2447 | 180×180 | retain |
| `image/avatar/avatar_1.png` | avatars | 4386874 | 1600×1600 | retain |
| `image/avatar/avatar_1.webp` | avatars | 137074 | 768×768 | fix |
| `image/avatar/avatar_10.png` | avatars | 4153735 | 1600×1600 | retain |
| `image/avatar/avatar_10.webp` | avatars | 105498 | 768×768 | fix |
| `image/avatar/avatar_2.png` | avatars | 4295501 | 1600×1600 | retain |
| `image/avatar/avatar_2.webp` | avatars | 132336 | 768×768 | fix |
| `image/avatar/avatar_3.png` | avatars | 4403471 | 1600×1600 | retain |
| `image/avatar/avatar_3.webp` | avatars | 111664 | 768×768 | fix |
| `image/avatar/avatar_4.png` | avatars | 4103697 | 1600×1600 | retain |
| `image/avatar/avatar_4.webp` | avatars | 122218 | 768×768 | fix |
| `image/avatar/avatar_5.png` | avatars | 4294427 | 1600×1600 | retain |
| `image/avatar/avatar_5.webp` | avatars | 115162 | 768×768 | fix |
| `image/avatar/avatar_6.png` | avatars | 4345552 | 1600×1600 | retain |
| `image/avatar/avatar_6.webp` | avatars | 114918 | 768×768 | fix |
| `image/avatar/avatar_7.png` | avatars | 4486405 | 1600×1600 | retain |
| `image/avatar/avatar_7.webp` | avatars | 129838 | 768×768 | fix |
| `image/avatar/avatar_8.png` | avatars | 4571768 | 1600×1600 | retain |
| `image/avatar/avatar_8.webp` | avatars | 133602 | 768×768 | fix |
| `image/avatar/avatar_9.png` | avatars | 4150600 | 1600×1600 | retain |
| `image/avatar/avatar_9.webp` | avatars | 108508 | 768×768 | fix |
| `image/boss/boss_1.png` | legacy-encounters | 2838256 | 1600×893 | retain |
| `image/boss/boss_1.webp` | legacy-encounters | 188240 | 1280×714 | fix |
| `image/boss/boss_10.png` | legacy-encounters | 3122627 | 1600×893 | retain |
| `image/boss/boss_10.webp` | legacy-encounters | 236250 | 1280×714 | fix |
| `image/boss/boss_11.png` | legacy-encounters | 3274377 | 1600×893 | retain |
| `image/boss/boss_11.webp` | legacy-encounters | 279824 | 1280×714 | fix |
| `image/boss/boss_12.jpg` | legacy-encounters | 295975 | 1600×893 | retain |
| `image/boss/boss_12.webp` | legacy-encounters | 173916 | 1280×714 | fix |
| `image/boss/boss_13.jpg` | legacy-encounters | 305624 | 1600×893 | retain |
| `image/boss/boss_13.webp` | legacy-encounters | 176444 | 1280×714 | fix |
| `image/boss/boss_14.png` | legacy-encounters | 3088268 | 1600×893 | retain |
| `image/boss/boss_14.webp` | legacy-encounters | 222390 | 1280×714 | fix |
| `image/boss/boss_15.png` | legacy-encounters | 2843837 | 1600×893 | retain |
| `image/boss/boss_15.webp` | legacy-encounters | 183758 | 1280×714 | fix |
| `image/boss/boss_16.png` | legacy-encounters | 3381053 | 1600×893 | retain |
| `image/boss/boss_16.webp` | legacy-encounters | 295506 | 1280×714 | fix |
| `image/boss/boss_17.png` | legacy-encounters | 3021861 | 1600×893 | retain |
| `image/boss/boss_17.webp` | legacy-encounters | 202484 | 1280×714 | fix |
| `image/boss/boss_18.png` | legacy-encounters | 2796871 | 1600×893 | retain |
| `image/boss/boss_18.webp` | legacy-encounters | 182066 | 1280×714 | fix |
| `image/boss/boss_19.png` | legacy-encounters | 2734418 | 1600×893 | retain |
| `image/boss/boss_19.webp` | legacy-encounters | 157990 | 1280×714 | fix |
| `image/boss/boss_2.png` | legacy-encounters | 2634396 | 1600×893 | retain |
| `image/boss/boss_2.webp` | legacy-encounters | 191908 | 1280×714 | fix |
| `image/boss/boss_20.png` | legacy-encounters | 2667851 | 1600×883 | retain |
| `image/boss/boss_20.webp` | legacy-encounters | 178374 | 1280×706 | fix |
| `image/boss/boss_21.jpeg` | legacy-encounters | 142233 | 1024×559 | retain |
| `image/boss/boss_21.webp` | legacy-encounters | 83788 | 1024×559 | fix |
| `image/boss/boss_22.png` | legacy-encounters | 2753553 | 1600×893 | retain |
| `image/boss/boss_22.webp` | legacy-encounters | 196766 | 1280×714 | fix |
| `image/boss/boss_23.png` | legacy-encounters | 2281903 | 1600×873 | retain |
| `image/boss/boss_23.webp` | legacy-encounters | 124626 | 1280×698 | fix |
| `image/boss/boss_24.png` | legacy-encounters | 2816614 | 1600×893 | retain |
| `image/boss/boss_24.webp` | legacy-encounters | 195294 | 1280×714 | fix |
| `image/boss/boss_25.png` | legacy-encounters | 2390944 | 1600×900 | retain |
| `image/boss/boss_25.webp` | legacy-encounters | 166820 | 1280×720 | fix |
| `image/boss/boss_3.png` | legacy-encounters | 3117411 | 1600×893 | retain |
| `image/boss/boss_3.webp` | legacy-encounters | 224082 | 1280×714 | fix |
| `image/boss/boss_4.png` | legacy-encounters | 3124282 | 1600×893 | retain |
| `image/boss/boss_4.webp` | legacy-encounters | 233100 | 1280×714 | fix |
| `image/boss/boss_5.png` | legacy-encounters | 2987246 | 1600×893 | retain |
| `image/boss/boss_5.webp` | legacy-encounters | 223104 | 1280×714 | fix |
| `image/boss/boss_6.png` | legacy-encounters | 2813904 | 1600×893 | retain |
| `image/boss/boss_6.webp` | legacy-encounters | 167968 | 1280×714 | fix |
| `image/boss/boss_7.png` | legacy-encounters | 3162649 | 1600×893 | retain |
| `image/boss/boss_7.webp` | legacy-encounters | 254600 | 1280×714 | fix |
| `image/boss/boss_8.jpg` | legacy-encounters | 173807 | 1024×559 | retain |
| `image/boss/boss_8.webp` | legacy-encounters | 103894 | 1024×559 | fix |
| `image/boss/boss_9.png` | legacy-encounters | 2975699 | 1600×893 | retain |
| `image/boss/boss_9.webp` | legacy-encounters | 225906 | 1280×714 | fix |
| `image/editorial/hero-small.webp` | public-auth-hero | 32704 | 840×473 | retain |
| `image/editorial/hero.webp` | public-auth-hero | 81724 | 1680×946 | fix |
| `image/logo-192.png` | brand | 2816 | 192×192 | retain |
| `image/logo-512.png` | brand | 6921 | 512×512 | retain |
| `image/logo-maskable-192.png` | brand | 4395 | 192×192 | retain |
| `image/logo-maskable-512.png` | brand | 14682 | 512×512 | retain |
| `image/logo.png` | brand | 12087 | 512×512 | retain |
| `image/mob/mob_1.jpg` | legacy-encounters | 80037 | 1024×572 | retain |
| `image/mob/mob_1.webp` | legacy-encounters | 43448 | 1024×572 | fix |
| `image/mob/mob_10.png` | legacy-encounters | 1674759 | 1600×893 | retain |
| `image/mob/mob_10.webp` | legacy-encounters | 66922 | 1024×572 | fix |
| `image/mob/mob_11.png` | legacy-encounters | 1366374 | 1600×893 | retain |
| `image/mob/mob_11.webp` | legacy-encounters | 51920 | 1024×572 | fix |
| `image/mob/mob_12.png` | legacy-encounters | 1512353 | 1600×893 | retain |
| `image/mob/mob_12.webp` | legacy-encounters | 51906 | 1024×572 | fix |
| `image/mob/mob_13.png` | legacy-encounters | 1655921 | 1600×893 | retain |
| `image/mob/mob_13.webp` | legacy-encounters | 66680 | 1024×572 | fix |
| `image/mob/mob_14.png` | legacy-encounters | 1855464 | 1600×941 | retain |
| `image/mob/mob_14.webp` | legacy-encounters | 81090 | 1024×602 | fix |
| `image/mob/mob_15.png` | legacy-encounters | 1951252 | 1600×971 | retain |
| `image/mob/mob_15.webp` | legacy-encounters | 69790 | 1024×621 | fix |
| `image/mob/mob_2.png` | legacy-encounters | 1532028 | 1600×893 | retain |
| `image/mob/mob_2.webp` | legacy-encounters | 59326 | 1024×572 | fix |
| `image/mob/mob_3.png` | legacy-encounters | 1576577 | 1600×893 | retain |
| `image/mob/mob_3.webp` | legacy-encounters | 60158 | 1024×572 | fix |
| `image/mob/mob_4.png` | legacy-encounters | 1602226 | 1600×893 | retain |
| `image/mob/mob_4.webp` | legacy-encounters | 66248 | 1024×572 | fix |
| `image/mob/mob_5.png` | legacy-encounters | 1338024 | 1600×893 | retain |
| `image/mob/mob_5.webp` | legacy-encounters | 42978 | 1024×572 | fix |
| `image/mob/mob_6.png` | legacy-encounters | 1750347 | 1600×893 | retain |
| `image/mob/mob_6.webp` | legacy-encounters | 75678 | 1024×572 | fix |
| `image/mob/mob_7.png` | legacy-encounters | 1554978 | 1600×893 | retain |
| `image/mob/mob_7.webp` | legacy-encounters | 57064 | 1024×572 | fix |
| `image/mob/mob_8.png` | legacy-encounters | 1530584 | 1600×893 | retain |
| `image/mob/mob_8.webp` | legacy-encounters | 54310 | 1024×572 | fix |
| `image/mob/mob_9.png` | legacy-encounters | 1470173 | 1600×893 | retain |
| `image/mob/mob_9.webp` | legacy-encounters | 55234 | 1024×572 | fix |
| `image/og-titan-os.png` | public-auth-hero | 106764 | 1200×630 | retain |
| `image/og-titan.jpg` | public-auth-hero | 96943 | 1200×630 | retain |
| `image/shop/titan-plus-v89.webp` | subscription | 143870 | 1844×853 | fix |
| `image/titan-coach-logo.svg` | subscription | 4404 | 1024×1024 | fix |
| `image/titan-coach-ultra-logo.svg` | subscription | 1866 | 1024×1024 | fix |
| `image/titan-mark.svg` | brand | 467 | 100×100 | fix |
| `image/titan-plus-logo.svg` | subscription | 4702 | 1024×1024 | fix |
| `mobile/assets/brand/adaptive-foreground.png` | brand | 15561 | 1024×1024 | retain |
| `mobile/assets/brand/adaptive-monochrome.png` | brand | 16169 | 1024×1024 | retain |
| `mobile/assets/brand/icon.png` | brand | 16531 | 1024×1024 | retain |
| `mobile/assets/brand/mark.png` | brand | 4363 | 256×256 | retain |
| `mobile/assets/brand/notification.png` | notifications | 1382 | 96×96 | retain |
| `mobile/assets/brand/splash-mark.png` | brand | 18018 | 1024×1024 | retain |
| `mobile/assets/fonts/Manrope-Bold.ttf` | typography | 35560 | sans dimension raster | retain |
| `mobile/assets/fonts/Manrope-ExtraBold.ttf` | typography | 35764 | sans dimension raster | retain |
| `mobile/assets/fonts/Manrope-Regular.ttf` | typography | 35652 | sans dimension raster | retain |
| `mobile/assets/fonts/Manrope-SemiBold.ttf` | typography | 35632 | sans dimension raster | retain |
| `mobile/assets/fonts/TitanDisplay-Bold.ttf` | typography | 40768 | sans dimension raster | retain |
| `mobile/assets/fonts/TitanDisplay-Heavy.ttf` | typography | 40648 | sans dimension raster | retain |
| `mobile/assets/fonts/archivo-OFL.txt` | typography | 4503 | sans dimension raster | fix |
| `mobile/assets/fonts/manrope-OFL.txt` | typography | 4384 | sans dimension raster | fix |
| `mobile/assets/rpg/archipelago-small.webp` | worlds | 112454 | 800×450 | retain |
| `mobile/assets/rpg/artisan-s.webp` | avatars | 10612 | 192×192 | retain |
| `mobile/assets/rpg/aurora-small.webp` | worlds | 92238 | 800×450 | retain |
| `mobile/assets/rpg/forge-small.webp` | worlds | 106664 | 800×450 | retain |
| `mobile/assets/rpg/guardian-aube-s.webp` | guardians | 18940 | 256×256 | retain |
| `mobile/assets/rpg/guardian-aurores-s.webp` | guardians | 17652 | 256×256 | retain |
| `mobile/assets/rpg/guardian-forge-s.webp` | guardians | 17508 | 256×256 | retain |
| `mobile/assets/rpg/guardian-marees-s.webp` | guardians | 16322 | 256×256 | retain |
| `mobile/assets/rpg/hero-small.webp` | public-auth-hero | 32704 | 840×473 | retain |
| `mobile/assets/rpg/keeper-s.webp` | avatars | 11606 | 192×192 | retain |
| `mobile/assets/rpg/navigator-s.webp` | avatars | 10130 | 192×192 | retain |
| `mobile/assets/rpg/ranger-s.webp` | avatars | 11200 | 192×192 | retain |
| `mobile/assets/rpg/scout-s.webp` | avatars | 10936 | 192×192 | retain |
| `mobile/assets/rpg/sentinel-s.webp` | avatars | 8926 | 192×192 | retain |
| `mobile/assets/rpg/valley-small.webp` | worlds | 83722 | 800×450 | retain |
| `mobile/docs/play-store/README.md` | store-listing | 1174 | sans dimension raster | fix |
| `mobile/docs/play-store/phone-01-qg.png` | store-listing | 188054 | 1080×2160 | fix |
| `mobile/docs/play-store/phone-02-apres-seance.png` | store-listing | 161039 | 1080×2160 | fix |
| `mobile/docs/play-store/phone-03-tes-questions.png` | store-listing | 210663 | 1080×2160 | fix |
| `mobile/docs/play-store/phone-04-monde.png` | store-listing | 834638 | 1080×2160 | fix |
| `mobile/docs/play-store/phone-05-aventure.png` | store-listing | 2094859 | 1080×2160 | fix |
| `mobile/docs/play-store/phone-06-records.png` | store-listing | 192398 | 1080×2160 | fix |

## Contrôles de rendu restant ouverts

- Comparer les sept blasons à 24/32/48/64/96/128/160 px ou dp. Contrôler silhouette, hiérarchie, contours, contraste, centrage et texte accessible.
- Préserver horizon, visages et silhouettes des quatre mondes, portraits et gardiens. Contrôler recadrages et densités sur les surfaces réelles.
- Examiner les icônes de sport par catégorie et le centre optique à petite taille. Le JSON recense les associations du catalogue hors ligne.
- Vérifier les surfaces à 320/360/390/768/1280, police 200 %, états vides, chargement, erreur et hors ligne. Confirmer clavier et TalkBack selon plateforme.
- Documenter la recette Samsung et les captures manquantes. Les champs de capture restent vides jusqu’à ce qu’une preuve soit disponible.

Examen des sources dans `docs/V13_ASSET_SOURCE_REVIEW.md`.
