// Story cards (« Partager », avant V2): the shared rules of what a 1080 × 1920 image of a session or a success may show.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const S = require("../js/core/share-story.js");
const root = new URL("..", import.meta.url).pathname;

const gps = {
  sport: "Course à pied",
  metrics: [["Distance", "10,2 km"], ["Durée", "52:10"], ["Allure", "5:07 /km"], ["Dénivelé", "+120 m"], ["Ressenti", "7/10"]],
  xp: { confirmed: true, amount: 1240, level: 12, rankName: "Sentinelle" },
  date: "2026-11-26T08:00:00Z",
  name: "Théo",
  // What a GPS session also carries on the clients: none of it may reach the card.
  route: [[47.24, 6.02], [47.25, 6.03]], location: "Rue des Granges, Besançon", note: "Genou un peu raide", heartRate: 168,
};

test("the picture is a 9:16 story at 1080 × 1920 with margins for the story interfaces", () => {
  assert.deepEqual(S.SIZE, { width: 1080, height: 1920 });
  assert.equal(S.SIZE.width / S.SIZE.height, 9 / 16);
  assert.ok(S.SAFE.top >= 220 && S.SAFE.bottom >= 300 && S.SAFE.side >= 80, "the story interfaces cover the top and the bottom");
});

test("a GPS session shows its measures, never its trace, place, note or body signals", () => {
  const card = S.session(gps);
  assert.equal(card.kind, "session");
  assert.equal(card.title, "Course à pied");
  assert.deepEqual(card.hero, { value: "10,2 km", label: "Distance" });
  assert.deepEqual(card.facts, [["Durée", "52:10"], ["Allure", "5:07 /km"], ["Dénivelé", "+120 m"]]);
  const text = JSON.stringify(card);
  for (const secret of ["47.24", "6.02", "Granges", "Besançon", "Genou", "168", "7/10", "Ressenti"]) assert.ok(!text.includes(secret), `${secret} must not be drawn`);
});

test("the name is off by default; the date and the confirmed XP can be hidden", () => {
  assert.equal(S.session(gps).name, null);
  assert.equal(S.session(gps, { name: true }).name, "Théo");
  assert.equal(S.session(gps).date, "26 novembre 2026");
  assert.equal(S.session(gps, { date: false }).date, null);
  assert.equal(S.session(gps).xp, "+1\u202f240 XP");
  assert.equal(S.session(gps).level, "Niveau 12 · Sentinelle");
  const hidden = S.session(gps, { xp: false });
  assert.equal(hidden.xp, null);
  assert.equal(hidden.level, null);
  assert.deepEqual(S.options("anything"), S.DEFAULTS);
  assert.deepEqual(S.options({ name: "yes" }), { name: false, date: true, xp: true }, "only an explicit true shows the name");
});

test("only a gain the server confirmed is drawn: no estimate, no historical XP", () => {
  assert.equal(S.session({ ...gps, xp: { confirmed: false, amount: 300 } }).xp, null);
  assert.equal(S.session({ ...gps, xp: { confirmed: true, amount: 0, level: 0 } }).xp, null);
  const old = S.session({ ...gps, historical: true });
  assert.equal(old.xp, null);
  assert.equal(old.eyebrow, "Séance de mon historique");
  assert.deepEqual(S.availableOptions({ ...gps, historical: true }), ["name", "date"]);
  assert.deepEqual(S.availableOptions(gps), ["name", "date", "xp"]);
  assert.deepEqual(S.availableOptions({ sport: "Yoga" }), []);
});

test("a manual session without distance or GPS still makes a card, with nothing invented", () => {
  const card = S.session({ sport: "Yoga", metrics: [["Durée", "45 min"]], date: "2026-11-20T18:00:00Z" });
  assert.deepEqual(card.hero, { value: "45 min", label: "Durée" });
  assert.deepEqual(card.facts, []);
  assert.equal(card.highlight, null);
  assert.equal(card.xp, null);
  const empty = S.session({ sport: "Escalade", metrics: [["Durée", "—"], ["Distance", "NaN km"], ["Valeur", "0 min"], ["Mystère", "12"]] });
  assert.equal(empty.hero, null, "placeholders and unknown measures are dropped");
  assert.deepEqual(empty.facts, []);
  assert.equal(S.session(null).title, "Séance");
});

test("strength and climbing keep their own measures", () => {
  const gym = S.session({ sport: "Musculation", metrics: [["Exercices", "5"], ["Séries", "18"], ["Volume", "6,4 t"], ["Durée", "1 h 05"], ["Ressenti", "8/10"]] });
  assert.deepEqual(gym.hero, { value: "6,4 t", label: "Volume" }, "the load moved, not the number of exercises");
  assert.deepEqual(gym.facts.map(([k]) => k), ["Exercices", "Séries", "Durée"]);
  const climb = S.session({ sport: "Escalade en salle", metrics: [["Durée", "1 h 30"], ["Meilleure", "6b+"], ["Réussites", "7/9"]] });
  assert.deepEqual(climb.hero, { value: "6b+", label: "Meilleure" }, "the hardest grade leads a climbing card");
  assert.deepEqual(climb.facts, [["Durée", "1 h 30"], ["Réussites", "7/9"]]);
});

test("a record set by the session is the highlight, in amber", () => {
  const card = S.session({ ...gps, record: { label: "10 km", value: "52:10", previous: "54:02" } });
  assert.equal(card.accent, "amber");
  assert.equal(card.eyebrow, "Nouveau record");
  assert.deepEqual(card.highlight, { label: "Record · 10 km", value: "52:10", detail: "avant : 54:02" });
  assert.equal(S.session({ ...gps, record: { label: "", value: "52:10" } }).highlight, null);
});

test("long texts are cut on one line, at a word, with an ellipsis", () => {
  const long = "Randonnée en raquettes à neige sur sentier balisé de moyenne montagne avec portage";
  const card = S.session({ sport: long, metrics: [["Durée", "3 h 20"]] });
  assert.ok(card.title.length <= S.LIMITS.title && card.title.endsWith("…"), card.title);
  assert.equal(S.clip("a\nb\u2028c\u202ed", 20), "a b c d", "line breaks and bidi controls are removed");
  assert.equal(S.clip("Court", 20), "Court");
  assert.equal(S.session({ ...gps, name: "x".repeat(80) }, { name: true }).name.length, S.LIMITS.name);
});

test("a success card: a record, a milestone, a level", () => {
  const record = S.achievement({ type: "record", title: "Squat", value: "120 kg", label: "Meilleure charge", sport: "Musculation", previous: "115 kg", date: "2026-11-12" });
  assert.equal(record.kind, "achievement");
  assert.equal(record.eyebrow, "Record personnel · Musculation");
  assert.deepEqual(record.hero, { value: "120 kg", label: "Meilleure charge" });
  assert.equal(record.progress, "avant : 115 kg");
  assert.equal(S.achievement({ type: "record", title: "5 km", value: "24:10", previous: null }).progress, "Premier repère");
  const milestone = S.achievement({ type: "milestone", title: "Ma 100e séance", value: "100", progress: "100 séances depuis le 3 mars 2025." });
  assert.equal(milestone.eyebrow, "Jalon atteint");
  assert.equal(milestone.progress, "100 séances depuis le 3 mars 2025.");
  const level = S.achievement({ type: "level", title: "Sentinelle", value: "Niveau 12" });
  assert.equal(level.accent, "cyan");
  assert.equal(S.achievement({ type: "other" }).title, "Succès");
  assert.equal(S.achievement({ type: "record", title: "Squat", value: "—" }).hero, null);
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
