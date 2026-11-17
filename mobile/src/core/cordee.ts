/* La Grande Cordée: the website's shared module (src/core/web/cordee.js, synchronised by scripts/sync-web-core.mjs), typed.
   The server counts; this module only words the state and mirrors the rule for previews. */
/* eslint-disable @typescript-eslint/no-require-imports */
require("./web/cordee.js");
/* eslint-enable @typescript-eslint/no-require-imports */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

export type CordeeRouteId = "aube" | "marees" | "forge" | "aurores";
export type CordeePace = "douce" | "reguliere" | "soutenue";
export type CordeeFamily = "endurance" | "force" | "technique" | "jeu" | "mobilite";
export type CordeeRoute = { id: CordeeRouteId; name: string; world: string; title: string; guardian: string; intro: string; camps: [string, string][] };
export type CordeeMember = { id: string | null; name: string; status: "joined" | "invited"; me: boolean; pitches: number; strand: boolean; families: CordeeFamily[] };
export type CordeeState = {
  id: string; title: string; route: CordeeRouteId; pace: CordeePace; startsAt: string; endsAt: string; days: number;
  status: "active" | "summited" | "ended"; summitedAt: string | null; mine: boolean; myStatus: "joined" | "invited" | "declined" | "left" | null;
  share: number; cap: number; target: number; longueurs: number; variety: number; total: number; percent: number; camps: number;
  families: CordeeFamily[]; joined: number; members: CordeeMember[]; me: { pitches: number; counted: number; days: number; families: CordeeFamily[]; strand: boolean } | null;
  title_key: string; earned: boolean;
};
export type CordeeWords = {
  route: CordeeRoute; camps: { index: number; name: string; text: string }[]; next: { index: number; name: string; at: number } | null;
  goal: string; mine: string; group: string; variety: string; unlocked: string; summited: boolean; title: string;
};

export const Cordee = g.TitanCordee as {
  RULE: { oneLongueur: number; twoLongueurs: number; dailyCap: number; capShare: number; varietyPerFamily: number; varietyMax: number; camps: number };
  PACES: Record<CordeePace, { id: CordeePace; label: string; perWeek: number; text: string }>;
  DAYS: number[];
  FAMILIES: Record<CordeeFamily, { id: CordeeFamily; label: string; text: string }>;
  ROUTES: Record<CordeeRouteId, CordeeRoute>;
  share(pace: CordeePace, days: number): number;
  cap(share: number): number;
  explain(state: CordeeState): CordeeWords;
  suggestPace(activeDays28: number): CordeePace;
};
