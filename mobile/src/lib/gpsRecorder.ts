/* Native GPS recording: Démarrer → Pause/Reprendre → Terminer. The state lives on the phone (per account) and is
   written after every batch of fixes, so a background service, a locked screen or a restart of the JS side loses nothing.
   Android does not keep a service alive after a force stop: an interrupted recording is closed at its last fix, never
   extended with invented time. While recording, positions stay on the phone. When the athlete saves the session, the session
   carries only the totals, and the trace goes to the athlete's private route library (« Mes parcours », private.titan_routes,
   ~1 m precision, start and end included) as the save screen says; the ends are trimmed only when a route is shared.

   V1.7.7 — recording v2. Every figure comes from the shared engine (core/web/gps-engine.js): the recording now keeps the periods it
   was really running (`stretches`), so a pause, an interruption and a lost signal are told apart afterwards; the latest raw position
   (`live`) is the heartbeat of the signal, kept even when the position is refused; a followed route, the way back to the start, an
   optional goal and a structured session advance here, in the background task, so they go on with the screen locked. */
import { GpsEngine, GpsNav, GpsSession, type GpsAnalysis, type GpsCursor, type GpsGoal, type GpsLive, type GpsStep, type GpsStretch, type NavCourse, type NavFollow, type NavRoute } from "../core";
import { addFix, emptyTrack, toGpx, type Fix, type Summary, type Track } from "./gpsTrack";

export type Status = "recording" | "paused" | "ended";
/** What the location service hands over: a fix, plus the receiver's own speed and course when it has them. Only the fix is stored in the trace. */
export type RawFix = Fix & { spd?: number | null; hdg?: number | null };
/** `autoPause`: detected stops leave the duration of the session (on by default). `offRouteAlert`: one vibration when the followed route is left. */
export type RecOptions = { autoPause: boolean; offRouteAlert: boolean };
export type RecFollow = { id: string; name: string; state: NavFollow };
/** `at`: the moment the way back was asked; the path to walk back is the trace recorded until then. */
export type RecBack = { at: number; state: NavFollow };
export type RecPlan = { steps: GpsStep[]; cursor: GpsCursor; alerts: boolean };
export type Recording = {
  v: 2;
  owner: string;
  sport: string;
  status: Status;
  startedAt: number;
  endedAt: number | null; // set by « Terminer »; a recording finished while paused ends where it last ran
  activeMs: number; // closed stretches only
  runStart: number | null; // start of the current stretch while recording
  newSegment: boolean; // next fix opens a new segment (after a pause or a restart)
  interrupted: boolean; // closed by a restart or a lost service, not by the athlete
  track: Track;
  stretches: GpsStretch[]; // the periods the recording was running; the open one has `e: null`
  live: GpsLive | null; // latest raw position, used or not
  opts: RecOptions;
  follow: RecFollow | null;
  back: RecBack | null;
  goal: GpsGoal | null;
  plan: RecPlan | null;
};
/** What was stored before V1.7.7. Read without loss by `upgradeRecording`. */
export type RecordingV1 = Pick<Recording, "owner" | "sport" | "status" | "startedAt" | "activeMs" | "runStart" | "newSegment" | "interrupted" | "track"> & { v: 1 };
/** What the athlete chose before « Démarrer ». */
export type StartSetup = { opts?: Partial<RecOptions>; goal?: GpsGoal | null; plan?: { steps: GpsStep[]; alerts: boolean } | null; follow?: { id: string; name: string } | null };

export type Deps = {
  read(key: string): Promise<Recording | RecordingV1 | null>;
  write(key: string, value: Recording | null): Promise<void>;
  startUpdates(): Promise<void>;
  stopUpdates(): Promise<void>;
  updatesRunning(): Promise<boolean>;
  now(): number;
  /** The route to follow, read from this phone. Null when it is not there: the follow state then stays as it is. */
  loadRoute?(owner: string, id: string): Promise<NavRoute | null>;
  /** A change the athlete asked to be told about without looking at the screen: a new step, the route left. */
  alert?(kind: "step" | "off"): void;
};

export const KEY_ACTIVE = "titan.gps.active.v1"; // owner id of the recording being written by the background task
export const recKey = (owner: string) => `titan.gps.v1:${owner}`;
export const DEFAULT_OPTIONS: RecOptions = { autoPause: true, offRouteAlert: true };

/** A stored recording as the current shape. A v1 recording had no stretches: they are derived from its segments (each segment was
    one period of recording), the open one from `runStart`; nothing of the trace or of the counted time is dropped. */
export function upgradeRecording(raw: Recording | RecordingV1 | null): Recording | null {
  if (!raw) return null;
  if (raw.v === 2) return { ...raw, opts: { ...DEFAULT_OPTIONS, ...(raw.opts || {}) }, stretches: raw.stretches || [], live: raw.live ?? null, follow: raw.follow ?? null, back: raw.back ?? null, goal: raw.goal ?? null, plan: raw.plan ?? null, endedAt: raw.endedAt ?? null };
  const segs = raw.track.segs.filter((s) => s.length);
  const running = raw.status === "recording";
  const closed = running && !raw.newSegment ? segs.slice(0, -1) : segs;
  const stretches: GpsStretch[] = closed.map((s, i) => ({ s: i === 0 ? Math.min(raw.startedAt, s[0]!.t) : s[0]!.t, e: s[s.length - 1]!.t, why: "pause" as const }));
  const last = stretches[stretches.length - 1];
  if (running) stretches.push({ s: raw.runStart ?? (raw.newSegment ? null : segs[segs.length - 1]?.[0]?.t) ?? raw.startedAt, e: null, why: "pause" });
  else if (last && raw.status === "ended") last.why = "finish";
  else if (last && raw.interrupted) last.why = "interrupted";
  return { ...raw, v: 2, endedAt: raw.status === "ended" ? last?.e ?? raw.startedAt : null, stretches, live: null, opts: { ...DEFAULT_OPTIONS }, follow: null, back: null, goal: null, plan: null };
}

/** The clock, or the last position when the receiver's time runs slightly ahead of the phone's clock (GPS time and system time are
    two clocks): a stretch read or closed at the bare clock would leave its last positions outside and ignore them. */
function edgeOf(r: Pick<Recording, "track">, t: number): number {
  const last = r.track.segs.at(-1)?.at(-1);
  return last && last.t > t && last.t - t <= 60000 ? last.t : t;
}

/** The engine's reading of a recording. `at` closes a recording that is still open (running or paused). */
export function analyseRecording(r: Recording, at: number): GpsAnalysis {
  return GpsEngine.analyse(
    { sport: r.sport, startedAt: r.startedAt, endedAt: r.status === "ended" ? r.endedAt ?? undefined : undefined, segs: r.track.segs, stretches: r.stretches, rejected: r.track.rejected, why: r.track.why, every: r.track.every },
    { now: r.status === "recording" ? edgeOf(r, at) : at, autoPause: r.opts.autoPause },
  );
}

/** The way back by the same path: the trace recorded until `at`, walked backwards. Null while there is nothing to walk back. */
export function backtrackOf(r: Pick<Recording, "track" | "sport">, at: number) {
  return GpsNav.backtrack(r.track.segs.map((s) => s.filter((f) => f.t <= at)).filter((s) => s.length >= 2), { sport: r.sport });
}

const liveOf = (f: RawFix): GpsLive => ({
  t: f.t,
  ...(Number.isFinite(f.lat) && Number.isFinite(f.lon) ? { lat: f.lat, lon: f.lon } : {}),
  acc: f.acc ?? null,
  spd: f.spd !== null && f.spd !== undefined && Number.isFinite(f.spd) && f.spd >= 0 ? Math.round(f.spd * 100) / 100 : null,
  hdg: f.hdg !== null && f.hdg !== undefined && Number.isFinite(f.hdg) && f.hdg >= 0 ? Math.round(f.hdg) : null,
  alt: f.alt ?? null,
});
const closeStretch = (stretches: GpsStretch[], at: number, why: GpsStretch["why"]): GpsStretch[] =>
  stretches.map((x, i) => (i === stretches.length - 1 && x.e === null ? { ...x, e: Math.max(x.s, at), why } : x));
const ROUTE_RETRY_MS = 30000;

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
  const read = async (owner: string) => upgradeRecording(await deps.read(recKey(owner)));
  const save = async (r: Recording | null, owner: string) => {
    await deps.write(recKey(owner), r);
    emit(r);
  };
  const lastFix = (r: Recording) => r.track.segs.at(-1)?.at(-1) ?? null;

  const edge = edgeOf;

  /** Time the recording was running (pauses and interruptions excluded) at `at`. */
  const activeMs = (r: Recording, at: number) => r.activeMs + (r.status === "recording" && r.runStart ? Math.max(0, at - r.runStart) : 0);

  /* The geometry of what is followed is prepared once per process and kept in memory: the route itself never enters the recording. */
  const courses = new Map<string, { course: NavCourse | null; at: number }>();
  async function courseOf(owner: string, id: string): Promise<NavCourse | null> {
    const key = `${owner}|${id}`, hit = courses.get(key);
    if (hit && (hit.course || deps.now() - hit.at < ROUTE_RETRY_MS)) return hit.course;
    let course: NavCourse | null = null;
    try {
      const route = deps.loadRoute ? await deps.loadRoute(owner, id) : null;
      course = route && route.segs?.length ? GpsNav.course(route) : null;
    } catch {
      course = null; // unreadable for now: the follow state stays as it is, the next batch tries again later
    }
    courses.set(key, { course, at: deps.now() });
    return course;
  }
  const backs = new Map<string, NavCourse>();
  function backCourseOf(r: Recording): NavCourse | null {
    if (!r.back) return null;
    const key = `${r.owner}|${r.startedAt}|${r.back.at}`, hit = backs.get(key);
    if (hit) return hit;
    const way = backtrackOf(r, r.back.at);
    if (!way) return null;
    const course = GpsNav.course(way.route);
    backs.clear(); // one way back at a time
    backs.set(key, course);
    return course;
  }
  /** Moves a follow state over the kept fixes; says whether the athlete just left the line. */
  const advance = (course: NavCourse, state: NavFollow, fixes: Fix[], sport: string) => {
    let left = false;
    for (const f of fixes) {
      const was = state.off;
      state = GpsNav.follow(course, state, f, { sport });
      if (!was && state.off) left = true;
    }
    return { state, left };
  };
  const signal = (kind: "step" | "off") => {
    try {
      deps.alert?.(kind);
    } catch {
      // no vibrator, or the system refused: the screen still shows the change
    }
  };
  /** Runs the structured session against the recording; returns the plan moved past every finished step. */
  const runPlan = (r: Recording, at: number): { plan: RecPlan | null; changed: boolean } => {
    if (!r.plan || r.plan.cursor.index >= r.plan.steps.length) return { plan: r.plan, changed: false };
    const run = GpsSession.runPlan(r.plan.steps, r.plan.cursor, analyseRecording(r, at));
    return run.changed ? { plan: { ...r.plan, cursor: run.cursor }, changed: true } : { plan: r.plan, changed: false };
  };
  /** A change of the athlete's choices on an open recording (nothing is changed once it is ended). */
  const change = (owner: string, fn: (r: Recording) => Recording | Promise<Recording>) =>
    lock(async () => {
      const r = await read(owner);
      if (!r || r.status === "ended") return r;
      const next = await fn(r);
      if (next !== r) await save(next, owner);
      return next;
    });

  return {
    subscribe(l: (r: Recording | null) => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    activeMs,
    load: (owner: string) => lock(() => read(owner)),

    start: (owner: string, sport: string, setup: StartSetup = {}) =>
      lock(async () => {
        const existing = await read(owner);
        if (existing && existing.status !== "ended") throw new Error("ALREADY_RECORDING");
        const t = deps.now();
        const steps = setup.plan ? GpsSession.planOf(setup.plan.steps) : [];
        const r: Recording = {
          v: 2, owner, sport, status: "recording", startedAt: t, endedAt: null, activeMs: 0, runStart: t, newSegment: true, interrupted: false, track: emptyTrack(),
          stretches: [{ s: t, e: null, why: "pause" }],
          live: null,
          opts: { ...DEFAULT_OPTIONS, ...(setup.opts || {}) },
          follow: setup.follow ? { id: setup.follow.id, name: setup.follow.name, state: GpsNav.startFollow() } : null,
          back: null,
          goal: GpsSession.goalOf(setup.goal),
          plan: steps.length ? { steps, cursor: GpsSession.startPlan(), alerts: setup.plan!.alerts !== false } : null,
        };
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
    append: (owner: string, fixes: RawFix[]) =>
      lock(async () => {
        const r = await read(owner);
        if (!r || r.status !== "recording") return r;
        let track = r.track;
        let newSegment = r.newSegment;
        let live = r.live;
        const kept: Fix[] = [];
        for (const raw of [...fixes].sort((a, b) => a.t - b.t)) {
          if (raw.t < r.startedAt - 5000) continue; // a stale cached position from before the start
          const { spd: _spd, hdg: _hdg, ...fix } = raw;
          void _spd; void _hdg;
          if (Number.isFinite(raw.t) && (!live || raw.t >= live.t)) live = liveOf(raw);
          const before = track;
          track = addFix(track, fix, newSegment, r.sport);
          if (track !== before && track.rejected === before.rejected) {
            newSegment = false;
            if (track.segs.at(-1)?.at(-1) === fix) kept.push(fix);
          }
        }
        let next: Recording = { ...r, track, newSegment, live };
        let left = false;
        if (kept.length && next.follow) {
          const course = await courseOf(owner, next.follow.id);
          if (course) {
            const moved = advance(course, next.follow.state, kept, r.sport);
            next = { ...next, follow: { ...next.follow, state: moved.state } };
            left = moved.left;
          }
        }
        if (kept.length && next.back) {
          const course = backCourseOf(next);
          if (course) {
            const moved = advance(course, next.back.state, kept, r.sport);
            next = { ...next, back: { ...next.back, state: moved.state } };
            left = left || moved.left;
          }
        }
        const ran = runPlan(next, deps.now());
        if (ran.changed) next = { ...next, plan: ran.plan };
        await save(next, owner);
        if (ran.changed && next.plan?.alerts) signal("step");
        else if (left && next.opts.offRouteAlert) signal("off");
        return next;
      }),

    pause: (owner: string) =>
      lock(async () => {
        const r = await read(owner);
        if (!r || r.status !== "recording") return r;
        const t = deps.now();
        const next: Recording = { ...r, status: "paused", activeMs: activeMs(r, t), runStart: null, newSegment: true, stretches: closeStretch(r.stretches, edge(r, t), "pause") };
        await save(next, owner);
        await deps.stopUpdates().catch(() => {});
        return next;
      }),

    resume: (owner: string) =>
      lock(async () => {
        const r = await read(owner);
        if (!r || r.status !== "paused") return r;
        const t = deps.now();
        // The last position is from before the pause: the signal is searched again rather than shown as lost.
        const next: Recording = { ...r, status: "recording", runStart: t, newSegment: true, interrupted: false, live: null, stretches: [...r.stretches, { s: t, e: null, why: "pause" }] };
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
        const r = await read(owner);
        if (!r || r.status === "ended") return r;
        const t = deps.now();
        // Finished while paused or interrupted: the outing ended where it last ran, the wait before « Terminer » is not part of it.
        const endedAt = r.status === "recording" ? edge(r, t) : r.stretches.at(-1)?.e ?? r.startedAt;
        let next: Recording = { ...r, activeMs: activeMs(r, t), runStart: null, stretches: closeStretch(r.stretches, endedAt, "finish") };
        next = { ...next, plan: runPlan(next, endedAt).plan, status: "ended", endedAt };
        await save(next, owner);
        if (r.status === "recording") await deps.stopUpdates().catch(() => {});
        return next;
      }),

    /** Throws the recording away (nothing is kept). */
    discard: (owner: string) =>
      lock(async () => {
        const r = await read(owner);
        if (r?.status === "recording") await deps.stopUpdates().catch(() => {});
        await save(null, owner);
      }),

    /** On app start: a recording that claims to run while the service is gone was interrupted. Close the stretch at the
        last fix; the athlete can resume or finish. */
    reconcile: (owner: string) =>
      lock(async () => {
        const r = await read(owner);
        if (!r || r.status !== "recording") return r;
        if (await deps.updatesRunning()) return r;
        const end = lastFix(r)?.t ?? r.runStart ?? deps.now();
        const next: Recording = { ...r, status: "paused", activeMs: r.activeMs + Math.max(0, end - (r.runStart ?? end)), runStart: null, newSegment: true, interrupted: true, stretches: closeStretch(r.stretches, end, "interrupted") };
        await save(next, owner);
        return next;
      }),

    /** Automatic pause and the off-route vibration, changed before or during the outing. */
    setOptions: (owner: string, patch: Partial<RecOptions>) => change(owner, (r) => ({ ...r, opts: { ...r.opts, ...patch } })),

    setGoal: (owner: string, goal: GpsGoal | null) => change(owner, (r) => ({ ...r, goal: GpsSession.goalOf(goal) })),

    /** Sets, replaces or removes the structured session. A plan set during the outing starts from where the outing is; the same
        steps given again (only the alert choice changed) keep their progress. */
    setPlan: (owner: string, plan: { steps: GpsStep[]; alerts: boolean } | null) =>
      change(owner, (r) => {
        const steps = plan ? GpsSession.planOf(plan.steps) : [];
        if (!plan || !steps.length) return { ...r, plan: null };
        if (r.plan && JSON.stringify(r.plan.steps) === JSON.stringify(steps)) return { ...r, plan: { ...r.plan, alerts: plan.alerts } };
        const a = analyseRecording(r, deps.now());
        return { ...r, plan: { steps, alerts: plan.alerts, cursor: { index: 0, fromS: a.recordingS, fromM: a.distanceM, laps: [] } } };
      }),

    /** The athlete ends the current step by hand. */
    skipStep: (owner: string) =>
      change(owner, (r) => (r.plan && r.plan.cursor.index < r.plan.steps.length ? { ...r, plan: { ...r.plan, cursor: GpsSession.skipStep(r.plan.steps, r.plan.cursor, analyseRecording(r, deps.now())) } } : r)),

    /** Follows a route kept on this phone (or stops following with null). The latest position places the athlete at once. */
    follow: (owner: string, target: { id: string; name: string } | null) =>
      change(owner, async (r) => {
        if (!target) return r.follow ? { ...r, follow: null } : r;
        if (r.follow?.id === target.id) return r;
        const course = await courseOf(owner, target.id);
        const at = lastFix(r);
        const state = course && at ? advance(course, GpsNav.startFollow(), [at], r.sport).state : GpsNav.startFollow();
        return { ...r, follow: { id: target.id, name: target.name, state } };
      }),

    /** Back to the start by the same path: the trace recorded so far becomes the line to follow, backwards. */
    backToStart: (owner: string, on: boolean) =>
      change(owner, (r) => {
        if (!on) return r.back ? { ...r, back: null } : r;
        const at = lastFix(r);
        const next: Recording = { ...r, back: { at: at?.t ?? deps.now(), state: GpsNav.startFollow() } };
        const course = backCourseOf(next);
        return course && at ? { ...next, back: { ...next.back!, state: advance(course, next.back!.state, [at], r.sport).state } } : next;
      }),

    /** The full reading of the recording by the engine: total, moving, stopped, paused, missing, averages, splits, timeline. */
    analysis: (r: Recording, at = deps.now()): GpsAnalysis => analyseRecording(r, at),

    /** The totals older callers read; every number is the engine's. `activeSeconds` is the time the recording was running. */
    summary(r: Recording, at = deps.now()): Summary {
      const a = analyseRecording(r, at);
      return { distanceKm: a.distanceKm, activeSeconds: a.recordingS, movingSeconds: a.movingS, avgSpeedKmh: a.avgMovingKmh, ascent: a.ascentM, points: a.points, rejected: a.rejected, start: a.firstFixAt, end: a.lastFixAt };
    },
    gpx: (r: Recording, name: string) => toGpx(r.track, name),
  };
}
export type Recorder = ReturnType<typeof createRecorder>;
