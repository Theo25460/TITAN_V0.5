# Concours de lancement « Les 20 premiers » — vidéo héro, fiche de publication, règlement

Créé le 24 novembre 2026. **Statut : vidéo prête ; rien n'est programmé ni publié.**

## 1. La vidéo

| Fichier | Usage |
| --- | --- |
| `production/out/HERO-les-20-premiers-play.mp4` | **Version principale** : « Disponible sur Google Play », 23,4 s, 1080 × 1920, son inclus |
| `production/out/HERO-les-20-premiers-web.mp4` | Variante de secours : « titan-app.fr », à utiliser si la fiche Google Play n'est pas publique |
| `…-sans-son.mp4` | Mêmes images sans la bande-son, pour poser un son tendance dans l'appli |
| `…-miniature.jpg` | Couverture (carte « 20 accès TITAN+ à vie ») |

Déroulé (coupes franches sur le tempo, 100 BPM) :

| Temps | Image | Texte à l'écran |
| --- | --- | --- |
| 0,0-2,4 s | La vallée de l'Aube, lent travelling avant | « Ce concours ne se gagne pas au hasard. » + étiquette « Concours de lancement · 20 places » |
| 2,4-4,2 s | Les forges d'Obsidienne | « Il se gagne à l'effort. Comme tout, dans TITAN Ascent. » |
| 4,2-7,8 s | Fond sombre, compteur 1 → 20, logo TITAN+ | « À gagner : 20 accès TITAN+ à vie. L'abonnement premium de TITAN Ascent. Offert. Sans tirage au sort. » |
| 7,8-10,2 s | Écran réel d'accueil | « Étape 1 sur 3 — Installe TITAN Ascent. Gratuit, sur Google Play. » |
| 10,2-12,6 s | Écran réel « Qu'as-tu fait ? » | « Étape 2 sur 3 — Enregistre une vraie séance. Course, muscu, escalade… 260 sports. » |
| 12,6-15,6 s | Écran réel « Séance confirmée +830 XP » | « Étape 3 sur 3 — TITAN confirme ta séance. Parmi les 20 premiers ? TITAN+ à vie. » |
| 15,6-18,6 s | 20 chevrons, le premier s'allume en orange | « 20 places. Pas une de plus. Premier arrivé, premier servi. » |
| 18,6-23,4 s | La citadelle des Aurores | « TITAN Ascent — Les 20 premiers gagnent TITAN+ à vie. [Disponible sur Google Play] Lien en bio. Gratuit, sans publicité. » + mention légale |

Codes TITAN utilisés : police Archivo (titres condensés, chiffres extra-condensés), double chevron, peintures des
mondes, couleurs par espace (cyan QG, citron Séance), orange du logo TITAN+ pour tout ce qui touche au lot, bouton
d'action au style du bouton principal de l'app. Les écrans de l'app sont réels (compte de démonstration, indiqué à
l'écran).

Bande-son : composition originale synthétisée pour cette vidéo (aucun échantillon, aucune musique tierce, donc aucun
droit à payer), calée sur les coupes, normalisée à −14 LUFS. **Je ne peux pas l'écouter : écoute-la une fois avant de
publier.** Si elle ne te plaît pas, utilise la version « sans son » et ajoute un son dans l'appli.

Régénérer : `cd marketing/production && ./build-ad.sh out play` (ou `web`).

## 2. Quatre vérifications avant de publier (bloquantes)

1. **La fiche Google Play est-elle publique ?** Ouvre
   `https://play.google.com/store/apps/details?id=fr.titanapp.app` en navigation privée, sans compte testeur. Si la
   fiche ne s'affiche pas, publie la variante `web` : annoncer « Disponible sur Google Play » serait faux. (Je n'ai
   pas pu le vérifier : play.google.com est bloqué depuis mon environnement, et le dépôt indique un test fermé.)
2. **TITAN+ « à vie » peut-il être activé ?** La table `premium_access` a bien un champ `is_lifetime` et une fonction
   d'administration pour l'attribuer. Teste-le sur un compte témoin : le site et l'app affichent encore « TITAN+ —
   Bientôt disponible ».
3. **Règlement** complété (crochets du §4) et accessible par un lien.
4. **Heure de début** notée : elle sert à désigner les gagnants.

## 3. Fiche de publication

- Quand : en ouverture de campagne, **jeudi 27/11 à 12:30** (TikTok), 12:45 (Reels), 13:00 (Shorts). Épingler la
  vidéo en haut des trois profils. La vidéo J1 part comme prévu à 18:30.
- Lien en bio pendant le concours (remplace le lien du site) :
  - TikTok : `https://play.google.com/store/apps/details?id=fr.titanapp.app&referrer=utm_source%3Dtiktok%26utm_medium%3Dsocial%26utm_campaign%3D20_premiers`
  - Instagram : même lien avec `utm_source%3Dinstagram`
  - YouTube : même lien avec `utm_source%3Dyoutube`
  - Variante web : `https://titan-app.fr/?utm_source=tiktok&utm_medium=social&utm_campaign=20_premiers`

**TikTok**

```
Ce concours ne se gagne pas au hasard : les 20 premiers à enregistrer une vraie séance dans TITAN Ascent gagnent TITAN+ à vie.

1. Installe TITAN Ascent (lien en bio, gratuit)
2. Enregistre une vraie séance
3. TITAN la confirme. Parmi les 20 premiers ? TITAN+ à vie est activé sur ton compte.

Conditions : 20 premiers nouveaux comptes créés à partir du [DATE], une participation par personne, séance réelle confirmée par TITAN. Pas de tirage au sort. TITAN+ ne donne aucun avantage de jeu. Règlement : [LIEN]. Opération non parrainée par TikTok.

#RallumeLeMonde #concours #sport #appsport #motivationsport
```

**Instagram** : même texte ; remplacer la dernière phrase des conditions par « Cette opération n'est ni parrainée, ni
gérée par Instagram, ni associée à Instagram. »

**YouTube Shorts** — titre : `20 accès TITAN+ à vie : ce concours se gagne à l'effort #shorts` · description : les
trois étapes + conditions + lien Google Play.

Suites prévues (à ne publier qu'avec les vrais chiffres) : « Il reste N places » (N = 20 − nombre de gagnants à
l'instant), puis « Les 20 places sont parties » le jour où c'est vrai.

## 4. Règlement (brouillon à compléter — ce n'est pas un avis juridique)

1. **Organisateur.** [Nom ou société, adresse], éditeur de TITAN Ascent. Contact : titanteam.app@gmail.com.
2. **Durée.** Du [date et heure de début, heure de Paris] jusqu'à l'attribution des 20 accès, et au plus tard le
   [date de fin].
3. **Participation.** Gratuite et sans obligation d'achat. Ouverte à toute personne pouvant créer un compte TITAN
   selon les conditions générales. Une seule participation par personne.
4. **Comment gagner.** Créer un compte TITAN après le début de l'opération, puis enregistrer une séance de sport
   réellement effectuée et confirmée par le serveur de TITAN. Les 20 premiers comptes, dans l'ordre chronologique de
   confirmation de leur première séance, gagnent. Il n'y a ni tirage au sort ni hasard.
5. **Lot.** Un accès TITAN+ à vie par gagnant, activé sur le compte gagnant, personnel, non cessible et non
   convertible en argent. « À vie » signifie : tant que TITAN et l'offre TITAN+ existent. TITAN+ ne donne aucun
   avantage de jeu (ni XP, ni crédits).
6. **Désignation.** L'horodatage du serveur fait foi. Les gagnants sont prévenus par e-mail à l'adresse de leur
   compte, et leur accès est activé, sous 7 jours.
7. **Fraude.** Séances fictives, comptes multiples ou automatisés : exclusion. Les règles anti-triche de TITAN
   s'appliquent.
8. **Données personnelles.** Seules les données du compte sont utilisées, pour désigner et prévenir les gagnants.
   Aucun nom n'est publié sans accord. Politique de confidentialité : https://titan-app.fr/legal_privacy
9. **Plateformes.** Opération ni parrainée ni gérée par TikTok, Instagram, YouTube ou Google. Aucune note ni aucun
   avis sur l'application n'est demandé ni récompensé.
10. **Divers.** L'organisateur peut suspendre l'opération en cas de force majeure ou de fraude massive. Droit français.

Choix fait par défaut : tout nouveau compte participe, qu'il vienne de l'app Android ou du site. Réserver le lot aux
installations Android demanderait un marqueur de plateforme sur la séance, que je n'ai pas vérifié.

## 5. Désigner les 20 gagnants (lecture seule)

```sql
with debut as (select timestamptz '2026-11-27 12:30:00+01' as t),      -- remplacer par le début réel
premiere as (
  select r.user_id, min(r.created_at) as premiere_seance
  from public.training_receipts r
  group by r.user_id)
select row_number() over (order by p.premiere_seance) as rang, u.id as compte, p.premiere_seance
from auth.users u
join premiere p on p.user_id = u.id
cross join debut d
where u.created_at >= d.t
order by p.premiere_seance
limit 20;
```

La requête ne renvoie que des identifiants de compte. Avant d'attribuer un lot, vérifier que le compte n'apparaît
pas dans `titan_suspicious_actions`. L'attribution elle-même est une écriture en production : elle se fait depuis ta
console d'administration, pas par moi sans ton accord explicite.

## 6. Points de vigilance

- **Google Play déconseille les installations « incitées »** (une récompense en échange d'une installation) et peut
  les écarter de ses classements. Ici le lot récompense une séance enregistrée, pour 20 personnes, sans jamais
  demander de note ni d'avis : le risque est faible, à condition de garder cette formulation.
- **Coût** : 0 € décaissé. Manque à gagner théorique maximal : 20 × 4,99 € = 99,80 € par mois si ces 20 personnes
  avaient toutes payé TITAN+ (prix prévu ; la console Play affiche 5,99 €).
- **Valeur perçue** : TITAN+ apporte des comparaisons sur 4, 12 ou 26 semaines, des bilans détaillés, 10 vues
  sauvegardées et 20 routines au lieu de 5. C'est un lot honnête mais modeste : la vidéo vend « premium, à vie,
  20 places », pas une liste de fonctions.
- Les trois comptes déjà actifs ne sont pas concernés par le concours (nouveaux comptes seulement). Leur offrir
  TITAN+ aussi serait un beau geste : c'est ta décision.
