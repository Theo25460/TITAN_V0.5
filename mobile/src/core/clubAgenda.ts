/* V1.8.6 — Agenda et rendez-vous d’équipe: the website's shared module (src/core/web/club-agenda.js, synchronised by
   scripts/sync-web-core.mjs), typed. The server counts the answers, keeps the capacity and the waiting list, decides who reads the precise
   place and withholds the group's totals below 3 linked sessions; this module only words what it gives. Nothing here writes a session. */
/* eslint-disable @typescript-eslint/no-require-imports */
require("./web/club-agenda.js");
/* eslint-enable @typescript-eslint/no-require-imports */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

export type ClubAgendaAnswer = "yes" | "maybe" | "no" | "waitlist";
export type ClubAgendaCan = "yes" | "maybe" | "no" | "remind" | "attend" | "link" | "unlink" | "move" | "fallback" | "cancel" | "restore";
export type ClubAgendaAction = "answer" | "remind" | "attend" | "link" | "unlink" | "move" | "fallback" | "cancel" | "restore" | "cancel_series" | "resume_series" | "new_code";
export type ClubAgendaSlot = {
  id: string; event: string; n: number; occurrences: number; recurrence: "once" | "weekly"; title: string; area: string; durationMin: number;
  startsAt: string; endsAt: string; plannedAt: string; moved: boolean; phase: "upcoming" | "running" | "ended" | "cancelled"; series: "active" | "cancelled";
  fallback: string | null; fallbackOn: boolean; capacity: number | null; full: boolean;
  /** Counts only: a member never reads who answered what. */
  counts: { yes: number; maybe: number; waitlist: number; no: number };
  hasPlace: boolean; place: string | null; code: string | null;
  me: {
    answer: ClubAgendaAnswer | null; answeredAt?: string; reminder?: boolean; position?: number | null; promoted?: boolean; toConfirm?: boolean;
    attended?: boolean | null; linked?: { id: string; sport: string; minutes: number } | null;
    candidates?: { id: string; sport: string; minutes: number; unit: string; val: number }[] | null;
  } | null;
  can: ClubAgendaCan[];
  report: { present: number; linked: number; threshold: number; visible: boolean; minutes?: number; km?: number; sports?: number } | null;
  history: { kind: string; n: number | null; from: string | null; to: string | null; at: string }[];
  /** Administrators only. */
  roster: { name: string; answer: ClubAgendaAnswer | null; attended: boolean | null }[] | null;
  suspended?: boolean;
};
export type ClubAgendaView = { club: string; role: "organizer" | "member"; canCreate: boolean; upcoming: ClubAgendaSlot[]; past: ClubAgendaSlot[] };
export type ClubAgendaButton = { id: "answer" | "remind" | "attend" | "unlink" | "move" | "fallback" | "restore" | "cancel"; answer?: "yes" | "maybe" | "no"; on?: boolean; label: string; primary?: boolean; danger?: boolean; organizer?: boolean };

type Api = {
  RULE: { reportThreshold: number; presenceDays: number; occurrencesMax: number };
  ANSWERS: Record<ClubAgendaAnswer, string>;
  role(view: ClubAgendaView | null): string;
  header(slot: ClubAgendaSlot | null): string;
  status(slot: ClubAgendaSlot | null): string[];
  counts(slot: ClubAgendaSlot | null): string;
  place(slot: ClubAgendaSlot | null): string;
  mine(slot: ClubAgendaSlot | null): string;
  history(slot: ClubAgendaSlot | null): string[];
  report(slot: ClubAgendaSlot | null): { title: string; lines: string[] } | null;
  candidates(slot: ClubAgendaSlot | null, sportLabel?: (sport: string) => string): { id: string; label: string }[];
  linked(slot: ClubAgendaSlot | null, sportLabel?: (sport: string) => string): string;
  actions(slot: ClubAgendaSlot | null): ClubAgendaButton[];
  confirmText(action: string): { title: string; message: string; confirm: string } | null;
  result(action: string, answer?: string): string;
  answered(slot: ClubAgendaSlot | null | undefined): string | null;
  message(error: unknown): string | null;
};
export const ClubAgenda = g.TitanClubAgenda as Api;
