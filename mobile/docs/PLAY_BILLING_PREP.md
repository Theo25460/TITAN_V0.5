# TITAN — Débloquer les abonnements dans Play Console (02/11/2026)

## Diagnostic vérifié

Google Play Console peut masquer/empêcher la création de produits tant qu'aucun bundle de l'application n'a été publié sur **une piste de test, y compris interne**, avec une bibliothèque Google Play Billing embarquée. La V1 Android TITAN précédente refusait explicitement la permission BILLING. Il ne faut pas créer une seconde application Play.

Identité existante : **TITAN**, package **`fr.titanapp.app`**. Garder la même application et la **clé d'envoi Google Play** (le workflow refuse une empreinte différente).

Référence Google : https://developer.android.com/google/play/billing/getting-ready

## Ce que contient cette branche

- `mobile/plugins/with-play-billing.js` ajoute `com.android.billingclient:billing:9.1.0` à `android/app/build.gradle` pendant `expo prebuild`. La dépendance n'est **pas** installée à la main dans un dossier `android/` généré.
- `mobile/app.config.ts` autorise `com.android.vending.BILLING` et charge le plugin.
- `.github/workflows/android-native.yml` refuse désormais un paquet sans la permission BILLING ; il continue de refuser `AD_ID`, les permissions inattendues et les signatures non conformes.
- `mobile/__tests__/with-play-billing.test.js` protège contre les doubles injections et les modifications de template Gradle incompatibles.
- Le client d'achat (`src/lib/playBilling.ts`, `TitanPlusScreen`) est livré mais **éteint** : sans `EXPO_PUBLIC_TITAN_BILLING=1` l'écran `TITAN+` reste « Bientôt disponible ».

## Fabriquer l'AAB accepté par Play Console

1. Vérifier le résultat des tests et de la construction GitHub de cette branche/PR.
2. Dans le dépôt, ouvrir **Actions → Android natif (React Native) → Run workflow**, sélectionner la branche `claude/titan-cahier-charges-0k7cdn`, `signing = upload`, et une `version_code` strictement **supérieure à tous les versionCode déjà envoyés dans Play Console** (une valeur vide utilise `1000 + numéro du workflow` : vérifier qu'elle dépasse bien le plus récent). Le workflow n'envoie rien à Play.
3. Télécharger **l'artefact `titan-android-<code>-upload`** (et non `essai-NE-PAS-PUBLIER`) : prendre le fichier **`.aab`**.
4. Play Console → **TITAN (`fr.titanapp.app`) → Tests → Test interne → Créer une version**. Ajouter cet AAB, vérifier que Google reconnaît la signature et la nouvelle permission. Ne pas utiliser Production, Test fermé ni rendre la version accessible sans choix explicite du propriétaire. **Cette version contient aussi le GPS** : la déclaration du service de premier plan « localisation » est demandée par la Play Console (voir `docs/PLAY_BILLING_GPS_OWNER_STEPS.md`).
5. Lorsqu'une version de test comportant Billing est publiée sur la piste interne, vérifier **Monétiser avec Play → Produits → Abonnements**. Un profil de paiement commerçant peut aussi être nécessaire.

## Ensuite, pour de vrais abonnements

- Créer les produits `titan_plus`, `coach` et `coach_pro` avec forfait de base renouvelable **mensuel** (identifiants à confirmer au moment de la création). Prix décidés : Coach 20 €/mois, Coach Pro 40 €/mois ; **prix Titan+ à confirmer**.
- Client d'achat : fait (voir `docs/adr/ADR-004-google-play-billing-titan-plus.md`). **Ne l'activer qu'après l'essai avec un compte testeur de licence.**
- Configurer côté serveur la Google Play Developer API avec service account privé (pas dans GitHub, ni l'APK), valider les purchase tokens auprès de Google, lier les utilisateurs Supabase, appliquer/revoker les droits idempotemment et accuser réception des achats initiaux seulement après vérification.
- Prévoir les RTDN via Pub/Sub (renouvellement, annulation, suspension, remboursement, expiration) et le contrôle régulier des états (une notification n'accorde jamais seule des droits).
- Appliquer la migration V1.1 `20261102090000_coach_seats` (après les précédentes), puis associer les IDs produits via `titan_plan_product_set_v1`. À faire sur une copie/test avant la base de production, uniquement avec autorisation.
- Tester en environnement Play (licence test, achat, refus, paiement en attente, changement d'offre, restauration, remboursement, expiration), sans paiement réel avant autorisation.

## Pas de publication automatique

Rien ici ne modifie `main`, Netlify, la base Supabase de production ou une piste Google Play.
