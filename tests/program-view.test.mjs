// « Le programme » on the website: js/app/program.js draws what js/core/program-grid.js computes. The figure is one accessible
// element with a sentence, a cell says how long the day was by its level, a planned day is a frame, rest is a dot, and nothing a
// person typed (a sport label) reaches the page unescaped.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require("../js/core/program-grid.js");
require("../js/app/program.js");
const V = globalThis.TitanProgramView;

const NOW = new Date("2026-11-12T17:30:00"); // a Thursday
const at = (daysAgo, sport, minutes) => ({ id: `${sport}-${daysAgo}`, sport, date: new Date(NOW.getTime() - daysAgo * 86400000).toISOString(), details: { duration: minutes } });
const count = (html, needle) => html.split(needle).length - 1;

test("a week is one image with a sentence, seven columns, one line per sport and today's column marked", () => {
  const grid = V.week([at(0, "bouldering", 95), at(1, "muscu_gym", 60), at(2, "running", 30)], { now: NOW });
  const html = V.html(grid);
  assert.equal(count(html, 'role="img"'), 1);
  assert.match(html, /aria-label="Programme de la semaine\. bouldering : 1 séance, 95 minutes\. muscu_gym : 1 séance, 60 minutes\. running : 1 séance, 30 minutes\."/);
  assert.match(html, /data-kind="week" style="--prg-cols:7"/);
  assert.equal(count(html, 'class="prg-col'), 7);
  assert.equal(count(html, 'class="prg-col is-mark"'), 1, "today is the only marked column");
  assert.equal(count(html, 'class="prg-line" data-family='), 3);
  assert.equal(count(html, 'class="prg-ink"'), 3, "one inked cell per session day");
  assert.match(html, /data-level="4"/, "95 minutes is the strongest ink");
  assert.match(html, /data-level="2"/, "30 minutes is the second step");
});

test("a planned day still to come is a dashed frame, a past empty day a dot, a future one nothing", () => {
  const plan = [null, null, null, null, "running", null, null]; // Friday
  const html = V.html(V.week([at(2, "running", 40)], { now: NOW, plan }));
  assert.equal(count(html, 'class="prg-frame"'), 1);
  assert.ok(count(html, 'class="prg-dot"') >= 2, "Monday and Wednesday were rest days");
  const cells = html.split('class="prg-cells"')[2].split("<i ").slice(1);
  assert.equal(cells.length, 7);
  assert.doesNotMatch(cells[5], /prg-(dot|ink|frame)/, "Saturday is still to come and not planned: an empty cell");
});

test("an empty period says so instead of drawing nothing", () => {
  const html = V.html(V.span([], { now: NOW, weeks: 8 }));
  assert.match(html, /Aucune séance/);
  assert.match(html, /aria-label="Programme des 8 dernières semaines\. Aucune séance sur cette période\."/);
  assert.match(html, /--prg-cols:8/);
});

test("a period folds the sports beyond the limit and names the current week", () => {
  const sports = ["running", "cycling", "yoga", "muscu_gym", "bouldering", "tennis", "padel"];
  const logs = sports.flatMap((s, i) => [at(i, s, 30 + i * 10), at(i + 14, s, 30)]);
  const html = V.html(V.span(logs, { now: NOW, weeks: 12, maxRows: 5 }));
  assert.match(html, /3 autres sports/);
  assert.match(html, /class="prg-col is-mark">Sem\.</);
  assert.equal(count(html, 'class="prg-col'), 12);
});

test("labels are escaped and the accessible name can be set by the page", () => {
  const grid = V.week([at(0, "x", 30)], { now: NOW, labelOf: () => '<img src=x onerror="1">' });
  const html = V.html(grid, { label: "Mes sports" });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=&quot;1&quot;&gt;/);
  assert.match(html, /aria-label="Mes sports\. /);
});
