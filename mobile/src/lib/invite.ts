/* Invitations that a non-user can follow (AUD-11/AUD-12). A shared code always travels with an https link to the website's
   community page: with the app installed and the App Link verified, Android opens TITAN on the right tab with the code filled in;
   otherwise the website opens with the same code pre-filled. The code stays in the text too, so a copied message still works.
   Nothing here grants anything: the server still checks the code, consent ("Profil trouvable") and blocks. */

export const INVITE_ORIGIN = "https://titan-app.fr";

const FRIEND_CODE = /^TN-[A-Z0-9]{4,10}$/;
const GUILD_CODE = /^G-[A-Z0-9]{4,10}$/;

const clean = (raw: unknown) => (typeof raw === "string" ? raw.trim().toUpperCase() : "");

export const isFriendCode = (raw: unknown) => FRIEND_CODE.test(clean(raw));
export const isGuildCode = (raw: unknown) => GUILD_CODE.test(clean(raw));

export function friendInviteUrl(code: string): string {
  return `${INVITE_ORIGIN}/social?ami=${encodeURIComponent(clean(code))}`;
}

export function guildInviteUrl(code: string): string {
  return `${INVITE_ORIGIN}/social?guilde=${encodeURIComponent(clean(code))}`;
}

export function friendInviteMessage(code: string): string {
  return `Rejoins-moi sur TITAN pour qu’on s’encourage : ${friendInviteUrl(code)}\nMon code ami : ${clean(code)}`;
}

export function guildInviteMessage(name: string, code: string): string {
  const team = name.trim() ? `ma guilde « ${name.trim()} »` : "ma guilde";
  return `Rejoins ${team} sur TITAN : chaque minute d’effort compte pour l’équipe. ${guildInviteUrl(code)}\nCode de guilde : ${clean(code)}`;
}

export type InviteParams = { ami?: string; guilde?: string };

/** Reads the parameters of an opened link: only a well-formed code is kept, anything else is ignored. */
export function parseInvite(params: unknown): { friend: string | null; guild: string | null } {
  const p = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;
  return { friend: isFriendCode(p.ami) ? clean(p.ami) : null, guild: isGuildCode(p.guilde) ? clean(p.guilde) : null };
}

/** AUD-22: the website's public challenge page shows the rules, then sign-in and « Rejoindre ». The token is one-use. */
export function challengeInviteUrl(token: string): string {
  return `${INVITE_ORIGIN}/defi?t=${encodeURIComponent(token)}`;
}

export function challengeInviteMessage(title: string, token: string): string {
  return `Je te défie sur TITAN : « ${title.trim() || "Défi"} ». Tous les sports comptent, sans mise. ${challengeInviteUrl(token)}`;
}
