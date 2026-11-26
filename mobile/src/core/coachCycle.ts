/* V1.9.5 — Bilans de cycle partageables: the website's shared module (src/core/web/coach-cycle.js, synchronised by
   scripts/sync-web-core.mjs), typed. The server (titan_coach_cycle_v1) computes every figure and every state; this module only words them. */
import "./coachFollowup";
/* eslint-disable @typescript-eslint/no-require-imports */
require("./web/coach-cycle.js");
/* eslint-enable @typescript-eslint/no-require-imports */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

export type Period = { from: string; to: string; weeks?: number };
export type Figure = { id: string; n: number; value?: number; unit?: string; period: Period; sources: string[] };
export type Totals = { period: Period; figures: Figure[]; weeks: { week: number; period: Period; planned: number; done: number; moved: number; sources: string[] }[]; outside?: { planned: number; done: number; sources: string[] } };
export type CycleSession = {
  key: string; week: number; title: string; sport: string; first_date: string; planned_date: string; effective_date: string; status: string; outcome: string;
  moved?: boolean; moved_by?: "athlete" | "coach"; in_scope?: boolean; measure?: { day: string; val?: number; unit?: string; duration?: number }; note?: string;
  session_id?: string; shared?: boolean; note_shared?: boolean; source_gone?: boolean; source_out_of_scope?: boolean;
};
export type Checkin = { week: string; scores: Record<string, number>; note?: string; already_shared?: boolean; shared?: boolean };
export type Observation = { key: string; text: string; sources: string[] };
export type Decision = { key: string; kind: "goal" | "session"; text: string; sport?: string; state?: "approved" | "declined" | "proposed"; decided_at?: string };
export type Published = {
  version: number; validated_at: string; allow_export: boolean; plan: { title: string; start_date: string; end_date: string; weeks: number; goals: string[] };
  sessions: CycleSession[]; checkins: Checkin[]; observations: Observation[]; decisions: Decision[]; athlete_note?: string; totals: Totals; retracted: { kind: string; key: string; at: string }[];
};
export type Proposal = { observations: Observation[]; decisions: Decision[]; sessions: CycleSession[]; checkins: Checkin[]; contract: Record<string, unknown>; totals: Totals; preview_key: string };
export type Report = {
  id: string; plan_id: string; link_id: string; state: "proposed" | "published" | "none"; version: number; hosted: "none" | "online" | "withdrawn" | "revalidate";
  plan: { title: string; start_date: string; end_date: string; weeks: number; state: string; goals: string[] }; link_state: "active" | "paused" | "revoked"; can_act: boolean;
  published_at?: string; allow_export?: boolean; next_plan?: { id: string; title: string; state: string }; coach_name?: string;
  proposal?: Proposal; published?: Published; exports?: { role: string; version: number; at: string; fields: Record<string, number> }[];
  versions?: { version: number; at: string; allow_export: boolean; retracted: number }[];
};
export type AthleteReports = { owner: string; today: string; reports: Report[] };
export type Choice = { measures: Record<string, boolean>; notes: Record<string, boolean>; checkins: Record<string, boolean> };
export type SessionView = { key: string; title: string; sport: string; outcome: string; label: string; tone: "done" | "neutral" | "wait"; name: string;
  dates: { key: string; label: string; text: string }[]; measure: string; note: string; text: string };
export type FigureView = { id: string; unit: string | null; label: string; value: string; count: string; period: string; source: string; sources: { key: string; text: string }[] };

export const CoachCycle = g.TitanCoachCycle as {
  message(code: string): string;
  SHARE_NOTICE: string;
  EXPORT_NOTICE: { coach: string; athlete: string };
  head(r: Report, role: "athlete" | "coach"): { title: string; dates: string; stateLabel: string; hosted: string; hostedLabel: string; hostedText: string; versionText: string; link: string; readOnly: boolean; next: string; exportAllowed: boolean };
  totals(t: Totals, sessions: CycleSession[]): { period: string; weeksCount: number; figures: FigureView[]; weeks: { week: number; label: string; period: string; planned: number; done: number; moved: number }[]; outside: { text: string } | null };
  session(s: CycleSession): SessionView;
  observation(o: Observation, sessions: CycleSession[]): { key: string; text: string; sources: { key: string; text: string }[] };
  decision(d: Decision): { key: string; kindLabel: string; text: string; sport: string; state: string | null; stateLabel: string; approved: boolean };
  checkin(c: Checkin): { week: string; label: string; note: string; scores: string; alreadyShared: boolean };
  choices(p: Proposal): Choice;
  validation(p: Proposal, c: Choice, extra: { opId: string; decisions: Record<string, string>; allowExport: boolean; note: string; understood?: string }): Record<string, unknown>;
  shareSummary(p: Proposal, c: Choice): string;
  exportFile(x: unknown): { filename: string; mime: string; text: string };
  exportLine(x: unknown): string;
  retractedLine(x: unknown): string;
  versionLine(v: unknown): string;
  opId(): string;
};
