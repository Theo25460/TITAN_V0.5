# Audit progression RPG — finalisé le 18 octobre 2026

Ce livrable termine le chantier annoncé le11/10, dont les documents et la branche n’ont pas été retrouvés. Il ne prétend pas avoir été publié à cette date. Périmètre : moteurs/catalogue/règles serveur versionnés, QG et Aventure ; aucun nouvel audit transversal web, aucune observation de comptes réels ou étude de ressenti utilisateur.

Référence de départ : checkpoint95, HEAD publié26a9caf64d169777252ad9fde8cd9f9df825be09 ; arbre7cc1b741957e273f64589860b0357d39de8112c9. La doctrine du cahier actuel prime sur l’ancien document ASCENSION_300.md.

## Ce qui progresse aujourd’hui

| Couche | Règle observée | Source |
| --- | --- | --- |
| XP et rang | Effort normalisé, courbe500×L^1,3 ; plafonds1800/jour et9600/semaine dans la version300. | js/core/effort.js, migration20261005160000_ascension_progression_v300.sql |
| Maîtrise et cadence | Pratique par discipline, durée/semaines ; cadence hebdomadaire et pauses. | js/core/progress.js |
| Campagnes | Quatre régions, neuf chapitres chacune ; même suite de cibles1,2,2,2,3,2,3,3,3. Deux régions gratuites, deux réservées à Titan+ dans le catalogue et les actions serveur actuelles. | js/renaissance-catalog.js, migration Ascension |
| Balises | Un jour admissible par date dans le chapitre ; séance enregistrée après son départ et date locale admissible. Le chemin Observation exige une note d’au moins10 caractères. | titan_adventure_evidence, guestSnapshot dans renaissance-engine.js |
| Gardien | Au chapitre9 : trois jours et150 minutes d’effort, avec90 minutes au plus comptées par jour. | migration Ascension, renaissance-engine.js |
| Récompenses | Validation explicite d’un chapitre, insigne cosmétique persistant ; pas d’XP/crédits supplémentaires attribués par le bouton de balise. Les gains de séance restent séparés. | titan_adventure_action, app/aventure.js |

Les cibles représentent21 contributions de jours de chapitre par campagne. Cela ne garantit pas21 dates calendaires différentes : le compteur repart au chapitre suivant et de nouvelles séances sont possibles. Aucune durée réelle de campagne n’est promise par cette somme.

Exemple reproductible : trois jours de30 minutes donnent90/150 minutes au gardien, donc les jours seuls ne suffisent pas ; cinq jours de30 minutes ou trois de50 satisfont les deux cibles. Trois jours de volume très élevé restent plafonnés à90 minutes/jour pour cet effort. Ces exemples illustrent les règles actuelles, sans recommandation d’entraînement.

## Pourquoi la progression peut paraître faible

Constats de code, à distinguer d’une validation du ressenti :

1. **Une séance antérieure au départ n’avance pas la première balise.** Elle reste au journal et peut avoir ses propres gains. Sans explication au départ, l’utilisateur peut croire qu’elle a été ignorée.
2. **Le QG affichait seulement les jours du chapitre.** Au gardien,3/3 pouvait remplir la barre alors que40/150 minutes ne permettaient pas la validation. Écart concret de lecture corrigé dans ce lot par un lecteur partagé des objectifs.
3. **La campagne répète surtout un compteur de jours.** Les textes et insignes changent, mais les conditions des36 chapitres suivent la même série. Le catalogue n’implémente pas encore des rencontres et mini-quêtes variées, des boss narratifs en phases ou une difficulté adaptée au profil.
4. **La récompense de campagne attend une action explicite.** Le sport peut avancer les compteurs sans allumer automatiquement la carte ; la relation séance → objectifs → validation → insigne mérite d’être expliquée.
5. **La pratique supplémentaire d’un même jour ne crée pas un jour de chapitre supplémentaire.** Elle peut contribuer à l’effort du gardien et à d’autres couches ; cela rend nécessaire une lecture claire des deux objectifs, pas un compteur fictif.
6. **Deux régions restent payantes.** C’est un écart identifié à la doctrine actuelle qui demande une campagne et des boss toujours battables sans payer. L’autorisation d’accès est aussi serveur : enlever seulement un verrou visuel serait incomplet.
7. **Pas d’adaptation des cibles au profil, ni d’endgame renouvelable décrit par le moteur de campagne actuel.** Les identifiants/chapitres et preuves existants sont des points d’extension à conserver ; ne pas ajouter une seconde progression divergente.

Le script tools/simulate-progression.mjs utilise encore des formules historiques v101 (2200×L^1,18). Il n’est pas utilisé comme preuve chiffrée de la progression300. Les données ci-dessus viennent des modules et migrations versionnés, pas d’une hypothèse sur la version actuellement déployée.

## Décisions de ce lot — RPG01 / RPG15 / RPG17

- RPG01 : audit borné finalisé avec sources, constats et ordre de travail. Il ne certifie pas l’équilibrage ou le ressenti auprès d’utilisateurs réels.
- RPG15 : un lecteur commun des objectifs du snapshot alimente QG et Aventure. Les deux conditions du gardien et le reste à accomplir sont visibles ; une règle d’effort absente du serveur historique n’est pas inventée. Les règles et récompenses restent intactes.
- RPG17 : guide au départ de campagne, utilisant l’espace existant ; sport libre, début du comptage, validation des balises, gains de séance séparés des insignes et découverte/serveur expliqués. Pas de nouvel écran ou d’étape obligatoire du premier onboarding.

## BLOQUANT À CORRIGER MAINTENANT

Aucun nouveau Critical/Important confirmé dans ce lot après tests et revue. Les conditions serveur, l’économie, les droits et la vérité des performances ne sont pas changés. Les lacunes de campagne ci-dessus restent des travaux produit explicites à traiter avant de déclarer le macro-bloc RPG achevé.

## NON BLOQUANT – BACKLOG FINITION

Les variantes de présentation et les16 avertissements éditoriaux existants ne bloquent pas la suite. Pas de nouveau cycle de micro-améliorations du QG/Aventure.

## EXIGENCE OU MACRO-BLOC SUIVANT

**RPG02 / RPG04 / RPG08** : concevoir la première zone comme une aventure avec mini-quêtes et objectifs adaptés au profil, en conservant les preuves de séance et des gains plafonnés. Résoudre explicitement le verrou Titan+ de la campagne au niveau client et serveur ; les insignes/chapitres existants doivent être conservés. La définition des combats/récompenses mérite une conception et des tests serveur propres, sans modifier arbitrairement l’équilibre dans un lot de lecture des objectifs.
