/* Turns Supabase, PostgREST, Postgres and network failures into short, honest French messages. */
export type AppError = { code: string; message: string; network: boolean; permanent: boolean; raw?: unknown };

const MESSAGES: Record<string, string> = {
  "Invalid login credentials": "E-mail ou mot de passe incorrect.",
  "Email not confirmed": "Confirme d’abord ton adresse e-mail grâce au lien reçu, puis reconnecte-toi.",
  "User already registered": "Un compte existe déjà avec cette adresse. Connecte-toi ou réinitialise ton mot de passe.",
  AUTH_REQUIRED: "Ta session a expiré. Reconnecte-toi pour continuer.",
  PROFILE_UNAVAILABLE: "Ce compte n’est pas disponible pour le moment.",
  ACCOUNT_UNAVAILABLE: "Ce compte n’est pas disponible pour le moment.",
  PROFILE_VERSION_CONFLICT: "Ton profil a changé sur un autre appareil. Les données ont été actualisées : réessaie.",
  ADVENTURE_CONFLICT: "Ta progression a changé sur un autre écran. Actualise puis réessaie.",
  QUEST_INCOMPLETE: "La mission n’est pas encore terminée.",
  GUARDIAN_EFFORT_INCOMPLETE: "Le gardien attend encore de l’effort : 90 minutes au plus sont comptées par jour.",
  AVATAR_LOCKED: "Ce personnage se débloque à un prochain niveau.",
  TITAN_PLUS_REQUIRED: "Cette région n’est pas encore ouverte gratuitement sur le serveur. Tes acquis sont conservés.",
  INSUFFICIENT_CREDITS: "Crédits insuffisants pour cet objet.",
  NOT_ENOUGH_CREDITS: "Crédits insuffisants pour cet objet.",
  PURCHASE_LIMIT_ONCE: "Tu possèdes déjà cet objet.",
  ITEM_NOT_OWNED: "Cet objet n’est pas encore dans ta collection.",
  TRAINING_DATE_OUT_OF_RANGE: "La date de la séance est hors des limites acceptées.",
  TRAINING_VALUE_OUT_OF_RANGE: "La valeur saisie est hors des limites acceptées.",
  TRAINING_DURATION_OUT_OF_RANGE: "Une séance dure au maximum 24 h.",
  EVENT_CONTENT_CONFLICT: "Cette séance a déjà été envoyée avec un contenu différent.",
  REVISION_CONFLICT: "Cette séance a été modifiée ailleurs. Actualise puis réessaie.",
  SESSION_VERSION_CONFLICT: "Cette séance a changé sur un autre appareil. Actualise le journal puis recommence.",
  EXERCISE_VOLUME_READ_ONLY: "Le volume d’une séance d’exercices se corrige série par série.",
  EXERCISES_INVALID: "Garde entre 1 et 30 exercices.",
  SETS_INVALID: "Chaque exercice garde entre 1 et 30 séries.",
  SET_INVALID: "Une série a une charge ou un nombre de répétitions invalide.",
  RIR_INVALID: "Le RIR va de 0 à 10, ou reste vide.",
  DURATION_INVALID: "La durée va de 1 minute à 24 heures.",
  EXTRAS_INVALID: "Un détail d’escalade n’est pas valide.",
  SESSION_INVALID: "Une valeur n’est pas valide pour cette séance.",
  TRAINING_RATE_LIMIT: "Beaucoup de séances ou de modifications en peu de temps. Réessaie dans un moment.",
  FRIEND_CODE_NOT_FOUND: "Aucun profil trouvable avec ce code. Ton ami doit rendre son profil trouvable dans la confidentialité.",
  INVALID_FRIEND_CODE: "Le code ami ressemble à TN-XXXX.",
  CANNOT_ADD_SELF: "C’est ton propre code ami.",
  CHALLENGE_INVALID: "Vérifie la mesure, l’objectif et la durée du défi (1 à 31 jours).",
  CHALLENGE_INVITEES: "Invite entre 1 et 10 amis.",
  MOMENT_INVALID: "Ce moment ne peut pas être partagé.",
  NO_FUNDS: "Crédits insuffisants pour cet objet.",
  NOT_FOR_SALE: "Cet objet se débloque autrement qu’avec des crédits.",
  NOT_OWNED: "Cet objet n’est pas encore dans ta collection.",
  ACCOUNT_SUSPENDED: "Ce compte est suspendu.",
  TRAINING_REVISION_CONFLICT: "Cette séance a été modifiée ailleurs. Actualise puis réessaie.",
  RATE_LIMITED: "Trop d’actions en peu de temps. Patiente un instant puis réessaie.",
};

function text(e: unknown): string {
  if (!e) return "";
  if (typeof e === "string") return e;
  const o = e as { message?: unknown; error_description?: unknown; msg?: unknown };
  return String(o.message ?? o.error_description ?? o.msg ?? "");
}

export function isNetworkError(e: unknown): boolean {
  const m = text(e);
  const name = (e as { name?: string })?.name;
  return (
    name === "AbortError" ||
    name === "TimeoutError" ||
    /Network request failed|Failed to fetch|NetworkError|network|timeout|timed out|AuthRetryableFetchError|fetch failed|ECONN|ENOTFOUND/i.test(m) ||
    (e as { status?: number })?.status === 0
  );
}

export function toAppError(e: unknown): AppError {
  const raw = e;
  const m = text(e);
  const code = String((e as { code?: unknown })?.code ?? "");
  if (isNetworkError(e)) return { code: "NETWORK", message: "Connexion indisponible. Vérifie ton accès à Internet puis réessaie.", network: true, permanent: false, raw };
  const status = (e as { status?: number })?.status;
  if (status === 429 || /rate limit|too many/i.test(m)) return { code: "RATE_LIMITED", message: MESSAGES.RATE_LIMITED, network: false, permanent: false, raw };
  for (const key of Object.keys(MESSAGES)) if (m.includes(key)) return { code: key, message: MESSAGES[key], network: false, permanent: true, raw };
  if (/JWT expired|invalid JWT|refresh token/i.test(m)) return { code: "AUTH_REQUIRED", message: MESSAGES.AUTH_REQUIRED, network: false, permanent: false, raw };
  if (code === "PGRST202" || /Could not find the function/i.test(m)) return { code: "UNAVAILABLE", message: "Cette fonction n’est pas encore disponible sur le serveur TITAN.", network: false, permanent: true, raw };
  if (/Password should be at least|weak password/i.test(m)) return { code: "WEAK_PASSWORD", message: "Mot de passe trop faible : 8 caractères minimum, avec lettres et chiffres.", network: false, permanent: true, raw };
  const permanent = ["22023", "22P02", "23514", "23505", "42501", "P0001"].includes(code);
  return { code: code || "UNKNOWN", message: "L’opération n’a pas pu aboutir. Réessaie dans un instant.", network: false, permanent, raw };
}

export const errorMessage = (e: unknown) => toAppError(e).message;
