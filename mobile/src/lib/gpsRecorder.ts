/* Native GPS recording: Démarrer → Pause/Reprendre → Terminer. The state lives on the phone (per account) and is
   written after every batch of fixes, so a background service, a locked screen or a restart of the JS side loses nothing.
   Android does not keep a service alive after a force stop: an interrupted recording is closed at its last fix, never
   extended with invented time. Positions stay on the phone; only the totals are sent when the session is saved. */
import { addFix, emptyTrack, summarize, toGpx, type Fix, type Summary, type Track } from "./gpsTrack";

export type Status = "recording" | "paused" | "ended";
export type Recording = {
  v: 1;
  owner: string;
  sport: string;
  status: Status;
  startedAt: number;
  activeMs: number; // closed stretches only
  runStart: number | null; // start of the current stretch while recording
  newSegment: boolean; // next fix opens a new segment (after a pause or a restart)
  interrupted: boolean; // closed by a restart or a lost service, not by the athlete
  track: Track;
};

export type Deps = {
  read(key: string): Promise<Recording | null>;
  write(key: string, value: Recording | null): Promise<void>;
  startUpdates(): Promise<void>;
  stopUpdates(): Promise<void>;
  updatesRunning(): Promise<boolean>;
  now(): number;
};

export const KEY_ACTIVE = "titan.gps.active.v1"; // owner id of the recording being written by the background task
export const recKey = (owner: string) => `titan.gps.v1:${owner}`;

/** Serialises every read-modify-write so batches arriving from the background task never overwrite each other. */
export function createRecorder(deps: Deps) {
  let chain: Promise<unknown> = Promise.resolve();
  const lock = <T,>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };
  const listeners = new Set<(r: Recording | null) => void>();
  const emit = (r: Recording | null) => listeners.forEach((l) => l(r));
  const save = async (r: Recording | null, owner: string) => {
    await deps.write(recKey(owner), r);
    emit(r);
  };
  const lastFixAt = (r: Recording) => r.track.segs.at(-1)?.at(-1)?.t ?? null;

  /** Total active time of the recording at `at`. */
  const activeMs = (r: Recording, at: number) => r.activeMs + (r.status === "recording" && r.runStart ? Math.max(0, at - r.runStart) : 0);

  return {
    subscribe(l: (r: Recording | null) => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    activeMs,
    load: (owner: string) => lock(() => deps.read(recKey(owner))),

    start: (owner: string, sport: string) =>
      lock(async () => {
        const existing = await deps.read(recKey(owner));
        if (existing && existing.status !== "ended") throw new Error("ALREADY_RECORDING");
        const t = deps.now();
        const r: Recording = { v: 1, owner, sport, status: "recording", startedAt: t, activeMs: 0, runStart: t, newSegment: true, interrupted: false, track: emptyTrack() };
        await save(r, owner);
        try {
          await deps.startUpdates();
        } catch (e) {
          await save(null, owner);
          throw e;
        }
        return r;
      }),

    /** Called by the background task for every batch of fixes. Ignored unless the recording is actually running. */
    append: (owner: string, fixes: Fix[]) =>
      lock(async () => {
        const r = await deps.read(recKey(owner));
        if (!r || r.status !== "recording") return r;
        let track = r.track;
        let newSegment = r.newSegment;
        for (const f of [...fixes].sort((a, b) => a.t - b.t)) {
          if (f.t < r.startedAt - 5000) continue; // a stale cached position from before the start
          const before = track;
          track = addFix(track, f, newSegment);
          if (track !== before && track.rejected === before.rejected) newSegment = false;
        }
        const next = { ...r, track, newSegment };
        await save(next, owner);
        return next;
      }),

    pause: (owner: string) =>
      lock(async () => {
        const r = await deps.read(recKey(owner));
        if (!r || r.status !== "recording") return r;
        const next: Recording = { ...r, status: "paused", activeMs: activeMs(r, deps.now()), runStart: null, newSegment: true };
        await save(next, owner);
        await deps.stopUpdates().catch(() => {});
        return next;
      }),

    resume: (owner: string) =>
      lock(async () => {
        const r = await deps.read(recKey(owner));
        if (!r || r.status !== "paused") return r;
        const next: Recording = { ...r, status: "recording", runStart: deps.now(), newSegment: true, interrupted: false };
        await save(next, owner);
        try {
          await deps.startUpdates();
        } catch (e) {
          await save(r, owner);
          throw e;
        }
        return next;
      }),

    finish: (owner: string) =>
      lock(async () => {
        const r = await deps.read(recKey(owner));
        if (!r || r.status === "ended") return r;
        const next: Recording = { ...r, status: "ended", activeMs: activeMs(r, deps.now()), runStart: null };
        await save(next, owner);
        if (r.status === "recording") await deps.stopUpdates().catch(() => {});
        return next;
      }),

    /** Throws the recording away (nothing is kept). */
    discard: (owner: string) =>
      lock(async () => {
        const r = await deps.read(recKey(owner));
        if (r?.status === "recording") await deps.stopUpdates().catch(() => {});
        await save(null, owner);
      }),

    /** On app start: a recording that claims to run while the service is gone was interrupted. Close the stretch at the
        last fix; the athlete can resume or finish. */
    reconcile: (owner: string) =>
      lock(async () => {
        const r = await deps.read(recKey(owner));
        if (!r || r.status !== "recording") return r;
        if (await deps.updatesRunning()) return r;
        const end = lastFixAt(r) ?? r.runStart ?? deps.now();
        const next: Recording = { ...r, status: "paused", activeMs: r.activeMs + Math.max(0, end - (r.runStart ?? end)), runStart: null, newSegment: true, interrupted: true };
        await save(next, owner);
        return next;
      }),

    summary(r: Recording, at = deps.now()): Summary {
      return summarize(r.track, activeMs(r, at));
    },
    gpx: (r: Recording, name: string) => toGpx(r.track, name),
  };
}
export type Recorder = ReturnType<typeof createRecorder>;
