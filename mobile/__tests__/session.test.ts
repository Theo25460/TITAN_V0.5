import { EffortRules, Sports } from "../src/core";
import { buildSession, freshDraft, sanitizeExercises, toPayload } from "../src/core/session";

const NOW = new Date("2026-10-21T18:30:00");
const ID = "11111111-2222-4333-8444-555555555555";

describe("session payload (same contract as js/app/seance.js + logActivity)", () => {
  test("distance session: km, val1/val2/duration, client_event_id, schemaVersion 2", () => {
    const d = { ...freshDraft("running", NOW), distance: "10,5", durM: "55", rpe: 6 };
    const b = buildSession(d, NOW);
    expect(b.errors).toEqual([]);
    const p = toPayload(b, "running", ID, "Europe/Paris", false, NOW.getTime());
    expect(p).toMatchObject({ sport: "running", unit: "km", val: 10.5, category: Sports.conf("running")!.cat });
    expect(p.details).toMatchObject({ val1: 10.5, val2: 55, duration: 55, bio: { rpe: 6 }, client_event_id: ID, schemaVersion: 2, timezone: "Europe/Paris" });
    expect(p.date).toBe(NOW.toISOString());
  });

  test("strength session: per-set rows, volume as value in kg", () => {
    const d = freshDraft("muscu_gym", NOW);
    d.exercises = [{ name: "Squat", variant: "", kind: "weighted", sets: [{ weight: "100", reps: "5", rir: "2", seconds: "" }, { weight: "100", reps: "5", rir: "", seconds: "" }] }];
    const p = toPayload(buildSession(d, NOW), "muscu_gym", ID, "Europe/Paris");
    expect(p.unit).toBe("kg");
    expect(p.val).toBe(1000);
    expect(p.details.exercises?.[0]).toMatchObject({ name: "Squat", sets: 2, totalReps: 10, volume: 1000, weight: 100, setRows: [{ weight: 100, reps: 5, rir: 2 }, { weight: 100, reps: 5, rir: null }] });
  });

  test("bodyweight session counts repetitions", () => {
    const d = freshDraft("bodyweight", NOW);
    d.exercises = [{ name: "Pompes", variant: "", kind: "bodyweight", sets: [{ weight: "", reps: "20", rir: "", seconds: "" }, { weight: "", reps: "15", rir: "", seconds: "" }] }];
    const p = toPayload(buildSession(d, NOW), "bodyweight", ID, "Europe/Paris");
    expect(p.unit).toBe("reps");
    expect(p.val).toBe(35);
  });

  test("climbing requires a duration and keeps grade context", () => {
    const d = freshDraft("bouldering", NOW);
    expect(buildSession(d, NOW).errors[0].message).toMatch(/durée/);
    d.durH = "1";
    d.durM = "30";
    d.climbing = { ...d.climbing, attempts: "8", successes: "5", best: "6b+" };
    const p = toPayload(buildSession(d, NOW), "bouldering", ID, "Europe/Paris");
    expect(p.unit).toBe("min");
    expect(p.val).toBe(90);
    expect(p.details.extras).toMatchObject({ climbing_discipline: "Bloc", location: "Salle", grade_system: "Fontainebleau bloc", attempts: 8, successful_routes: 5, max_done: "6b+" });
  });

  test("validation: future date, distance limit, successes above attempts", () => {
    const future = { ...freshDraft("running", NOW), when: "other" as const, date: "2026-10-25", distance: "5" };
    expect(buildSession(future, NOW).errors[0].message).toMatch(/futur/);
    expect(buildSession({ ...freshDraft("running", NOW), distance: "301" }, NOW).errors[0].message).toMatch(/300 km/);
    const c = freshDraft("bouldering", NOW);
    c.durM = "60";
    c.climbing = { ...c.climbing, attempts: "2", successes: "3" };
    expect(buildSession(c, NOW).errors[0].message).toMatch(/réussites/);
  });

  test("note limit follows the website (180, 600 with TITAN+)", () => {
    const d = { ...freshDraft("yoga", NOW), durM: "30", note: "x".repeat(400) };
    expect(toPayload(buildSession(d, NOW), "yoga", ID, "UTC").details.note).toHaveLength(180);
    expect(toPayload(buildSession(d, NOW), "yoga", ID, "UTC", true).details.note).toHaveLength(400);
  });

  test("sanitizer drops empty exercises and clamps values like titanSanitizeSessionDetails", () => {
    const out = sanitizeExercises([{ name: "  Développé   couché ", setRows: [{ weight: 2000, reps: 900, rir: 50 }] }, { name: "", setRows: [{ weight: 10, reps: 5 }] }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "Développé couché", weight: 1000, reps: 500, setRows: [{ weight: 1000, reps: 500, rir: 10 }] });
  });
});

describe("effort and level rules (mirror of titan_effort_v300)", () => {
  test("documented examples", () => {
    expect(EffortRules.effort({ sport: "running", unit: "km", val: 10, details: { duration: 55, bio: { rpe: 6 } } }).xp).toBe(594);
    expect(EffortRules.effort({ sport: "swimming", profile: "swimming", unit: "m", val: 1500, details: { duration: 40 } }).xp).toBe(400);
    expect(EffortRules.effort({ sport: "muscu_gym", unit: "kg", val: 1000, details: { duration: 45, bio: { rpe: 7 } } }).xp).toBe(522);
  });
  test("level curve 500 × L^1.3", () => {
    expect(EffortRules.levelRequirement(1)).toBe(500);
    expect(EffortRules.totalForLevel(3)).toBe(1731);
    expect(EffortRules.rank(10).name).toBe("Gardien");
  });
});
