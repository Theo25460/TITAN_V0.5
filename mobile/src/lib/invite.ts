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

export type InviteParams = { ami?: string; guilde?: string; invitation?: string };

/* Social lot A: a personal one-use invitation link. It works while the inviter stays private (not findable); the person who opens it
   sees who invites them once signed in, then accepts or ignores. The token is 64 hex characters; only its hash is stored server-side. */
const INVITATION = /^[0-9a-f]{64}$/;
export const isInvitationToken = (raw: unknown) => typeof raw === "string" && INVITATION.test(raw.trim().toLowerCase());

export function friendLinkUrl(token: string): string {
  return `${INVITE_ORIGIN}/social?invitation=${encodeURIComponent(token.trim().toLowerCase())}`;
}

export function friendLinkMessage(token: string): string {
  return `Rejoins-moi sur TITAN pour qu’on s’encourage. Ce lien est pour toi seul·e, valable 7 jours : ${friendLinkUrl(token)}`;
}

/** Reads the parameters of an opened link: only a well-formed code or token is kept, anything else is ignored. */
export function parseInvite(params: unknown): { friend: string | null; guild: string | null; invitation: string | null } {
  const p = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;
  return {
    friend: isFriendCode(p.ami) ? clean(p.ami) : null,
    guild: isGuildCode(p.guilde) ? clean(p.guilde) : null,
    invitation: isInvitationToken(p.invitation) ? String(p.invitation).trim().toLowerCase() : null,
  };
}

/** AUD-22: the website's public challenge page shows the rules, then sign-in and « Rejoindre ». The token is one-use. */
export function challengeInviteUrl(token: string): string {
  return `${INVITE_ORIGIN}/defi?t=${encodeURIComponent(token)}`;
}

export function challengeInviteMessage(title: string, token: string): string {
  return `Je te défie sur TITAN : « ${title.trim() || "Défi"} ». Tous les sports comptent, sans mise. ${challengeInviteUrl(token)}`;
}
