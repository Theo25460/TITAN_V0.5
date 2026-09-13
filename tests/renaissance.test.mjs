import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

function env({ browser = false, storageFailure = false, seed = {} } = {}) {
  const storage = new Map(Object.entries(seed)),
    events = [];
  const window = {
    state: { user: { id: "guest_test" }, history: [] },
    dispatchEvent: (e) => events.push(e.type),
    addEventListener() {},
  };
  const context = {
    window,
    structuredClone,
    console,
    Date,
    Intl,
    AbortSignal,
    CustomEvent: class {
      constructor(type) {
        this.type = type;
      }
    },
    localStorage: {
      getItem: (k) => storage.get(k) || null,
      setItem(k, v) {
        if (storageFailure) throw Error("QuotaExceeded");
        storage.set(k, v);
      },
    },
    setTimeout() {},
    clearTimeout() {},
  };
  if (browser) context.document = { addEventListener() {} };
  vm.createContext(context);
  for (const file of [
    "training-store",
    "renaissance-catalog",
    "renaissance-engine",
    "sport-insights",
  ])
    vm.runInContext(
      readFileSync(new URL(`../js/${file}.js`, import.meta.url), "utf8"),
      context,
    );
  return {
    window,
    storage,
    events,
    context,
    A: window.TitanAdventure,
    I: window.TitanInsights,
  };
}
const log = (id, fields = {}) => ({
  id,
  sport: "running",
  date: "2026-01-10T12:00:00",
  val: 5,
  unit: "km",
  details: { duration: 30 },
  ...fields,
});
const ex = (weight, reps = 10, variant = "") => ({
  name: "Squat",
  variant,
  setRows: [{ weight, reps, rir: null }],
});

test("records exclude archived/future sessions and compare whole distances with explicit tolerance", () => {
  const { I } = env();
  const rows = [
    log("a"),
    log("faster", { val: 5.03, details: { duration: 24 } }),
    log("outside", { val: 4.8, details: { duration: 18 } }),
    log("archived", { archived_at: "2026-01-11", details: { duration: 10 } }),
    log("future", { date: "2099-01-01", val: 100 }),
  ];
  const records = I.records(rows);
  assert.equal(records.find((r) => r.id === "time:running:5").log.id, "faster");
  assert.equal(records.find((r) => r.id === "distance:running").value, 5.03);
  assert.match(
    records.find((r) => r.id === "time:running:5").context,
    /pas un temps de segment/,
  );
});
test("strength merges repeated exercises in a session without mixing variants or missing measurements", () => {
  const { I } = env();
  const rows = [
    log("a", {
      sport: "muscu_builder",
      details: {
        exercises: [ex(50), ex(40, 5), ex(70, 5, "goblet"), ex(null)],
      },
    }),
    log("b", { sport: "muscu_builder", details: { exercises: [ex(0, 20)] } }),
  ];
  const groups = I.strength(rows),
    same = groups.find((g) => !g.variant);
  assert.equal(groups.length, 2);
  assert.equal(same.sessions.length, 2);
  assert.equal(same.volume, 700);
  assert.equal(same.reps, 35);
  assert.equal(same.maxWeight.value, 50);
  assert.equal(same.maxWeight.reps, 10);
  const trend = I.exerciseTrend(same);
  assert.equal(trend.unit, "kg de volume");
  assert.equal(
    trend.points[1].value,
    0,
    "bodyweight cannot become 20 kg in a volume chart",
  );
  assert.equal(I.sets(ex(0))[0].rir, null);
  assert.equal(I.num("  "), null);
});
test("climbing separates systems, discipline and venue, and never guesses malformed grades", () => {
  const { I } = env();
  const rows = ["Fontainebleau bloc", "Français voie", "V-scale bloc"].map(
    (system, i) =>
      log("c" + i, {
        sport: "climbing",
        details: {
          extras: {
            grade_system: system,
            max_done: ["6A", "6b+", "V4"][i],
            location: "Salle",
            climbing_discipline: i === 1 ? "Voie" : "Bloc",
          },
        },
      }),
  );
  const groups = I.climbing(rows);
  assert.equal(groups.length, 3);
  assert.equal(I.grade("6", "Français voie"), null);
  assert.equal(I.grade("7z", "Français voie"), null);
  assert.equal(I.grade("6A", "Système inconnu"), null);
  assert.ok(
    I.grade("6c", "Français voie").score >
      I.grade("6b+", "Français voie").score,
  );
  assert.equal(groups[0].attemptsMeasured, 0);
});
test("dated goals count only measured sources and recompute after an archive", () => {
  const { I } = env();
  const goal = {
    metric: "minutes",
    target: 60,
    start_date: "2026-01-10",
    end_date: "2026-01-11",
    sport: "running",
  };
  const rows = [
    log("a"),
    log("b", { date: "2026-01-11T23:00:00", details: { duration: 45 } }),
    log("missing", { details: {} }),
    log("wrong-sport", { sport: "cycling" }),
    log("outside", { date: "2026-01-12T12:00:00" }),
  ];
  let p = I.goalProgress(goal, rows, new Date("2026-01-15"));
  assert.equal(p.value, 75);
  assert.equal(p.sources.length, 3);
  assert.equal(p.contributors.length, 2);
  assert.equal(p.complete, true);
  rows[1].archived_at = "2026-01-12";
  p = I.goalProgress(goal, rows, new Date("2026-01-15"));
  assert.equal(p.value, 30);
  assert.equal(p.complete, false);
  assert.equal(p.ended, true);
});
test("weekly missions use active days and explicit notes without rewarding backdated or missing data", () => {
  const { A } = env();
  const rows = [
    log("a", {
      date: "2026-01-12T09:00:00",
      details: { note: "Une bonne séance.", duration: 20 },
    }),
    log("b", { date: "2026-01-12T18:00:00", details: {} }),
    log("old", { date: "2026-01-04" }),
    log("future", { date: "2026-01-16" }),
  ];
  const q = A.weeklyQuests(rows, 3, new Date("2026-01-14"));
  assert.equal(q[0].value, 2);
  assert.equal(q[1].value, 1);
  assert.equal(q[2].value, 1);
  assert.equal(q[3].value, 1);
});
test("guest campaign cannot consume old sessions, double claim or convert a claim to XP", async () => {
  const { window, A } = env({ browser: true });
  window.state.history = [log("old")];
  await A.refresh();
  await A.action("start", { world: "aube" });
  await assert.rejects(
    () => A.action("claim", { world: "aube", chapter: 1 }),
    /QUEST_INCOMPLETE/,
  );
  const now = new Date().toISOString();
  window.state.history.push(log("new", { date: now, created_at: now }));
  await A.refresh();
  const xp = A.snapshot.xp;
  await A.action("claim", { world: "aube", chapter: 1 });
  assert.equal(A.snapshot.xp, xp);
  assert.equal(A.snapshot.rewards.length, 1);
  await assert.rejects(
    () => A.action("claim", { world: "aube", chapter: 1 }),
    /QUEST_INCOMPLETE/,
  );
  await assert.rejects(
    () => A.action("start", { world: "forge" }),
    /TITAN_PLUS_REQUIRED/,
  );
});
test("guest action never reports success when persistent storage fails", async () => {
  const { A } = env({ browser: true, storageFailure: true });
  await A.refresh();
  await assert.rejects(
    () => A.action("start", { world: "aube" }),
    /LOCAL_STORAGE_UNAVAILABLE/,
  );
  assert.equal(A.snapshot.campaigns[0].chapter, 0);
});
test("a late cloud response cannot replace the newly selected account", async () => {
  const { window, A, context } = env({ browser: true });
  window.state.user.id = "owner-a";
  window.titanClient = {
    auth: {
      async getSession() {
        return {
          data: {
            session: {
              user: { id: window.state.user.id },
              access_token: "test-token",
            },
          },
        };
      },
    },
  };
  let respond;
  context.fetch = () =>
    new Promise((resolve) => {
      respond = resolve;
    });
  const pending = A.refresh();
  await new Promise(setImmediate);
  assert.equal(typeof respond, "function");
  window.state.user.id = "guest_other";
  await A.refresh();
  respond({
    ok: true,
    json: async () => ({ owner: "owner-a", level: 40, xp: 1 }),
  });
  await pending;
  assert.equal(A.snapshot.owner, "guest_other");
  assert.equal(A.snapshot.level, 1);
});

test("initial rendering restores only the matching owner's cached character", () => {
  const saved = {owner:'guest_test',level:6,avatar:'ranger',xp:150};
  const {A}=env({browser:true,seed:{'titan_adventure_v1:guest_test':JSON.stringify(saved)}});
  assert.equal(A.snapshot.avatar,'ranger');
  assert.equal(A.status,'cached');
  const wrong=env({browser:true,seed:{'titan_adventure_v1:guest_test':JSON.stringify({...saved,owner:'someone-else'})}});
  assert.equal(wrong.A.snapshot,null);
});
