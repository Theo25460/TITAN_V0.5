/* V1.8.4 — Saisons privées de club: the website's shared module (src/core/web/club-season.js, synchronised by scripts/sync-web-core.mjs),
   typed. The server counts the active days, shares, caps and stages and withholds every aggregate below 3 participants; this module
   only words what it gives. */
/* eslint-disable @typescript-eslint/no-require-imports */
require("./web/club-season.js");
/* eslint-enable @typescript-eslint/no-require-imports */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

export type ClubSeasonPace = "douce" | "reguliere" | "soutenue";
export type ClubSeasonAction = "join" | "pause" | "resume" | "leave" | "postpone" | "stop";
export type ClubSeasonStage = { n: number; threshold?: number; reachedAt?: string | null };
export type ClubSeasonState = {
  id: string; club: string; title: string; pace: ClubSeasonPace; perWeek: number; weeks: number; startsAt: string; endsAt: string;
  stoppedAt: string | null; postponed: number; phase: "upcoming" | "running" | "ended" | "stopped"; week: number | null;
  /** Participants still in the season; every other aggregate is null below the threshold (visible false). */
  participants: number; threshold: number; visible: boolean;
  paused: number | null; contributors: number | null; total: number | null; target: number | null; next: number | null;
  stages: ClubSeasonStage[];
  me: { status: "active" | "paused" | "left"; days: number; cap: number; share: number; capped: boolean; joinedAt?: string; leftAt?: string | null } | null;
  can: ClubSeasonAction[]; suspended?: boolean;
};
export type ClubSeasonReport = {
  id: string; title: string; pace: ClubSeasonPace; weeks: number; startsAt: string; endsAt: string; stoppedAt: string | null;
  phase: "closed" | "stopped" | "cancelled"; participants: number | null; threshold: number; visible: boolean;
  total: number | null; target: number | null; contributors: number | null; reached: number | null; stages: ClubSeasonStage[];
  me: { days: number | null; left: boolean } | null;
};
export type ClubSeasonView = { club: string; role: "organizer" | "member"; current: ClubSeasonState | null; last: ClubSeasonReport | null; canCreate: boolean };
export type StageLine = { n: number; name: string; status: "reached" | "current" | "locked" | "hidden"; text: string };

type Api = {
  RULE: { threshold: number; activeMinutes: number; capShare: number; contributors: number };
  role(view: ClubSeasonView | null): string;
  header(s: ClubSeasonState | null): string;
  group(s: ClubSeasonState | null): string;
  progress(s: ClubSeasonState | null): { total: number; target: number; pct: number; line: string } | null;
  stages(s: ClubSeasonState | null): StageLine[];
  ongoing(s: ClubSeasonState | null): string;
  mine(s: ClubSeasonState | null): string;
  report(last: ClubSeasonReport | null): { title: string; lines: string[] } | null;
  actions(s: ClubSeasonState | null): { id: ClubSeasonAction; label: string; danger: boolean }[];
  confirmText(action: ClubSeasonAction, s: ClubSeasonState | null): { title: string; message: string; confirm: string } | null;
  result(action: string): string;
  message(error: unknown): string | null;
};
export const ClubSeason = g.TitanClubSeason as Api;
