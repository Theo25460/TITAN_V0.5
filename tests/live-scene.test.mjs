// « L'Expédition », the adventure view of a live session: the shared geometry must be deterministic (same scene on the website,
// on Android and in a reloaded page), must only draw what the engine decided, and must stay inside its frame for any session.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const S = require("../js/core/live-scene.js");
const numbers = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number);

test("the same session gives the same scene; another sport gets another relief", () => {
  const a = S.scene({ beats: 3, planCount: 8, seed: "running", elan: { value: 30, max: 90 } });
  const b = S.scene({ beats: 3, planCount: 8, seed: "running", elan: { value: 30, max: 90 } });
  assert.deepEqual(a, b);
  const other = S.scene({ beats: 3, planCount: 8, seed: "badminton", elan: { value: 30, max: 90 } });
  assert.notDeepEqual(a.ridges, other.ridges);
  assert.equal(a.ridges.length, 3);
});

test("waypoints lit, the next one and the traveller follow the beats; the session starts at the base camp", () => {
  const start = S.scene({ beats: 0, planCount: 6, seed: "x" });
  assert.equal(start.nodes.filter((n) => n.lit).length, 0);
  assert.equal(start.done, "");
  assert.deepEqual([start.traveller.x, start.traveller.y, start.traveller.atCamp], [start.camp.x, start.camp.y, true]);
  assert.equal(start.nodes.findIndex((n) => n.next), 0);
  // The very first beat already draws a stretch of trail, from the camp to the first waypoint.
  const one = S.scene({ beats: 1, planCount: 6, seed: "x" });
  assert.deepEqual(numbers(one.done).slice(0, 2), [one.camp.x, one.camp.y]);
  assert.deepEqual(numbers(one.done).slice(-2), [one.nodes[0].x, one.nodes[0].y]);
  const mid = S.scene({ beats: 4, planCount: 6, seed: "x" });
  assert.equal(mid.nodes.filter((n) => n.lit).length, 4);
  assert.deepEqual([mid.traveller.x, mid.traveller.y, mid.traveller.atCamp], [mid.nodes[3].x, mid.nodes[3].y, false]);
  assert.equal(mid.nodes.findIndex((n) => n.next), 4);
  assert.deepEqual(numbers(mid.done).slice(-2), [mid.nodes[3].x, mid.nodes[3].y]);
  assert.equal(S.scene({ beats: 4, planCount: 6, seed: "x", ended: true }).nodes.some((n) => n.next), false);
});

test("a short plan ends on the summit: the last planned waypoint is the summit, reached exactly when the plan is done", () => {
  for (const plan of [1, 2, 3, 5, 12]) {
    const full = S.scene({ beats: plan, planCount: plan, seed: "badminton" });
    assert.equal(full.nodes.length, plan);
    assert.equal(full.nodes.every((n) => n.lit), true);
    assert.deepEqual([full.traveller.x, full.traveller.y], [full.summit.x, full.summit.y], `plan of ${plan}: the traveller stands on the summit`);
    assert.equal(full.summit.reached, true);
    assert.equal(S.scene({ beats: plan - 1, planCount: plan, seed: "badminton" }).summit.reached, false);
  }
  // Going beyond the plan keeps the summit reached and never lights more waypoints than exist.
  const beyond = S.scene({ beats: 9, planCount: 3, seed: "badminton" });
  assert.equal(beyond.nodes.length, 3);
  assert.equal(beyond.summit.reached, true);
});

test("without a plan the window slides and never shows more waypoints lit than beats; with a plan the summit is the plan", () => {
  for (const beats of [0, 1, 5, 6, 7, 23, 24, 60, 400]) {
    const s = S.scene({ beats, seed: "trail" });
    assert.ok(s.nodes.length >= 6 && s.nodes.length <= 24, `window of ${s.nodes.length} for ${beats}`);
    assert.ok(s.nodes.filter((n) => n.lit).length <= beats);
    assert.ok(s.nodes.some((n) => !n.lit), `room ahead at ${beats} beats`);
    if (beats) assert.equal(s.nodes.filter((n) => n.lit).at(-1).index, beats - 1);
  }
  assert.equal(S.scene({ beats: 8, planCount: 8, seed: "p" }).summit.reached, true);
  assert.equal(S.scene({ beats: 7, planCount: 8, seed: "p" }).summit.reached, false);
  assert.equal(S.scene({ beats: 2, goalRatio: 1, seed: "p" }).summit.reached, true);
});

test("everything stays inside the frame, for any seed and any size of session", () => {
  for (const seed of ["running", "muscu_gym", "yoga", "escalade_bloc", "football", "", "çà-é", "x".repeat(80)]) {
    for (const beats of [0, 3, 24, 999]) {
      const s = S.scene({ beats, planCount: beats % 2 ? 12 : null, echoBeats: 2, elan: { value: beats * 7, max: 90 }, seed });
      const xs = [...s.nodes.map((n) => n.x), ...s.stars.map((p) => p.x), s.sky.x, s.summit.x], ys = [...s.nodes.map((n) => n.y), ...s.stars.map((p) => p.y), s.sky.y, s.summit.y - 22];
      for (const x of xs) assert.ok(x >= 0 && x <= s.width, `x ${x} (${seed}, ${beats})`);
      for (const y of ys) assert.ok(y >= 0 && y <= s.height, `y ${y} (${seed}, ${beats})`);
      for (const d of [...s.ridges, s.trail]) for (const n of numbers(d)) assert.ok(Number.isFinite(n) && n >= -1 && n <= Math.max(s.width, s.height) + 1, `path value ${n}`);
      assert.ok(s.sky.ratio >= 0 && s.sky.ratio <= 1);
    }
  }
});

test("the disc rises with the day's élan and the Écho stands on its own waypoint", () => {
  const low = S.scene({ beats: 1, seed: "s", elan: { value: 0, max: 90 } }), high = S.scene({ beats: 1, seed: "s", elan: { value: 90, max: 90 } });
  assert.ok(high.sky.y < low.sky.y, "higher in the sky with more élan");
  const s = S.scene({ beats: 5, planCount: 10, echoBeats: 3, seed: "s" });
  assert.deepEqual([s.echo.x, s.echo.y], [s.nodes[2].x, s.nodes[2].y]);
  assert.ok(Math.abs(s.sky.x - s.summit.x) > 120, "the disc never sits on the summit");
  assert.equal(S.scene({ beats: 5, planCount: 10, echoBeats: null, seed: "s" }).echo, null);
  assert.equal(S.scene({ beats: 5, planCount: 10, echoBeats: 99, seed: "s" }).echo, null);
});

test("the phone carries the same module as the website", () => {
  assert.equal(readFileSync(new URL("../mobile/src/core/web/live-scene.js", import.meta.url), "utf8"), readFileSync(new URL("../js/core/live-scene.js", import.meta.url), "utf8"));
});
