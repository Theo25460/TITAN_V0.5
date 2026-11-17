// The navigation is on the first frame of every application page: shell-nav.js is read before the content, draws from what the
// device remembers, and a damaged or foreign memory can only fall back to the visitor.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const ROOT = new URL("..", import.meta.url).pathname;
const require = createRequire(import.meta.url);
const source = readFileSync(ROOT + "js/app/shell-nav.js", "utf8");
const pages = readdirSync(ROOT).filter(f => f.endsWith(".html") && /src="\/js\/app\/shell\.js/.test(readFileSync(ROOT + f, "utf8")));

function boot(stored, { shell = "", territory = "progres" } = {}) {
  const store = new Map(stored === undefined ? [] : [["titan_shell_nav_v1", typeof stored === "string" ? stored : JSON.stringify(stored)]]);
  const made = [];
  const el = () => { const node = { className: "", attrs: {}, innerHTML: "", dataset: {}, setAttribute(k, v) { this.attrs[k] = v; } }; made.push(node); return node; };
  const body = { classList: { contains: c => c === "asc" }, dataset: { territory, title: "Progrès", ...(shell ? { shell } : {}) }, prepend() {}, append() {} };
  const { titanIcon, titanMark } = require("../js/app/icons.js");
  const window = { titanIcon, titanMark, TitanCrest: { BADGES: ["eclaireur", "explorateur", "sentinelle", "gardien"] }, addEventListener() {} };
  const context = { window, document: { body, title: "Progrès — TITAN", documentElement: { setAttribute() {} }, querySelector: () => null, createElement: el },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) } };
  vm.runInNewContext(source, context);
  return { nav: window.titanShellNav, made, store };
}

test("every application page reads icons, crests and the navigation before its content, and the shell after", () => {
  assert.ok(pages.length >= 18);
  for (const page of pages) {
    const html = readFileSync(ROOT + page, "utf8");
    const at = name => html.indexOf(`src="/js/app/${name}.js`);
    assert.ok(at("icons") > 0 && at("icons") < at("crest") && at("crest") < at("shell-nav") && at("shell-nav") < at("shell"), `${page}: icons, crest, shell-nav, then shell`);
    const main = html.search(/<main\b|<div\b/);
    assert.ok(at("shell-nav") < main, `${page}: the navigation is drawn before the content is parsed`);
    assert.equal(html.split(`src="/js/app/icons.js`).length, 2, `${page}: icons.js is read once`);
    assert.equal(html.split(`src="/js/app/crest.js`).length, 2, `${page}: crest.js is read once`);
  }
});

test("first frame: the remembered account, its rank crest, and the current space", () => {
  const { made } = boot({ id: "u1", guest: false, name: "Camille R.", level: 14, avatar: "ranger", frame: "frame-tide", rank: "gardien" });
  const [rail, top, tabs] = made;
  assert.match(rail.innerHTML, /<strong>Camille R\.<\/strong>/);
  assert.match(rail.innerHTML, /Niveau 14/);
  assert.match(rail.innerHTML, /\/assets\/ranks\/gardien-256\.webp/);
  assert.match(rail.innerHTML, /data-frame="frame-tide"/);
  assert.match(top.innerHTML, /NIV 14/);
  assert.equal((tabs.innerHTML.match(/aria-current="page"/g) || []).length, 1);
  assert.match(tabs.innerHTML, /href="\/stats" aria-current="page"/);
});

test("nothing remembered, a damaged memory or a forged one: the visitor, and no markup from storage", () => {
  for (const stored of [undefined, "{broken", { guest: true }, { name: "", level: 3 }, { name: "A", level: "x" }, { name: "A", level: 9999 }]) {
    const { made } = boot(stored);
    assert.match(made[0].innerHTML, /<strong>Découverte<\/strong>/);
    assert.doesNotMatch(made[0].innerHTML, /assets\/ranks/);
  }
  const { made } = boot({ id: "u1", name: `<img src=x onerror=alert(1)>`, level: 4, avatar: "../../x", frame: `x" onload="y`, rank: "../x" });
  assert.doesNotMatch(made[0].innerHTML, /<img src=x/);
  assert.match(made[0].innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(made[0].innerHTML, /renaissance\/scout-s\.webp/);
  assert.doesNotMatch(made[0].innerHTML, /data-frame|onload|ranks\/\.\./);
  assert.match(made[0].innerHTML, /assets\/ranks\/eclaireur-256\.webp/);
});

test("a rank without an approved crest shows none; a focused flow draws no navigation; forgetting removes the memory", () => {
  assert.doesNotMatch(boot({ id: "u1", name: "Sam", level: 16, rank: "champion" }).made[0].innerHTML, /assets\/ranks/);
  assert.equal(boot({ id: "u1", name: "Sam", level: 16 }, { shell: "none" }).made.length, 0);
  const { nav, store } = boot({ id: "u1", name: "Sam", level: 16 });
  nav.remember({ id: "u2", guest: false, name: "Lou", level: 2, avatar: "scout", rank: "eclaireur" });
  assert.equal(JSON.parse(store.get("titan_shell_nav_v1")).name, "Lou");
  nav.remember({ guest: true });
  assert.equal(store.has("titan_shell_nav_v1"), false);
});
