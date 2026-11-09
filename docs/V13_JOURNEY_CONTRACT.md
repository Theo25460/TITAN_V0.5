# V1.3 — Contrat serveur des sentiers

La migration `20261105213712_journey_v13.sql` ajoute deux opérations authentifiées sans argument.

| RPC | Effet |
| --- | --- |
| `titan_journey_snapshot_v1()` | Lecture seule `STABLE` |
| `titan_journey_sync_v1()` | Action explicite qui confirme les découvertes et titres éligibles et retourne le même contrat |

Les opérations tirent le propriétaire de `auth.uid()` et exigent un profil actif. La synchronisation verrouille la ligne du propriétaire dans sa transaction. La clé unique `(user_id, track, id)` et `ON CONFLICT DO NOTHING` préservent chaque acquisition lors des répétitions. Les enveloppes publiques sont `SECURITY INVOKER`. Les fonctions privilégiées sont privées et fixent `search_path=''`. RLS et l’absence de droits directs protègent les tables.

```ts
type JourneySnapshotV1 = {
  version: 1;
  owner: string;
  configVersion: number;
  totalSteps: number;
  today: { day: string; steps: number; sources: string[]; updatedAt: string } | null;
  goal: 30000000;
  discoveries: Array<{
    id: string;
    steps: number;
    world: 'aube' | 'marees' | 'forge' | 'aurores';
    name: string;
    story: string;
    kind: 'milestone' | 'discovery';
    earnedAt: string | null;
  }>;
  career: {
    level: number;
    milestones: Array<{
      id: string;
      level: number;
      title: string;
      description: string;
      earnedAt: string | null;
    }>;
  };
};
```

Les découvertes sont triées par pas puis identifiant et les titres par niveau puis identifiant. Un seuil atteint avec `earnedAt:null` est prêt à révéler. Une date `earnedAt` correspond à la première confirmation lors d’une synchronisation explicite. Elle indique le moment de cette confirmation même pour un compte ancien. Le titre cosmétique reste dans le journal.

`today.day` est la journée UTC du serveur. `today:null` signifie aucune ligne admissible. Une vraie ligne à zéro produit `today.steps:0`. `sources` liste toutes les sources admissibles du jour et `updatedAt` leur horodatage maximal de mise à jour.

## Provenance

La V1.3 lit exclusivement les lignes `private.titan_daily_activity` acceptées par le RPC d’import existant. La confirmation serveur désigne l’acceptation après contrôle du propriétaire, du consentement, des dates et des bornes. Ce périmètre ne constitue pas une attestation matérielle du capteur. Le canal quotidien implémenté est `health_connect`. Garmin concerne les activités dans la version actuelle. Le calcul multi-sources attend un canal quotidien réel et une configuration serveur qui l’autorise.

La lecture retient le propriétaire exact et un consentement actif avec date finie non future. Elle limite les canaux à `health_connect` et `garmin`, selon le catalogue autorisé. Les compteurs natifs locaux sont exclus. Chaque ligne doit contenir un entier de zéro au plafond configuré, au plus 200 000. Le jour doit être fini, au moins le 01/01/2000 et au plus le jour UTC courant. Son horodatage de mise à jour doit être fini et non futur. L’intervalle d’import J−400 à J+1 se mesure par rapport à la mise à jour, ce qui conserve l’historique ancien valablement accepté.

Le total additionne le maximum par jour. Deux sources à 12 000 et 18 000 pas le même jour contribuent 18 000. Une correction ou une révocation de consentement peut diminuer le total courant. Le journal conserve les acquis.

## Configuration et conservation

La version initiale contient 304 découvertes et 13 grands jalons de 10 000 à 30 millions de pas. Les repères intermédiaires maintiennent un intervalle maximal de 100 000 pas. Les jalons de carrière lisent `profiles.level` aux niveaux 5, 10, 20, 35, 50, 75 et 100. Une évolution publie un catalogue complet et bascule la version active dans la même transaction.

La première synchronisation fige le contenu, la version et la date des acquisitions. Le snapshot conserve un souvenir acquis dont le texte ou le seuil change, même si le catalogue le retire. L’export du compte inclut `journey` et la suppression du compte efface son journal par cascade. Les acquisitions sont cosmétiques, sans effet sur les XP, crédits, niveau, campagnes, achats ou avantages payants.
