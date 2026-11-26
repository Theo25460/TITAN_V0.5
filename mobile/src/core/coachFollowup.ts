/* V1.9.1 — Une séance assignée: the website's shared module (src/core/web/coach-followup.js, synchronised by scripts/sync-web-core.mjs), typed.
   The server (titan_coach_followup_v1) computes every state; this module only words it and lists what the athlete may do. */
/* eslint-disable @typescript-eslint/no-require-imports */
require("./web/coach-followup.js");
/* eslint-enable @typescript-eslint/no-require-imports */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

export type FollowState = "awaiting" | "to_discuss" | "reproposed" | "moved" | "to_match" | "done_unmatched" | "overdue" | "linked" | "declined" | "planned" | "cancelled";
export type FollowVersion = { title: string; sport: string; planned_date: string; instructions: string; at?: string; note?: string };
export type FollowCandidate = { id: string; day: string; val: number; unit: string | null; duration: number | null };
export type FollowRow = {
  id: string; link_id: string; revision: number; status: "proposed" | "accepted" | "declined" | "completed" | "cancelled"; state: FollowState;
  title: string; sport: string; planned_date: string; instructions: string; moved_date: string | null; effective_date: string; done_date: string | null;
  gap_days: number | null; done_declared_at: string | null; accepted_version: FollowVersion | null; pending_change: (FollowVersion & { note?: string }) | null;
  linked: { in_scope: boolean; day?: string; sport?: string; val?: number; unit?: string | null; duration?: number | null; session_id?: string | null; archived?: boolean } | null;
  history: { k: string; at: string; [key: string]: unknown }[]; candidates: FollowCandidate[] | null; link_state: "active" | "paused" | "revoked"; can_act: boolean;
  coach_name?: string; state_key: string;
};
export type AthleteInbox = { owner: string; today: string; links: { id: string; coach_name: string; state: "active" | "paused" | "revoked"; revoked_at: string | null }[]; rows: FollowRow[] };
export type AthleteAction = "accept" | "decline" | "accept_change" | "decline_change" | "confirm" | "move" | "declare" | "undeclare" | "unlink";
export type AthleteView = {
  label: string; tone: "wait" | "gap" | "done" | "neutral"; text: string; readOnly: boolean; link: string;
  dates: { key: "planned" | "moved" | "done" | "proposed"; label: string; date: string; text: string }[];
  changes: { field: string; label: string; before: string; after: string }[]; candidates: FollowCandidate[]; can: AthleteAction[];
};

export const CoachFollowup = g.TitanCoachFollowup as {
  day(v: string | null | undefined): string;
  message(code: string): string;
  forAthlete(row: FollowRow): AthleteView;
  history(row: FollowRow): { kind: string; at: string; text: string }[];
};
