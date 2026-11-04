import { availabilityOf, createHealthConnect, localDay, sportOf, SPORT_BY_EXERCISE, toCandidate, windowOf, type HcLib } from "../src/lib/healthConnect";

const NOW = new Date(2026, 10, 2, 9, 30); // Monday 2 November 2026, 09:30 (phone time)
const iso = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m, d, h, mi).toISOString();

function fakeLib(over: Partial<HcLib> = {}): HcLib & { calls: string[] } {
  const calls: string[] = [];
  const lib: HcLib = {
    getSdkStatus: async () => 3,
    initialize: async () => { calls.push("initialize"); return true; },
    requestPermission: async (p) => { calls.push("request:" + p.map((x) => x.recordType).join(",")); return p; },
    getGrantedPermissions: async () => [{ accessType: "read", recordType: "Steps" }],
    revokeAllPermissions: async () => { calls.push("revoke"); },
    openHealthConnectSettings: () => { calls.push("settings"); },
    aggregateGroupByPeriod: async () => [],
    readRecords: async () => ({ records: [] }),
    ...over,
  };
  return Object.assign(lib, { calls });
}

describe("Health Connect (read only, on request)", () => {
  test("only the two read permissions are ever requested", async () => {
    const lib = fakeLib();
    const hc = createHealthConnect(lib);
    const access = await hc.request();
    expect(lib.calls).toContain("request:Steps,ExerciseSession");
    expect(access).toEqual({ steps: true, exercise: true });
  });
  test("a refused Android prompt grants nothing", async () => {
    const hc = createHealthConnect(fakeLib({ requestPermission: async () => [] }));
    expect(await hc.request()).toEqual({ steps: false, exercise: false });
  });
  test("availability: unsupported without the library, unavailable, update required, ready", async () => {
    expect(await createHealthConnect(null).availability()).toBe("unsupported");
    expect(availabilityOf(1)).toBe("unavailable");
    expect(availabilityOf(2)).toBe("update_required");
    expect(availabilityOf(3)).toBe("ready");
    expect(await createHealthConnect(fakeLib({ getSdkStatus: async () => { throw new Error("x"); } })).availability()).toBe("unavailable");
  });
  test("the window is seven local calendar days ending today, in phone time", () => {
    const w = windowOf(NOW);
    expect(w.days).toEqual(["2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(w.days.length).toBe(7);
    expect(localDay(w.from)).toBe(w.days[0]);
  });
  test("steps are the Health Connect daily aggregate; a day without data is absent, never zero; out of window or absurd values are dropped", async () => {
    const w = windowOf(NOW);
    const lib = fakeLib({
      aggregateGroupByPeriod: async () => [
        { result: { COUNT_TOTAL: 8421 }, startTime: new Date(2026, 9, 30).toISOString(), endTime: new Date(2026, 9, 31).toISOString() },
        { result: { COUNT_TOTAL: 5200 }, startTime: new Date(2026, 10, 1).toISOString(), endTime: new Date(2026, 10, 2).toISOString() },
        { result: { COUNT_TOTAL: 999999 }, startTime: new Date(2026, 10, 2).toISOString(), endTime: new Date(2026, 10, 3).toISOString() },
        { result: { COUNT_TOTAL: 4000 }, startTime: new Date(2026, 8, 1).toISOString(), endTime: new Date(2026, 8, 2).toISOString() },
        { result: {}, startTime: new Date(2026, 9, 28).toISOString(), endTime: new Date(2026, 9, 29).toISOString() },
      ],
    });
    const days = await createHealthConnect(lib).readSteps(NOW);
    expect(days).toEqual([{ day: "2026-10-30", steps: 8421 }, { day: "2026-11-01", steps: 5200 }]);
    expect(days.every((d) => w.days.includes(d.day))).toBe(true);
  });
  test("only the eleven recognised sports become candidates, with a stable id, a bounded duration and a local start", () => {
    expect(new Set(Object.values(SPORT_BY_EXERCISE)).size).toBe(11);
    expect(sportOf(56)).toBe("running");
    expect(sportOf(999)).toBeNull();
    const ok = toCandidate({ startTime: iso(2026, 10, 1, 8, 0), endTime: iso(2026, 10, 1, 8, 45), exerciseType: 56, title: " Footing ", metadata: { id: "hc-abc_1" } });
    expect(ok).toMatchObject({ externalId: "hc-abc_1", sport: "running", minutes: 45, title: "Footing" });
    expect(toCandidate({ startTime: iso(2026, 10, 1, 8, 0), endTime: iso(2026, 10, 1, 8, 0), exerciseType: 56, metadata: { id: "x" } })).toBeNull();
    expect(toCandidate({ startTime: iso(2026, 10, 1, 8, 0), endTime: iso(2026, 10, 3, 8, 0), exerciseType: 56, metadata: { id: "x" } })).toBeNull();
    expect(toCandidate({ startTime: iso(2026, 10, 1, 8, 0), endTime: iso(2026, 10, 1, 9, 0), exerciseType: 999, metadata: { id: "x" } })).toBeNull();
    expect(toCandidate({ startTime: iso(2026, 10, 1, 8, 0), endTime: iso(2026, 10, 1, 9, 0), exerciseType: 56 })).toBeNull();
    expect(toCandidate({ startTime: iso(2026, 10, 1, 8, 0), endTime: iso(2026, 10, 1, 9, 0), exerciseType: 56, metadata: { id: "bad id !" } })).toBeNull();
  });
  test("sessions are read page by page, unreadable ones skipped, newest first, and the page loop is bounded", async () => {
    let page = 0;
    const lib = fakeLib({
      readRecords: async () => {
        page++;
        return { records: [{ startTime: iso(2026, 10, 1, page, 0), endTime: iso(2026, 10, 1, page, 30), exerciseType: 79, metadata: { id: `w${page}` } }, { startTime: iso(2026, 10, 1, 1, 0), endTime: iso(2026, 10, 1, 1, 30), exerciseType: 999, metadata: { id: "z" } }], pageToken: "next" };
      },
    });
    const list = await createHealthConnect(lib).readSessions(NOW);
    expect(page).toBe(10);
    expect(list.length).toBe(10);
    expect(list[0]!.startedAt > list[9]!.startedAt).toBe(true);
    expect(list.every((c) => c.sport === "walking")).toBe(true);
  });
  test("nothing is read without the library, and revoking goes through Android", async () => {
    const none = createHealthConnect(null);
    expect(await none.readSteps(NOW)).toEqual([]);
    expect(await none.readSessions(NOW)).toEqual([]);
    const lib = fakeLib();
    await createHealthConnect(lib).revoke();
    expect(lib.calls).toContain("revoke");
  });
});
