// Lot B — measure contracts by sport family: what a form asks for each of the 260 disciplines.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
require("../js/core/sports-catalog.js");
const Sports = require("../js/core/sports.js");
const C = require("../js/core/sport-contracts.js");
const ROWS = globalThis.TITAN_SPORTS_SNAPSHOT;
const fieldsOf = (id) => ROWS.find((r) => r[0] === id)[7];
const asked = (id, values) => C.entryFields(id, fieldsOf(id), { values }).map((f) => f.id);

test("the 260 disciplines each ask at least three measures of their own, all from the catalogue", () => {
  assert.equal(ROWS.length, 260);
  for (const [id, , , , , , , fields] of ROWS) {
    const ids = asked(id);
    assert.ok(ids.length >= 3, `${id} asks only ${ids.join(",")}`);
    for (const f of ids) assert.ok(fields.some((x) => x.id === f), `${id}: ${f} not in catalogue`);
    assert.equal(new Set(ids).size, ids.length, `${id}: duplicate field`);
  }
});

test("no discipline asks a generic 1–10 score, a self-rating or a health value", () => {
  for (const [id, , , , , , , fields] of ROWS) {
    for (const f of C.entryFields(id, fields)) {
      assert.notEqual(f.legacy, true, `${id} asks legacy ${f.id}`);
      assert.ok(!C.SELF_RATED.has(f.id), `${id} asks self-rated ${f.id}`);
    }
  }
});

test("a form never asks twice what it already measures", () => {
  for (const [id, , , , , , , fields] of ROWS) {
    const own = new Set(C.structuredKeys(id));
    for (const f of C.entryFields(id, fields)) assert.ok(!own.has(f.id), `${id} asks structured ${f.id}`);
  }
  assert.ok(!asked("muscu_gym").some((f) => ["top_set_weight", "top_set_reps", "working_sets", "rir", "tempo"].includes(f)));
  assert.ok(!asked("swimming").includes("pace_100m"));
  assert.ok(!asked("bouldering").some((f) => ["climb_type", "max_done"].includes(f)));
});

test("absurd historical measures are gone from the disciplines they did not describe", () => {
  const none = (id, ...fields) => { const a = asked(id); for (const f of fields) assert.ok(!a.includes(f), `${id} still asks ${f}`); };
  none("freediving", "cadence", "falls");
  none("snorkeling", "cadence", "falls");
  none("rowing", "falls");
  none("rowing_machine", "water");
  none("figure_skating", "elevation", "runs");
  none("speed_skating", "elevation", "runs");
  none("athletics", "elevation", "avg_pace");
  none("aquagym", "stroke", "swolf", "pace_100m", "stroke_rate");
  none("artistic_swimming", "avg_pace", "stroke_rate", "pool_length");
  none("cycle_ball", "elevation", "avg_speed", "avg_power", "cadence");
  none("triathlon", "rounds", "stations", "work_time");
  none("walking", "intervals", "quality_score", "errors");
  none("tug_of_war", "exercise", "sets", "reps", "top_load", "volume");
  none("underwater_hockey", "conditions", "falls", "cadence");
  none("trekking", "pack_weight", "navigation_quality", "technical_difficulty");
  none("yoga", "pain_before", "pain_after", "breathing_quality", "focus_area");
  none("badminton", "rally_quality_score");
  none("beach_volleyball", "score_for");
});

test("each family keeps the measures its athletes expect", () => {
  const has = (id, ...fields) => { const a = asked(id); for (const f of fields) assert.ok(a.includes(f), `${id} lost ${f}`); };
  has("badminton", "sets_won", "sets_lost", "match_result", "rallies");
  has("tennis", "sets_won", "aces", "first_serve_pct");
  has("football", "position", "minutes_played", "goals", "score_for", "score_against");
  has("rugby", "role", "tries", "tackles");
  has("basketball", "points", "rebounds", "position");
  has("climbing", "flashes", "max_attempted", "fall_count");
  has("yoga", "style", "poses", "breath_minutes", "hold_seconds");
  has("muscu_gym", "rest_seconds", "focus", "muscle_group");
  has("cycling", "cadence", "avg_power", "max_power", "normalized_power");
  has("running", "cadence", "intervals", "surface");
  has("surfing", "waves", "rides");
  has("bodyboarding", "falls");
  has("stair_climbing", "elevation");
});

test("a value already recorded in a retired field stays visible and editable", () => {
  assert.ok(!asked("walking").includes("quality_score"));
  assert.ok(asked("walking", { quality_score: 7 }).includes("quality_score"));
  assert.ok(asked("freediving", { cadence: 0 }).includes("cadence"), "zero is a value");
  assert.ok(!asked("freediving", { cadence: "" }).includes("cadence"), "an empty string is not");
});

test("every retired field comes with a reason; curated fields are judged only through declared exceptions", () => {
  for (const [id, , , , , , , fields] of ROWS) {
    const a = C.audit(id, fields);
    for (const r of a.retired) assert.ok(r.why.length > 8, `${id}.${r.id} retired without reason`);
    assert.equal(a.asked.length + a.retired.length + fields.filter((f) => C.structuredKeys(id).includes(f.id)).length, fields.length);
  }
});

test("the distance form asks for elevation where the discipline measures it, even outside mountain families", () => {
  for (const id of ["orienteering", "obstacle_course", "rogaining", "trail", "cycling"]) assert.equal(Sports.hasElevation(id), true, id);
  for (const id of ["running", "treadmill", "rowing"]) assert.equal(Sports.hasElevation(id), false, id);
});

test("the Android app runs the same contract module", () => {
  assert.equal(readFileSync(new URL("../mobile/src/core/web/sport-contracts.js", import.meta.url), "utf8"), readFileSync(new URL("../js/core/sport-contracts.js", import.meta.url), "utf8"));
});
