// The TITAN sport icon system (docs/design/SPORT_ICONS.md): every sport of the catalogue has a drawing of its own, the few shared
// ones are named with their reason, the generated file is the generator's output, the web pages and the Android catalogue carry it.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const ROOT = new URL("..", import.meta.url).pathname;
const require = createRequire(import.meta.url);
const read = (p) => readFileSync(ROOT + p, "utf8");

function product() {
  const ctx = vm.createContext({});
  for (const p of ["js/app/icons.js", "js/app/sport-icons.js", "js/core/sports-catalog.js", "js/core/sports.js"]) vm.runInContext(read(p), ctx, { filename: p });
  return ctx;
}
const ctx = product();
const S = ctx.TitanSports;
const GLYPHS = ctx.TITAN_SPORT_ICONS;
const ids = ctx.TITAN_SPORTS_SNAPSHOT.map((r) => r[0]);

test("each of the 260 sports of the catalogue has a glyph, and all but the named exceptions have their own", () => {
  assert.equal(ids.length, 260);
  const users = new Map();
  for (const id of ids) {
    const g = S.iconOf(id);
    assert.ok(GLYPHS[g], `${id} → ${g} is drawn`);
    assert.match(g, /^sport-[a-z0-9]+(-[a-z0-9]+)*$/, `${id} has a sport glyph, not a family mark`);
    users.set(g, [...(users.get(g) || []), id]);
  }
  const shared = [...users].filter(([, list]) => list.length > 1);
  const allowed = new Set(Object.keys(S.ICON_SHARED));
  for (const [glyph, list] of shared) {
    const exceptions = list.filter((id) => allowed.has(id));
    assert.ok(exceptions.length >= list.length - 1, `${glyph} is shared by ${list.join(", ")} without a reason in ICON_SHARED`);
  }
  assert.ok(Object.keys(S.ICON_SHARED).length <= 6, "sharing stays rare");
  assert.ok([...users.keys()].length >= 255, "at least 255 distinct drawings for 260 sports");
  // The source comments every shared entry with its reason.
  for (const id of Object.keys(S.ICON_SHARED)) assert.match(read("js/core/sports.js"), new RegExp(`${id}: "sport-[a-z-]+",( //|\\n)`), id);
});

test("the old regex families are gone: close disciplines no longer share a pictogram", () => {
  const pairs = [["football", "rugby"], ["boxing", "fencing"], ["golf", "basketball"], ["mountain_bike", "gravel"], ["cycling_road", "cycling_indoor"],
    ["tennis", "padel"], ["badminton", "squash"], ["alpine_skiing", "cross_country_skiing"], ["equestrian", "karting"], ["kayak", "rowing"],
    ["trail", "hiking"], ["yoga", "pilates"], ["judo", "karate"], ["swimming", "open_water_swimming"], ["bouldering", "climbing_route"]];
  for (const [a, b] of pairs) assert.notEqual(S.iconOf(a), S.iconOf(b), `${a} / ${b}`);
});

test("families have their own marks and a sport the snapshot does not know gets the closest drawing or its family mark", () => {
  for (const f of ["endurance", "force", "technique", "jeu", "mobilite"]) {
    assert.equal(S.FAMILY_ICON[f], `family-${f}`);
    assert.ok(GLYPHS[S.FAMILY_ICON[f]], f);
  }
  assert.equal(S.iconOf("ultra_trail_night"), "sport-trail");
  assert.equal(S.iconOf("beach_tennis_doubles"), "sport-beach-tennis");
  assert.equal(S.iconOf("indoor_rowing_machine"), "sport-rowing-machine");
  assert.equal(S.iconOf("kettlebell_sport"), "sport-kettlebell");
  assert.equal(S.iconOf("nordic_walking_race"), "sport-nordic-walk");
  assert.match(S.iconOf("zzz_unknown"), /^family-/);
  assert.match(S.iconOf(""), /^family-/);
});

test("titanIcon draws a sport glyph on the 24 grid with the UI stroke, and falls back when the sport file is absent", () => {
  const html = ctx.titanIcon("sport-tennis");
  assert.match(html, /^<svg class="t-icon  t-sport" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65"/);
  assert.ok(html.includes(GLYPHS["sport-tennis"]));
  const bare = vm.createContext({});
  vm.runInContext(read("js/app/icons.js"), bare);
  assert.match(bare.titanIcon("sport-tennis"), /<circle cx="12" cy="12" r="9"\/><path d="m16 8/, "without sport-icons.js the compass, never an empty svg");
  assert.equal(ctx.titanIcon("run"), bare.titanIcon("run"), "UI icons are untouched");
});

test("glyphs use only what Android draws, one main stroke, at most one tinted mass, and readable names", () => {
  for (const [name, svg] of Object.entries(GLYPHS)) {
    assert.match(name, /^(sport|family)-[a-z0-9]+(-[a-z0-9]+)*$/, name);
    const tags = [...svg.matchAll(/<([a-z]+)\b/g)].map((m) => m[1]);
    assert.ok(tags.length, name);
    for (const t of tags) assert.ok(["path", "circle", "rect", "ellipse"].includes(t), `${name}: <${t}>`);
    assert.doesNotMatch(svg, /style=|class=|<g\b|<text|url\(|#[0-9a-f]{3,6}/i, `${name}: no style, group, text or colour of its own`);
    const widths = [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
    for (const w of widths) assert.ok(w >= 0.9 && w <= 4.2, `${name}: stroke ${w}`);
    for (const m of svg.matchAll(/fill-opacity="([\d.]+)"/g)) assert.equal(Number(m[1]), 0.22, `${name}: one tint strength`);
  }
});

test("js/app/sport-icons.js is exactly what the generator writes from tools/sport-icons", async () => {
  const before = read("js/app/sport-icons.js");
  const { GLYPHS: source } = await import("../tools/sport-icons/glyphs.mjs");
  assert.deepEqual(Object.keys(source).sort(), Object.keys(GLYPHS).sort(), "rebuild with node tools/sport-icons/build.mjs");
  assert.match(before, /Generated by tools\/sport-icons\/build\.mjs/);
  const registry = JSON.parse(read("docs/design/sport-icons/registry.json"));
  assert.equal(registry.sports, 260);
  for (const row of registry.rows) assert.equal(row.glyph, S.iconOf(row.id), row.id);
});

test("every page that reads icons.js reads sport-icons.js right after it, once", () => {
  const pages = readdirSync(ROOT).filter((f) => f.endsWith(".html") && read(f).includes('src="/js/app/icons.js'));
  assert.ok(pages.length >= 18);
  for (const page of pages) {
    const html = read(page);
    const a = html.indexOf('src="/js/app/icons.js'), b = html.indexOf('src="/js/app/sport-icons.js');
    assert.ok(b > a && html.slice(a, b).split("<script").length === 2, `${page}: sport-icons.js follows icons.js`);
    assert.equal(html.split('src="/js/app/sport-icons.js').length, 2, `${page}: read once`);
  }
});

test("the Android icon catalogue carries every sport glyph, and its copy of the sport rules is the website's", () => {
  const generated = read("mobile/src/core/icons.generated.ts");
  for (const name of Object.keys(GLYPHS)) assert.ok(generated.includes(`"${name}":[`), `${name} in icons.generated.ts`);
  assert.equal(read("mobile/src/core/web/sports.js"), read("js/core/sports.js"), "re-sync: cd mobile && node scripts/sync-web-core.mjs .. <sha>");
});
