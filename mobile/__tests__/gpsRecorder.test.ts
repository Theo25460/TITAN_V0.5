import { createRecorder, recKey, type Deps, type Recording } from "../src/lib/gpsRecorder";
import type { Fix } from "../src/lib/gpsTrack";

const T0 = Date.UTC(2026, 10, 2, 8, 0, 0);
const fix = (i: number, over: Partial<Fix> = {}): Fix => ({ lat: 48.85 + i * 0.000045, lon: 2.35, alt: 100, altAcc: 5, acc: 5, t: T0 + i * 1000, ...over });

function setup() {
  const store = new Map<string, Recording | null>();
  const calls: string[] = [];
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
  };
  return { rec: createRecorder(deps), store, calls, tick: (ms: number) => (clock += ms), setClock: (t: number) => (clock = t), fail: (v: boolean) => (failStart = v), setRunning: (v: boolean) => (running = v) };
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
  const d = draftFromRecording(done, s.rec.summary(done));
  expect(d.sport).toBe("running");
  expect(d.durH).toBe("1");
  expect(d.durM).toBe("2");
  expect(d.durS).toBe("5");
  expect(d.distance).toMatch(/^0,[23]/);
  expect(d.gpx?.points).toBe(61);
  expect(JSON.stringify(d)).not.toContain("48.85");
});
