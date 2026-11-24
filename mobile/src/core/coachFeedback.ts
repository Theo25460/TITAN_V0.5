/* V1.9.2 — Retour sur la séance: the website's shared module (src/core/web/coach-feedback.js, synchronised by scripts/sync-web-core.mjs), typed.
   The server (titan_coach_feedback_v1) projects the session through the link's current sharing; this module only words it. */
/* eslint-disable @typescript-eslint/no-require-imports */
require("./web/coach-feedback.js");
/* eslint-enable @typescript-eslint/no-require-imports */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

export type FeedbackVersion = { title?: string; sport?: string; planned_date?: string; instructions?: string };
export type FeedbackRow = {
  id: string; link_id: string; revision: number; created_at: string; read_at: string | null; observation: string; message_id: string; coach_name?: string;
  assignment: { id: string; title: string; sport: string; planned_date: string; status: string; session: "same" | "other" | "none" };
  session: { state: "shared" | "out_of_scope" | "archived" | "removed"; hidden: string[]; day?: string; [key: string]: unknown };
  adjustment: null | { kind: "change" | "new"; state: "pending" | "accepted" | "declined" | "withdrawn" | "stale"; before?: FeedbackVersion; after: FeedbackVersion; note?: string | null;
    answered_at: string | null; target: { id: string; title: string; planned_date: string; status: string } | null; result: { id: string; title: string; planned_date: string; status: string } | null };
  link_state: "active" | "paused" | "revoked"; can_answer: boolean; can_withdraw: boolean; can_read: boolean;
};
export type FeedbackInbox = { owner: string; rows: FeedbackRow[] };
export type SessionView = {
  state: string; heading: string; measures: { key: string; label: string; text: string }[]; exercises: { name: string; summary: string; sets: string[] }[];
  extras: { key: string; text: string }[]; note: string; checkin: string; hidden: string; text: string; corrected: string;
};
export type AdjustmentView = { kind: "change" | "new"; state: string; label: string; tone: "wait" | "done" | "neutral"; heading: string; text: string; changes: { field: string; label: string; before: string; after: string }[]; note: string };
export type AthleteFeedbackView = { preview: string; observation: string; written: string; session: SessionView; adjustment: AdjustmentView | null; link: string; relinked: string; read: boolean; can: ("accept" | "decline" | "read")[] };

export const CoachFeedback = g.TitanCoachFeedback as {
  message(code: string): string;
  day(v: string | null | undefined): string;
  preview(row: FeedbackRow, role: "coach" | "athlete"): string;
  forAthlete(row: FeedbackRow): AthleteFeedbackView;
};
