# Bilan de séance : contexte de compte et focus — 18/10/2026

Lot de trois points : SEC03 / UX09 / QA13, exigences globales partielles.
Branche `codex/web-moment-context-focus-cdc`, parent PR #81,
`6363c72b5598f4e8b4a5312fb0e67032a70674a0`.

## Problème et correction

Le bilan après séance conservait son log et ses actions lors d’un changement de compte.
Une mise à jour remplaçait ses boutons et perdait le focus ; son focus initial différé pouvait
aussi remplacer un choix déjà fait par l’utilisateur. Le partage ouvert depuis ce bilan pouvait
perdre son point de retour si son déclencheur était remplacé pendant l’ouverture du brouillon.

TitanMoment capture maintenant propriétaire/client/époque à l’ouverture. Une ouverture sans
propriétaire ou pendant une transition est refusée. Les événements account-changing/changed
ferment le bilan ; un changement silencieux est également vérifié avant chaque action ou rendu.
Les anciens boutons retenus et mises à jour ne peuvent pas relancer le partage depuis ce bilan.
La fermeture retire les listeners et annule le focus différé. Le mode découverte reste autorisé.

Un rendu retrouve l’action ou le lien actif, avec repli vers Terminé si l’action a disparu, à
condition que le focus ait été perdu et que le bilan soit la fenêtre au premier plan. Le focus
initial différé ne remplace pas un autre choix. Le retour du partage retrouve le bouton courant
si le déclencheur natif a été remplacé, en respectant une nouvelle fenêtre ou un autre focus.

Les métriques, calculs d’XP/récompense, records, données de séance, API de partage et SQL sont intacts.
Le passage du reçu synthétique pending à confirmed reste rendu et ne déclenche qu’un refresh
Aventure comme auparavant ; ce test ne valide aucune attribution de récompense serveur.

## Preuves

- Baseline et final pnpm verify : 188/188 tests, build/audit sans erreur, 16 avertissements préexistants.
- RED initial : 8/11 nouveaux cas échouent sur parent, trois témoins passent.
- Assertion de retour du partage ensuite renforcée : RED séparé 1/1 sur parent.
- Premier GREEN : 11/12 ; le dernier échec provenait du test qui n’avait pas placé le focus
  dans la nouvelle saisie (diagnostic : bouton Fermer natif actif). Fixture corrigée explicitement,
  sans modification produit pour ce cas. Ajout de deux témoins : repli d’action supprimée et invité.
- GREEN : 40/40 navigateur ciblés (14 nouveaux +16 partage de Moment +10 retour des fenêtres).
- Régression réelle d’enregistrement de séances : 11/11 tests existants session save réussis, incluant écritures et interruption de transaction IndexedDB, mesures GPX et ouverture du bilan après sauvegarde durable. Total navigateur vérifié : 51/51.
- Revue indépendante en copie isolée : 30/30 tests (14 bilan +16 partage) réussis, aucun constat Critical/Important/Minor.
- git diff --check réussi.

Vrais TitanMoment et TitanShare imbriqués, historiques/reçus/propriétaires en mémoire simulés,
requêtes externes bloquées, horloge contrôlée pour les 30 ms. Cas de transition et conservation
d’actions aux largeurs 360/1280 px. Aucun compte réel, aucun partage ou appel d’écriture externe.

## Coordination et limites

Moment300.1 sur training.html et journal.html. Profil, profile.html, smoke partagé et chantier RPG
intacts. Le garde lie le bilan au contexte de son ouverture ; il ne certifie pas la provenance d’un
log arbitraire fourni par un appelant de confiance ni l’autorisation serveur. Transitions d’identité
simulées ; sessions authentifiées, révocation, RLS/backend réels, PWA installée/Android, autres moteurs,
lecteur d’écran réel, suite E2E entière et CI distante hors validation. Aucun merge ni déploiement.
