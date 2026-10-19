# Handoff — achats, transactions et modération admin (SEC05, SEC06, SHOP15, SHOP16, Q-003)

Chantier AUTRE — Claude Code, 19/10/2026, suite de `docs/CDC_WEB_ECONOMY_SECURITY_HANDOFF_2026-10-19.md`. Branche `claude/titan-cahier-charges-0k7cdn` au-dessus de `aa92302c229ed0aaa8bd03b09aa0d6e7ea05ad4c` (PR #100 `530269c`). Aucune fusion, aucun déploiement, aucune migration appliquée à un projet réel. Théo a délégué la décision de Q-003 à Claude le 19/10/2026 (« si tu juges que c'est nécessaire fais-le »).

## Résultat

| Point | Statut proposé | Ce qui le justifie |
|---|---|---|
| Q-003 — la console d'administration ne pouvait modérer aucun autre compte | corrigé | Reproduit (`PROFILE_USER_MISMATCH`) avant correction, garde identique en production (lecture seule). Un administrateur peut désormais suspendre, rétablir ou modifier un autre compte par `titan_admin_update_profile_v1`, avec son identité dans le journal. |
| SEC06 — journaux d'audit des transactions virtuelles et de la modération | `[x]` | Journal livré hier ; la modération par un administrateur y apparaît désormais avec son auteur (test). Restent la rétention (Q-002) et la journalisation des lectures, classées au backlog. |
| SEC05 — contraintes contre soldes négatifs, doublons et états impossibles | `[x]` | Soldes, XP, niveau, rôle, statut et montants d'achat validés ; reçus de séance, succès, participations : clés primaires ; achat de cosmétique : index unique. |
| SHOP15 — empêcher doubles achats, soldes négatifs et modification client de l'inventaire | `[x]` | Fonction d'achat sous verrou de ligne **et** index unique refusant un second achat quel que soit l'auteur ; solde jamais stocké négatif ; écritures client sur historique et inventaire refusées (`300_economy_attacks`, `300_purchase_integrity`). |
| SHOP16 — transactions de coins et d'objets validées côté serveur et journalisées | `[x]` | Tout achat crée une ligne d'historique et une écriture de journal ; la somme des mouvements de crédits journalisés égale la variation réelle du solde (test) ; aucune écriture client. |

## Ce qui change

- `supabase/migrations/20261019120000_purchase_integrity_admin_moderation.sql`
  - **Garde de progression du profil.** L'exemption n'existe qu'à l'intérieur de la RPC d'administration : elle exige un marqueur local à la transaction, posé uniquement par `titan_admin_update_profile_v1` puis remis à zéro à son retour, **et** un administrateur (`private.titan_is_admin`, rôle lu sur le profil, jamais dans les métadonnées client). Une écriture directe d'un administrateur sur un autre profil reste refusée. Quand l'exemption sert, un contrôle de progression qui annulerait la ligne lève `PROFILE_UPDATE_REJECTED` au lieu d'annuler en silence (sinon l'administrateur et le journal d'actions croiraient à un bannissement non appliqué). Les contrôles eux-mêmes sont inchangés.
  - **RPC publique** `titan_admin_update_profile_v1` : même signature, même mode invoker, mêmes droits, corps en `plpgsql` pour poser et effacer le marqueur.
  - **Index unique partiel** `shop_history_cosmetic_once_idx (user_id, item_id) where item_id like 'cos\_%'`. Tous les cosmétiques du catalogue commencent par `cos_` (vérifié). Les anciens achats répétables, dont une paire en double en production, ne sont pas concernés. La migration échoue sans rien changer si un cosmétique a déjà été acheté deux fois ; production : 0 achat `cos_`.
- Tests : `sql/tests/300_admin_moderation.sql`, `300_purchase_integrity.sql`, `300_z_purchase_admin_migration.sql`.

## Vérifications

- RED avant correction : la modération échouait sur `PROFILE_USER_MISMATCH`, le doublon de cosmétique était accepté. Après correction, cinq mutations sont détectées (marqueur non exigé, annulation silencieuse pour un administrateur, index dépendant des métadonnées, index absent, garde sans exemption).
- Banc PostgreSQL 16 natif, deux voies de la CI : 33 suites SQL par voie, rejeu des migrations dans une transaction appelante. `pnpm run verify` : 219/219, build et audit sans erreur (16 avertissements préexistants).
- Une revue de code unique (effort élevé) : 7 remarques. 5 corrigées (écriture directe d'un administrateur, annulation silencieuse, index trop étroit, rollback documenté ici, deux fragilités de tests) ; 1 fausse alerte (`supabase/release-300.sql` est le bundle historique : la voie 2 du banc l'applique puis rejoue ensuite mes migrations, comme la CI) ; 1 absorbée par la correction de test.
- Non exécuté : aucun parcours navigateur n'a changé dans ce lot (SQL uniquement). La suite E2E complète du lot précédent (683/685, 2 flakes sous charge qui passent seuls) reste la référence.

## BLOQUANT À CORRIGER MAINTENANT

Aucun Critical/Important connu ouvert dans ce périmètre. Rappel du lot précédent : `profile.html` charge encore `training-store.js?v=300.0` (réservation Codex du Profil).

## NON BLOQUANT / BACKLOG FINITION

- Seule la RLS bloque une écriture croisée d'un joueur : si l'exemption du garde était étendue à tous, aucun test existant ne le verrait. Le garde est une seconde barrière ; la RLS reste la première (policies `profiles_self_or_admin_*`).
- Rétention et purge du journal (Q-002 a), journalisation des lectures du journal, absence de console de consultation (BOT04).
- Le marqueur est un réglage de session local ; un futur chemin `SECURITY DEFINER` qui accepterait un nom de réglage fourni par un client l'ouvrirait. Aucun n'existe ; à revérifier à chaque nouvelle RPC.

## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE

Modération réelle : BOT03 (file de comptes à examiner), BOT05 (signaux), BOT06 (actions graduées) sur la base désormais fonctionnelle de Q-003. Sinon un macro-bloc non réservé : Android et intégrations santé, ou monétisation.

## Retour arrière

```sql
drop index if exists public.shop_history_cosmetic_once_idx;
-- Restaurer le garde de progression d'origine : la définition de tools/db/baseline/04-functions-public.sql
-- (titan_guard_profile_progression), sans l'exemption ni PROFILE_UPDATE_REJECTED.
create or replace function public.titan_admin_update_profile_v1(p_user_id uuid, p_patch jsonb, p_reason text default null)
returns jsonb language sql set search_path to 'public', 'private' as $$
  select private.titan_admin_update_profile_v1(p_user_id, p_patch, p_reason);
$$;
```

Effet : la console d'administration ne peut plus modérer d'autre compte et un doublon de cosmétique n'est plus refusé que par la fonction d'achat. Aucune donnée n'est modifiée par la migration ni par son retrait.
