# TITAN V1.1 — Google OAuth Web + Android (configuration externe)

Ce document décrit le raccordement du **code sur la branche de travail**. Aucune modification de Supabase production, aucun déploiement Netlify ni Google Play n'est effectué ici.

## Identifiant Android confirmé par le propriétaire (02/11/2026)

- Type créé dans Google Cloud : **Android** (package `fr.titanapp.app`, SHA-1 propre à la signature Play).
- Client ID public : `623091962913-5cjuq9lj78unlk4j38irpjq1v3ld2t1j.apps.googleusercontent.com`
- L'empreinte SHA-1 reste propre à la clé de signature Play. Les builds de debug signés avec une autre clé exigent un autre client OAuth Android.
- Il est **normal que l'ID Android ne soit pas codé dans la page Web ou dans `googleOAuth.ts`** : la connexion est orchestrée par Supabase Auth. Le ou les Client IDs se déclarent dans le fournisseur Google de Supabase.

## Configuration restante dans les consoles (obligatoire avant un test réel)

1. **Google Cloud → Auth Platform → Clients** : créer ou identifier aussi un client de type **Application Web**. Indiquer l'origine `https://titan-app.fr` et l'URI de redirection vers Supabase : `https://oubmftfufwwzwpgvrcag.supabase.co/auth/v1/callback`. Récupérer son Client ID et son **Client Secret**.
2. **Supabase → TITAN → Authentication → Providers → Google** : activer Google ; mettre **l'ID du client Web en premier**, puis l'ID client Android ci-dessus dans la liste des Client IDs (séparateur virgule selon l'interface) ; placer **uniquement le secret du client Web** dans le champ prévu. Ne jamais placer de secret dans GitHub, Expo `EXPO_PUBLIC_*`, le navigateur ou ce document.
3. **Supabase → Authentication → URL Configuration** : conserver Site URL = `https://titan-app.fr` ; ajouter les deux URL de retour à la liste *Redirect URLs* si absentes :
   - `https://titan-app.fr/login` (le flux Web utilise des paramètres `?google=1&next=...` ; prévoir `https://titan-app.fr/login**` comme règle si nécessaire à la configuration Supabase).
   - `titan://auth/callback` (retour sur l'application Android).
4. **Google Auth Platform → Audience** : pour les tests non publiés, ajouter le compte Google testeur dans **Test users** si l'app est en état *Testing* ; sinon vérifier que le consentement est publié selon les exigences Google.
5. **Tester sans toucher à la V1** : sur une prévisualisation privée de branche avec sa configuration d'environnement ; contrôler un compte nouveau et un compte email/password existant avec email Google vérifié. Vérifier l'ID `auth.users.id` / `profiles.user_id`, sessions, journal et XP **avant/après**. Ne pas promettre un rattachement automatique systématique : vérifier la liaison d'identités Supabase et ne jamais créer un second profil par-dessus un profil existant.
6. **Android** : la configuration native `scheme: "titan"` est préexistante ; le flux ouvre le navigateur système et revient via `titan://auth/callback?code=...`. Le code effectue `exchangeCodeForSession` (PKCE) et ne traite aucune session provenant directement d'un lien profond. Tester une version signée réelle, le retour app après connexion, l'annulation, la relance à froid et le changement de compte.

## État de la branche

- Web `js/app/auth.js` : bouton *Continuer avec Google* ; redirection Supabase OAuth vers page TITAN login et reprise vers la destination locale.
- Android `mobile/src/lib/googleOAuth.ts` : lancement Google via Supabase OAuth et finalisation PKCE via code.
- Android `mobile/src/lib/supabase.ts` : flowType `pkce` ; aucun secret embarqué.
- Android `mobile/src/data/auth.tsx` : écoute des deep links, restauration et compte utilisateur dans le contexte d'authentification.
- Android `mobile/src/navigation/linking.ts` : le deep link OAuth n'est pas envoyé au routeur React Navigation.
- Android `mobile/src/screens/auth/LoginScreen.tsx` : bouton de connexion Google et gestion d'erreur.
- Test : `mobile/__tests__/google-oauth.test.ts`.

## Limites et garde-fous

- Le client ID Android ci-dessus est **public**. Le **secret Web** ne l'est pas.
- Ce travail ne permet pas de lire le panneau Google Cloud de l'utilisateur, ni de connaître le secret qu'il n'a pas fourni.
- Les outils Supabase disponibles ne permettent pas de régler le fournisseur OAuth Auth directement dans le Dashboard. Il faut donc le renseigner dans Supabase depuis l'interface autorisée.
- Ne déployer aucune branche sur la V1 Web, Supabase prod ni Play Console sans validation explicite du propriétaire.
