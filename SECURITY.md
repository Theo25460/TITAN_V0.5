# Sécurité

## Signaler une vulnérabilité

Ne publiez pas de vulnérabilité exploitable, de clé, de donnée utilisateur ou de preuve contenant des informations privées dans une issue publique. Utilisez en priorité le signalement privé de vulnérabilité dans l'onglet **Security** du dépôt GitHub. Si cette fonction n'est pas disponible, contactez le propriétaire du dépôt en privé avant de transmettre les détails.

Incluez la surface touchée, l'impact, les étapes minimales de reproduction et une proposition de mitigation. Expurgez tous les tokens, identifiants personnels et charges utiles réelles.

## Modèle de confiance

Le navigateur est un client non fiable. Les contrôles d'accès et les actions sensibles reposent sur Supabase RLS/RPC et sur les fonctions serveur Netlify. Une clé Supabase `anon` ou `sb_publishable_*` et un token client Paddle peuvent être présents dans le front ; une clé Supabase secrète/service-role, le secret webhook Paddle et l'URL de base avec mot de passe ne doivent jamais y apparaître.

Les scripts SQL de sécurité sont conservés dans `sql/`, mais leur présence dans Git ne prouve pas qu'ils ont été appliqués en production. Vérifier l'état réel de Supabase avant chaque publication sensible.
