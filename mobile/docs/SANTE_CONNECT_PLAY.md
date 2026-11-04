# Santé Connect — ce que l'application déclare (à reporter dans la Play Console)

Statut : code et tests en branche, **non validé sur un téléphone, non déclaré dans la Play Console** (dépendance externe : essai sur un vrai téléphone, formulaire « Santé Connect » et « Sécurité des données » à remplir par le propriétaire).

## Permissions demandées (lecture seule)
- `android.permission.health.READ_STEPS` — pas quotidiens.
- `android.permission.health.READ_EXERCISE` — séances d'exercice (type, début, fin, titre).
Aucune autre : ni fréquence cardiaque, sommeil, poids, calories, position ni tracé. Aucune lecture en arrière-plan (`READ_HEALTH_DATA_IN_BACKGROUND` absente), aucune écriture. Le contrôle du paquet en CI refuse toute autre permission.

## Quand et comment
- Le joueur ouvre Profil → Santé Connect, lit l'explication, puis touche « Autoriser » : Android affiche son propre écran d'accord. TITAN ne lit rien tant que le joueur n'a pas accepté **et** touché un bouton de lecture.
- Fenêtre de lecture : les 7 derniers jours calendaires du téléphone.
- Pas : agrégat quotidien fourni par Santé Connect (qui fusionne les sources qui se recoupent). Enregistrés comme « activité quotidienne » ; ils ne créent ni séance, ni XP, ni crédit.
- Séances : proposées une par une avec une durée corrigeable ; l'import passe par la même fonction serveur que toute séance (plafonds, risque, retenue des récompenses) ; une séance qui recoupe une séance déjà au journal est rapprochée et comptée une seule fois.

## Données et vie privée
- Envoyé au serveur TITAN : par jour le nombre de pas ; par séance l'identifiant stable de l'enregistrement, le sport reconnu, l'heure de début et la durée. Rien d'autre.
- Jamais envoyé aux statistiques ou à la publicité (l'application n'en contient aucune).
- Retrait : « Arrêter la synchronisation » retire l'accord côté serveur et les autorisations côté Android ; « Archiver les séances importées » les retire du journal sans les supprimer. Suppression du compte : tout est effacé avec le compte.
- Texte de politique de confidentialité à compléter avant publication : section « Santé Connect » (`legal_privacy.html`), à relire par une personne humaine.

## Reste à faire (hors de portée de cette session)
1. Essai réel : un téléphone avec Santé Connect et des données (pas, une séance de course).
2. Déclaration Play Console : formulaire des autorisations Santé Connect (justification ci-dessus) et section « Sécurité des données ».
3. Binaire conforme : compilation signée par la CI Android, publication au test fermé sur décision du propriétaire.
