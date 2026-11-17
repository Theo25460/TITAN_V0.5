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
