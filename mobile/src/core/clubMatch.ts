/* V1.8.5 — Rencontres entre clubs: the website's shared module (src/core/web/club-match.js, synchronised by scripts/sync-web-core.mjs),
   typed. The server counts the active days, shares and rates, gives the other club only its name, participants and rate, and withholds
   every rate below 3 participants; this module only words what it gives. */
/* eslint-disable @typescript-eslint/no-require-imports */
require("./web/club-match.js");
/* eslint-enable @typescript-eslint/no-require-imports */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

export type ClubMatchAction = "join" | "leave" | "stop" | "feedback";
export type ClubMatchFormat = "cooperation" | "versus";
/** One's own club: totals from 3 participants. The other club: a name, a number of participants and a rate, nothing else. */
export type ClubMatchSide = { name: string; participants?: number | null; scored?: boolean | null; rate?: number | null; total?: number | null; target?: number | null };
export type ClubMatchState = {
  id: string; format: ClubMatchFormat; pace: "douce" | "reguliere" | "soutenue"; perWeek: number; weeks: number;
  startsAt: string; endsAt: string; joinUntil: string; phase: "proposed" | "upcoming" | "running" | "ended"; side: "host" | "guest";
  asOf?: string; code?: string; threshold: number; goal: number; tieMargin: number;
  us: ClubMatchSide; them: ClubMatchSide | null; common?: number | null; reached?: boolean | null; lead?: "us" | "them" | "tie" | null;
  me?: { status: "active" | "left"; club: string; days: number; share: number } | null; can: ClubMatchAction[]; suspended?: boolean;
};
export type ClubMatchReport = {
  id: string; phase: "closed" | "short" | "abandoned" | "cancelled" | "refused" | "expired"; format: ClubMatchFormat; startsAt?: string; endsAt?: string;
  stoppedAt?: string | null; stoppedBy?: "us" | "them" | null; us: ClubMatchSide | null; them: ClubMatchSide | null;
  common?: number | null; reached?: boolean | null; lead?: "us" | "them" | "tie" | null;
  me?: { days: number | null; share: number | null; left: boolean; answered: boolean } | null; can: ClubMatchAction[];
};
export type ClubMatchView = { club: string; role: "organizer" | "member"; current: ClubMatchState | null; last: ClubMatchReport | null; canPropose: boolean; formats: ClubMatchFormat[] };

type Api = {
  RULE: { threshold: number; goal: number; tieMargin: number; shareCap: number };
  role(view: ClubMatchView | null): string;
  rules(m: ClubMatchState | null): string;
  header(m: ClubMatchState | null): string;
  sides(m: ClubMatchState | null): string[];
  score(m: ClubMatchState | null): string;
  mine(m: ClubMatchState | null): string;
  proposal(m: ClubMatchState | null): string;
  report(last: ClubMatchReport | null): { title: string; lines: string[] } | null;
  actions(m: ClubMatchState | null): { id: ClubMatchAction; label: string; danger: boolean }[];
  confirmText(action: string, m: ClubMatchState | null): { title: string; message: string; confirm: string } | null;
  result(action: string): string;
  message(error: unknown): string | null;
};
export const ClubMatch = g.TitanClubMatch as Api;
