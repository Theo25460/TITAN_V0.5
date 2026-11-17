/* Before Android asks, TITAN explains (V12-08): the system prompt is the one thing the app cannot restyle, so it is never the first thing
   the person reads. Each text says what is read, what it is for, and where it goes: a GPS trace is saved privately to the account (routes, AUD-01). */
export const PERMISSION_COPY = {
  steps: { title: "Compter tes pas", message: "TITAN lit le compteur de pas de ton téléphone pour afficher tes pas du jour, en direct. Rien ne quitte ton téléphone.\n\nAndroid va te demander l’autorisation « activité physique ».", confirmLabel: "Continuer" },
  location: { title: "Suivre ta sortie en GPS", message: "TITAN a besoin de ta position, seulement pendant l’enregistrement, pour mesurer distance, allure et dénivelé. Ta trace est enregistrée sur ton compte, en privé : toi seul la vois.\n\nAndroid va te demander l’autorisation de localisation.", confirmLabel: "Continuer" },
  notifications: { title: "Recevoir tes rappels", message: "TITAN peut te rappeler une séance ou t’envoyer ton récap de la semaine, aux jours et heures que tu choisis. Rien n’est envoyé par un serveur.\n\nAndroid va te demander l’autorisation d’afficher des notifications.", confirmLabel: "Continuer" },
} as const;
