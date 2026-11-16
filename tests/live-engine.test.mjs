// TITAN LIVE — coverage of the 260 sports, safety, fairness and engine behaviour.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("../js/core/sports-catalog.js");
const Effort = require("../js/core/effort.js");
const Voies = require("../js/core/live-voies.js");
const Live = require("../js/core/live-engine.js");
const World = require("../js/core/live-world.js");

const ROWS = globalThis.TITAN_SPORTS_SNAPSHOT;
const INTENTS = Object.keys(Voies.INTENTS);
const T0 = Date.UTC(2026, 10, 16, 8, 0, 0);
const MIN = 60000;

function run(sportId, opts = {}, script = []) {
  let s = Live.create({ sportId, seed: "seed-1", ...opts });
  let now = T0;
  const outs = [];
  const apply = (input, t) => { const r = Live.step(s, input, t); s = r.state; outs.push(...r.out.map((o) => ({ ...o, t }))); };
  apply({ type: "start", missions: opts.missions || [] }, now);
  for (const [atMin, input] of script) { now = T0 + atMin * MIN; apply(input, now); }
  return { state: s, outs, now };
}

test("every sport of the catalogue resolves to one Voie with a beat, a panel, missions, events and a fallback", () => {
  assert.equal(ROWS.length, 260);
  for (const [id] of ROWS) {
    const c = Voies.resolve(id);
    assert.ok(Voies.VOIES[c.voie], id);
    assert.ok(c.beat.one && c.beat.many, `${id} beat`);
    assert.ok(c.panel && c.fallback.length > 30, `${id} panel/fallback`);
    assert.ok(c.missions.length >= 3, `${id} has ${c.missions.length} missions`);
    assert.ok(c.events.length >= 1, `${id} events`);
    assert.ok(Voies.SAFETY[c.safety], `${id} safety`);
    assert.ok(c.data.timer, `${id} always has a timer`);
  }
});

test("for every sport, each intent offers at least one mission to prepare, even with no numeric goal", () => {
  const missing = [];
  for (const [id] of ROWS) for (const intent of INTENTS) {
    const s = Live.create({ sportId: id, intent, seed: "x" });
    if (!Live.preparable(s).length) missing.push(`${id}/${intent}`);
  }
  assert.deepEqual(missing, []);
});

test("an explorer session never needs a number: no goal is required", () => {
  const s = Live.create({ sportId: "yoga", intent: "explorer", seed: "x" });
  assert.equal(s.goal, null);
  assert.ok(Live.preparable(s).every((m) => m.intents.includes("explorer")));
});

test("Voies are genuinely different: unique beats, unique panels per family of loops, no shared mission wording", () => {
  const beats = new Set(), labels = new Map();
  for (const v of Object.values(Voies.VOIES)) {
    assert.ok(!beats.has(v.beat.id), `beat ${v.beat.id} reused`);
    beats.add(v.beat.id);
    assert.ok(v.loop.length >= 3, `${v.id} loop`);
    for (const m of v.missions) {
      assert.ok(m.id.startsWith(`${v.id}.`), m.id);
      assert.ok(!labels.has(m.label), `mission label "${m.label}" in ${v.id} and ${labels.get(m.label)}`);
      labels.set(m.label, v.id);
    }
    for (const intent of INTENTS) assert.ok(v.missions.some((m) => m.intents.includes(intent)), `${v.id} lacks ${intent}`);
  }
  assert.ok(Object.keys(Voies.VOIES).length >= 18);
  assert.ok(new Set(Object.values(Voies.VOIES).map((v) => v.panel)).size >= 7);
});

test("badminton is not a disguised run, and the reverse", () => {
  const bad = Voies.resolve("badminton"), runr = Voies.resolve("running");
  assert.notEqual(bad.voie, runr.voie);
  assert.equal(bad.panel, "score");
  assert.equal(runr.panel, "route");
  assert.equal(bad.data.gps, false);
  assert.equal(runr.data.gps, true);
  assert.equal(bad.tuning.score.points, 21);
  assert.notDeepEqual(bad.missions.map((m) => m.id), runr.missions.map((m) => m.id));
});

test("team sports use their real periods, precision sports their real units, combat sports a bell", () => {
  assert.deepEqual(Voies.resolve("basketball").plan, { kind: "period", count: 4, minutes: 10 });
  assert.equal(Voies.resolve("ice_hockey").beat.one, "tiers-temps");
  assert.equal(Voies.resolve("golf").beat.one, "trou");
  assert.equal(Voies.resolve("petanque").beat.many, "mènes");
  assert.equal(Voies.resolve("boxing").plan.workS, 180);
  assert.equal(Voies.resolve("hiit").plan.restS, 20);
});

test("risky, precision and motor sports are fully silent during the effort; road sports are hands-free", () => {
  for (const id of Voies.STRICT_SILENCE) assert.equal(Voies.resolve(id).maxImmersion, 0, id);
  for (const id of Voies.ROAD) assert.ok(Voies.resolve(id).maxImmersion <= 2 && !Voies.SAFETY[Voies.resolve(id).safety].tapsWhileActive, id);
  const s = Live.create({ sportId: "kitesurf", immersion: "aventure", seed: "k" });
  assert.equal(s.level, 0);
  const { outs } = run("kitesurf", { immersion: "aventure" }, Array.from({ length: 120 }, (_, i) => [i + 1, { type: "tick" }]));
  assert.equal(outs.filter((o) => o.type === "cue" || o.type === "mission_offer").length, 0);
});

test("no in-session wording pushes speed or force on the road, in the water, in the air or in combat", () => {
  const BAD = /acc[ée]l[èe]re|plus vite|plus fort|frappe plus|à fond|sprinte|pousse au maximum|jusqu’à l’échec/i;
  for (const v of Object.values(Voies.VOIES)) {
    for (const m of v.missions) assert.ok(!BAD.test(`${m.label} ${m.text}`), `${v.id}: ${m.text}`);
    for (const e of v.events) assert.ok(!BAD.test(e.text), `${v.id}: ${e.text}`);
  }
  for (const r of Live.RULES) assert.ok(!BAD.test(String(r.why)), r.id);
});

test("the companion never bursts: cues respect the quiet period of the immersion and safety levels", () => {
  const script = [];
  for (let i = 1; i <= 120; i++) script.push([i, { type: "tick" }]);
  for (const [sport, immersion] of [["running", "aventure"], ["running", "audio"], ["muscu_gym", "notifications"], ["cycling_road", "aventure"]]) {
    const { outs, state } = run(sport, { immersion, goal: { kind: "time", value: 90 }, intent: "atteindre" }, script);
    const cues = outs.filter((o) => o.type === "cue" && o.cue.priority < 3);
    const gap = Math.max({ 1: 150, 2: 210, 3: 100 }[state.level], Voies.SAFETY[state.safety].minGapS) * 1000;
    for (let i = 1; i < cues.length; i++) assert.ok(cues[i].t - cues[i - 1].t >= gap, `${sport}/${immersion}`);
    for (const c of outs.filter((o) => o.type === "cue")) assert.ok(c.cue.why, "every cue says why");
  }
});

test("silent mode emits nothing during the session but still completes missions", () => {
  const script = [];
  for (let i = 1; i <= 50; i++) script.push([i, { type: "tick" }]);
  const { outs, state } = run("yoga", { immersion: "silence", goal: { kind: "time", value: 40 }, missions: ["sanctuaire.terrasses"] }, script);
  assert.equal(outs.filter((o) => o.type === "cue" || o.type === "mission_offer").length, 0);
  assert.equal(state.missions.done[0].id, "sanctuaire.terrasses");
});

test("pause freezes active time and the bell; resume after a kill reports the gap and the athlete may remove it", () => {
  let { state } = run("boxing", {}, [[2, { type: "pause" }]]);
  assert.equal(Math.round(Live.activeMs(state, T0 + 30 * MIN) / MIN), 2);
  assert.equal(Live.bellState(state, T0 + 30 * MIN).round, 1);
  state = Live.step(state, { type: "resume" }, T0 + 30 * MIN).state;
  state = Live.step(state, { type: "tick" }, T0 + 31 * MIN).state;
  const r = Live.resume(JSON.parse(JSON.stringify(state)), T0 + 51 * MIN);
  assert.equal(r.out[0].type, "interrupted");
  assert.equal(r.out[0].gapS, 20 * 60);
  const trimmed = Live.trimGap(r.state, r.out[0].since, T0 + 51 * MIN);
  assert.equal(Math.round(Live.activeMs(trimmed, T0 + 51 * MIN) / MIN), 3);
});

test("the same inputs replay to the same state (resume, tests and server re-verification)", () => {
  const script = [[3, { type: "beat", kind: "set", data: { exercise: "Squat", reps: 5, load: 100, rir: 2 } }], [6, { type: "beat", kind: "set", data: { exercise: "Squat", reps: 5, load: 100, rir: 2 } }], [20, { type: "tick" }]];
  const a = run("muscu_gym", { intent: "depasser" }, script).state;
  const b = run("muscu_gym", { intent: "depasser" }, script).state;
  assert.deepEqual(a, b);
});

test("forge: sets are strikes, clean strikes need reserve, rests are counted, the journal rebuilds the strength form", () => {
  const set = (rir, ex = "Développé couché") => ({ type: "beat", kind: "set", data: { exercise: ex, reps: 8, load: 60, rir } });
  const { state } = run("muscu_gym", { intent: "atteindre", missions: ["forge.nettes", "forge.braise"] }, [
    [1, set(2)], [3, set(2)], [5, set(1)], [7, set(0)], [9, set(2, "Rowing barre")], [11, set(3, "Rowing barre")],
  ]);
  assert.ok(state.missions.done.some((d) => d.id === "forge.nettes"));
  assert.ok(state.missions.done.some((d) => d.id === "forge.braise"), "five rests of two minutes ≥ 90 s");
  const draft = Live.toDraft({ ...state, ended: { at: T0 + 12 * MIN, rpe: 7 } });
  assert.deepEqual(draft.exercises.map((e) => [e.name, e.setRows.length]), [["Développé couché", 4], ["Rowing barre", 2]]);
});

test("a set to failure never counts as a clean strike", () => {
  const { state } = run("muscu_gym", { missions: ["forge.nettes"] }, [1, 3, 5].map((m) => [m, { type: "beat", kind: "set", data: { reps: 5, rir: 0 } }]));
  assert.equal(state.missions.done.length, 0);
});

test("joute: points, momentum and comebacks; losing never removes anything", () => {
  const p = (won) => ({ type: "beat", kind: "point", data: { won } });
  const { state, outs } = run("badminton", { intent: "depasser", missions: ["joute.sequence", "joute.remontee"] }, [
    [1, p(false)], [2, p(true)], [3, p(true)], [4, p(true)], [20, { type: "beat", kind: "game", data: { won: true, trailing: true } }],
  ]);
  assert.equal(state.fields.momentum, 1);
  assert.equal(state.fields.comebacks, 1);
  assert.deepEqual(state.missions.done.map((d) => d.id).sort(), ["joute.remontee", "joute.sequence"]);
  assert.ok(outs.some((o) => o.type === "event" && o.event.id === "remontee"));
});

test("cible: regularity forms a constellation, which makes the Voie fair to beginners", () => {
  const e = (score) => ({ type: "beat", kind: "end", data: { score } });
  const beginner = run("archery", {}, [[2, e(30)], [4, e(31)], [6, e(29)]]).state;
  const erratic = run("archery", {}, [[2, e(10)], [4, e(58)], [6, e(30)]]).state;
  assert.equal(beginner.fields.steadyEnds, 3);
  assert.equal(erratic.fields.steadyEnds || 0, 0);
});

test("paroi: falls reveal holds, a sent project is an event, rest after hard attempts is a mission", () => {
  const a = (result, project = false) => ({ type: "beat", kind: "attempt", data: { result, project, grade: "6b" } });
  const { state, outs } = run("bouldering", { project: true, intent: "depasser", missions: ["paroi.projet"] }, [[2, a("fall", true)], [6, a("fall", true)], [10, a("send", true)]]);
  assert.equal(state.fields.falls, 2);
  assert.equal(state.fields.projectSent, 1);
  assert.ok(outs.some((o) => o.type === "event" && o.event.id === "cede"));
  assert.ok(state.missions.done.some((d) => d.id === "paroi.projet"));
});

test("feeling it hard sets the surpassing missions aside and stops new offers", () => {
  const { state, outs } = run("hiit", { intent: "depasser", missions: ["brasier.vague_plus"] }, [[3, { type: "feel", value: 9 }], [20, { type: "tick" }]]);
  assert.ok(outs.some((o) => o.type === "mission_set_aside" && o.id === "brasier.vague_plus"));
  assert.equal(state.missions.active.length, 0);
  assert.equal(outs.filter((o) => o.type === "mission_offer" && o.t > T0 + 3 * MIN).length, 0);
});

test("a recovery session never offers a surpassing-only mission", () => {
  const s = Live.create({ sportId: "running", intent: "depasser", recovery: true, seed: "r", baseline: { sessions: 5, medianBeats: 6, medianMinutes: 40 }, echo: { minutes: 40, beats: 6 } });
  assert.ok(Live.preparable(s).every((m) => !(m.intents.length === 1 && m.intents[0] === "depasser")));
});

test("at most one declared mission counts per session", () => {
  const { state, outs } = run("running", { intent: "atteindre", missions: ["sentier.regulier", "sentier.halte"] }, [[50, { type: "declare", id: "sentier.regulier" }], [51, { type: "declare", id: "sentier.halte" }]]);
  assert.equal(state.missions.done.filter((d) => d.declared).length, 1);
  assert.ok(outs.some((o) => o.type === "mission_capped"));
});

test("the journal is small, bounded and contains no free text", () => {
  const script = [];
  for (let i = 1; i <= 300; i++) script.push([i * 0.5, { type: "beat", kind: "point", data: { won: i % 2 === 0, note: "x".repeat(500) } }]);
  const { state } = run("tennis", {}, script);
  const j = Live.journal(state);
  assert.ok(JSON.stringify(j).length < 2048, `${JSON.stringify(j).length} bytes`);
  assert.ok(!JSON.stringify(j).includes("xxxx"));
});

test("fairness: the same effort gives the same essence in every sport; long or easy-to-log sports gain nothing more", () => {
  const amounts = new Set();
  for (const [id, , unit] of ROWS) {
    const e = Effort.effort({ sport: id, unit, val: unit === "km" ? 10 : 60, details: { duration: 60 } });
    const j = { voie: Voies.resolve(id).voie, intent: "atteindre", seed: "s", beats: 5, activeMin: 60, missions: [] };
    amounts.add(World.settlePreview(j, { effortMinutes: e.effortMinutes, essenceToday: 0, sessionsToday: 0, familySettledThisWeek: true }).essenceAmount);
  }
  assert.deepEqual([...amounts], [60]);
  const ultra = Effort.effort({ sport: "running", unit: "km", val: 100, details: { duration: 720 } });
  const j = { voie: "sentier", intent: "atteindre", seed: "s", beats: 99, activeMin: 720, missions: [] };
  assert.equal(World.settlePreview(j, { effortMinutes: ultra.effortMinutes, essenceToday: 0, sessionsToday: 0, familySettledThisWeek: true }).essenceAmount, 90);
  assert.equal(World.settlePreview(j, { effortMinutes: 60, essenceToday: 70, sessionsToday: 1, familySettledThisWeek: true }).essenceAmount, 20);
});

test("fairness: the three intents are worth the same, and a session's éclats are bounded", () => {
  const max = {};
  for (const intent of INTENTS) {
    const j = { voie: "forge", intent, seed: "s", beats: 10, activeMin: 50, missions: [{ id: "forge.plan" }, { id: "forge.nettes" }, { id: "forge.braise", declared: true }, { id: "forge.seuil" }] };
    max[intent] = World.settlePreview(j, { effortMinutes: 50, essenceToday: 0, sessionsToday: 0, familySettledThisWeek: false, ownedFinds: [] }).eclats;
  }
  assert.equal(new Set(Object.values(max)).size, 1);
  assert.ok(max.atteindre <= 48, String(max.atteindre));
});

test("forged or foreign missions are not counted by the settlement rule", () => {
  const j = { voie: "sentier", intent: "atteindre", seed: "s", activeMin: 30, missions: [{ id: "forge.plan" }, { id: "sentier.echo" }, { id: "sentier.echo" }, { id: "DROP TABLE" }, { id: "sentier.nope" }, { id: "sentier.regulier" }, { id: "sentier.halte", declared: false }] };
  assert.deepEqual(World.verifiedMissions(j).map((m) => m.id), ["sentier.echo", "sentier.regulier"]);
  const forged = { voie: "forge", activeMin: 30, missions: [{ id: "forge.lame_neuve", declared: true }, { id: "forge.r_warmup_sets" }] };
  assert.deepEqual(World.verifiedMissions(forged, { warmup_sets: 1 }).map((m) => [m.id, m.declared]), [["forge.lame_neuve", false]], "the journal cannot relabel a mission as declared; a failed report is dropped");
  assert.deepEqual(World.verifiedMissions({ ...j, activeMin: 3 }), []);
});

test("finds are deterministic from the session id, a bit likelier when exploring, and every Voie has six", () => {
  for (const v of Object.keys(Voies.VOIES)) assert.equal(World.FINDS[v].length, 6, v);
  const rate = (intent) => Array.from({ length: 2000 }, (_, i) => World.findOf({ voie: "sentier", intent, seed: `e-${i}` })).filter(Boolean).length / 2000;
  assert.ok(Math.abs(rate("atteindre") - 0.25) < 0.04);
  assert.ok(Math.abs(rate("explorer") - 0.4) < 0.04);
  assert.deepEqual(World.findOf({ voie: "paroi", intent: "explorer", seed: "abc" }), World.findOf({ voie: "paroi", intent: "explorer", seed: "abc" }));
});

test("the Cordée is reachable by regularity alone; variety only accelerates it", () => {
  assert.equal(World.cordee({ days: 130, voies: 1 }).unlocked, 10);
  assert.ok(World.cordee({ days: 8, voies: 4 }).unlocked > World.cordee({ days: 8, voies: 1 }).unlocked);
  for (const v of Object.keys(Voies.VOIES)) assert.equal(World.ARCS[v].length, World.REGION_STEPS.length, v);
});

test("the camp is built with the building's essence first, then universal éclats, so a specialist is never blocked", () => {
  const p = World.buildPlan("halle", 0, { essences: { acier: 20 }, eclats: 60 });
  assert.deepEqual([p.useEssence, p.useEclats, p.affordable], [20, 60, true]);
  const yogi = World.buildPlan("halle", 0, { essences: { seve: 500 }, eclats: 80 });
  assert.equal(yogi.affordable, true);
  assert.equal(World.buildPlan("phare", 5, { eclats: 1e6 }), null);
});

test("the FNV hash matches the reference vectors used by the SQL mirror", () => {
  assert.equal(Live.hash(""), 2166136261);
  assert.equal(Live.hash("a"), 0xe40c292c);
  assert.equal(Live.hash("foobar"), 0xbf9cf968);
});

test("dojo: techniques noted between bell rounds fill the scrolls", () => {
  const { state } = run("judo", { intent: "atteindre", missions: ["dojo.technique"], knownTechniques: ["O-soto-gari"] }, [
    [3, { type: "field", id: "technique_note", value: "O-soto-gari" }], [8, { type: "field", id: "technique_note", value: "Uchi-mata" }], [9, { type: "tick" }],
  ]);
  assert.equal(state.fields.newTechniques, 1);
  assert.ok(state.missions.done.some((d) => d.id === "dojo.technique"));
});

test("report missions are confirmed from the after-session statistics, like the server", () => {
  let { state } = run("golf", { intent: "depasser", missions: ["cible.r_putts"] }, [[60, { type: "end" }]]);
  for (const [id, value] of [["r_putts", 15], ["r_holes", 9]]) state = Live.step(state, { type: "field", id, value }, T0 + 61 * MIN).state;
  assert.ok(state.missions.done.some((d) => d.id === "cible.r_putts"), "15 putts on 9 holes ≤ 2 per hole");
  let fail = run("golf", { intent: "depasser", missions: ["cible.r_putts"] }, [[60, { type: "end" }]]).state;
  for (const [id, value] of [["r_putts", 25], ["r_holes", 9]]) fail = Live.step(fail, { type: "field", id, value }, T0 + 61 * MIN).state;
  assert.equal(fail.missions.done.length, 0);
});

test("racket scoreboards fill the sport's own form fields: sets for badminton, games for tennis", () => {
  const g = (won) => ({ type: "beat", kind: "game", data: { won } });
  const bad = run("badminton", {}, [[10, g(true)], [20, g(false)], [30, g(true)], [31, { type: "end" }]]).state;
  assert.deepEqual([Live.toDraft(bad).extras.sets_won, Live.toDraft(bad).extras.sets_lost], [2, 1]);
  const ten = run("tennis", {}, [[10, g(true)], [20, g(true)], [31, { type: "end" }]]).state;
  assert.equal(Live.toDraft(ten).extras.games_won, 2);
  assert.equal(Live.toDraft(ten).extras.sets_won, undefined);
});

test("performance: one step stays cheap on a loaded session and the saved state is bounded", () => {
  let s = Live.create({ sportId: "muscu_gym", seed: "perf", intent: "atteindre", immersion: "aventure" });
  s = Live.step(s, { type: "start" }, T0).state;
  for (let i = 0; i < 600; i++) s = Live.step(s, { type: "beat", kind: "set", data: { exercise: `Ex ${i % 12}`, reps: 8, load: 60, rir: 2 } }, T0 + i * 1000).state;
  assert.equal(s.beats.length, 400, "beats are capped");
  const t = performance.now();
  for (let i = 0; i < 300; i++) s = Live.step(s, { type: "tick" }, T0 + (601 + i) * 1000).state;
  const perStep = (performance.now() - t) / 300;
  assert.ok(perStep < 5, `${perStep.toFixed(2)} ms per step`);
  assert.ok(JSON.stringify(s).length < 120000, `${JSON.stringify(s).length} bytes saved`);
});

test("many tiny sessions in a day earn no extra éclats: base, missions and finds count for the first two only", () => {
  const j = { voie: "forge", intent: "atteindre", seed: "s", beats: 6, activeMin: 6, missions: [{ id: "forge.plan" }, { id: "forge.nettes" }] };
  const third = World.settlePreview(j, { effortMinutes: 6, essenceToday: 12, sessionsToday: 2, familySettledThisWeek: true, ownedFinds: [] });
  assert.equal(third.eclats, 0);
  assert.equal(third.essenceAmount, 6, "effort still counts under the daily cap");
});
