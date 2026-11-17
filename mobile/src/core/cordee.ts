/* La Grande Cordée: the website's shared module (src/core/web/cordee.js, synchronised by scripts/sync-web-core.mjs), typed.
   The server counts; this module only words the state and mirrors the rule for previews. */
/* eslint-disable @typescript-eslint/no-require-imports */
require("./web/cordee.js");
require("./web/social-digest.js");
/* eslint-enable @typescript-eslint/no-require-imports */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

export type CordeeRouteId = "aube" | "marees" | "forge" | "aurores";
export type CordeePace = "douce" | "reguliere" | "soutenue";
export type CordeeFamily = "endurance" | "force" | "technique" | "jeu" | "mobilite";
export type CordeeRoute = { id: CordeeRouteId; name: string; world: string; title: string; guardian: string; intro: string; camps: [string, string][] };
/** A member the viewer may not see (id null) carries no pitches, strand or families. */
export type CordeeMember = { id: string | null; name: string; status: "joined" | "invited"; me: boolean; pitches?: number; strand?: boolean; families?: CordeeFamily[] };
export type CordeeState = {
  id: string; title: string; route: CordeeRouteId; pace: CordeePace; startsAt: string; endsAt: string; days: number;
  status: "active" | "summited" | "ended"; summitedAt: string | null; mine: boolean; myStatus: "joined" | "invited" | "declined" | "left" | null;
  share: number; cap: number; target: number; longueurs: number; variety: number; total: number; percent: number; camps: number;
  pending?: number; contributors?: number; needs?: number;
  families: CordeeFamily[]; joined: number; members: CordeeMember[]; me: { pitches: number; counted: number; days: number; families: CordeeFamily[]; strand: boolean } | null;
  title_key: string; earned: boolean;
};
export type CordeeWords = {
  route: CordeeRoute; camps: { index: number; name: string; text: string }[]; next: { index: number; name: string; at: number } | null;
  goal: string; mine: string; group: string; variety: string; unlocked: string; summited: boolean; title: string;
};

export const Cordee = g.TitanCordee as {
  RULE: { oneLongueur: number; twoLongueurs: number; dailyCap: number; capShare: number; contributors: number; varietyPerFamily: number; varietyMax: number; camps: number };
  PACES: Record<CordeePace, { id: CordeePace; label: string; perWeek: number; text: string }>;
  DAYS: number[];
  FAMILIES: Record<CordeeFamily, { id: CordeeFamily; label: string; text: string }>;
  ROUTES: Record<CordeeRouteId, CordeeRoute>;
  share(pace: CordeePace, days: number): number;
  cap(share: number): number;
  explain(state: CordeeState): CordeeWords;
  suggestPace(activeDays28: number): CordeePace;
};

/* « Depuis ta dernière visite », social part (public.titan_social_digest_v1), worded by the website's module. */
export type SocialDigest = {
  since: string; requestsIn: number; cheersReceived: number;
  friendMoments: { count: number; latest: { id: string; kind: string; title: string; at: string; author: string }[] };
  friendsActive: string[];
  cordees: { id: string; route: CordeeRouteId; status: string; myStatus: string; percent: number; camps: number; total: number; target: number; mine: number; earned: boolean; summitedSince: boolean }[];
  duo: { status: "active" | "invited" | "finished"; partner: string | null; together?: number; target?: number; daysLeft?: number; reached?: boolean } | null;
  challengesEnded: { id: string; title: string; reached: boolean | null }[];
  memories: { id: string; route: CordeeRouteId; summitedAt: string; members: number }[];
  suggestion: { kind: "cordee"; pace: CordeePace; activeDays28: number; friends: number } | null;
};
export type DigestLine = { id: string; text: string; href: string; kind: "celebrate" | "together" | "circle" | "memory" | "suggest"; pace?: CordeePace };
export const SocialDigestWords = g.TitanSocialDigest as { lines(d: SocialDigest | null, now?: number): DigestLine[]; hasNews(d: SocialDigest | null, now?: number): boolean };
