import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const E = require("../js/core/effort.js");

test("effort mirrors the server v300 formula (same cases as sql/tests/300_progression.sql)", () => {
  const run = E.effort({ sport: "running", profile: "running", unit: "km", val: 10, details: { duration: 55, bio: { rpe: 6 } } });
  assert.equal(run.xp, 594);
  assert.equal(run.estimated, false);
  const swim = E.effort({ sport: "swimming", profile: "swimming", unit: "m", val: 1500, details: {} });
  assert.equal(swim.minutes, 37.5);
  assert.equal(swim.xp, 375);
  assert.equal(swim.estimated, true);
  assert.equal(E.effort({ sport: "swimming", profile: "swimming", unit: "m", val: 100 }).xp, 25);
  assert.equal(E.effort({ sport: "walking", profile: "mountain_endurance", unit: "km", val: 5 }).xp, 600);
  const gym = E.effort({
    sport: "muscu_gym",
    profile: "strength",
    unit: "kg",
    val: 4000,
    details: { exercises: [{ setRows: [{}, {}, {}, {}] }, { setRows: [{}, {}, {}] }, { sets: 5 }] },
  });
  assert.equal(gym.minutes, 30);
  assert.equal(gym.xp, 300);
  const yoga = E.effort({ sport: "yoga", profile: "mobility", unit: "min", val: 200, details: { rpe: 10 } });
  assert.equal(yoga.counted, 135);
  assert.equal(yoga.xp, 1890);
});

test("effort is fair across sports for the same time and intensity", () => {
  const hour = (sport, profile, unit, val) =>
    E.effort({ sport, profile, unit, val, details: { duration: 60, bio: { rpe: 6 } } }).xp;
  const values = [
    hour("running", "running", "km", 11),
    hour("swimming", "swimming", "m", 2400),
    hour("muscu_gym", "strength", "kg", 9000),
    hour("bouldering", "climbing", "min", 60),
    hour("football", "football", "min", 60),
  ];
  assert.ok(values.every((v) => v === values[0]), `same effort, same XP: ${values}`);
});

test("missing RPE is neutral, extreme RPE is bounded, absurd durations are capped", () => {
  assert.equal(E.effort({ unit: "min", val: 30 }).intensity, 1);
  assert.equal(E.effort({ unit: "min", val: 30, details: { rpe: 99 } }).intensity, 1.4);
  assert.equal(E.effort({ unit: "min", val: 30, details: { rpe: -4 } }).intensity, 0.68);
  assert.equal(E.effort({ unit: "min", val: 5000 }).counted, 135);
});

test("level curve: 500 × L^1.3, cumulative totals and ranks", () => {
  assert.equal(E.levelRequirement(1), 500);
  assert.equal(E.levelRequirement(2), 1231);
  assert.equal(E.levelRequirement(10), 9976);
  assert.equal(E.totalForLevel(3), 1731);
  assert.equal(E.totalForLevel(10), 38473);
  assert.deepEqual(E.levelFromTotal(1800), { level: 3, xp: 69, next: E.levelRequirement(3) });
  assert.equal(E.rank(1).name, "Éclaireur");
  assert.equal(E.rank(9).name, "Sentinelle");
  assert.equal(E.rank(40).name, "Légende");
  assert.equal(E.nextRank(9).name, "Gardien");
  assert.equal(E.nextRank(40), null);
});

test("sessions older than 30 days are history", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  assert.equal(E.isHistorical("2026-09-06T12:00:00Z", now), false);
  assert.equal(E.isHistorical("2026-09-04T12:00:00Z", now), true);
});
