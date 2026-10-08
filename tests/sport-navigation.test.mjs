import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const require = createRequire(import.meta.url);
let N = {};
try { N = require("../js/core/sport-navigation.js"); }
catch (e) { if (e.code !== "MODULE_NOT_FOUND") throw e; }
const select = (entries, options) => {
  assert.equal(typeof N.select, "function", "shared sport navigation must exist");
  return N.select(entries, options);
};
const NOW = Date.parse("2026-10-08T12:00:00Z");
const rows = [
  { sport: "bouldering", label: "Escalade bloc", family: "technique", hasData: true, last: "2026-10-07T12:00:00Z", level: 3, aliases: ["grimpe"] },
  { sport: "running", label: "Course à pied", family: "endurance", hasData: true, last: "2026-10-01T12:00:00Z", level: 4, aliases: ["footing"] },
  { sport: "yoga", label: "Yoga", family: "mobilite", hasData: false, last: null },
  { sport: "old_sport", label: "Ancien sport", family: "force", hasData: true, last: "2026-08-01T12:00:00Z", level: 2 },
];

test("200 sports remain reachable in bounded pages", () => {
  const list = Array.from({ length: 200 }, (_, i) => ({ sport: `s${i}`, label: `Sport ${String(i).padStart(3, "0")}`, hasData: true }));
  const first = select(list, { pageSize: 12 });
  assert.equal(first.total, 200);
  assert.equal(first.items.length, 12);
  assert.equal(first.pages, 17);
  const last = select(list, { page: 999, pageSize: 12 });
  assert.equal(last.page, 17);
  assert.equal(last.items.length, 8);
  assert.equal(last.items.at(-1).sport, "s199");
});
test("names ignore accents and case, aliases remain searchable", () => {
  assert.deepEqual(select(rows, { query: "COURSE A PIED" }).items.map(x => x.sport), ["running"]);
  assert.deepEqual(select(rows, { query: "grimpe" }).items.map(x => x.sport), ["bouldering"]);
  assert.deepEqual(select(rows, { query: "old sport" }).items.map(x => x.sport), ["old_sport"]);
});
test("favorites, family and query combine instead of replacing each other", () => {
  assert.deepEqual(select(rows, { favorites: ["running", "bouldering"], scope: "favorites", family: "technique", query: "bloc" }).items.map(x => x.sport), ["bouldering"]);
  assert.equal(select(rows, { favorites: ["running"], scope: "favorites", family: "technique" }).total, 0);
});
test("a favorite without data is hidden by default and reachable on demand", () => {
  assert.equal(select(rows, { favorites: ["yoga"], scope: "favorites" }).total, 0);
  assert.deepEqual(select(rows, { favorites: ["yoga"], scope: "favorites", hideEmpty: false }).items.map(x => x.sport), ["yoga"]);
});
test("recent means 30 days with inclusive boundary, invalid/future dates excluded", () => {
  const list = [
    { sport: "boundary", label: "A", hasData: true, last: "2026-09-08T12:00:00Z" },
    { sport: "older", label: "B", hasData: true, last: "2026-09-08T11:59:59Z" },
    { sport: "future", label: "C", hasData: true, last: "2026-10-09T12:00:00Z" },
    { sport: "invalid", label: "D", hasData: true, last: "broken" },
  ];
  assert.deepEqual(select(list, { scope: "recent", now: NOW }).items.map(x => x.sport), ["boundary"]);
});
test("sport deep links and record recency sort keep their meaning", () => {
  assert.deepEqual(select(rows, { sport: "running" }).items.map(x => x.sport), ["running"]);
  assert.deepEqual(select(rows, { sort: "recent" }).items.map(x => x.sport), ["bouldering", "running", "old_sport"]);
  assert.deepEqual(select(rows, { sort: "mastery" }).items.map(x => x.sport), ["running", "bouldering", "old_sport"]);
});
test("small accounts are not padded and empty searches have a valid first page", () => {
  assert.equal(select(rows.slice(0, 2)).items.length, 2);
  const empty = select(rows, { query: "<img src=x onerror=alert(1)>" });
  assert.equal(empty.total, 0);
  assert.equal(empty.page, 1);
  assert.equal(empty.pages, 1);
});
test("sorting does not mutate input or lose old catalog entries", () => {
  const list = structuredClone(rows);
  const before = structuredClone(list);
  assert.deepEqual(select(list).items.map(x => x.sport), ["old_sport", "running", "bouldering"]);
  assert.deepEqual(list, before);
});

test("navigation analytics never transmits the search text or session details", async () => {
  const writes = [];
  const context = {
    window: { state: { user: { id: "fixture-account" } }, titanClient: {
      auth: { getSession: async () => ({ data: { session: { user: { id: "fixture-account" } } } }) },
      from: () => ({ insert: async payload => { writes.push(payload); return { error: null }; } }),
    } },
    localStorage: { getItem: () => JSON.stringify({ analytics: "granted" }) },
    navigator: { onLine: true }, location: { pathname: "/records", search: "" }, URLSearchParams,
  };
  vm.runInNewContext(readFileSync(new URL("../js/app/analytics.js", import.meta.url), "utf8"), context);
  const sent = await context.window.TitanAnalytics.track("sport_navigation_searched", { source: "records", count: 1, query: "private search", sessions: [{ health: "private" }] });
  assert.equal(sent, true, "the documented navigation event is accepted");
  assert.equal(writes.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(writes[0].metadata)), { source: "records", count: 1, consent: "granted", v: 300 });
  await context.window.TitanAnalytics.track("sport_navigation_filtered", { source: "mastery", kind: "family", family: "technique" });
  assert.equal(writes.length, 2);
});

test("legacy favorite remains reachable after its last session is archived", () => {
  const context = { window: {
    state: { user: { favoriteSports: ["retired_sport"] } },
    TitanSports: { all: () => [{ id: "running", label: "Course à pied", family: "endurance" }], label: id => id === "retired_sport" ? "Ancien sport" : "Course à pied", familyOf: () => "endurance", conf: () => null },
  } };
  vm.runInNewContext(readFileSync(new URL("../js/app/sport-browser.js", import.meta.url), "utf8"), context);
  const entries = context.window.TitanSportBrowser.entries([]);
  const found = select(entries, { favorites: ["retired_sport"], scope: "favorites", hideEmpty: false });
  assert.equal(found.items.length, 1);
  assert.equal(found.items[0].sport, "retired_sport");
  assert.equal(found.items[0].hasData, false);
});

test("online catalog retains snapshot aliases in Records and Maîtrise search", () => {
  const context = { window: {
    state: { user: { favoriteSports: [] } },
    SPORTS_CONFIG: { running: { name: "Course à pied", label: "Course à pied", unit: "km", balanceProfile: "running", trackingSummary: {} } },
  } };
  for (const file of ["core/sports-catalog", "core/sports", "app/sport-browser"])
    vm.runInNewContext(readFileSync(new URL(`../js/${file}.js`, import.meta.url), "utf8"), context);
  const entries = context.window.TitanSportBrowser.entries([{ sport: "running", last: "2026-10-01" }]);
  assert.deepEqual(Array.from(select(entries, { query: "footing" }).items, x => x.sport), ["running"]);
});
