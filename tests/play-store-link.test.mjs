// GP12 to GP15, SEO09: the Google Play link exists only for the real public listing, and never as a broken button.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { playStoreUrl } from "../tools/lib/public-template.mjs";

const LISTING = "https://play.google.com/store/apps/details?id=fr.titanapp.app";
const root = new URL("../", import.meta.url);

test("only the public listing of this application is accepted", () => {
  assert.equal(playStoreUrl(""), "");
  assert.equal(playStoreUrl("   "), "");
  assert.equal(playStoreUrl(LISTING), LISTING);
  for (const bad of ["http://play.google.com/store/apps/details?id=fr.titanapp.app", "https://play.google.com/store/apps/details?id=com.autre.app",
    `${LISTING}&hl=fr`, "https://example.com/store/apps/details?id=fr.titanapp.app", "https://play.google.com/store/apps/details?id=fr.titanapp.app.evil", "javascript:alert(1)", "https://play.google.com/"]) {
    assert.throws(() => playStoreUrl(bad), /not the public listing/, bad);
  }
});

test("with no URL configured, no generated page mentions Google Play links, tags or scripts (GP13)", () => {
  assert.equal(JSON.parse(readFileSync(new URL("tools/data/play-store.json", root), "utf8")).url, "", "the repository ships with the link off");
  for (const file of readdirSync(root).filter((f) => f.endsWith(".html"))) {
    const html = readFileSync(new URL(file, root), "utf8");
    assert.ok(!html.includes("data-play-store") && !html.includes("titan-play-store") && !html.includes("play-store.js"), `${file} has Play store markup while no URL is set`);
  }
});

test("with the listing set, pages get a hidden link, the meta tag and the script; the home page declares the app", () => {
  const html = execFileSync(process.execPath, ["--input-type=module", "-e",
    `import { page } from "./tools/lib/public-template.mjs"; process.stdout.write(page({ route: "/", title: "Titre", description: "Description assez longue pour le test.", body: "<p>x</p>" }));`],
    { cwd: root.pathname, env: { ...process.env, TITAN_PLAY_STORE_URL: LISTING } }).toString();
  assert.match(html, /<a data-play-store hidden href="https:\/\/play\.google\.com\/store\/apps\/details\?id=fr\.titanapp\.app" rel="noopener">/, "the footer link starts hidden");
  assert.match(html, /<meta name="titan-play-store" content="https:\/\/play\.google\.com\/store\/apps\/details\?id=fr\.titanapp\.app">/);
  assert.match(html, /<script src="\/js\/play-store\.js\?v=300\.0" defer><\/script>/);
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1])["@graph"];
  const app = graph.find((n) => n["@type"] === "MobileApplication");
  assert.equal(app.installUrl, LISTING);
  assert.ok(!("aggregateRating" in app) && !("review" in app) && !("offers" in app), "no invented rating, review or price");
  const other = execFileSync(process.execPath, ["--input-type=module", "-e",
    `import { page } from "./tools/lib/public-template.mjs"; process.stdout.write(page({ route: "/tarifs", title: "Titre", description: "Description assez longue pour le test.", body: "<p>x</p>" }));`],
    { cwd: root.pathname, env: { ...process.env, TITAN_PLAY_STORE_URL: LISTING } }).toString();
  assert.ok(!other.includes("MobileApplication"), "only the home page declares the application");
});
