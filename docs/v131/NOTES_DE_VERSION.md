# TITAN 1.3.1 · Notes de version

Version Android `1.3.1 (1303)`, site : candidat de la branche `claude/titan-v131-finalization-9g6jjo`. Rien n'est publié.
Ces notes décrivent le candidat ; chaque ligne renvoie au lot qui en porte la preuve dans [`REGISTRE.md`](REGISTRE.md).

## Texte « Nouveautés » pour Google Play (français, 500 caractères au plus)

```
Un QG plus clair : ta progression, ta mission et une seule action à faire.
Aventure repensée : ton chapitre en tête, les quatre mondes illustrés.
Après chaque séance : ce que tu as fait, ce que TITAN confirme, et la suite.
Profil : niveau, sports, records et insignes d’un coup d’œil.
Nouveaux blasons pour les quatre premiers rangs.
Plus fiable : longues sorties GPS, pas conservés, moins de doublons avec ta montre.
```

Ce texte ne parle pas des abonnements : il ne faut le faire que lorsque l'achat est réellement ouvert et prouvé (lot 2).

## Ce qui change pour le sportif

### Application Android
- **QG** : blason, niveau, rang et barre d'XP dans le bandeau ; une action principale ; trois entrées (Sport, Aventure, Progrès) ; la semaine et le chapitre en cours sur une carte ; les pas réduits à une ligne facultative.
- **Aventure** : le chapitre en cours en tête, avec ses objectifs, ce qu'il apporte et une seule action ; les quatre mondes en grille illustrée.
- **Résultat de séance** : ce que tu as fait, puis ce que TITAN a confirmé (rien n'est annoncé comme gagné avant confirmation du serveur), puis « Et maintenant ».
- **Séance** : entrées GPS, GPX et montre visibles ; séances en attente ou refusées dites clairement.
- **Profil** : identité, sports pratiqués, records, insignes et crédits, journal.
- **Blasons** : Éclaireur, Explorateur, Sentinelle et Gardien ont leur blason sculpté. Champion, Titan et Légende gardent le blason dessiné en attendant leurs visuels.
- **Confidentialité** : ce que tu partages avec un coach est visible au même endroit que le retrait ; la suppression de compte prévient qu'elle ne résilie pas un abonnement Google Play.

### Fiabilité
- Une longue sortie GPS (plus de huit heures) ne risque plus de devenir illisible ; un enregistrement illisible n'est plus écrasé par un nouveau départ.
- L'historique des pas n'est plus effacé en quittant l'application pendant son chargement, ni par une déconnexion ordinaire ; une correction d'horloge n'ajoute plus de pas fantômes.
- Une séance saisie à la main puis reçue de Garmin ou de Santé Connect ne compte plus deux fois.
- Une activité Garmin refusée par les règles du journal ne bloque plus les suivantes.
- Un nom de parcours GPX contenant « > » n'empêche plus l'import.
- Un achat accepté par Google Play mais non confirmé est repris automatiquement à la réouverture de l'application (non prouvé sur un achat réel).

### Site
- Mêmes blasons que l'application.
- Textes d'offre, publicité et données unifiés avec le fonctionnement réel ; conditions d'utilisation version 8, politique de confidentialité version 12.
- Pages d'aide et d'escalade réécrites, deux nouveaux guides (vélo, défis sportifs), liens entre les guides.

### Vie privée et sécurité
- Dans un défi entre amis, ton nom et ta progression ne sont visibles que de tes amis et de la personne avec qui tu partages un lien d'invitation.
- Bloquer quelqu'un met fin à ce que vous partagiez dans vos défis respectifs.
- « Exporter toutes mes données » contient désormais toutes les familles de données du compte.

## Ce que cette version ne contient pas

- Les blasons Champion, Titan et Légende et les autres illustrations prévues (production bloquée, voir le registre, A4).
- L'ouverture de l'achat des abonnements : elle dépend de la mise en production des migrations, de la configuration serveur et d'une recette d'achat réelle.
- Une validation par de nouveaux utilisateurs : le protocole est prêt (`lot3-4-ux-android.md`), les tests restent à organiser.
