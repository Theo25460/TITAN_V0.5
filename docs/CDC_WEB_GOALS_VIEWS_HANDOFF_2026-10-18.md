# Objectifs : accès aux archives et vues — 18/10/2026

Trois points du cahier vivant : UX07 / UX09 / QA13. UX07 passe de non engagé à partiellement
engagé pour ce périmètre de découverte des archives ; aucune exigence globale n’est terminée.
Branche `codex/web-goals-views-cdc`, parent PR #82,
`f6e2ee8256a47cc6276243460fdb427df0d7b0ba`.

## Problème et résultat

L’accès aux archives était en bas de page, via un bouton dont le libellé changeait. Un objectif
créé depuis les archives était enregistré mais restait invisible dans la vue affichée.

Deux boutons permanents « Mes objectifs » et « Archives (N) » précèdent maintenant les résultats.
Ils réemploient le composant asc-seg existant, indiquent leur sélection par aria-pressed et
désignent le conteneur de résultats par aria-controls. Mes objectifs contient les objectifs
non archivés, avec la section Terminés conservée ; Archives ne contient que les archives.
L’état vide conserve ces accès et le bouton de création.

Le changement de vue et les rendus retrouvent le bouton actif sans prendre le focus d’une
fenêtre ou d’un contrôle extérieur. Archiver/restaurer retrouve le contrôle de la vue courante.
Après création réussie depuis Archives, Mes objectifs est sélectionné et le titre de l’objectif
créé reçoit le focus. Ajuster une archive conserve Archives et cible le titre enregistré.
L’annulation et l’échec de sauvegarde conservent la vue et les données ; une reprise réussie
rend l’objectif créé visible. Une nouvelle fenêtre ou un focus déjà établi reste prioritaire.

Aucune nouvelle préférence persistée ni aucun filtre métier ajouté. Sauvegarde, révision,
limites, progression, archive/restauration serveur et presets de dates restent inchangés.
Aucun CSS nouveau : classes et DA existantes réemployées.

## Preuves

- Baseline pnpm verify : 188/188, build/audit sans erreur, 16 avertissements préexistants.
- RED initial : 8/8 nouveaux contrats de vues échouent sur le parent, contrôles absents.
- Reproduction dédiée avec l’ancien contrôle Archives : objectif enregistré mais invisible,
  assertion de visibilité en échec avant correction.
- Premier GREEN : 8/8. Ajout d’un neuvième cas d’échec local puis reprise depuis Archives.
- Validation finale : pnpm verify, 188/188 et build/audit sans erreur (16 avertissements préexistants) ; 24/24 tests navigateur (9 vues +9 validation +6 calendrier).
- Revue indépendante en copie isolée : build et 24/24 tests réussis, aucun constat Critical/Important/Minor ; capture mobile inspectée sans débordement des nouveaux contrôles.
- Inspection visuelle : les deux vues inspectées à 360 et 1280 px, quatre captures temporaires ; contrôles placés avant les résultats, texte lisible et absence de débordement horizontal dans les cas testés.

Neuf scénarios : état et position des vues, clavier/focus/compteurs et séparation des listes,
création depuis Archives puis rechargement, archivage/restauration et révisions, ajustement
d’archive, annulation, état vide, rendu de fond avec focus extérieur/fenêtre et panne locale
avec brouillon conservé puis reprise. Cas principaux aux largeurs 360/1280 px ; localStorage
invité et vrais formulaires/confirmations. Seule la panne de stockage est injectée.

## Coordination et limites

Objectifs300.3 sur objectifs.html. Profil, profile.html et smoke partagé intacts. Aucun compte
réel, appel backend, modification SQL/RLS, changement de règle ou de récompense/XP. Transitions
de compte, autorisation serveur, synchronisation réelle, autres moteurs, lecteur d’écran réel,
PWA installée/Android, suite E2E entière et CI distante non validés. Aucun merge ni déploiement.
