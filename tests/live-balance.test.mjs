// TITAN LIVE balance: same effort, similar reward, whatever the sport; length and volume are not rewarded beyond the
// daily cap; variety accelerates without blocking specialists; progression lasts more than a year.
import test from "node:test";
import assert from "node:assert/strict";
import { PROFILES, simulate } from "../tools/simulate-live.mjs";

const r12 = Object.fromEntries(Object.entries(PROFILES).map(([k, p]) => [k, simulate(p, 12)]));
const r52 = Object.fromEntries(Object.entries(PROFILES).map(([k, p]) => [k, simulate(p, 52)]));

test("resources per hour of effort stay in one band across sports; the ultra-distance athlete earns no premium", () => {
  for (const [k, r] of Object.entries(r12)) if (k !== "ultra") assert.ok(r.perHour >= 70 && r.perHour <= 120, `${k}: ${r.perHour}/h`);
  assert.ok(Math.abs(r12.yoga.perHour - r12.coureur.perHour) <= r12.coureur.perHour * 0.1, "yoga = running at equal minutes");
  assert.ok(r12.ultra.earned <= r12.coureur.earned * 1.15, "2.6× the minutes, about the same world progress");
  assert.ok(Math.abs(r12.foot.earned - r12.force.earned) <= r12.force.earned * 0.2, "two long matches ≈ three gym sessions");
});

test("variety accelerates, specialists are never blocked", () => {
  assert.ok(r12.polyvalent.earned > r12.coureur.earned && r12.polyvalent.earned <= r12.coureur.earned * 1.45);
  assert.ok(r12.polyvalent.lands > r12.coureur.lands);
  for (const k of ["coureur", "force", "yoga", "foot", "ultra"]) assert.ok(r52[k].levels >= 15 && r52[k].cordee >= 9, `${k} builds and reads the story alone`);
});

test("beginners feel progress at once; nobody finishes everything in a year", () => {
  const week1 = simulate(PROFILES.debutant, 1);
  assert.ok(week1.levels >= 1, "a first building level in the first week");
  assert.ok(simulate(PROFILES.debutant, 4).cordee >= 2);
  for (const [k, r] of Object.entries(r52)) assert.ok(r.levels < 30, `${k} still has something to build after a year`);
  assert.ok(r12.coureur.cordee < 10, "the Cordée is not over after three months");
});
