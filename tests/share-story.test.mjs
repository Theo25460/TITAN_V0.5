// Story cards (« Partager », avant V2): the shared rules of what a 1080 × 1920 image of a session or a success may show, and the
// layout of its three styles (Champ, Feuille, Carnet), checked for every kind of session the catalogue allows.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
require("../js/core/sports-catalog.js");
require("../js/core/sports.js");
require("../js/core/sport-contracts.js");
const S = require("../js/core/share-story.js");
const root = new URL("..", import.meta.url).pathname;

// A plausible city loop in metres (planar offsets), as the clients hand it over after trimming its ends.
const loop = { segs: [[[0, 0], [900, 60], [950, 1300], [2200, 1250], [2300, 2100], [3100, 2350], [3300, 900], [2100, 300], [1600, -200], [400, -150]]] };
const week = { rows: [{ label: "Course à pied", family: "endurance", cells: [0, 2, 0, 3, 0, 0, 0] }, { label: "Musculation", family: "force", cells: [{ level: 2 }, null, null, null, { level: 1 }, null, null] }, { label: "Yoga", family: "mobilite", cells: [0, 0, 1, 0, 0, 0, 0] }], mark: 3, markRow: 0 };

const gps = {
  sport: "Course à pied", sportId: "running",
  metrics: [["Distance", "10,2 km"], ["Durée", "52:10"], ["Allure", "5:07 /km"], ["Dénivelé", "+120 m"], ["Ressenti", "7/10"]],
  record: { label: "10 km", value: "52:10", previous: "54:02" },
  route: loop, week, date: "2026-11-26T08:00:00Z", name: "Théo",
  // What a GPS session also carries on the clients: none of it may reach the card.
  location: "Rue des Granges, Besançon", note: "Genou un peu raide", heartRate: 168,
};
const extrasOf = (sport, values) => ({ fields: globalThis.TitanSports.conf(sport)?.extraFields || [], values });

test("the picture is a 9:16 story at 1080 × 1920 with margins for the story interfaces", () => {
  assert.deepEqual(S.SIZE, { width: 1080, height: 1920 });
  assert.ok(S.SAFE.top >= 220 && S.SAFE.bottom >= 300 && S.SAFE.side >= 80);
  assert.deepEqual(S.STYLES, ["champ", "feuille", "carnet"]);
});

test("a GPS session shows its measures and its route shape, never coordinates, place, note or body signals", () => {
  const card = S.session(gps);
  assert.equal(card.title, "Course à pied");
  assert.deepEqual([card.hero.number, card.hero.unit, card.hero.label], ["10,2", "km", "Distance"]);
  assert.deepEqual(card.facts.map(([k]) => k), ["Durée", "Allure", "Dénivelé"]);
  assert.ok(card.route && card.route.segs[0].length >= 2, "the route is drawn by default");
  for (const [x, y] of card.route.segs.flat()) assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1, "the shape is normalised");
  const text = JSON.stringify(card);
  for (const secret of ["Granges", "Besançon", "Genou", "168", "7/10", "Ressenti", "xp", "Niveau"]) assert.ok(!text.includes(secret), `${secret} must not be on the card`);
  assert.equal(S.session(gps, { route: false }).route, null, "the route can be removed");
});

test("the name is off by default; the date, the route and the week can be hidden", () => {
  assert.equal(S.session(gps).name, null);
  assert.equal(S.session(gps, { name: true }).name, "Théo");
  assert.match(S.session(gps).date, /26 novembre 2026/);
  assert.equal(S.session(gps, { date: false }).date, null);
  assert.equal(S.session(gps, { week: false }).week, null);
  assert.deepEqual(S.options("anything"), { style: "champ", name: false, date: true, route: true, week: true });
  assert.deepEqual(S.options({ name: "yes", style: "poster" }), { style: "champ", name: false, date: true, route: true, week: true });
  assert.deepEqual(S.availableOptions(gps, "champ"), ["route", "week", "date", "name"]);
  assert.deepEqual(S.availableOptions(gps, "carnet"), ["route", "date", "name"], "the notebook has no week");
  assert.deepEqual(S.availableOptions({ sport: "Yoga" }), []);
});

test("every discipline brings its own measures; body signals, self-ratings and free text stay off", () => {
  const football = S.session({ sport: "Football", sportId: "football", metrics: [["Durée", "1 h 30"]], extras: extrasOf("football", { position: "Milieu", goals: 2, assists: 1, score_for: 3, score_against: 1, avg_hr: 160 }) });
  assert.deepEqual(football.hero, { value: "3 – 1", label: "Score", number: "3 – 1", unit: "" }, "a score leads a match");
  assert.ok(football.facts.some(([k, v]) => k === "Buts marqués" && v === "2"));
  assert.ok(!JSON.stringify(football).includes("160"), "heart rate is never drawn");
  const tennis = S.session({ sport: "Tennis", sportId: "tennis", metrics: [["Durée", "1 h 45"]], extras: extrasOf("tennis", { sets_won: 2, sets_lost: 1, aces: 6, first_serve_pct: 64 }) });
  assert.ok(tennis.facts.some(([k, v]) => k === "Sets" && v === "2 – 1") || tennis.hero.label === "Sets");
  assert.ok(tennis.facts.some(([, v]) => v === "64 %"));
  const yoga = S.session({ sport: "Yoga", sportId: "yoga", metrics: [["Durée", "45 min"]], extras: extrasOf("yoga", { poses: 24, pain_before: 3, pain_after: 1 }) });
  assert.ok(yoga.facts.some(([k]) => k === "Postures travaillées"));
  assert.ok(!JSON.stringify(yoga).match(/Douleur/), "pain is a body signal");
  const surf = S.session({ sport: "Surf", sportId: "surfing", metrics: [["Durée", "2 h"]], extras: extrasOf("surfing", { waves: 18, wave_height_m: 1.5, quality_score: 8 }) });
  assert.ok(surf.facts.some(([, v]) => v === "1,5 m"));
  assert.ok(!surf.facts.some(([k]) => /Qualit/.test(k)), "self-ratings are not drawn");
  assert.deepEqual(S.extraFacts([{ id: "opponent_name", type: "text", label: "Adversaire" }], { opponent_name: "Paul" }), [], "free text is never drawn");
});

test("a manual session without distance or GPS still makes a card, with nothing invented", () => {
  const card = S.session({ sport: "Yoga", metrics: [["Durée", "45 min"]], date: "2026-11-20T18:00:00Z" });
  assert.equal(card.hero.value, "45 min");
  assert.deepEqual(card.facts, []);
  assert.equal(card.route, null);
  const empty = S.session({ sport: "Escalade", metrics: [["Durée", "—"], ["Distance", "NaN km"], ["Valeur", "0 min"], ["Mystère", "12"]] });
  assert.equal(empty.hero, null, "placeholders and unknown measures are dropped");
  assert.equal(S.session(null).title, "Séance");
  assert.equal(S.routeShape({ segs: [[[1, 1]]] }), null, "one point is not a route");
  assert.equal(S.routeShape({ segs: [[[1, 1], [1, 1]]] }), null, "a route that does not move is not drawn");
});

test("strength and climbing lead with their own figure", () => {
  const gym = S.session({ sport: "Musculation", metrics: [["Exercices", "5"], ["Séries", "18"], ["Volume", "6,4 t"], ["Durée", "1 h 05"]] });
  assert.equal(gym.hero.label, "Volume");
  const climb = S.session({ sport: "Escalade en salle", metrics: [["Durée", "1 h 30"], ["Meilleure", "6b+"], ["Réussites", "7/9"]] });
  assert.deepEqual([climb.hero.number, climb.hero.unit], ["6b+", ""], "a grade is never split as a number and a unit");
});

test("a record set by the session, and success cards", () => {
  const card = S.session(gps);
  assert.equal(card.tone, "amber");
  assert.deepEqual(card.record, { label: "10 km", value: "52:10", previous: "54:02" });
  const record = S.achievement({ type: "record", title: "Charge maximale", value: "120 kg", sport: "Musculation", previous: "115 kg" });
  assert.equal(record.eyebrow, "Record personnel · Musculation");
  assert.equal(record.progress, "avant : 115 kg");
  assert.equal(S.achievement({ type: "record", title: "5 km", value: "24:10", previous: null }).progress, "Premier repère");
  assert.equal(S.achievement({ type: "milestone", title: "Ma 100e séance", value: "100" }).tone, "cyan");
});

test("long texts are cut on one line, at a word, with an ellipsis", () => {
  const long = "Randonnée en raquettes à neige sur sentier balisé de moyenne montagne avec portage";
  assert.ok(S.session({ sport: long, metrics: [] }).title.endsWith("…"));
  assert.equal(S.clip("a\nb\u2028c\u202ed", 20), "a b c d", "line breaks and bidi controls are removed");
  assert.equal(S.session({ ...gps, name: "x".repeat(80) }, { name: true }).name.length, S.LIMITS.name);
});

/* ---------- Layout: every text inside the safe area, none over another, for every style and every kind of card ---------- */
const CASES = {
  gps: [S.session, gps, { name: true }],
  manual: [S.session, { sport: "Yoga", sportId: "yoga", metrics: [["Durée", "45 min"]], week, date: "2026-11-20" }],
  football: [S.session, { sport: "Football", sportId: "football", metrics: [["Durée", "1 h 30"]], extras: extrasOf("football", { position: "Milieu", goals: 2, assists: 1, shots: 5, score_for: 3, score_against: 1 }), week, date: "2026-11-20" }],
  long: [S.session, { sport: "Randonnée en raquettes à neige sur sentier balisé de moyenne montagne", metrics: [["Distance", "14,8 km"], ["Durée", "4 h 20"], ["Vitesse", "3,4 km/h"], ["Dénivelé", "+860 m"]], route: loop, week, name: "Marie-Charlotte de La Rochefoucauld-Montbel", date: "2026-11-20" }, { name: true }],
  empty: [S.session, { sport: "Pratique libre", metrics: [] }],
  record: [S.achievement, { type: "record", title: "Charge maximale au développé couché incliné", value: "120 kg", sport: "Musculation", previous: "115 kg", date: "2026-11-12" }],
  milestone: [S.achievement, { type: "milestone", title: "Ma 100e séance", value: "100", progress: "100 séances enregistrées depuis le 3 mars 2025, tous sports confondus.", date: "2026-11-12" }],
};
/** The part of its box a line of text really inks, from the shared advance widths and its alignment. */
const ink = (o) => {
  const w = Math.min(o.w, S.measure(o.text, o.font, o.size, o.tracking));
  const x = o.align === "right" ? o.x + o.w - w : o.align === "center" ? o.x + (o.w - w) / 2 : o.x;
  return { x, w, y: o.y, lh: o.lh };
};
const overlap = (p, q) => { const a = ink(p), b = ink(q); return a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.lh - 4 && b.y < a.y + a.lh - 4; };

for (const style of S.STYLES) {
  test(`style ${style}: every text stays inside the story margins, fits its box and overlaps no other`, () => {
    for (const [name, [make, input, opts]] of Object.entries(CASES)) {
      const plan = S.layout(make(input, { ...opts, style }), style);
      assert.equal(plan.style, style);
      const texts = plan.ops.filter((o) => o.t === "text");
      assert.ok(texts.some((o) => o.text === S.SITE), `${name}: titan-app.fr is on the card`);
      assert.ok(plan.ops.some((o) => o.t === "mark"), `${name}: the TITAN mark is on the card`);
      for (const o of texts) {
        assert.ok(o.y >= S.SAFE.top - 2 && o.y + o.lh <= S.SIZE.height - S.SAFE.bottom + 2, `${name}: « ${o.text} » at y=${o.y} leaves the safe area`);
        assert.ok(o.x >= S.SAFE.side - 60 && o.x + o.w <= S.SIZE.width - S.SAFE.side + 2, `${name}: « ${o.text} » leaves the side margins`);
        assert.ok(S.measure(o.text, o.font, o.size, o.tracking) <= o.w + 2, `${name}: « ${o.text} » is wider than its box`);
      }
      for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) assert.ok(!overlap(texts[i], texts[j]), `${name}: « ${texts[i].text} » overlaps « ${texts[j].text} »`);
      const route = plan.ops.find((o) => o.t === "route");
      if (route) for (const [x, y] of route.segs.flat()) assert.ok(x >= 0 && x <= S.SIZE.width && y >= S.SAFE.top && y <= S.SIZE.height - S.SAFE.bottom, `${name}: the route leaves the safe area`);
    }
  });
}

test("the route is drawn in every style when there is one; the week in Champ and Feuille", () => {
  for (const style of S.STYLES) assert.ok(S.layout(S.session(gps, { style }), style).ops.some((o) => o.t === "route"), style);
  const manual = S.session({ sport: "Yoga", metrics: [["Durée", "45 min"]], week }, { style: "champ" });
  assert.ok(S.layout(manual, "champ").ops.some((o) => o.t === "text" && o.text === "Ma semaine"));
});

test("the export has a neutral file name and the analytics names carry no sport data", () => {
  assert.equal(S.fileName("session"), "titan-seance.png");
  assert.equal(S.fileName("achievement"), "titan-succes.png");
  assert.deepEqual(Object.values(S.EVENTS).sort(), ["share_export_failed", "share_export_succeeded", "share_preview_opened", "share_sheet_opened"]);
});

test("the Android app carries an unchanged copy of the module", () => {
  const web = readFileSync(`${root}js/core/share-story.js`, "utf8");
  assert.equal(readFileSync(`${root}mobile/src/core/web/share-story.js`, "utf8"), web);
  assert.ok(readFileSync(`${root}mobile/scripts/sync-web-core.mjs`, "utf8").includes('"js/core/share-story.js"'));
});
