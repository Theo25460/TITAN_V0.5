# V1.1 — analyse et aperçu GPX

Suite de la PR #118, base `4fe0aa0f69b66a784818472e1a67eee4f203e590`, branche `codex/v11-gpx-analysis-20261029`. Exigences avancées : GPX-01/02/04, REC-05 et partie locale REC-08. Aucune modification de production, migration, secret ou client Android.

## Comportement sur branche

L'import existant propose maintenant un aperçu schématique du parcours sans service cartographique externe, un profil altimétrique et les temps par kilomètre lorsque le fichier le permet. Le Journal conserve les chiffres et le profil après sauvegarde/rechargement. Le tracé précis n'est envoyé ni au serveur ni aux analytics ; ses coordonnées ne sont pas conservées dans le brouillon. Le profil enregistré contient uniquement distance cumulée, altitude et identifiants de fragments.

Le lecteur distingue traces enregistrées et routes prévues. Une route prévue reste une route même avec des heures de passage planifiées. Sans temps complet/cohérent, aucune durée sportive ni vitesse n'est inventée ; sans altitude, le dénivelé reste absent. Les traces trop espacées pour évaluer le temps actif indiquent cette indisponibilité. Un itinéraire ne peut pas enregistrer automatiquement une séance ou générer de l'XP. Retour explicite vers une saisie manuelle gratuite, toujours accessible, y compris pour un ancien brouillon GPX.

Les segments distincts ne sont pas reliés par une distance ou un dénivelé fictifs. Un point GPS manifestement incohérent est ignoré puis la lecture reprend au dernier point valide. Les coupures d'altitude sont préservées dans le profil. Le dénivelé est une estimation lissée issue du fichier, jamais annoncé corrigé par DEM/baromètre ni certifié. Les chiffres du fichier d'origine sont distingués des corrections manuelles de la séance.

Lecture bornée à 15 Mo, 100 000 points et 160 fragments ; aperçu à 320 points et profil à 160 échantillons. XML tronqué, attributs mal formés et déclarations d'entités refusés ; les extensions fournisseur ne deviennent pas artificiellement des champs GPX. Import, brouillon et sauvegarde protègent les changements de compte et les réponses tardives. Aucune récompense, formule d'effort ou autorisation serveur modifiée.

## Validation

- **388 tests unitaires** : lecteur, ancien contrat GPX et reste du site. Typecheck, build, audit de publication et contrôle de release verts.
- **20 tests navigateur ciblés** : cinq parcours GPX, cinq saisies endurance, six parcours Journal et quatre tests GPX de la suite smoke. Ils couvrent notamment aperçu à 360 px sans débordement, route sans temps bloquée, retour manuel, réimport sans valeurs périmées, ancien brouillon, changement de compte, profil dans le Journal et absence de coordonnées sauvegardées.
- Revue indépendante : anciens brouillons bloqués, attributs XML mal formés et champs issus d'extensions corrigés avec tests rouges puis verts. Aperçu relu visuellement à 360 px.
- Pas de PASS de la suite navigateur globale, de recette Safari/iPhone réel, Android ou capture GPS native revendiqué.

## Limites et reprise

GPX-01/02/04 restent **partiellement réalisés**, pas clôturés : manquent fond cartographique, coloration par allure/pente, correction d'altitude externe, stockage/export consenti de traces, routes favorites/comparaisons, déduplication serveur entre fichiers/Garmin/Health Connect, et formats FIT/TCX. Le fichier importé reste non vérifié ; le backend garde l'autorité sur l'effort et les récompenses. FIN-CHEAT, FIN-SEC et FIN-SEO restent différés selon le cahier. Préserver la PR #118 et intégrer les deux lots dans l'ordre après validation, sans publier la V1.1 prématurément.
