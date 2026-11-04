# Backlog de finition — 18 octobre 2026

Ce document sépare les finitions facultatives des obligations encore ouvertes du cahier. Il ne crée aucune exigence. Une finition ne bloque pas le passage au macro-bloc suivant. Revenir dessus seulement avec un besoin concret, un lot pertinent ou un défaut important confirmé.

## NON BLOQUANT – BACKLOG FINITION

| Sujet constaté | Décision | Condition de reprise |
| --- | --- | --- |
| 16 avertissements préexistants de l’audit public (métadonnées et titres/h1) | Conserver le diagnostic ; aucune erreur de build/audit. | Lot éditorial ou visibilité publique, sans détourner le RPG. |
| Variantes rares de focus, présentation ou confort non couvertes au-delà des scénarios actuels | Ne pas ouvrir une nouvelle série de PR écran par écran. Aucun nouveau défaut fonctionnel confirmé par ce checkpoint. | Retour utilisateur reproductible ou modification substantielle de l’écran. |
| Répétition des audits transversaux UX | Le checkpoint constitue le contrôle borné de cette phase. | Régression, changement commun substantiel ou risque concret nouveau. |

## Obligations toujours ouvertes — pas des finitions facultatives

- **A08** : les contrôles actuels analysent la syntaxe JavaScript et les assets ; ils ne constituent pas un contrôle statique de types. Une solution de typage proportionnée reste à réaliser avant les prochains changements à risque ; aucun déploiement de type-check n’est revendiqué ici.
- **QA05** : recette Android et appareils/PWA installés ; Chromium avec viewport mobile ne vaut pas preuve sur Android.
- **Sécurité et comptes** : les scénarios synthétiques et tests SQL ne remplacent pas la recette Auth/synchronisation et autorisation de bout en bout avec comptes dédiés. Les exigences concernées gardent leur statut.
- **Profil** : coordonner les références de scripts anciennes signalées par les handoffs #74 et #87 avec le chantier réservé ; ne pas réécrire son fichier dans ce lot. À vérifier dans sa recette d’intégration, sans présumer d’une régression critique actuelle.
- **Juridique, store, paiements et récompenses** : conserver les exigences et validations finales du cahier ; aucune obligation légale ni contrôle d’isolation ne passe dans le backlog cosmétique.

## EXIGENCE OU MACRO-BLOC SUIVANT

Progression/RPG, en commençant par récupérer le livrable du chantier **RPG01** et clarifier son handoff contradictoire (`STATUT [x]`, note `EN COURS`). Les deux documents d’audit annoncés ne sont pas dans la chaîne #94 ; la recherche des PR intitulées RPG/audit/progression n’a pas retrouvé leur livraison. Ne pas relancer un audit web général et ne pas écraser les fichiers réservés.

Le lot suivant choisira trois points du cahier, dont au moins deux ferment une exigence partielle ou avancent directement ce macro-bloc. Il s’appuiera sur les critères produit déjà demandés, avant d’ajouter ennemis, cartes ou récompenses.
