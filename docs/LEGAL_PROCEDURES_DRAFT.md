# Brouillons de procédures de conformité (LEG26, LEG30, LEG32, LEG33)

**Brouillon technique de travail rédigé à partir du comportement réel du code et de la configuration lue (19–20/10/2026). Ce n'est pas un avis juridique, rien ici n'est publié, et chaque point marqué « à valider » demande une personne compétente.** Les noms de personnes, adresses de contact, délais légaux et clauses contractuelles ne sont volontairement pas inventés.

## 1. Registre des activités de traitement — squelette (LEG26)

Une ligne par traitement. Colonnes renseignées à partir du dépôt ; **base légale, durée et destinataires contractuels : à valider** (voir `docs/PRIVACY_TECHNICAL_INVENTORY.md` §3 pour les tables et `docs/DATA_RETENTION.md` pour les durées proposées).

| Traitement | Données | Finalité | Où | Sous-traitants | Base légale | Durée |
|---|---|---|---|---|---|---|
| Compte et authentification | e-mail, identifiant, mot de passe (haché par le fournisseur d'authentification) | créer et protéger le compte | Supabase (région eu-west-1, Irlande) | Supabase | à valider | à décider (Q-002) |
| Séances sportives | sport, valeur, durée, distance, dénivelé, notes, tracé GPS éventuel | fonction principale | Supabase | Supabase | à valider | tant que le compte existe ; effacées à la suppression |
| Progression, économie, boutique | XP, crédits, niveau, achats, journal d'économie | jeu, équité | Supabase | Supabase | à valider | journal immuable : à décider |
| Paiement TITAN+ | événements de facturation, identifiants d'abonnement | accès Premium | Supabase (copie locale) ; paiement chez Paddle | Paddle | à valider | 13 mois (copie locale, contenu vidé à la suppression du compte) |
| Social | amis, guildes, messages, moments, carte publique | fonctions sociales choisies | Supabase | Supabase | à valider | à décider |
| Anti-triche et modération | signaux de risque, décisions, recours, retenues de récompense, journal d'administration | équité, sécurité | Supabase (schéma privé) | Supabase | à valider (intérêt légitime ?) | signaux 12 mois ; décisions et recours 24 mois ; journal d'administration 12 mois ; retenues réglées 3 mois |
| Mesure d'audience | nom d'événement, page, source, métadonnées minimales | amélioration du produit | Supabase | Supabase | consentement ou refus respecté dans l'application | 13 mois, purge exécutée |
| Assistance | message, catégorie, adresse de réponse | répondre aux demandes | Supabase ; envoi de l'alerte par Resend | Resend | à valider | 6 mois (paiement 13 mois, droits 12 mois) |
| Hébergement et diffusion | adresses IP, requêtes | servir le site | Netlify | Netlify | à valider | journaux de l'hébergeur : à confirmer |

## 2. Transferts de données hors de l'Espace économique européen (LEG30)

Faits établis : le projet Supabase est en `eu-west-1` (lu le 20/10/2026). **Non établis, à confirmer auprès de chaque fournisseur** : localisation des journaux et des sauvegardes, siège et sous-traitants ultérieurs de Netlify, Paddle (vendeur officiel), Resend ; garanties de transfert (décision d'adéquation, clauses contractuelles types) ; emplacement du serveur de fonctions.

| Flux | Pays à confirmer | Données | Garantie à documenter |
|---|---|---|---|
| Navigateur → Netlify (diffusion, fonctions) | à confirmer | IP, requêtes ; contenu des demandes d'assistance et événements de facturation traités par les fonctions | à valider |
| Fonction → Resend | à confirmer | adresse de réponse et texte saisis dans une demande d'assistance | à valider |
| Navigateur → Paddle | à confirmer | données de paiement saisies chez Paddle (jamais chez TITAN) | à valider |
| Application → Supabase | UE (Irlande) | toutes les données du compte | région confirmée ; sauvegardes et assistance du fournisseur : à confirmer |

Action : demander à chaque fournisseur sa page de transferts / son addendum de traitement et en consigner la version et la date ici.

## 3. Procédure d'exercice des droits (LEG32)

Moyens techniques réellement en place :
- **Accès / portabilité** : fonction `export_own_data` (bouton dans Profil) : export du compte par la personne elle-même.
- **Suppression** : fonction `delete_own_account` (Profil > Supprimer mon compte), effacement des données du compte, séances, brouillons locaux et transmission des guildes ; contrôlé par test (aucune référence résiduelle au compte supprimé). Ce qui est conservé et pour combien de temps reste à fixer (Q-002).
- **Rectification** : modification du profil et des séances dans l'application.
- **Opposition à la mesure** : le refus dans l'application arrête l'envoi.
- **Limitation, décisions automatisées** : aucune décision automatique n'a d'effet sur une personne (le score de risque informe seulement un administrateur ; un recours existe, serveur et onglet administrateur ; formulaire joueur à faire).

À définir par une personne compétente : adresse de réception des demandes, vérification d'identité proportionnée (demande depuis le compte connecté, sinon pièce justificative minimale), délai de réponse et de prolongation, registre des demandes (date, nature, réponse), modèle de réponse.

## 4. Violation de données personnelles (LEG33) — déroulé interne proposé

1. **Détecter** : alerte de l'équipe, signal d'un fournisseur, rapport d'un utilisateur ou d'un chercheur ; ouvrir un dossier horodaté (registre des incidents).
2. **Contenir** : révoquer et renouveler les secrets concernés (procédure : `docs/SECRETS_ROTATION_PLAN.md`), suspendre l'accès fautif, conserver les journaux utiles.
3. **Qualifier** : quelles données, combien de personnes, confidentialité / intégrité / disponibilité atteintes, données sensibles (santé, localisation) ou mineurs concernés, risque pour les personnes.
4. **Notifier** : si le risque pour les personnes est établi, notification à l'autorité de contrôle compétente **dans les 72 heures après en avoir pris connaissance** (règle du RGPD, à confirmer avec la personne compétente) ; information des personnes si le risque est élevé ; informer les stores si leurs règles l'exigent.
5. **Corriger et apprendre** : correctif, test de non-régression, note d'incident, mise à jour du registre.

À désigner : responsable de l'incident, contact de l'autorité, modèle de notification, tenue du registre des incidents.

## À valider par un humain compétent
Base légale de chaque traitement, durées, garanties de transfert, désignation d'un DPO ou non (LEG35), nécessité d'une AIPD (LEG34), textes publics (LEG28, LEG16, LEG18), délais et modèles ci-dessus.
