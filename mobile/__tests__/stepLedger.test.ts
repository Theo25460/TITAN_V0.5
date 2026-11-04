import { applyReading, approxKm, emptyLedger, ledgerRows, mergeDays, MAX_DAY, partialFirstDay, todaySteps, type Ledger } from "../src/lib/stepLedger";

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const BOOT = at(1, 6);
const read = (l: Ledger, total: number, time: number, boot = BOOT) => applyReading(l, { total, boot, at: time });

describe("TITAN pedometer ledger", () => {
  test("no number before the first reading, and the first reading counts nothing it did not see", () => {
    const l0 = emptyLedger();
    expect(todaySteps(l0, at(4, 9))).toBeNull();
    const l1 = read(l0, 48_210, at(4, 9)); // the sensor already says 48 210 since boot: that is not today's walking
    expect(todaySteps(l1, at(4, 9))).toBe(0);
    expect(l1.last).toBe(48_210);
  });

  test("live readings add only what the sensor gained, and the same reading twice adds nothing", () => {
    let l = read(emptyLedger(), 1000, at(4, 9));
    l = read(l, 1040, at(4, 9, 1));
    l = read(l, 1040, at(4, 9, 1));
    l = read(l, 1100, at(4, 9, 2));
    expect(todaySteps(l, at(4, 9, 2))).toBe(100);
  });

  test("steps taken while TITAN was closed are credited when it opens again, on the same day exactly", () => {
    let l = read(emptyLedger(), 1000, at(4, 9));
    l = read(l, 6200, at(4, 18));
    expect(todaySteps(l, at(4, 18))).toBe(5200);
    expect(l.est).toEqual({});
  });

  test("a reboot restarts the total from zero: new steps are counted, never negative, never doubled", () => {
    let l = read(emptyLedger(), 9000, at(4, 9));
    l = read(l, 9500, at(4, 10)); // +500
    const newBoot = at(4, 11); // phone restarted at 11:00
    l = read(l, 120, at(4, 12), newBoot); // 120 steps since the reboot
    expect(todaySteps(l, at(4, 12))).toBe(620);
    l = read(l, 150, at(4, 12, 5), newBoot);
    expect(todaySteps(l, at(4, 12, 5))).toBe(650);
  });

  test("a total that goes backwards without a reboot is treated as a restart too", () => {
    let l = read(emptyLedger(), 5000, at(4, 9));
    l = read(l, 80, at(4, 10));
    expect(todaySteps(l, at(4, 10))).toBe(80);
  });

  test("a gap across midnight is shared by usual waking hours and the earlier day's share is flagged as an estimate", () => {
    let l = read(emptyLedger(), 1000, at(4, 20)); // closed at 20:00 …
    l = read(l, 1900, at(5, 8)); // … reopened at 08:00: 900 steps in between
    const yesterday = l.days["2026-11-04"];
    const today = l.days["2026-11-05"];
    expect(yesterday + today).toBe(900);
    // waking hours: 20:00–22:00 yesterday (2 h) vs 07:00–08:00 today (1 h) → two thirds / one third
    expect(yesterday).toBe(600);
    expect(today).toBe(300);
    expect(l.est["2026-11-04"]).toBe(600);
    expect(l.est["2026-11-05"]).toBeUndefined();
  });

  test("a gap spent entirely at night goes to the day it ends on", () => {
    let l = read(emptyLedger(), 1000, at(4, 23));
    l = read(l, 1040, at(5, 5));
    expect(l.days["2026-11-05"]).toBe(40);
    expect(l.days["2026-11-04"]).toBe(0);
  });

  test("an implausible jump is capped by the hours elapsed, and a day never passes the ceiling", () => {
    let l = read(emptyLedger(), 0, at(4, 9));
    l = read(l, 900_000, at(4, 9, 30)); // half an hour, 900 000 steps: a glitch
    expect(todaySteps(l, at(4, 9, 30))).toBeLessThanOrEqual(6050);
    let g = read(emptyLedger(), 0, at(4, 0, 1));
    for (let i = 1; i <= 30; i++) g = read(g, i * 12_000, at(4, i % 24, 59));
    expect(todaySteps(g, at(4, 23, 59)) ?? 0).toBeLessThanOrEqual(MAX_DAY);
  });

  test("garbage readings are ignored", () => {
    const l = read(emptyLedger(), 1000, at(4, 9));
    expect(applyReading(l, { total: NaN, boot: BOOT, at: at(4, 10) })).toBe(l);
    expect(applyReading(l, { total: -5, boot: BOOT, at: at(4, 10) })).toBe(l);
  });

  test("the first day says it started counting mid-day; later days do not", () => {
    const l = read(emptyLedger(), 1000, at(4, 14, 12));
    expect(partialFirstDay(l, at(4, 15))).toBe(true);
    expect(partialFirstDay(l, at(5, 9))).toBe(false);
    expect(todaySteps(l, at(6, 9))).toBeNull(); // a day with no reading at all is "no number", not 0
  });

  test("merging with Santé Connect never adds the sources: the larger number of the day wins and names its source", () => {
    const own = ledgerRows(read(read(emptyLedger(), 0, at(4, 8)), 4200, at(4, 12)));
    const merged = mergeDays(own, [{ day: "2026-11-04", steps: 6100, sources: ["health_connect"], updatedAt: "2026-11-04T10:00:00Z" }, { day: "2026-11-03", steps: 7000, sources: ["health_connect"] }]);
    expect(merged.find((r) => r.day === "2026-11-04")).toMatchObject({ steps: 6100, sources: ["health_connect"] });
    expect(merged.map((r) => r.day)).toEqual(["2026-11-03", "2026-11-04"]);
    const merged2 = mergeDays(own, [{ day: "2026-11-04", steps: 3000, sources: ["health_connect"] }]);
    expect(merged2[0]).toMatchObject({ steps: 4200, sources: ["titan"] });
  });

  test("the distance is only ever an approximation from a standard stride", () => {
    expect(approxKm(10_000)).toBe(7.5);
    expect(approxKm(0)).toBe(0);
  });
});
