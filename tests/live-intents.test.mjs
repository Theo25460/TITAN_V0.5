// TITAN LIVE — the three intents produce three different sessions, built on the sport measure contracts and on the
// athlete's really comparable sessions. Nothing here grants a reward: the server settles (tests/live-engine.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("../js/core/sports-catalog.js");
require("../js/training-store.js");
require("../js/core/sports.js");
require("../js/sport-insights.js");
const Contracts = require("../js/core/sport-contracts.js");
const Voies = require("../js/core/live-voies.js");
const Live = require("../js/core/live-engine.js");
const World = require("../js/core/live-world.js");
const Prepare = require("../js/core/live-prepare.js");

const ROWS = globalThis.TITAN_SPORTS_SNAPSHOT;
const T0 = Date.UTC(2026, 10, 17, 8, 0, 0);
const MIN = 60000;

function run(sportId, opts = {}, script = []) {
  let s = Live.create({ sportId, seed: "seed-1", ...opts });
  const outs = [];
  let now = T0;
  const apply = (input, t) => { const r = Live.step(s, input, t); s = r.state; outs.push(...r.out); };
  apply({ type: "start", missions: opts.missions || [] }, now);
  for (const [atMin, input] of script) { now = T0 + atMin * MIN; apply(input, now); }
  return { state: s, outs, now };
}
const set = (exercise, load, reps, rir) => ({ type: "beat", kind: "set", data: { exercise, load, reps, rir } });
const squatRef = { exercises: { Squat: { name: "Squat", load: 60, reps: 8 } }, basis: "test" };
const baseline3 = { sessions: 3, medianMinutes: 40, medianBeats: 0 };

test("contracts: no mission of the 260 sports targets a statistic its entry form no longer asks for", () => {
  let reports = 0;
  for (const row of ROWS) {
    const conf = Voies.resolve(row[0]);
    for (const m of conf.missions.filter((x) => x.verify === "report")) {
      reports++;
      for (const id of [m.check.field, m.check.requires, m.check.per?.field].filter(Boolean)) {
        const field = row[7].find((f) => f.id === id);
        assert.ok(field, `${row[0]}: ${id} is a field of the sport`);
        assert.equal(Contracts.retiredReason(row[0], field), "", `${row[0]}: mission ${m.id} targets retired field ${id}`);
      }
    }
    for (const id of conf.data.afterFields) assert.equal(Contracts.retiredReason(row[0], row[7].find((f) => f.id === id)), "", `${row[0]}: ${id}`);
    for (const intent of Object.keys(Voies.INTENTS)) assert.ok(conf.missions.some((m) => m.intents.includes(intent)), `${row[0]} keeps a mission for ${intent}`);
  }
  assert.ok(reports > 300, "report missions still cover the catalogue");
});

test("contracts: no health data under yoga, no relaunch on the road for gravel, no relief under figure skating", () => {
  const yoga = Voies.resolve("yoga");
  assert.ok(!yoga.missions.some((m) => /pain/.test(m.id)) && !yoga.data.afterFields.some((f) => /pain/.test(f)));
  assert.ok(!Voies.resolve("gravel").missions.some((m) => m.id === "roue.r_sprints"), "sprints are a home-trainer mission only");
  assert.ok(Voies.resolve("spinning").missions.some((m) => m.id === "roue.r_sprints"));
  assert.ok(!Voies.resolve("figure_skating").missions.some((m) => /elevation|runs/.test(m.id)));
});

test("yoga stays calm: silent by default, never compared, no threshold, the story comes at the end", () => {
  const conf = Voies.resolve("yoga");
  assert.equal(conf.defaultImmersion, "silence");
  assert.equal(conf.serene, true);
  const { state, outs } = run("yoga", { intent: "depasser", immersion: "silence", baseline: baseline3, echo: { minutes: 30, beats: 7 } }, [[10, { type: "tick" }], [31, { type: "tick" }], [32, { type: "end" }]]);
  assert.equal(state.baseline, null);
  assert.equal(state.echo, null);
  assert.equal(outs.filter((o) => o.type === "cue").length, 0, "nothing is said during a silent practice");
  assert.equal(Live.view(state, T0 + 20 * MIN).interlude, null);
  assert.equal(Live.thresholdOf(state, T0 + 31 * MIN).status, "missions");
  assert.ok(Live.recap(state).lines.length >= 2);
});

test("atteindre: the plan is cut into stages that tick one by one and are announced once each", () => {
  const script = [];
  for (let i = 1; i <= 8; i++) script.push([i * 4, set("Squat", 60, 8, 2)]);
  const { state, outs } = run("muscu_gym", { intent: "atteindre", plan: { count: 8 }, immersion: "aventure" }, script);
  const st = Live.stages(state, T0 + 33 * MIN);
  assert.deepEqual(st.list.map((x) => x.at), [2, 4, 6, 8]);
  assert.equal(st.reached, 4);
  const said = outs.filter((o) => o.type === "cue" && o.cue.id === "stage").map((o) => o.cue.text);
  assert.ok(said.length >= 2 && said.length <= 4, "stages are announced, never in a burst");
  assert.match(said[said.length - 1], /Plan tenu/);
  assert.equal(new Set(said).size, said.length, "a stage is never announced twice");
  assert.equal(Live.view(state, T0 + 33 * MIN).threshold, null, "no comparison in Atteindre");
  assert.equal(state.fields.thresholdSets, undefined);
  assert.match(Live.recap(state).lines[0], /Plan tenu jusqu’au bout/);
});

test("atteindre with a goal: stages follow the goal (time, distance) and a plain session has none", () => {
  const timed = Live.create({ sportId: "running", intent: "atteindre", goal: { kind: "time", value: 40 }, seed: "a" });
  assert.deepEqual(Live.stages(timed, 0).list.map((x) => x.label), ["10 min", "20 min", "30 min", "40 min"]);
  const km = Live.create({ sportId: "gravel", intent: "atteindre", goal: { kind: "distance", value: 30 }, seed: "a" });
  assert.deepEqual(Live.stages(km, 0).list.map((x) => x.label), ["7,5 km", "15 km", "22,5 km", "30 km"]);
  assert.equal(Live.stages(Live.create({ sportId: "running", intent: "explorer", seed: "a" }), 0), null);
});

test("se dépasser: the threshold comes from the last comparable set, with reserve kept, once per exercise", () => {
  const ok = run("muscu_gym", { intent: "depasser", reference: squatRef }, [[3, set("squat ", 60, 9, 2)], [6, set("Squat", 60, 10, 2)]]);
  assert.equal(ok.state.fields.thresholdSets, 1, "counted once for the exercise, whatever the spelling");
  assert.equal(Live.thresholdOf(ok.state, ok.now).status, "done");
  assert.match(Live.recap(ok.state).lines[0], /Seuil franchi sur squat/i);
  const step = run("muscu_gym", { intent: "depasser", reference: squatRef }, [[3, set("Squat", 62.5, 8, 1)]]);
  assert.equal(step.state.fields.thresholdSets, 1, "a small step of load counts");
  for (const [load, reps, rir, why] of [[60, 9, 0, "to failure"], [60, 8, 2, "same set"], [75, 6, 2, "a jump above 10 %"], [55, 12, 2, "a lighter load"]]) {
    const no = run("muscu_gym", { intent: "depasser", reference: squatRef }, [[3, set("Squat", load, reps, rir)]]);
    assert.equal(no.state.fields.thresholdSets, undefined, `no threshold for ${why}`);
  }
  const other = run("muscu_gym", { intent: "depasser", reference: squatRef }, [[3, set("Développé couché", 80, 12, 2)]]);
  assert.equal(other.state.fields.thresholdSets, undefined, "an exercise without a reference is observed, not judged");
});

test("se dépasser: the threshold withdraws in recovery, when the effort feels hard, and never exists for other intents", () => {
  const rec = run("muscu_gym", { intent: "depasser", reference: squatRef, recovery: true }, [[3, set("Squat", 60, 9, 2)]]);
  assert.equal(rec.state.fields.thresholdSets, undefined);
  assert.equal(Live.thresholdOf(rec.state, rec.now).status, "aside");
  const hard = run("muscu_gym", { intent: "depasser", reference: squatRef }, [[2, { type: "feel", value: 9 }], [3, set("Squat", 60, 9, 2)]]);
  assert.equal(hard.state.fields.thresholdSets, undefined);
  assert.equal(Live.thresholdOf(hard.state, hard.now).status, "aside");
  assert.equal(Live.referenceFor(hard.state, "Squat").suggest, null, "nothing is suggested once the effort feels hard");
  const reach = run("muscu_gym", { intent: "atteindre", reference: squatRef }, [[3, set("Squat", 60, 9, 2)]]);
  assert.equal(reach.state.fields.thresholdSets, undefined);
  const none = Live.create({ sportId: "muscu_gym", intent: "depasser", seed: "n" });
  assert.equal(Live.thresholdOf(none, 0).status, "none", "no comparable session: TITAN observes and says so");
});

test("the last comparable set is shown for every intent; only Se dépasser gets one reasonable step above it", () => {
  const dep = Live.create({ sportId: "muscu_gym", intent: "depasser", reference: squatRef, seed: "r" });
  const r = Live.referenceFor(dep, "SQUAT");
  assert.equal(r.last, "60 kg × 8");
  assert.match(r.suggest, /60 kg × 9, ou 62,5 kg, en gardant au moins une répétition en réserve/);
  assert.equal(Live.referenceFor(Live.create({ sportId: "muscu_gym", intent: "atteindre", reference: squatRef, seed: "r" }), "Squat").suggest, null);
  assert.equal(Live.referenceFor(dep, "Fentes"), null);
  const pull = Live.create({ sportId: "tractions", intent: "depasser", reference: { exercises: { Tractions: { reps: 6, load: 0 } } }, seed: "r" });
  assert.match(Live.referenceFor(pull, "tractions").suggest, /^7 répétitions/);
});

test("se dépasser in endurance: a little longer than the recent median, never faster, and only with three comparable sessions", () => {
  const s = Live.create({ sportId: "running", intent: "depasser", baseline: baseline3, seed: "t" });
  const open = Live.thresholdOf(s, 0);
  assert.equal(open.status, "open");
  assert.equal(open.target, 42);
  assert.doesNotMatch(open.text, /plus vite|accél|allure cible/i);
  const { state, outs, now } = run("running", { intent: "depasser", baseline: baseline3, immersion: "aventure" }, [[20, { type: "tick" }], [43, { type: "tick" }]]);
  assert.equal(Live.thresholdOf(state, now).status, "done");
  assert.equal(outs.filter((o) => o.type === "cue" && o.cue.id === "threshold_done").length, 1);
  assert.equal(Live.thresholdOf(Live.create({ sportId: "running", intent: "depasser", baseline: { sessions: 2, medianMinutes: 40 }, seed: "t" }), 0).status, "none");
  for (const sport of ["football", "surfing", "karting", "bouldering", "badminton"])
    assert.equal(Live.thresholdOf(Live.create({ sportId: sport, intent: "depasser", baseline: baseline3, seed: "t" }), 0).status, "missions", `${sport}: no imposed figure`);
});

test("explorer: no figure on the adventure screen, discoveries at a slowing pace, real novelties add one", () => {
  const ticks = [5, 9, 15, 21, 36, 51, 70].map((m) => [m, { type: "tick" }]);
  const { state, outs } = run("running", { intent: "explorer", immersion: "aventure" }, ticks);
  const v = Live.view(state, T0 + 70 * MIN);
  assert.equal(v.numbers, false);
  assert.equal(v.stages, null);
  assert.equal(v.threshold, null);
  assert.equal(v.discoveries.length, 4);
  assert.equal(new Set(v.discoveries).size, 4, "four different curios");
  for (const d of v.discoveries) assert.ok(Voies.CURIOS.sentier.includes(d));
  assert.equal(outs.filter((o) => o.type === "discovery").length, 4);
  const novel = run("muscu_gym", { intent: "explorer", knownExercises: ["Squat"] }, [[2, set("Squat", 40, 10, 3)], [4, set("Fentes", 20, 10, 3)]]);
  assert.deepEqual(Live.view(novel.state, novel.now).discoveries, ["un mouvement nouveau dans ton répertoire"]);
  const reach = run("running", { intent: "atteindre" }, ticks);
  assert.equal(Live.view(reach.state, reach.now).discoveries, null, "discoveries belong to Explorer");
});

test("explorer: the story of the session holds no figure at all", () => {
  const script = [[2, set("Squat", 40, 10, 3)], [5, set("Squat", 40, 10, 3)], [8, set("Fentes", 20, 10, 3)], [12, set("Fentes", 20, 10, 3)], [20, { type: "end" }]];
  for (const sport of ["muscu_gym", "running", "trail", "badminton", "yoga", "bouldering"]) {
    const { state } = run(sport, { intent: "explorer" }, sport === "muscu_gym" ? script : [[9, { type: "tick" }], [30, { type: "tick" }], [50, { type: "end" }]]);
    const recap = Live.recap(state);
    assert.equal(recap.numbers, false);
    for (const line of recap.lines) assert.doesNotMatch(line, /\d/, `${sport}: « ${line} »`);
  }
});

test("rests are calm moments of the adventure: a line of the Voie on screen, never a voice, never in silence", () => {
  const { state, outs, now } = run("muscu_gym", { intent: "atteindre" }, [[3, set("Squat", 60, 8, 2)]]);
  const first = Live.view(state, now + 20000).interlude;
  assert.ok(first && Voies.CALM.forge.includes(first.text));
  assert.equal(outs.filter((o) => o.type === "cue" && Voies.CALM.forge.includes(o.cue.text)).length, 0, "a calm line is never a cue");
  const next = Live.step(state, set("Squat", 60, 8, 2), now + 3 * MIN).state;
  assert.notEqual(Live.view(next, now + 3 * MIN + 1000).interlude.text, first.text, "the adventure moves from one rest to the next");
  assert.equal(Live.view(Live.step(next, { type: "pause" }, now + 4 * MIN).state, now + 9 * MIN).interlude.text.length > 0, true);
  const silent = run("muscu_gym", { intent: "atteindre", immersion: "silence" }, [[3, set("Squat", 60, 8, 2)]]);
  assert.equal(Live.view(silent.state, silent.now + 20000).interlude, null);
  const badminton = run("badminton", { intent: "atteindre" }, [[12, { type: "beat", kind: "game", data: { won: true } }]]);
  assert.ok(Voies.CALM.joute.includes(Live.view(badminton.state, badminton.now + 5000).interlude.text), "the change of ends is a calm moment");
  const match = run("football", { intent: "atteindre" }, [[20, { type: "tick" }]]);
  assert.equal(Live.view(match.state, match.now).interlude, null, "nothing during play");
});

test("every Voie has its calm lines and curios, and none of them pushes, counts or sells", () => {
  const BAD = /acc[ée]l[èe]re|plus vite|plus fort|à fond|record|dernière chance|perdu|éclat|essence|récompense|\d/i;
  for (const id of Object.keys(Voies.VOIES)) {
    assert.equal(Voies.CALM[id].length, 3, id);
    assert.equal(Voies.CURIOS[id].length, 4, id);
    for (const t of [...Voies.CALM[id], ...Voies.CURIOS[id]]) assert.doesNotMatch(t, BAD, `${id}: ${t}`);
  }
  for (const i of Object.values(Voies.INTENTS)) assert.equal(i.brings.length, 3);
});

test("the three intents give three different screens for the same sport and the same effort", () => {
  const script = [[3, set("Squat", 60, 9, 2)], [6, set("Squat", 60, 9, 2)], [9, { type: "tick" }]];
  const views = Object.fromEntries(Object.keys(Voies.INTENTS).map((intent) => {
    const r = run("muscu_gym", { intent, plan: { count: 4 }, reference: squatRef }, script);
    return [intent, Live.view(r.state, r.now)];
  }));
  assert.ok(views.atteindre.stages && !views.atteindre.threshold && !views.atteindre.discoveries);
  assert.ok(!views.depasser.stages && views.depasser.threshold.status === "done" && !views.depasser.discoveries);
  assert.ok(!views.explorer.stages && !views.explorer.threshold && views.explorer.discoveries.length >= 1 && views.explorer.numbers === false);
  assert.equal(views.atteindre.beats, views.explorer.beats, "the sport data is the same: only the experience differs");
});

test("the journal stays small and numeric; a state saved before these changes still runs", () => {
  const { state } = run("muscu_gym", { intent: "depasser", reference: squatRef }, [[3, set("Squat", 60, 9, 2)], [30, { type: "end" }]]);
  const j = Live.journal(state);
  assert.deepEqual(Object.keys(j.facts).sort(), ["calm", "discoveries", "stages", "stagesOf", "threshold"]);
  for (const v of Object.values(j.facts)) assert.equal(typeof v, "number");
  assert.equal(j.facts.threshold, 1);
  assert.ok(JSON.stringify(j).length < 2000);
  const old = JSON.parse(JSON.stringify(Live.create({ sportId: "muscu_gym", seed: "old" })));
  for (const k of ["thresholds", "discoveries", "calm", "reference", "stageSaid", "novelSeen"]) delete old[k];
  let s = Live.resume(old, T0).state;
  s = Live.step(s, { type: "start" }, T0).state;
  s = Live.step(s, set("Squat", 60, 8, 2), T0 + MIN).state;
  assert.equal(Live.view(old, T0).status, "ready");
  assert.equal(Live.view(s, T0 + 2 * MIN).beats, 1);
});

test("the story of a session is deterministic and never longer than seven lines", () => {
  const script = [[3, set("Squat", 60, 8, 2)], [6, set("Squat", 60, 8, 2)], [9, set("Squat", 60, 8, 2)], [12, set("Squat", 60, 8, 2)], [20, { type: "end" }]];
  const a = Live.recap(run("muscu_gym", { intent: "atteindre", plan: { count: 4 } }, script).state);
  const b = Live.recap(run("muscu_gym", { intent: "atteindre", plan: { count: 4 } }, script).state);
  assert.deepEqual(a, b);
  assert.ok(a.lines.length >= 3 && a.lines.length <= 7);
  assert.match(a.lines.join(" "), /repos tenus/);
});

test("the reference only reads sessions the server counted: held, refused and archived sessions are never one", () => {
  const log = (date, extra = {}) => ({ sport: "muscu_gym", date, unit: "min", val: 60, details: { duration: 60, exercises: [{ name: "Squat", setRows: [{ weight: 60, reps: 8 }, { weight: 55, reps: 10 }] }] }, ...extra });
  const logs = [
    log("2026-11-01T10:00:00Z"),
    { ...log("2026-11-05T10:00:00Z"), details: { duration: 50, exercises: [{ name: "squat", setRows: [{ weight: 62.5, reps: 6 }] }, { name: "Gainage", kind: "hold", setRows: [{ weight: 0, reps: 1 }] }] } },
    { ...log("2026-11-08T10:00:00Z", { is_suspicious: true }), details: { duration: 60, exercises: [{ name: "Squat", setRows: [{ weight: 140, reps: 20 }] }] } },
    { ...log("2026-11-09T10:00:00Z", { archived_at: "2026-11-09T12:00:00Z" }), details: { duration: 60, exercises: [{ name: "Squat", setRows: [{ weight: 150, reps: 20 }] }] } },
    { sport: "running", date: "2026-11-10T10:00:00Z", unit: "km", val: 10, details: { duration: 55 } },
    log("2026-12-25T10:00:00Z"),
  ];
  const ctx = Prepare.context("muscu_gym", logs, { now: Date.UTC(2026, 10, 17) });
  assert.equal(ctx.comparable, 2);
  assert.deepEqual(ctx.reference.exercises.squat, { name: "squat", load: 62.5, reps: 6 }, "the top set of the LAST counted session");
  assert.equal(ctx.reference.exercises.gainage, undefined, "a hold is not a set");
  assert.equal(ctx.baseline.medianMinutes, 55);
  assert.equal(ctx.echo, null);
  const empty = Prepare.context("yoga", logs, { now: Date.UTC(2026, 10, 17) });
  assert.equal(empty.baseline, null);
  assert.equal(empty.reference, null);
  assert.match(empty.basis, /Aucune séance comparable/);
  const s = Live.create({ sportId: "muscu_gym", intent: "depasser", seed: "p", ...ctx });
  assert.equal(Live.referenceFor(s, "Squat").last, "62,5 kg × 6");
});

test("the camp shows what comes next, nearest first, and never promises what the server has not granted", () => {
  const world = { wallet: { eclats: 30, essences: { souffle: 60, acier: 0, prisme: 0, ardeur: 0, seve: 0 } }, buildings: {}, voies: { sentier: { sessions: 3, days: 3 } }, days: 3, distinctVoies: 1, collection: [] };
  const h = World.horizon(world);
  assert.ok(h.length >= 2 && h.length <= 3);
  assert.equal(h[0].kind, "building");
  assert.equal(h[0].ready, true, "80 for level 1: 60 souffle + 20 éclats");
  assert.equal(h[0].id, "observatoire");
  assert.ok(h.some((x) => x.kind === "land" && /Encore 1 séance live/.test(x.text)));
  assert.ok(h.some((x) => x.kind === "cordee" && /Encore 1 jour actif/.test(x.text)));
  assert.deepEqual(World.horizon(null).map((x) => x.kind).sort(), ["building", "cordee"]);
  const stake = World.stake("running", world);
  assert.match(stake.lines[0], /1 Souffle/);
  assert.match(stake.lines[1], /Une fois confirmée/);
  const fresh = World.stake("muscu_gym", world);
  assert.ok(fresh.lines.some((l) => /Voie nouvelle/.test(l)));
  assert.equal(World.stake("yoga", null).lines.length, 1);
  for (const l of [...stake.lines, ...fresh.lines, ...h.map((x) => x.text)]) assert.doesNotMatch(l, /dernière chance|dépêche|expire|perdr/i);
});

/* ---- Regressions found by the independent review of the first version ---- */

test("review: a session whose reward the server holds back is never the reference", () => {
  const log = (date, weight, reps, details = {}) => ({ sport: "muscu_gym", date, unit: "min", val: 60, details: { duration: 60, exercises: [{ name: "Squat", setRows: [{ weight, reps }] }], ...details } });
  for (const flag of [{ rewardHeld: true }, { reward_held: true }, { held: true }, { serverReward: { reward_held: true } }]) {
    const ctx = Prepare.context("muscu_gym", [log("2026-11-01T10:00:00Z", 60, 8), log("2026-11-05T10:00:00Z", 180, 25, flag)], { now: Date.UTC(2026, 10, 17) });
    assert.deepEqual(ctx.reference.exercises.squat, { name: "Squat", load: 60, reps: 8 }, JSON.stringify(flag));
    assert.equal(ctx.comparable, 1);
  }
});

test("review: the same exercise entered twice in a session gives its best row, and odd names never reach a prototype", () => {
  const logs = [{ sport: "muscu_gym", date: "2026-11-05T10:00:00Z", unit: "min", val: 60, details: { duration: 60, exercises: [
    { name: "Squat", setRows: [{ weight: 40, reps: 10 }] }, { name: "squat", setRows: [{ weight: 80, reps: 5 }] }, { name: "constructor", setRows: [{ weight: 20, reps: 5 }] }] } }];
  const ctx = Prepare.context("muscu_gym", logs, { now: Date.UTC(2026, 10, 17) });
  assert.equal(ctx.reference.exercises.squat.load, 80);
  const s = Live.create({ sportId: "muscu_gym", intent: "depasser", seed: "c", reference: ctx.reference });
  assert.equal(Live.referenceFor(s, "constructor").last, "20 kg × 5");
  assert.equal(Live.referenceFor(Live.create({ sportId: "muscu_gym", intent: "depasser", seed: "c", reference: squatRef }), "constructor"), null);
  assert.equal(Live.referenceFor(Live.create({ sportId: "muscu_gym", intent: "depasser", seed: "c", reference: squatRef }), "toString"), null);
});

test("review: a match is measured in its real playing time until a period is logged, never « plan tenu » at half an hour", () => {
  const half = run("football", { intent: "atteindre" }, [[32, { type: "tick" }], [33, { type: "end" }]]);
  const st = Live.stages(half.state, half.now);
  assert.deepEqual(st.list.map((x) => x.label), ["23 min", "45 min", "68 min", "90 min"]);
  assert.equal(st.reached, 1);
  assert.doesNotMatch(Live.recap(half.state).lines[0], /Plan tenu/);
  const logged = run("football", { intent: "atteindre" }, [[46, { type: "pause" }], [47, { type: "beat", kind: "period" }], [48, { type: "resume" }]]);
  assert.deepEqual(Live.stages(logged.state, logged.now).list.map((x) => x.label), ["1 mi-temps", "2 mi-temps"]);
});

test("review: the endurance threshold never completes in recovery or once the effort feels hard, and stays crossed once crossed", () => {
  const ticks = [[20, { type: "tick" }], [43, { type: "tick" }], [44, { type: "end" }]];
  const rec = run("running", { intent: "depasser", baseline: baseline3, recovery: true, immersion: "aventure" }, ticks);
  assert.equal(Live.thresholdOf(rec.state, rec.now).status, "aside");
  assert.equal(Live.journal(rec.state).facts.threshold, 0);
  assert.equal(rec.outs.filter((o) => o.type === "cue" && o.cue.id === "threshold_done").length, 0);
  assert.doesNotMatch(Live.recap(rec.state).lines[0], /Seuil franchi/);
  const hard = run("running", { intent: "depasser", baseline: baseline3 }, [[20, { type: "feel", value: 9 }], [43, { type: "tick" }], [44, { type: "end" }]]);
  assert.equal(Live.thresholdOf(hard.state, hard.now).status, "aside");
  const late = run("running", { intent: "depasser", baseline: baseline3 }, [[43, { type: "tick" }], [45, { type: "feel", value: 9 }], [46, { type: "end" }]]);
  assert.equal(Live.thresholdOf(late.state, late.now).status, "done", "crossed before the effort felt hard: it stays crossed");
  assert.equal(Live.journal(late.state).facts.threshold, 1);
});

test("review: staying longer is never the threshold in the mountains, on open water or in a silent practice", () => {
  for (const sport of ["hiking", "alpinism", "open_water_swimming", "swimming", "kayak", "trail_running_never_exists"].filter((id) => ROWS.some((r) => r[0] === id)))
    assert.equal(Live.thresholdOf(Live.create({ sportId: sport, intent: "depasser", baseline: baseline3, seed: "t" }), 0).status, "missions", sport);
  for (const sport of ["running", "cycling", "rowing_machine"])
    assert.equal(Live.thresholdOf(Live.create({ sportId: sport, intent: "depasser", baseline: baseline3, seed: "t" }), 0).status, "open", sport);
});

test("review: a threshold is measured, never declared, and compares loads without floating-point luck", () => {
  const declared = run("muscu_gym", { intent: "depasser" }, [[3, { type: "beat", kind: "set", data: { exercise: "Curl", load: 10, reps: 5, rir: 1, threshold: true } }]]);
  assert.equal(declared.state.fields.thresholdSets, undefined);
  const below = run("muscu_gym", { intent: "depasser", reference: squatRef }, [[3, { type: "beat", kind: "set", data: { exercise: "Squat", load: 20, reps: 3, rir: 1, threshold: true } }]]);
  assert.equal(below.state.fields.thresholdSets, undefined);
  const ref = { exercises: { Curl: { load: 0.1 + 0.2, reps: 8 }, Squat: { load: 62.5, reps: 8 } } };
  assert.equal(run("muscu_gym", { intent: "depasser", reference: ref }, [[3, set("Curl", 0.3, 9, 2)]]).state.fields.thresholdSets, 1, "0.1 + 0.2 is 0.3");
  assert.equal(run("muscu_gym", { intent: "depasser", reference: ref }, [[3, set("Squat", 62.50000001, 6, 2)]]).state.fields.thresholdSets, undefined, "the same load is not a step of load");
  const blank = run("muscu_gym", { intent: "depasser", reference: squatRef }, [[3, { type: "beat", kind: "set", data: { exercise: "Squat", load: 60, reps: 9 } }]]);
  assert.equal(blank.state.fields.thresholdSets, undefined, "reserve not stated is not reserve kept");
});

test("review: nothing of the intent shows during a silent effort; the end tells it", () => {
  const surf = run("surfing", { intent: "explorer" }, [[9, { type: "tick" }], [21, { type: "tick" }]]);
  const during = Live.view(surf.state, surf.now);
  assert.equal(during.discoveries, null);
  assert.equal(during.interlude, null);
  const silent = run("muscu_gym", { intent: "depasser", immersion: "silence", reference: squatRef }, [[3, set("Squat", 60, 9, 2)]]);
  assert.equal(Live.view(silent.state, silent.now).threshold, null);
  assert.equal(Live.referenceFor(silent.state, "Squat").suggest, null);
  assert.equal(Live.referenceFor(silent.state, "Squat").last, "60 kg × 8", "the sport fact stays");
  const ended = Live.step(silent.state, { type: "end" }, silent.now + MIN).state;
  assert.equal(Live.view(ended, silent.now + MIN).threshold.status, "done");
  assert.match(Live.recap(ended).lines[0], /Seuil franchi/);
});

test("review: one discovery per kind of novelty, and an explorer mission carries no counter", () => {
  const script = Array.from({ length: 9 }, (_, i) => [i + 1, set(`Exercice ${i}`, 20, 10, 3)]);
  const { state, outs, now } = run("muscu_gym", { intent: "explorer", immersion: "aventure", missions: ["forge.lame_neuve", "forge.braise"] }, script);
  const v = Live.view(state, now);
  assert.equal(v.discoveries.filter((d) => /mouvement nouveau/.test(d)).length, 1);
  assert.equal(outs.filter((o) => o.type === "cue" && o.cue.id === "discovery" && /mouvement nouveau/.test(o.cue.text)).length, 1);
  for (const m of v.missions.active) assert.deepEqual([m.value, m.target], [null, null]);
  const long = run("running", { intent: "explorer", immersion: "aventure" }, [[46, { type: "tick" }]]);
  for (const o of long.outs.filter((x) => x.type === "cue")) assert.doesNotMatch(o.cue.text, /\d/, o.cue.text);
});

test("review: the calm line belongs to real pauses — not to every point, not after the effort resumed, no phantom bell", () => {
  let s = Live.step(Live.create({ sportId: "badminton", seed: "b" }), { type: "start" }, T0).state;
  for (let i = 1; i <= 6; i++) s = Live.step(s, { type: "beat", kind: "point", data: { won: i % 2 === 0 } }, T0 + i * 24000).state;
  assert.equal(Live.view(s, T0 + 150000).interlude, null, "points are play, not a pause");
  let r = Live.step(Live.create({ sportId: "running", seed: "b" }), { type: "start" }, T0).state;
  r = Live.step(r, { type: "pause" }, T0 + 5 * MIN).state;
  assert.ok(Live.view(r, T0 + 5 * MIN + 1000).interlude);
  r = Live.step(r, { type: "resume" }, T0 + 6 * MIN).state;
  assert.equal(Live.view(r, T0 + 6 * MIN + 5000).interlude, null);
  const arm = Voies.resolve("arm_wrestling");
  assert.equal(arm.panel, "sets");
  assert.equal(arm.plan.kind, "set");
  assert.equal(arm.plan.workS, undefined);
  const duel = run("arm_wrestling", { intent: "atteindre", plan: { count: 4 } }, [[2, set("Duel", 0, 1, 2)], [4, set("Duel", 0, 1, 2)], [6, set("Duel", 0, 1, 2)], [8, set("Duel", 0, 1, 2)]]);
  assert.equal(Live.stages(duel.state, duel.now).reached, 4);
  assert.equal(Live.view(duel.state, duel.now).bell, null);
});

test("review: a tiny distance goal never breaks the story, and an old state can be asked for its threshold", () => {
  const { state } = run("running", { intent: "atteindre", goal: { kind: "distance", value: 0.04 } }, [[5, { type: "end" }]]);
  assert.equal(Live.stages(state, T0), null);
  assert.ok(Live.recap(state).lines.length >= 1);
  const old = JSON.parse(JSON.stringify(Live.create({ sportId: "muscu_gym", intent: "depasser", seed: "old" })));
  for (const k of ["thresholds", "discoveries", "calm", "reference"]) delete old[k];
  assert.equal(Live.thresholdOf(old, T0).status, "none");
});
