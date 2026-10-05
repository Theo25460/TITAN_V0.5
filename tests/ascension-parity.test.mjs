// TITAN 300 — guarantees that the retired v200 modules used to test, now checked on their v300 replacements.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require("../js/core/sports-catalog.js");
require("../js/core/sports.js");
const E = require("../js/core/effort.js");
const S = globalThis.TitanSports;
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("five primary destinations, social and coaching stay secondary", async () => {
  const shell = await read("js/app/shell.js");
  const block = (name) => shell.match(new RegExp(`const ${name} = \\[(.*?)\\n  \\];`, "s"))?.[1] || "";
  assert.deepEqual([...block("TERRITORIES").matchAll(/href: "([^"]+)"/g)].map((m) => m[1]), ["/aujourdhui", "/stats", "/training", "/adventure", "/profile"]);
  assert.deepEqual([...block("SECONDARY").matchAll(/href: "([^"]+)"/g)].map((m) => m[1]), ["/social", "/coaching", "/boutique", "/service"]);
});

test("sport families are practice families, never Olympic metadata", () => {
  assert.deepEqual(Object.keys(S.FAMILY_LABEL), ["endurance", "force", "technique", "jeu", "mobilite"]);
  for (const label of Object.values(S.FAMILY_LABEL)) assert.doesNotMatch(label, /olymp/i);
});

test("search normalizes accents, apostrophes and separators", () => {
  assert.equal(S.norm("Course d’Orientation_VTT"), "course d orientation vtt");
  assert.equal(S.search("étirements")[0]?.id, "stretching");
});

test("search understands everyday French intentions and spelling variants", () => {
  assert.equal(S.search("padel")[0].id, "padel");
  assert.ok(S.search("paddle").some((r) => r.id === "padel"), "paddle also offers padel");
  assert.equal(S.search("courir")[0].id, "running");
  assert.equal(S.search("nager")[0].id, "swimming");
  assert.equal(S.search("vtt")[0].id, "mountain_bike");
});

test("durations: missing stays missing, hours and declared minutes are honoured", () => {
  assert.equal(E.declaredMinutes("km", 5, {}), null);
  assert.equal(E.declaredMinutes("h", 1.5, {}), 90);
  assert.equal(E.declaredMinutes("km", 5, { duration: "", val2: 32 }), 32);
  assert.equal(E.declaredMinutes("km", 6, { duration: 40, gpxStats: { movingMinutes: 30 } }), 30, "GPX moving time wins");
});

test("climbing minutes never become kilometres and an absent RPE stays unknown", () => {
  const e = E.effort({ sport: "bouldering", profile: "climbing", unit: "min", val: 45, details: {} });
  assert.equal(e.minutes, 45);
  assert.equal(e.estimated, false);
  assert.equal(e.rpe, null);
  assert.ok(e.intensity > 0.99 && e.intensity < 1.01, "unknown RPE uses the neutral 5");
});
