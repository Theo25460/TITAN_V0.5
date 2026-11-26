import { createRecorder, recKey, upgradeRecording, type Deps, type RawFix, type Recording, type RecordingV1 } from "../src/lib/gpsRecorder";
import type { Fix } from "../src/lib/gpsTrack";
import { GpsNav, GpsSession, type GpsAnalysis, type NavRoute } from "../src/core";

const T0 = Date.UTC(2026, 10, 2, 8, 0, 0);
const fix = (i: number, over: Partial<Fix> = {}): Fix => ({ lat: 48.85 + i * 0.000045, lon: 2.35, alt: 100, altAcc: 5, acc: 5, t: T0 + i * 1000, ...over });

function setup() {
  const store = new Map<string, Recording | RecordingV1 | null>();
  const calls: string[] = [];
  const alerts: string[] = [];
  const routes = new Map<string, NavRoute>();
  let routeReads = 0;
  let clock = T0;
  let running = false;
  let failStart = false;
  const deps: Deps = {
    read: async (k) => (store.get(k) ? JSON.parse(JSON.stringify(store.get(k))) : null),
    write: async (k, v) => void store.set(k, v ? JSON.parse(JSON.stringify(v)) : null),
    startUpdates: async () => {
      if (failStart) throw new Error("PERMISSION");
      running = true;
      calls.push("start");
    },
    stopUpdates: async () => {
      running = false;
      calls.push("stop");
    },
    updatesRunning: async () => running,
    now: () => clock,
    loadRoute: async (_owner, id) => {
      routeReads++;
      return routes.get(id) ?? null;
    },
    alert: (kind) => void alerts.push(kind),
  };
  return { rec: createRecorder(deps), store, calls, alerts, routes, routeReads: () => routeReads, tick: (ms: number) => (clock += ms), setClock: (t: number) => (clock = t), fail: (v: boolean) => (failStart = v), setRunning: (v: boolean) => (running = v) };
}

test("start, record, pause, resume, finish: active time excludes the pause and the pause is a new segment", async () => {
  const s = setup();
  await s.rec.start("u1", "running");
  await s.rec.append("u1", Array.from({ length: 11 }, (_, i) => fix(i)));
  s.setClock(T0 + 10_000);
  await s.rec.pause("u1");
  s.setClock(T0 + 310_000); // five minutes of pause
  await s.rec.resume("u1");
  await s.rec.append("u1", [fix(311, { lat: 48.86 }), fix(312, { lat: 48.86 + 0.000045 })]);
  s.setClock(T0 + 322_000);
  const done = (await s.rec.finish("u1"))!;
  expect(done.status).toBe("ended");
  expect(done.track.segs).toHaveLength(2);
  expect(done.activeMs).toBe(10_000 + 12_000);
  const sum = s.rec.summary(done);
  expect(sum.activeSeconds).toBe(22);
  expect(sum.distanceKm).toBeLessThan(0.1); // the 1 km jump across the pause is never counted
  expect(s.calls).toEqual(["start", "stop", "start", "stop"]);
});

test("fixes are ignored while paused or after the end, and a stale cached fix before the start is dropped", async () => {
  const s = setup();
  await s.rec.start("u1", "cycling");
  await s.rec.append("u1", [fix(-60), fix(1), fix(2)]);
  expect((await s.rec.load("u1"))!.track.segs.flat()).toHaveLength(2);
  await s.rec.pause("u1");
  await s.rec.append("u1", [fix(3)]);
  expect((await s.rec.load("u1"))!.track.segs.flat()).toHaveLength(2);
});

test("two simultaneous batches are both kept (serialised writes)", async () => {
  const s = setup();
  await s.rec.start("u1", "running");
  await Promise.all([s.rec.append("u1", [fix(1), fix(2)]), s.rec.append("u1", [fix(3), fix(4)])]);
  expect((await s.rec.load("u1"))!.track.segs.flat()).toHaveLength(4);
});

test("a recording is private to its account", async () => {
  const s = setup();
  await s.rec.start("u1", "running");
  expect(await s.rec.load("u2")).toBeNull();
  expect(s.store.has(recKey("u2"))).toBe(false);
  await s.rec.append("u2", [fix(1)]);
  expect(await s.rec.load("u2")).toBeNull();
});

test("a second start is refused while one is open, a failed start leaves nothing", async () => {
  const s = setup();
  s.fail(true);
  await expect(s.rec.start("u1", "running")).rejects.toThrow("PERMISSION");
  expect(await s.rec.load("u1")).toBeNull();
  s.fail(false);
  await s.rec.start("u1", "running");
  await expect(s.rec.start("u1", "running")).rejects.toThrow("ALREADY_RECORDING");
});

test("a service lost after a restart closes the stretch at the last fix, never extends it", async () => {
  const s = setup();
  await s.rec.start("u1", "running");
  await s.rec.append("u1", Array.from({ length: 31 }, (_, i) => fix(i)));
  s.setClock(T0 + 3_600_000); // the phone was off for an hour
  s.setRunning(false);
  const r = (await s.rec.reconcile("u1"))!;
  expect(r.status).toBe("paused");
  expect(r.interrupted).toBe(true);
  expect(r.activeMs).toBe(30_000);
  await s.rec.resume("u1");
  expect((await s.rec.load("u1"))!.interrupted).toBe(false);
});

test("reconcile leaves a live recording alone", async () => {
  const s = setup();
  await s.rec.start("u1", "running");
  expect((await s.rec.reconcile("u1"))!.status).toBe("recording");
});

test("discard removes everything", async () => {
  const s = setup();
  await s.rec.start("u1", "running");
  await s.rec.discard("u1");
  expect(await s.rec.load("u1")).toBeNull();
});

test("finishing or discarding a paused old recording leaves the new owner's GPS service running", async () => {
  const s = setup();
  await s.rec.start("old", "running");
  await s.rec.pause("old");
  await s.rec.start("new", "cycling");
  await s.rec.finish("old");
  await s.rec.discard("old");
  expect((await s.rec.reconcile("new"))?.status).toBe("recording");
});

import { draftFromRecording } from "../src/lib/gpsDraft";
test("the finished recording becomes the usual form draft, with no coordinates in it", async () => {
  const s = setup();
  await s.rec.start("u1", "running");
  await s.rec.append("u1", Array.from({ length: 61 }, (_, i) => fix(i)));
  s.setClock(T0 + 3_725_000);
  const done = (await s.rec.finish("u1"))!;
  // V1.7.7: the duration is the effort (60 s of movement), no longer the 1 h 02 the recording stayed open without a position.
  for (const d of [draftFromRecording(done, s.rec.summary(done)), draftFromRecording(done, s.rec.analysis(done))]) {
    expect(d.sport).toBe("running");
    expect([d.durH, d.durM, d.durS]).toEqual(["", "1", ""]);
    expect(d.gpx?.movingMinutes).toBe(1);
    expect(d.gpx?.elapsedMinutes).toBeCloseTo(62.08, 2);
    expect(d.distance).toMatch(/^0,[23]/);
    expect(d.gpx?.points).toBe(61);
    expect(JSON.stringify(d)).not.toContain("48.85");
  }
});

/* ---- V1.7.7: recording v2 ---- */
const M_PER_DEG = (Math.PI / 180) * 6371008.8;
/** `north` metres north and `east` metres east of the origin, at second `sec`: distances are exact by construction. */
const at = (north: number, sec: number, over: Partial<RawFix> = {}, east = 0): RawFix => ({ lat: 48.58 + north / M_PER_DEG, lon: 7.7 + east / (M_PER_DEG * Math.cos((48.58 * Math.PI) / 180)), alt: null, altAcc: null, acc: 5, t: T0 + sec * 1000, ...over });
const sumOfParts = (a: GpsAnalysis) => a.ms.moving + a.ms.stopped + a.ms.paused + a.ms.interrupted + a.ms.missing;
/** Feeds fixes like the background task does: in batches, the clock at the last fix of each batch. */
async function feed(s: ReturnType<typeof setup>, owner: string, fixes: RawFix[], batch = 30) {
  for (let i = 0; i < fixes.length; i += batch) {
    const part = fixes.slice(i, i + batch);
    s.setClock(part[part.length - 1]!.t);
    await s.rec.append(owner, part);
  }
}

test("v2: stretches are opened at start and resume, closed by pause, interruption and finish, and the time adds up", async () => {
  const s = setup();
  await s.rec.start("u1", "running");
  await feed(s, "u1", Array.from({ length: 61 }, (_, i) => at(i * 3, i)));
  s.setClock(T0 + 60_000);
  await s.rec.pause("u1");
  s.setClock(T0 + 360_000);
  await s.rec.resume("u1");
  await feed(s, "u1", Array.from({ length: 61 }, (_, i) => at(180 + i * 3, 360 + i)));
  // The service dies: the stretch is closed at the last fix, not at the clock.
  s.setClock(T0 + 2_000_000);
  s.setRunning(false);
  const lost = (await s.rec.reconcile("u1"))!;
  expect(lost.stretches).toEqual([
    { s: T0, e: T0 + 60_000, why: "pause" },
    { s: T0 + 360_000, e: T0 + 420_000, why: "interrupted" },
  ]);
  s.setClock(T0 + 3_000_000);
  await s.rec.resume("u1");
  await feed(s, "u1", Array.from({ length: 31 }, (_, i) => at(360 + i * 3, 3000 + i)));
  s.setClock(T0 + 3_030_000);
  const running = (await s.rec.load("u1"))!;
  expect(running.stretches.at(-1)).toEqual({ s: T0 + 3_000_000, e: null, why: "pause" });
  const done = (await s.rec.finish("u1"))!;
  expect(done.stretches.at(-1)).toEqual({ s: T0 + 3_000_000, e: T0 + 3_030_000, why: "finish" });
  expect(done.endedAt).toBe(T0 + 3_030_000);
  const a = s.rec.analysis(done);
  expect(a.elapsedS).toBe(3030);
  expect(a.pausedS).toBe(300);
  expect(a.interruptedS).toBe(2580);
  expect(a.movingS).toBe(150);
  expect(a.recordingS).toBe(150);
  expect(sumOfParts(a)).toBe(a.ms.elapsed);
  expect(a.distanceM).toBeGreaterThan(445);
  expect(a.distanceM).toBeLessThan(455);
  expect(done.track.segs).toHaveLength(3); // a pause and an interruption are never bridged
  // The older totals keep their meaning: the time the recording was running.
  expect(s.rec.summary(done).activeSeconds).toBe(150);
  expect(done.activeMs).toBe(150_000);
});

test("v2: the identity elapsed = moving + stopped + paused + interrupted + missing holds while recording, paused and ended", async () => {
  const s = setup();
  await s.rec.start("u1", "cycling");
  const fixes: RawFix[] = [];
  for (let i = 0; i <= 100; i++) fixes.push(at(i * 12, i * 2)); // 200 s at 6 m/s
  for (let i = 1; i <= 60; i++) fixes.push(at(1200 + (i % 2 ? 0.6 : -0.6), 200 + i * 2)); // 2 min at a red light
  fixes.push(at(1700, 520)); // 200 s without any position, then 500 m further
  for (let i = 1; i <= 50; i++) fixes.push(at(1700 + i * 12, 520 + i * 2));
  await feed(s, "u1", fixes);
  s.setClock(T0 + 631_500);
  let r = (await s.rec.load("u1"))!;
  for (const now of [T0 + 631_500, T0 + 700_000]) {
    const a = s.rec.analysis(r, now);
    expect(sumOfParts(a)).toBe(a.ms.elapsed);
    expect(a.ms.elapsed).toBe(now - T0);
  }
  const a = s.rec.analysis(r, T0 + 631_500);
  expect(a.stoppedS).toBeGreaterThanOrEqual(118);
  expect(a.missingS).toBe(200);
  expect(a.gaps).toHaveLength(1);
  expect(a.distanceM).toBeGreaterThan(1790); // the 500 m of the hole are not added
  expect(a.distanceM).toBeLessThan(1810);
  r = (await s.rec.pause("u1"))!;
  const paused = s.rec.analysis(r, T0 + 900_000);
  expect(paused.pausedS).toBe(Math.round((900_000 - 631_500) / 1000));
  expect(sumOfParts(paused)).toBe(paused.ms.elapsed);
  // Finished while paused: the outing ends where it last ran, the wait before « Terminer » is not part of it.
  s.setClock(T0 + 5_000_000);
  const done = (await s.rec.finish("u1"))!;
  expect(done.endedAt).toBe(T0 + 631_500);
  const end = s.rec.analysis(done);
  expect(end.elapsedS).toBe(632);
  expect(end.pausedS).toBe(0);
  expect(sumOfParts(end)).toBe(end.ms.elapsed);
});

test("v2: a recording stored before V1.7.7 is read without loss, its stretches derived from its segments", async () => {
  const seg1 = Array.from({ length: 31 }, (_, i) => fix(i));
  const seg2 = Array.from({ length: 21 }, (_, i) => fix(400 + i));
  const v1: RecordingV1 = { v: 1, owner: "u1", sport: "running", status: "paused", startedAt: T0, activeMs: 52_000, runStart: null, newSegment: true, interrupted: true, track: { segs: [seg1, seg2], rejected: 3 } };
  const up = upgradeRecording(JSON.parse(JSON.stringify(v1)))!;
  expect(up.v).toBe(2);
  expect(up.track).toEqual(v1.track);
  expect(up.activeMs).toBe(52_000);
  expect(up.stretches).toEqual([{ s: T0, e: T0 + 30_000, why: "pause" }, { s: T0 + 400_000, e: T0 + 420_000, why: "interrupted" }]);
  expect([up.live, up.follow, up.back, up.goal, up.plan, up.endedAt]).toEqual([null, null, null, null, null, null]);
  expect(up.opts.autoPause).toBe(true);
  // Through the recorder: resumed, extended and finished like any other.
  const s = setup();
  s.store.set(recKey("u1"), v1);
  expect((await s.rec.load("u1"))!.stretches).toHaveLength(2);
  s.setClock(T0 + 1_000_000);
  await s.rec.resume("u1");
  await feed(s, "u1", Array.from({ length: 11 }, (_, i) => fix(1000 + i, { lat: 48.9 + i * 0.000045 })));
  s.setClock(T0 + 1_010_000);
  const done = (await s.rec.finish("u1"))!;
  expect(done.v).toBe(2);
  expect(done.track.segs).toHaveLength(3);
  expect(done.track.rejected).toBe(3);
  expect(done.activeMs).toBe(62_000);
  const a = s.rec.analysis(done);
  expect(a.movingS).toBe(60);
  expect(a.pausedS).toBe(370);
  expect(a.interruptedS).toBe(580);
  expect(sumOfParts(a)).toBe(a.ms.elapsed);
  // A v1 recording that was running keeps its open stretch; an ended one ends at its last fix.
  expect(upgradeRecording({ ...v1, status: "recording", runStart: T0 + 400_000, newSegment: false, interrupted: false })!.stretches).toEqual([{ s: T0, e: T0 + 30_000, why: "pause" }, { s: T0 + 400_000, e: null, why: "pause" }]);
  const ended = upgradeRecording({ ...v1, status: "ended", interrupted: false })!;
  expect(ended.endedAt).toBe(T0 + 420_000);
  expect(ended.stretches.at(-1)!.why).toBe("finish");
  expect(upgradeRecording(null)).toBeNull();
});

test("v2: the latest raw position is the heartbeat, kept even when the position is refused, and only the fix is stored", async () => {
  const s = setup();
  await s.rec.start("u1", "running");
  expect((await s.rec.load("u1"))!.live).toBeNull();
  await s.rec.append("u1", [at(0, 1, { spd: 3.126, hdg: 42.4, alt: 212.3 }), at(3, 2, { spd: 3, hdg: -1 })]);
  let r = (await s.rec.load("u1"))!;
  expect(r.live).toEqual({ t: T0 + 2000, lat: at(3, 2).lat, lon: 7.7, acc: 5, spd: 3, hdg: null, alt: null });
  expect(Object.keys(r.track.segs[0]![0]!).sort()).toEqual(["acc", "alt", "altAcc", "lat", "lon", "t"]);
  // Too imprecise to be used: refused for the trace, but it proves the receiver is alive (« signal faible », not « perdu »).
  await s.rec.append("u1", [at(6, 4, { acc: 80, spd: 0.2, hdg: 10 })]);
  r = (await s.rec.load("u1"))!;
  expect(r.track.segs.flat()).toHaveLength(2);
  expect(r.track.why?.accuracy).toBe(1);
  expect(r.live).toMatchObject({ t: T0 + 4000, acc: 80, hdg: 10 });
  // An older position in a late batch never moves the heartbeat back; a resume searches the signal again.
  await s.rec.append("u1", [at(4, 3)]);
  expect((await s.rec.load("u1"))!.live!.t).toBe(T0 + 4000);
  await s.rec.pause("u1");
  expect((await s.rec.resume("u1"))!.live).toBeNull();
});

test("v2: standing still with time-based updates stays two fixes and is a stop, not a lost signal", async () => {
  const s = setup();
  await s.rec.start("u1", "hiking");
  const fixes: RawFix[] = [];
  for (let i = 0; i <= 60; i++) fixes.push(at(i * 2.4, i * 2));
  for (let i = 1; i <= 300; i++) fixes.push(at(144 + (i % 2 ? 0.5 : -0.5), 120 + i * 2)); // 10 minutes on a bench, a fix every 2 s
  await feed(s, "u1", fixes);
  const r = (await s.rec.load("u1"))!;
  expect(r.track.segs.flat().length).toBeLessThan(70); // the 300 fixes of the halt are its arrival and its latest
  expect(r.track.rejected).toBe(0);
  const a = s.rec.analysis(r, T0 + 720_000);
  expect(a.stoppedS).toBeGreaterThanOrEqual(595);
  expect(a.missingS).toBe(0);
  expect(a.movingS).toBeLessThanOrEqual(125);
  expect(a.timeline.at(-1)!.kind).toBe("stopped");
  expect(r.live!.t).toBe(T0 + 720_000);
});

test("v2: one wrong first position does not freeze the trace", async () => {
  const s = setup();
  await s.rec.start("u1", "running");
  await feed(s, "u1", [at(4000, 0), ...Array.from({ length: 30 }, (_, i) => at(i * 3, 2 + i * 2))]);
  const r = (await s.rec.load("u1"))!;
  expect(r.track.segs).toHaveLength(1);
  expect(r.track.segs[0]!.length).toBeGreaterThanOrEqual(28);
  expect(s.rec.analysis(r, T0 + 60_000).distanceM).toBeLessThan(100);
});

test("v2: the followed route advances in the background batch, is read once, and leaving it alerts (unless turned off)", async () => {
  const route = GpsNav.makeRoute([Array.from({ length: 41 }, (_, i) => ({ lat: 48.58 + (i * 50) / M_PER_DEG, lon: 7.7 }))], { name: "Boucle du canal" })!;
  for (const offRouteAlert of [true, false]) {
    const s = setup();
    s.routes.set("r1", route);
    await s.rec.start("u1", "running", { follow: { id: "r1", name: route.name }, opts: { offRouteAlert } });
    expect((await s.rec.load("u1"))!.follow).toMatchObject({ id: "r1", name: "Boucle du canal", state: { joined: false, off: false } });
    await feed(s, "u1", Array.from({ length: 101 }, (_, i) => at(i * 6, i * 2)), 10); // 600 m along the line
    let r = (await s.rec.load("u1"))!;
    expect(r.follow!.state.joined).toBe(true);
    expect(r.follow!.state.off).toBe(false);
    expect(r.follow!.state.remainingM).toBeGreaterThan(1390);
    expect(r.follow!.state.remainingM).toBeLessThan(1410);
    expect(JSON.stringify(r)).not.toContain("Boucle du canal\\\",\\\"segs"); // the route itself is not in the recording
    expect(r).not.toHaveProperty("follow.route");
    expect(s.alerts).toEqual([]);
    // Turns east and walks away from the line: 120 m off after 40 s.
    await feed(s, "u1", Array.from({ length: 20 }, (_, i) => at(600, 202 + i * 2, {}, (i + 1) * 6)), 5);
    r = (await s.rec.load("u1"))!;
    expect(r.follow!.state.off).toBe(true);
    expect(r.follow!.state.offM).toBeGreaterThan(100);
    expect(s.alerts).toEqual(offRouteAlert ? ["off"] : []); // once, when the line is left — not at every batch
    expect(s.routeReads()).toBe(1);
  }
});

test("v2: a route that is not on the phone leaves the follow state as it is, and nothing breaks", async () => {
  const s = setup();
  await s.rec.start("u1", "running", { follow: { id: "missing", name: "Parcours" } });
  await feed(s, "u1", Array.from({ length: 20 }, (_, i) => at(i * 6, i * 2)), 5);
  const r = (await s.rec.load("u1"))!;
  expect(r.follow!.state).toEqual(GpsNav.startFollow());
  expect(r.track.segs.flat()).toHaveLength(20);
  expect(s.routeReads()).toBeLessThanOrEqual(2); // 4 batches over 38 s: a missing route is looked for again every 30 s at most, not at every batch
  expect((await s.rec.follow("u1", null))!.follow).toBeNull();
});

test("v2: the structured session advances in the background batch and vibrates at each step only when asked", async () => {
  const steps = GpsSession.buildPlan({ warmup: { by: "time", value: 60 }, reps: 2, work: { by: "distance", value: 200 }, recover: { by: "manual" }, cooldown: null });
  expect(steps.map((x) => x.kind)).toEqual(["warmup", "work", "recover", "work"]);
  for (const alerts of [true, false]) {
    const s = setup();
    await s.rec.start("u1", "running", { plan: { steps, alerts } });
    await feed(s, "u1", Array.from({ length: 30 }, (_, i) => at(i * 4, i * 2)), 10); // 58 s: still warming up
    expect((await s.rec.load("u1"))!.plan!.cursor.index).toBe(0);
    expect(s.alerts).toEqual([]);
    await feed(s, "u1", Array.from({ length: 10 }, (_, i) => at(120 + i * 8, 60 + i * 2)), 10); // 78 s
    let r = (await s.rec.load("u1"))!;
    expect(r.plan!.cursor.index).toBe(1);
    expect(r.plan!.cursor.laps[0]).toMatchObject({ kind: "warmup", seconds: 60, manual: false });
    expect(s.alerts).toEqual(alerts ? ["step"] : []);
    await feed(s, "u1", Array.from({ length: 30 }, (_, i) => at(200 + i * 8, 80 + i * 2)), 10); // 200 m of effort done
    r = (await s.rec.load("u1"))!;
    expect(r.plan!.cursor.index).toBe(2);
    expect(r.plan!.cursor.laps[1]).toMatchObject({ kind: "work", metres: 200 });
    expect(s.alerts).toEqual(alerts ? ["step", "step"] : []);
    // The recovery is « au signal »: it only ends by hand, with its real duration.
    await feed(s, "u1", Array.from({ length: 20 }, (_, i) => at(440 + i * 2, 140 + i * 2)), 10);
    expect((await s.rec.load("u1"))!.plan!.cursor.index).toBe(2);
    r = (await s.rec.skipStep("u1"))!;
    expect(r.plan!.cursor.index).toBe(3);
    expect(r.plan!.cursor.laps[2]).toMatchObject({ kind: "recover", manual: true });
    // Paused: the recording time stands still, so does the plan.
    await s.rec.pause("u1");
    s.setClock(T0 + 5_000_000);
    await s.rec.resume("u1");
    expect((await s.rec.load("u1"))!.plan!.cursor.index).toBe(3);
    const done = (await s.rec.finish("u1"))!;
    const sum = GpsSession.planSummary(done.plan!.steps, done.plan!.cursor);
    expect([sum.total, sum.done, sum.complete]).toEqual([4, 3, false]);
    expect(sum.missed).toEqual(["Effort 2/2"]);
  }
});

test("v2: options, goal and plan are persisted, set mid-outing they start from where the outing is, and nothing changes once ended", async () => {
  const s = setup();
  await s.rec.start("u1", "gravel", { opts: { autoPause: false }, goal: { kind: "distance", km: 42.04 } });
  let r = (await s.rec.load("u1"))!;
  expect(r.opts).toEqual({ autoPause: false, offRouteAlert: true });
  expect(r.goal).toEqual({ kind: "distance", km: 42 });
  expect(r.plan).toBeNull();
  await feed(s, "u1", Array.from({ length: 61 }, (_, i) => at(i * 10, i * 2)));
  await s.rec.setOptions("u1", { autoPause: true });
  await s.rec.setGoal("u1", { kind: "time", minutes: 90 });
  const steps = GpsSession.buildPlan({ reps: 3, work: { by: "time", value: 120 }, recover: { by: "time", value: 60 } });
  await s.rec.setPlan("u1", { steps, alerts: true });
  r = JSON.parse(JSON.stringify(s.store.get(recKey("u1")))) as Recording;
  expect(r.opts.autoPause).toBe(true);
  expect(r.goal).toEqual({ kind: "time", minutes: 90 });
  expect(r.plan!.steps).toHaveLength(5);
  expect(r.plan!.cursor).toEqual({ index: 0, fromS: 120, fromM: 600, laps: [] }); // the first effort starts now, not at the start of the outing
  // Only the alert choice changes: the progress is kept.
  await feed(s, "u1", Array.from({ length: 65 }, (_, i) => at(600 + (i + 1) * 10, 120 + (i + 1) * 2)));
  expect((await s.rec.load("u1"))!.plan!.cursor.index).toBe(1);
  r = (await s.rec.setPlan("u1", { steps, alerts: false }))!;
  expect(r.plan).toMatchObject({ alerts: false, cursor: { index: 1 } });
  expect((await s.rec.setGoal("u1", { kind: "distance", km: -3 } as never))!.goal).toBeNull();
  expect((await s.rec.setPlan("u1", null))!.plan).toBeNull();
  s.setClock(T0 + 300_000);
  const done = (await s.rec.finish("u1"))!;
  expect((await s.rec.setOptions("u1", { autoPause: false }))!.opts.autoPause).toBe(true);
  expect((await s.rec.setGoal("u1", { kind: "time", minutes: 5 }))!.goal).toBeNull();
  expect(await s.rec.load("u1")).toEqual(done);
  expect(await s.rec.setGoal("nobody", null)).toBeNull();
});

test("v2: back to the start follows the recorded trace backwards, to the real start of this outing", async () => {
  const s = setup();
  await s.rec.start("u1", "hiking");
  await feed(s, "u1", [...Array.from({ length: 101 }, (_, i) => at(i * 3, i * 2)), ...Array.from({ length: 100 }, (_, i) => at(300, 202 + i * 2, {}, (i + 1) * 3))]); // 300 m north then 300 m east
  let r = (await s.rec.backToStart("u1", true))!;
  expect(r.back!.at).toBe(T0 + 400_000);
  expect(r.back!.state.joined).toBe(true);
  expect(r.back!.state.remainingM).toBeGreaterThan(590);
  expect(r.back!.state.remainingM).toBeLessThanOrEqual(600);
  // Walks back along the east leg: what is left is the way to the start by the path taken, not the straight line (424 m at the corner… 300 m here).
  await feed(s, "u1", Array.from({ length: 100 }, (_, i) => at(300, 402 + i * 2, {}, 300 - (i + 1) * 3)));
  r = (await s.rec.load("u1"))!;
  expect(r.back!.state.remainingM).toBeGreaterThan(290);
  expect(r.back!.state.remainingM).toBeLessThan(310);
  expect(r.back!.state.off).toBe(false);
  await feed(s, "u1", Array.from({ length: 99 }, (_, i) => at(300 - (i + 1) * 3, 602 + i * 2)));
  r = (await s.rec.load("u1"))!;
  expect(r.back!.state.remainingM).toBeLessThan(10);
  expect(r.back!.state.done).toBe(true);
  expect((await s.rec.backToStart("u1", false))!.back).toBeNull();
});

test("v2: sortie gravel de 55 km avec un arrêt de 20 minutes — moyenne en mouvement, arrêt et durée d’effort de bout en bout", async () => {
  const s = setup();
  await s.rec.start("u1", "gravel", { goal: { kind: "distance", km: 50 } });
  const v = 55000 / 9000; // 55 km in 2 h 30 of movement: 22.0 km/h
  const fixes: RawFix[] = [at(0, 0)];
  let m = 0, t = 0;
  for (let k = 0; k < 2250; k++) { t += 2; m += v * 2; fixes.push(at(m, t, { spd: v })); } // 1 h 15 out
  for (let k = 1; k <= 600; k++) fixes.push(at(m + (k % 2 ? 0.7 : -0.7), t + k * 2, { spd: 0 })); // 20 min at the café, the receiver still delivering
  t += 1200;
  for (let k = 0; k < 2250; k++) { t += 2; m += v * 2; fixes.push(at(m, t, { spd: v })); } // 1 h 15 more
  await feed(s, "u1", fixes, 60);
  s.setClock(T0 + t * 1000);
  const done = (await s.rec.finish("u1"))!;
  const a = s.rec.analysis(done);
  expect(a.elapsedS).toBe(10200);
  expect(Math.abs(a.stoppedS - 1200)).toBeLessThanOrEqual(15);
  expect(Math.abs(a.movingS - 9000)).toBeLessThanOrEqual(15);
  expect(Math.abs(a.distanceM - 55000)).toBeLessThanOrEqual(80);
  expect(a.avgMovingKmh).toBeGreaterThanOrEqual(21.9);
  expect(a.avgMovingKmh).toBeLessThanOrEqual(22.1);
  expect(a.avgOverallKmh).toBeGreaterThanOrEqual(19.3); // 55 km in 2 h 50: 19.4 km/h — the stop no longer « ruins » the moving average
  expect(a.avgOverallKmh).toBeLessThanOrEqual(19.5);
  expect(a.stops).toHaveLength(1);
  expect([a.pausedS, a.interruptedS, a.missingS]).toEqual([0, 0, 0]);
  expect(sumOfParts(a)).toBe(a.ms.elapsed);
  expect(a.splits).toHaveLength(55);
  expect(done.track.segs.flat().length).toBeLessThan(4520); // the 600 fixes of the stop are two
  expect(done.track.rejected).toBe(0);
  // What the server reads for the XP is the effort: 2 h 30, not the 2 h 50 the recording ran.
  const d = draftFromRecording(done, a);
  expect(a.effortS).toBe(a.movingS);
  expect(Math.abs((d.gpx!.movingMinutes as number) - 150)).toBeLessThanOrEqual(0.25);
  expect(d.gpx!.elapsedMinutes).toBe(170);
  expect([d.durH, d.durM]).toEqual(["2", a.effortS >= 9000 ? "30" : "29"]);
  expect(d.distance).toMatch(/^5(4,9\d?|5(,0\d?)?)$/);
  expect(d.gps).toMatchObject({ v: 1, family: "bike", autoPause: true, elapsedS: 10200, goal: { kind: "distance", km: 50, reached: true } });
  // With automatic pause off, the detected stop stays in the duration; a pause or a hole never would.
  const kept = draftFromRecording({ ...done, opts: { ...done.opts, autoPause: false } });
  expect(Math.abs((kept.gpx!.movingMinutes as number) - 170)).toBeLessThanOrEqual(0.25);
});
