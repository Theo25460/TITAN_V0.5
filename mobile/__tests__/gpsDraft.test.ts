/* V1.7.7 — from a finished GPS recording to the session the server receives: the duration sent for the XP is the EFFORT (time in
   movement; with automatic pause off, the detected stops stay in it), never a pause, an interruption or a period without a
   position; and `details.gps` carries the engine's digest, the structured session and the goal — bounded, without any position. */
import { buildSession, gpsDetails, sanitizeDetails, toPayload, applyGpxImport, removeGpxImport } from "../src/core/session";
import { GpsSession } from "../src/core";
import { draftFromRecording, gpsRecordDetails } from "../src/lib/gpsDraft";
import { createRecorder, type Deps, type RawFix, type Recording } from "../src/lib/gpsRecorder";

// A fixed past morning in local time, so « the date cannot be in the future » never interferes.
const T0 = new Date(2026, 9, 12, 8, 0, 0).getTime();
const M_PER_DEG = (Math.PI / 180) * 6371008.8;
const at = (north: number, sec: number, over: Partial<RawFix> = {}): RawFix => ({ lat: 45.2 + north / M_PER_DEG, lon: 5.7, alt: 300, altAcc: 4, acc: 5, t: T0 + sec * 1000, ...over });

function setup() {
  const store = new Map<string, unknown>();
  let clock = T0;
  const deps: Deps = {
    read: async (k) => (store.get(k) ? JSON.parse(JSON.stringify(store.get(k))) : null),
    write: async (k, v) => void store.set(k, v ? JSON.parse(JSON.stringify(v)) : null),
    startUpdates: async () => {},
    stopUpdates: async () => {},
    updatesRunning: async () => true,
    now: () => clock,
  };
  return { rec: createRecorder(deps), setClock: (t: number) => (clock = t) };
}

/** 20 min of running at 3 m/s, a 5 min halt (the receiver still delivering), a 6 min manual pause, 4 min without any position, 10 min of running. */
async function outing(setupArg: Parameters<ReturnType<typeof setup>["rec"]["start"]>[2] = {}): Promise<{ s: ReturnType<typeof setup>; done: Recording }> {
  const s = setup();
  await s.rec.start("u1", "running", setupArg);
  const feed = async (fixes: RawFix[]) => {
    for (let i = 0; i < fixes.length; i += 60) {
      const part = fixes.slice(i, i + 60);
      s.setClock(part[part.length - 1]!.t);
      await s.rec.append("u1", part);
    }
  };
  let m = 0, t = 0;
  const a: RawFix[] = [at(0, 0)];
  for (let k = 0; k < 600; k++) { t += 2; m += 6; a.push(at(m, t, { alt: 300 + m / 100 })); }
  for (let k = 1; k <= 150; k++) a.push(at(m + (k % 2 ? 0.5 : -0.5), t + k * 2, { alt: 336 }));
  t += 300;
  await feed(a);
  s.setClock(T0 + t * 1000);
  await s.rec.pause("u1");
  t += 360;
  s.setClock(T0 + t * 1000);
  await s.rec.resume("u1");
  const b: RawFix[] = [at(m, t + 2, { alt: 336 })];
  t += 2;
  t += 240; m += 700; // a tunnel: 4 minutes and 700 m without a position
  b.push(at(m, t, { alt: 336 }));
  for (let k = 0; k < 300; k++) { t += 2; m += 6; b.push(at(m, t, { alt: 336 })); }
  await feed(b);
  s.setClock(T0 + t * 1000);
  return { s, done: (await s.rec.finish("u1"))! };
}

test("the duration of the session is the effort: movement only with automatic pause, movement and detected stops without it — never the pause nor the hole", async () => {
  const { s, done } = await outing();
  const a = s.rec.analysis(done);
  expect(a.elapsedS).toBe(1200 + 300 + 360 + 2 + 240 + 600);
  expect(Math.abs(a.movingS - 1800)).toBeLessThanOrEqual(6);
  expect(Math.abs(a.stoppedS - 300)).toBeLessThanOrEqual(8);
  expect(a.pausedS).toBe(360);
  expect(a.missingS).toBe(240);
  expect(a.ms.moving + a.ms.stopped + a.ms.paused + a.ms.interrupted + a.ms.missing).toBe(a.ms.elapsed);

  const on = draftFromRecording(done, a);
  expect(a.effortS).toBe(a.movingS);
  expect(on.gpx!.movingMinutes).toBeCloseTo(a.movingS / 60, 2);
  expect(on.gpx!.elapsedMinutes).toBeCloseTo(a.elapsedS / 60, 2);
  expect((Number(on.durH || 0) * 60 + Number(on.durM)) * 60 + Number(on.durS || 0)).toBe(a.movingS);
  expect(on.when).toBe("other");
  expect([on.date, on.time]).toEqual(["2026-10-12", "08:00"]);
  expect(on.distance).toMatch(/^5,4/); // 5.4 km measured; the 700 m of the tunnel are not added
  expect(on.gpx!.ascent).toBe(a.ascentM);
  expect(on.elevation).toBe(String(a.ascentM));

  const off = draftFromRecording({ ...done, opts: { ...done.opts, autoPause: false } });
  const kept = off.gpx!.movingMinutes as number;
  expect(kept).toBeCloseTo((a.movingS + a.stoppedS) / 60, 1);
  expect(kept * 60).toBeLessThan(a.elapsedS - 360 - 240 + 5); // the manual pause and the tunnel are in neither
  expect(off.gps).toMatchObject({ autoPause: false });

  // What the server reads for the XP.
  const build = buildSession(on, new Date(T0 + 86_400_000));
  expect(build.errors).toEqual([]);
  expect(build.details.gpxStats).toMatchObject({ movingMinutes: on.gpx!.movingMinutes, elapsedMinutes: on.gpx!.elapsedMinutes });
  expect(build.details.duration).toBeCloseTo(a.movingS / 60, 1);
});

test("an unreliable altitude sends no climb, and a recording without movement has no usable duration", async () => {
  const s = setup();
  await s.rec.start("u1", "walking");
  await s.rec.append("u1", Array.from({ length: 40 }, (_, i) => at(0, i * 2, { alt: 300 + i, altAcc: 60 })));
  s.setClock(T0 + 80_000);
  const done = (await s.rec.finish("u1"))!;
  const d = draftFromRecording(done);
  expect(d.gpx).toMatchObject({ movingMinutes: null, ascent: null, descent: null });
  expect([d.durH, d.durM, d.durS, d.elevation]).toEqual(["", "", "", ""]);
  expect(buildSession(d, new Date(T0 + 86_400_000)).errors.some((e) => e.field === "duration" || e.field === "distance")).toBe(true);
});

test("details.gps travels from the draft to the payload: digest, structured session and goal, without a position and small", async () => {
  const steps = GpsSession.buildPlan({ warmup: { by: "time", value: 300 }, reps: 3, work: { by: "distance", value: 400 }, recover: { by: "time", value: 60 }, cooldown: { by: "manual" } });
  const { s, done } = await outing({ plan: { steps, alerts: true }, goal: { kind: "time", minutes: 25 } });
  const a = s.rec.analysis(done);
  const draft = draftFromRecording(done, a);
  expect(draft.gps).toMatchObject({
    v: 1, rules: "gps-engine-v1", family: "run", autoPause: true,
    elapsedS: a.elapsedS, movingS: a.movingS, stoppedS: a.stoppedS, pausedS: 360, missingS: 240, distanceM: a.distanceM, gapDistanceM: 700, altitude: "gnss", points: a.points,
    goal: { kind: "time", minutes: 25, reached: true },
  });
  const plan = (draft.gps as { plan: { total: number; done: number; laps: { k: string; s: number; m: number; x?: number }[] } }).plan;
  expect(plan.total).toBe(7);
  expect(plan.done).toBe(plan.laps.length);
  expect(plan.laps[0]).toEqual({ k: "warmup", s: 300, m: expect.any(Number) });
  expect(plan.laps[1]).toMatchObject({ k: "work", m: 400 });

  const build = buildSession(draft, new Date(T0 + 86_400_000));
  expect(build.details.gps).toEqual(draft.gps);
  const payload = toPayload(build, "running", "evt-1", "Europe/Paris", false, T0 + 86_400_000);
  expect(payload.details.gps).toEqual(draft.gps);
  const text = JSON.stringify(payload.details.gps);
  expect(text.length).toBeLessThan(700);
  expect(JSON.stringify(payload)).not.toMatch(/45\.2|5\.7\d/); // no coordinate anywhere in the session
  // Without a structured session and a goal: the digest alone.
  const plain = draftFromRecording({ ...done, plan: null, goal: null }, a);
  expect(Object.keys(plain.gps!)).not.toContain("plan");
  expect(JSON.stringify(plain.gps).length).toBeLessThan(330);
  // Replacing the recording by a GPX file, or removing it, drops what described the recording.
  expect(removeGpxImport(draft).gps).toBeUndefined();
  expect(applyGpxImport(draft, { ok: true, points: 10, ignoredPoints: 0, distanceKm: 3, movingMinutes: 20, elapsedMinutes: 21, ascent: null, descent: null, kind: "recorded", timing: "complete", routeType: "track", start: null }).gps).toBeUndefined();
});

test("details.gps is bounded whatever is handed over: 60 laps at most, whole numbers inside limits, unknown keys and text dropped", () => {
  const huge = {
    v: 1, rules: "gps-engine-v1".repeat(20), family: "bike", autoPause: "yes", elapsedS: 1e12, movingS: -5, stoppedS: 12.6, pausedS: "40", missingS: null, distanceM: 5e9, gapDistanceM: NaN,
    ascentM: null, descentM: 123456, altitude: "barometer", points: 999999, rejected: 3.2,
    track: [[45.2, 5.7]], note: "x".repeat(5000), lat: 45.2,
    plan: { total: 500, done: 500, laps: Array.from({ length: 500 }, (_, i) => ({ k: i % 2 ? "work" : "recover", s: 1e9, m: 1e9, x: i % 3 === 0, label: "y".repeat(200) })), missed: ["z".repeat(999)] },
    goal: { kind: "distance", km: 5000.123, reached: "true", extra: "w".repeat(999) },
  };
  const g = gpsDetails(huge)!;
  expect(Object.keys(g).sort()).toEqual(["altitude", "ascentM", "autoPause", "descentM", "distanceM", "elapsedS", "family", "gapDistanceM", "goal", "missingS", "movingS", "pausedS", "plan", "points", "rejected", "rules", "stoppedS", "v"]);
  expect(g).toMatchObject({ rules: "gps-engine-v1gps-engine-", elapsedS: 172800, movingS: 0, stoppedS: 13, pausedS: 40, missingS: 0, distanceM: 1000000, gapDistanceM: 0, ascentM: null, descentM: 30000, altitude: "unreliable", points: 20000, rejected: 3 });
  const plan = g.plan as { total: number; done: number; laps: Record<string, unknown>[] };
  expect([plan.total, plan.done, plan.laps.length]).toEqual([60, 60, 60]);
  expect(plan.laps[0]).toEqual({ k: "recover", s: 86400, m: 1000000, x: 1 });
  expect(g.goal).toEqual({ kind: "distance", km: 1000, reached: false });
  expect(JSON.stringify(g).length).toBeLessThan(3000); // the very worst case: 60 laps at their limits
  expect(JSON.stringify(g)).not.toContain("45.2");
  // The same bound applies on the way to the server, and a value that is not a digest is removed.
  expect(sanitizeDetails({ gps: huge }, "cycling").gps).toEqual(g);
  expect("gps" in sanitizeDetails({ gps: { anything: 1 } }, "cycling")).toBe(false);
  expect("gps" in sanitizeDetails({}, "cycling")).toBe(false);
  for (const bad of [null, undefined, "x", 3, [], { v: 2, rules: "r", family: "run" }]) expect(gpsDetails(bad)).toBeNull();
});

test("« être rentré pour » is reached when the outing ended before the chosen hour", async () => {
  const { s, done } = await outing({ goal: { kind: "return", at: T0 + 3 * 3600_000 } });
  const a = s.rec.analysis(done);
  expect(gpsRecordDetails(done, a)!.goal).toEqual({ kind: "return", at: T0 + 3 * 3600_000, reached: true });
  expect(gpsRecordDetails({ ...done, goal: { kind: "return", at: T0 + 600_000 } }, a)!.goal).toMatchObject({ reached: false });
});
