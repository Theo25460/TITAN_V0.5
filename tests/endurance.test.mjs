import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { highlights, bests } = createRequire(import.meta.url)("../js/core/endurance.js");

const run = (km, minutes, extra = {}) => ({ unit: "km", val: km, details: { duration: minutes, ...(extra.details || {}) }, ...extra });

test("an ultra-distance effort earns souvenirs for every step it passed, highest first, and names the next target", () => {
  const h = highlights([run(320, 1200, { details: { duration: 1200, elevation: 4200 } })]);
  assert.deepEqual(h.earned.filter((e) => e.family === "distance").map((e) => e.step), [300, 200, 100, 50]);
  assert.ok(h.earned.some((e) => e.label === "Ultra : 300 km"));
  assert.deepEqual(h.earned.filter((e) => e.family === "elevation").map((e) => e.step), [3000, 1000]);
  assert.deepEqual(h.next.map((n) => `${n.family}:${n.step}`), ["distance:500", "duration:24", "elevation:5000"]);
});

test("souvenirs come from one session, never from a sum of many", () => {
  const logs = Array.from({ length: 30 }, () => run(20, 120));
  const h = highlights(logs);
  assert.equal(h.earned.some((e) => e.family === "distance"), false);
  assert.equal(bests(logs).distanceKm, 20);
});

test("a held, flagged, suspicious or archived session earns nothing, and neither does an impossible pace", () => {
  for (const bad of [{ is_suspicious: true }, { status: "flagged" }, { status: "pending_review" }, { archived_at: "2026-10-01" }, { details: { duration: 600, rewardHeld: true } }]) {
    assert.equal(highlights([{ ...run(150, 600), ...bad, details: { duration: 600, ...(bad.details || {}) } }]).earned.length, 0, JSON.stringify(bad));
  }
  assert.equal(highlights([run(400, 60)]).earned.some((e) => e.family === "distance"), false, "400 km in one hour is impossible");
});

test("a duration-only session counts for its time and never for a distance", () => {
  const h = highlights([{ unit: "min", val: 300, details: { duration: 300 } }]);
  assert.deepEqual(h.earned.map((e) => e.key), ["endurance:duration:4"]);
  assert.equal(bests([{ unit: "min", val: 300, details: {} }]).durationH, 5);
});

test("nothing is granted: no XP, no credits, only labels", () => {
  const h = highlights([run(120, 480)]);
  for (const e of h.earned) assert.deepEqual(Object.keys(e).sort(), ["family", "key", "label", "step"]);
});
