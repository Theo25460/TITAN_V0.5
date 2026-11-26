/* V1.9.4 — Programmation multi-semaines: the website's shared module (src/core/web/coach-program.js, synchronised by
   scripts/sync-web-core.mjs), typed. The server (titan_coach_program_v1) computes every state; this module only words it. */
import "./coachFollowup";
import type { FollowRow } from "./coachFollowup";
/* eslint-disable @typescript-eslint/no-require-imports */
require("./web/coach-program.js");
/* eslint-enable @typescript-eslint/no-require-imports */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

export type PlanSession = FollowRow & { key: string; week: number; discuss_note: string | null; discuss_at: string | null };
export type PlanVersion = { version: number; kind: "sent" | "revision" | "closed"; scope?: string; summary: Record<string, unknown>; created_at: string };
export type Plan = {
  id: string; link_id: string; title: string; goals: string[]; start_date: string; end_date: string; weeks: number; today: string;
  state: "sent" | "closed"; version: number; revision: number; current_week?: number; sessions: PlanSession[];
  counts: Record<string, number>; versions: PlanVersion[]; link_state: "active" | "paused" | "revoked"; can_act: boolean; coach_name?: string;
};
export type AthletePlans = { owner: string; today: string; plans: Plan[] };
export type Answer = "accept" | "decline" | "discuss" | "accept_change" | "keep_version";
export type SessionView = {
  key: string; week: number | null; title: string; sport: string; dayText: string; date: string | null; state: string; status: string | null;
  label: string; tone: "wait" | "gap" | "done" | "neutral"; text: string; instructions: string; discuss: string; linked: boolean; changePending: boolean; readOnly: boolean;
  dates: { key: string; label: string; date: string; text: string }[]; changes: { field: string; label: string; before: string; after: string }[];
};

export const CoachProgram = g.TitanCoachProgram as {
  message(code: string): string;
  head(plan: Plan): { title: string; stateLabel: string; dates: string; current: string; goals: string[]; summary: string; link: string; readOnly: boolean };
  weeks(plan: Plan, role: "athlete" | "coach"): { week: number; label: string; state: "played" | "current" | "coming"; stateLabel: string; sessions: SessionView[] }[];
  version(v: PlanVersion): { version: number; kind: string; at: string; text: string };
  toAnswer(plan: Plan): { sessions: number; changes: number };
  answers(choices: Record<string, { answer?: Answer; note?: string }>): { key: string; answer: Answer; note?: string }[];
  answerText(r: { effect: string }): string;
};
