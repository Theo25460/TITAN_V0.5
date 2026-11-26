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
  /** V1.8.2: longueurs acquired by members who left (a count, never who or why). */
  kept?: number;
  families: CordeeFamily[]; joined: number; members: CordeeMember[]; me: { pitches: number; counted: number; days: number; families: CordeeFamily[]; strand: boolean } | null;
  title_key: string; earned: boolean;
  /** V1.8.1: the relay step of the pilot route (null or absent elsewhere, or while screens.cordee_relay is closed and nothing was played). */
  relay?: CordeeRelay | null;
  /** V1.8.3: on a finished cordée, its story (shareable steps, group decisions) and the proposals to set off again; on a new one, the cordée it follows. */
  story?: CordeeStoryEvent[] | null;
  suite?: CordeeSuite | null;
  follows?: CordeeFollows | null;
};
export type CordeeSuiteAction = "accept" | "decline" | "withdraw";
export type CordeeSuitePerson = { name: string; me: boolean };
export type CordeeProposal = {
  id: string; route: CordeeRouteId; pace: CordeePace; days: number; status: "open" | "started" | "withdrawn" | "merged" | "expired" | "cancelled";
  by: CordeeSuitePerson; mine: boolean; myAnswer: "yes" | "no" | null; yes: number; no: number; eligible: number; waiting: number;
  accepted: CordeeSuitePerson[]; others: number; expiresAt: string | null; createdAt?: string; startedId: string | null; startedAt?: string | null;
  myStatus?: string | null; joined?: number | null; turn: CordeeSuiteAction[];
};
export type CordeeSuite = {
  closesAt: string; can: "propose"[]; group: number; waiting: number; choice: boolean;
  previous: { route: CordeeRouteId; pace: CordeePace; days: number; summited: boolean };
  proposals: CordeeProposal[]; hint: "propose" | "answer" | "mine" | "in" | "full" | "alone" | "closed" | "suspended";
};
export type CordeeStoryEvent = { kind: string; at?: string; [k: string]: unknown };
export type CordeeFollows = { id: string; route: CordeeRouteId; pace: CordeePace; summited: boolean; endedAt: string; proposedBy: CordeeSuitePerson; group: number; camps: number; total: number; target: number };
export type CordeeSuiteWords = {
  title: string; hint: string; choice: string | null; can: boolean; label: string; previous: CordeeSuite["previous"] | null; pace: CordeePace;
  proposals: { id: string; status: CordeeProposal["status"]; route: CordeeRouteId; title: string; by: string; counts: string; accepted: string | null; mine: string | null;
    actions: { action: CordeeSuiteAction; label: string }[]; expiresAt: string | null; startedId: string | null }[];
};
export type CordeeSuiteAnswer = { suite: CordeeSuite | null; proposal: string; status: CordeeProposal["status"]; started: string | null; canonical: boolean; changed: boolean };
export type CordeeRelayPerson = { name: string; me: boolean; family: CordeeFamily | null };
/** V1.8.2: the optional turns of the relay (titan_cordee_relay_turn_v1). */
export type CordeeTurn = "take" | "handover" | "withdraw" | "accept";
export type CordeeHandover = { pending: true; mine: boolean; forMe: boolean; open: boolean | null; to: CordeeRelayPerson | null; expiresAt: string };
export type CordeeRelay = {
  step: "sentinelle"; status: "waiting" | "opened" | "confirmed"; active: boolean; can: "transmit" | "confirm" | null;
  hint: "transmit" | "session" | "own" | "confirm" | "other_day" | "join" | "done" | "closed" | "held" | "offered" | "holder" | "holder_session" | "paused" | "alone";
  opener: CordeeRelayPerson | null; receiver: CordeeRelayPerson | null;
  holder?: CordeeRelayPerson | null; holdUntil?: string | null; handover?: CordeeHandover | null; turn?: CordeeTurn[]; choices?: { id: string; name: string }[] | null;
};
export type CordeeRelayWords = {
  name: string; intro: string; status: CordeeRelay["status"]; shared: string; mine: string; can: "transmit" | "confirm" | null; label: string | null;
  steps: { id: "transmit" | "confirm"; label: string; done: boolean }[];
  holder: string | null; handover: string | null; turns: { action: CordeeTurn; label: string }[]; choices: { id: string; name: string }[];
};
export type CordeeWords = {
  route: CordeeRoute; camps: { index: number; name: string; text: string }[]; next: { index: number; name: string; at: number } | null;
  goal: string; mine: string; group: string; kept: string | null; together: string | null; variety: string; unlocked: string; summited: boolean; title: string;
};

export const Cordee = g.TitanCordee as {
  RULE: { oneLongueur: number; twoLongueurs: number; dailyCap: number; capShare: number; contributors: number; varietyPerFamily: number; varietyMax: number; camps: number; holdHours: number; offerHours: number; turnLimit: number };
  PACES: Record<CordeePace, { id: CordeePace; label: string; perWeek: number; text: string }>;
  DAYS: number[];
  FAMILIES: Record<CordeeFamily, { id: CordeeFamily; label: string; text: string }>;
  ROUTES: Record<CordeeRouteId, CordeeRoute>;
  share(pace: CordeePace, days: number): number;
  cap(share: number): number;
  explain(state: CordeeState): CordeeWords;
  suggestPace(activeDays28: number): CordeePace;
  RELAY: { route: CordeeRouteId; step: string; name: string; intro: string; labels: { transmit: string; confirm: string }; turns: Record<CordeeTurn, string> };
  RELAY_MESSAGES: Record<string, string>;
  LEAVE: string;
  relay(state: { relay?: CordeeRelay | null } | null): CordeeRelayWords | null;
  relayResult(answer: { changed?: boolean } | null, action: "transmit" | "confirm"): { title: string; message: string };
  turnResult(answer: { changed?: boolean } | null, action: CordeeTurn): { title: string; message: string };
  relayMessage(error: unknown): string | null;
  SUITE: { proposalHours: number; windowDays: number; openMax: number; labels: Record<"propose" | CordeeSuiteAction, string> };
  SUITE_MESSAGES: Record<string, string>;
  nextPace(previous: CordeePace | undefined, summited: boolean | undefined): CordeePace;
  itinerary(p: { route: CordeeRouteId; pace: CordeePace; days: number }): string;
  suite(state: { suite?: CordeeSuite | null } | null): CordeeSuiteWords | null;
  story(state: { route?: CordeeRouteId; story?: CordeeStoryEvent[] | null } | null): { kind: string; at?: string; text: string }[];
  follows(state: { follows?: CordeeFollows | null } | null): string | null;
  suiteResult(answer: Partial<CordeeSuiteAnswer> | null, action: "propose" | CordeeSuiteAction): { title: string; message: string };
  suiteMessage(error: unknown): string | null;
};

/* « Depuis ta dernière visite », social part (public.titan_social_digest_v1), worded by the website's module. */
export type SocialDigest = {
  since: string; requestsIn: number; cheersReceived: number;
  friendMoments: { count: number; latest: { id: string; kind: string; title: string; at: string; author: string }[] };
  friendsActive: string[];
  cordees: { id: string; route: CordeeRouteId; status: string; myStatus: string; percent: number; camps: number; total: number; target: number; mine: number; earned: boolean; summitedSince: boolean; follows?: CordeeRouteId | null }[];
  /** V1.8.3: finished cordées whose group proposes to set off again (only when an answer waits or I proposed). */
  suites?: { id: string; route: CordeeRouteId; waiting: number; choice: boolean; proposals: { id: string; route: CordeeRouteId; pace: CordeePace; days: number; status: string; mine: boolean; by: string; myAnswer: "yes" | "no" | null; yes: number; eligible: number; turn: string[] }[] }[];
  duo: { status: "active" | "invited" | "finished"; partner: string | null; together?: number; target?: number; daysLeft?: number; reached?: boolean } | null;
  challengesEnded: { id: string; title: string; reached: boolean | null }[];
  memories: { id: string; route: CordeeRouteId; summitedAt: string; members: number }[];
  suggestion: { kind: "cordee"; pace: CordeePace; activeDays28: number; friends: number } | null;
};
export type DigestLine = { id: string; text: string; href: string; kind: "celebrate" | "together" | "circle" | "memory" | "suggest"; pace?: CordeePace };
export const SocialDigestWords = g.TitanSocialDigest as { lines(d: SocialDigest | null, now?: number): DigestLine[]; hasNews(d: SocialDigest | null, now?: number): boolean };
