/* V1.6.5 — Centre des sources: one Santé Connect reading, explicit and bounded, recorded on the server (titan_source_run_v1).
   Two steps, both started by the athlete: `readForResume` reads the window and says what was found and excluded; `importRead` sends
   what was found, one session at a time, through the same import as before (titan_import_activity_v1: the same (source, id) is
   imported once, a session already in the journal is never rewritten). The run is opened « running » before reading and closed with
   its counts; if the app is closed in between, the server keeps it open and the center reads it as interrupted after 15 minutes.
   A withdrawn source is never read: the server consent is checked first and nothing is asked to Health Connect. */
import { Sources, type ReplayWindow, type SourceRunOutcome } from "../core";
import type { Access, Exclusion, SessionCandidate, WindowRead } from "./healthConnect";
import { isNetworkError } from "./errors";

export type ImportAnswer = { status: "imported" | "linked" | "duplicate"; needs_review?: boolean };
export type SyncDeps = {
  hc: { granted(): Promise<Access>; readWindow(from: Date, to: Date): Promise<WindowRead> };
  /** The server consent of Santé Connect: true, false (withdrawn) or null (never given). */
  consent(): Promise<boolean | null>;
  report(run: Record<string, unknown>): Promise<unknown>;
  importOne(c: SessionCandidate): Promise<ImportAnswer>;
  newId(): string;
  now?: () => number;
  /** False once the screen left or the account changed: nothing more is sent. */
  active?: () => boolean;
};
export type ReadResult =
  | { status: "withdrawn" | "not_authorised" }
  | { status: "denied"; code: "ANDROID_PERMISSION" }
  | { status: "failed"; code: string; runId: string }
  | { status: "read"; runId: string; kind: "read" | "replay"; startedAt: string; window: ReplayWindow; candidates: SessionCandidate[]; excluded: Partial<Record<Exclusion, number>>; complete: boolean };
export type ImportSummary = { outcome: SourceRunOutcome; counts: Record<string, number>; error_code: string | null; interrupted: boolean; durationMs: number };

const codeOf = (e: unknown, fallback: string) => {
  const m = String((e as { message?: unknown })?.message ?? e ?? "");
  if (isNetworkError(e)) return "NETWORK";
  if (/rate[ _]?limit|too many/i.test(m)) return "RATE_LIMITED";
  if (/CONSENT_REQUIRED/.test(m)) return "CONSENT_REQUIRED";
  return fallback;
};
/** The report itself is best effort: a lost report never blocks the athlete (the import answers are the authority). */
async function send(deps: SyncDeps, run: Record<string, unknown>) {
  try { await deps.report(run); } catch { /* the center will read the run as interrupted */ }
}

export async function readForResume(deps: SyncDeps, window: ReplayWindow, kind: "read" | "replay" = "replay"): Promise<ReadResult> {
  const now = deps.now ?? Date.now;
  const consent = await deps.consent();
  if (consent === false) return { status: "withdrawn" };
  if (consent === null) return { status: "not_authorised" };
  const access = await deps.hc.granted();
  if (!access.exercise) {
    await send(deps, { id: deps.newId(), kind, started_at: new Date(now()).toISOString(), outcome: "denied", error_code: "ANDROID_PERMISSION", window_from: window.from, window_to: window.to });
    return { status: "denied", code: "ANDROID_PERMISSION" };
  }
  const runId = deps.newId();
  const startedAt = new Date(now()).toISOString();
  const base = { id: runId, kind, started_at: startedAt, window_from: window.from, window_to: window.to };
  await send(deps, { ...base, outcome: "running" });
  let read: WindowRead;
  try {
    read = await deps.hc.readWindow(new Date(window.from), new Date(window.to));
  } catch (e) {
    const code = codeOf(e, /unavailable|not installed|service/i.test(String((e as Error)?.message)) ? "HC_UNAVAILABLE" : "HC_READ");
    await send(deps, { ...base, outcome: "failed", error_code: code, counts: {} });
    return { status: "failed", code, runId };
  }
  return { status: "read", runId, kind, startedAt, window, candidates: read.candidates, excluded: read.excluded, complete: read.complete };
}

export async function importRead(deps: SyncDeps, read: Extract<ReadResult, { status: "read" }>): Promise<ImportSummary> {
  const now = deps.now ?? Date.now;
  const active = deps.active ?? (() => true);
  const t0 = now();
  const results: (ImportAnswer | "error")[] = [];
  let error: string | null = null;
  let interrupted = false;
  for (const c of read.candidates) {
    if (!active()) { interrupted = true; break; }
    try {
      results.push(await deps.importOne(c));
    } catch (e) {
      results.push("error");
      error = codeOf(e, "SERVER");
      if (error === "CONSENT_REQUIRED" || error === "RATE_LIMITED" || error === "NETWORK") {
        // Nothing else can pass: stop here and say so; the next resume of the same window finishes the job without duplicates.
        for (let i = results.length; i < read.candidates.length; i++) results.push("error");
        break;
      }
    }
  }
  const s = Sources.summarizeRun({ read: read.candidates.length + Object.values(read.excluded).reduce((n, x) => n + (x ?? 0), 0), results: results.map((r) => (r === "error" ? "error" : r)), excluded: read.excluded as Record<string, number> });
  const outcome: SourceRunOutcome = !read.complete && s.outcome !== "partial" ? "partial" : s.outcome;
  const error_code = s.outcome === "partial" ? error ?? "SERVER" : !read.complete ? "INTERRUPTED" : null;
  if (!interrupted && active()) {
    await send(deps, { id: read.runId, kind: read.kind, started_at: read.startedAt, window_from: read.window.from, window_to: read.window.to, outcome, error_code, counts: s.counts, excluded: read.excluded });
  }
  return { outcome, counts: s.counts, error_code, interrupted, durationMs: now() - t0 };
}

/** Words for the result of a resume, shown once it ended. */
export function summaryText(s: ImportSummary): string {
  const n = (k: string) => s.counts[k] ?? 0;
  const added = n("imported"), linked = n("linked"), dup = n("duplicate"), ex = n("excluded"), failed = n("failed");
  const parts = [
    added ? `${added} séance${added > 1 ? "s" : ""} ajoutée${added > 1 ? "s" : ""}` : null,
    linked ? `${linked} rattachée${linked > 1 ? "s" : ""} à une séance déjà saisie` : null,
    dup ? `${dup} déjà dans ton journal, pas importée${dup > 1 ? "s" : ""} de nouveau` : null,
    ex ? `${ex} exclue${ex > 1 ? "s" : ""}` : null,
    failed ? `${failed} non confirmée${failed > 1 ? "s" : ""} : reprends la même période` : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(", ")}.` : "Aucune séance dans cette période.";
}
