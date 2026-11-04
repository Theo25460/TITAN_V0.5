# Carte d’athlète publique : reprise réseau

18/10/2026 — lot UX06 / QA08 / QA13, exigences globales maintenues `[~]`.
Branche : `codex/web-athlete-recovery-cdc`, empilée sur PR #90 (`fc7e003cff740514f5bdc9950d9167faf2fd0773`).

La carte publique annonçait qu’elle reviendrait avec la connexion sans écouter la reconnexion. Une panne temporaire se terminait par le même message qu’une carte absente, sans action de reprise ; le délai dépendait du transport supportant AbortSignal.timeout.

Les erreurs temporaires et le mode hors ligne proposent maintenant Réessayer. L’entrée hors ligne ne lance aucune requête ; le retour réseau relance une seule lecture lorsque la carte est dans un état récupérable. Une carte chargée, absente ou indisponible avant la mise à jour serveur ne déclenche pas de lecture sur online. Les appels simultanés sont sérialisés. Un délai local de 12 secondes termine aussi une promesse qui ignore l’annulation ; pas de boucle de retry ni de polling.

Le passage hors ligne annule la requête en cours ; popstate annule et charge le nouveau lien. Réponse et focus restent liés au slug, au client et à la requête courante. Les anciennes continuations ne réécrivent pas la nouvelle carte. Un statut persistant est extérieur à la zone occupée. Après une reprise au clavier, le focus rejoint la nouvelle carte ou le nouveau bouton Réessayer, en respectant un autre contrôle et un dialogue ouverts entre-temps.

Le rendu publié, les sports/maîtrises, totaux, distinctions et échappement de texte sont conservés. Le RPC titan_public_card et ses paramètres restent identiques. Aucune règle de publication/visibilité ni aucun calcul ne change. Ressource Athlete 300.1 ; script ajouté à test:e2e. Profil et smoke.e2e.mjs non modifiés.

## Vérification

- RED : deux cas ciblés reproduisent l’absence de reprise et un RPC envoyé à l’entrée hors ligne.
- Review : un P2 sur le focus de Réessayer hors ligne est reproduit par un test rouge, corrigé puis vérifié indépendamment. La même branche de récupération couvre le client pas encore prêt.
- GREEN : 16/16 tests navigateur sur l’écran réel, réponses synthétiques. Panne/retry au clavier à 360/1280 px, reconnexion sans doublon, timeout avec transport ignorant abort, carte absente/RPC absent, lien invalide, clics concurrents, annulation et réponse tardive, changement de lien, focus extérieur/dialogue, échappement et contenu publié existant, retry hors ligne/client absent.
- pnpm verify : 188/188 tests de base, 62 scripts analysés, build 103 fichiers offline ; audit 0 erreur, 16 avertissements préexistants.
- Contrôle visuel erreur, attente et réussite à 360/1280 px ; aucune nouvelle CSS. git diff --check.
- Review finale indépendante : aucun constat concret restant ; reproductions ciblées exécutées, suite entière non relancée par le reviewer.

## Limites

Aucun compte réel ni écriture backend. Tests Chromium synthétiques, sans lecteur d’écran réel, autres moteurs, Android/PWA installé, suite E2E entière ou CI distante. La validation du contrat serveur et des politiques de visibilité reste hors périmètre. Un changement silencieux de l’instance client pendant une lecture est rejeté ; config.js initialise actuellement ce client une seule fois. Aucun merge ni déploiement.
