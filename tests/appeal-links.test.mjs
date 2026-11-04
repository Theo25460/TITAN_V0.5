// CHEAT19: a player can reach the appeal page from the profile (signed-in accounts only) and from the support page.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the profile account section links to /recours for signed-in accounts, not in the guest branch", () => {
  const source = read("js/app/profil.js");
  const guestBranch = source.slice(source.indexOf("guest() ? `<div class=\"asc-note\">"), source.indexOf("</div>` : `<div class=\"asc-list\">"));
  assert.ok(source.includes('href="/recours"'), "link present");
  assert.ok(!guestBranch.includes("/recours"), "guests have no appeal link");
});

test("the support page and the appeal page stay linked and the appeal page is not indexed", () => {
  assert.match(read("service.html"), /href="\/recours"/);
  assert.match(read("recours.html"), /<meta name="robots" content="noindex/);
});
