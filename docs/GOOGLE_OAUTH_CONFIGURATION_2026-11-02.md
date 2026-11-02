# TITAN V1.1 — Google OAuth : paramètres réels et étape finale (02/11/2026)

## Fournis et vérifiés

- Projet Supabase : `oubmftfufwwzwpgvrcag`
- Package Android : `fr.titanapp.app`
- Client Google OAuth créé pour **Android** (public) : `623091962913-5cjuq9lj78unlk4j38irpjq1v3ld2t1j.apps.googleusercontent.com`
- L'empreinte SHA-1 Play a été récupérée par le propriétaire pour ce client Android. Ne pas l'inventer ; un build local signé avec un autre certificat requiert un autre client Google Android.
- La branche de consolidation Claude `claude/titan-cahier-charges-0k7cdn` contient déjà le parcours Google Web et Android protégé par des flags. Ne pas intégrer une seconde implémentation parallèle (la PR #125 est une candidate expérimentale, pas le chemin cible de consolidation).

## Étapes manuelles strictement nécessaires (Google Cloud / Supabase Auth)

1. Google Cloud → Auth Platform → Clients : **créer un client supplémentaire de type Application Web** dans le même projet Google Cloud. Nom libre, par exemple « TITAN Web ». Origine Javascript : `https://titan-app.fr`. URI de redirection Google : `https://oubmftfufwwzwpgvrcag.supabase.co/auth/v1/callback`. Récupérer **Client ID Web** + **Client Secret Web**. Ne jamais coller le secret sur GitHub.
2. Supabase Dashboard → projet ci-dessus → Authentication → Providers → Google : activer Google. Remplir **Client IDs** avec l'ID du client Web **en premier** puis l'ID Android donné ci-dessus, séparés par une virgule si l'interface demande plusieurs identifiants. Renseigner **le secret du client Web** dans le champ prévu. Garder ce secret hors du code et de toute discussion.
3. Supabase Authentication → URL Configuration : Site URL `https://titan-app.fr`. Dans **Redirect URLs**, autoriser les retours utilisés par le code réel de la branche Claude : `https://titan-app.fr/**` (ou des chemins précis autorisés) et **`titan://auth-callback`**. Important : `titan://auth-callback` est différent de `titan://auth/callback`; seul le premier est utilisé par la version Claude de TITAN.
4. Google Cloud → Audience : vérifier que le type d'application est Externe ; pendant Testing, ajouter les testeurs autorisés ou publier suivant les exigences Google.
5. Seulement une fois la configuration opérationnelle sur un banc d'essai : activer côté serveur le flag **`auth.google`** et côté build Android **`EXPO_PUBLIC_TITAN_GOOGLE=1`**. Ne pas le faire avant, les boutons seraient visibles alors que les fournisseurs ne sont pas prêts.
6. Tester Web et APK Android signé : compte neuf, compte historique, deep link après navigateur fermé/réouvert, erreurs et annulation, profil/XP/journal conservés, pas d'identités dupliquées. Le lien d'identités Supabase dépend des preuves d'e-mail vérifié et des règles d'Auth ; ne jamais supposer qu'une fusion de comptes est automatique dans tous les cas.

## Références techniques

- Branche complémentaire : `codex/v11-google-oauth-finalize-20261102`. Apporte validation stricte du callback Android, filtrage du routeur React Navigation et protection contre un échange du même code deux fois.
- Branche alternative expérimentale (ne pas fusionner telle quelle) : `codex/v11-google-oauth-20261102`, PR #125.
- Docs Supabase : https://supabase.com/docs/guides/auth/social-sign-in/auth-google
- Aucun changement de configuration Google Cloud ni Supabase Auth ne peut être attesté par les seuls commits GitHub.
- Pas de déploiement de la V1 Web, migration de base de données, publication Play Console ou merge vers main.
