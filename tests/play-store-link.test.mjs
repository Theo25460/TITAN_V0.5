// GP12 to GP15, SEO09: the Google Play link exists only for the real public listing, leads exactly to it, and never as a broken button.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { playStoreUrl, PLAY_PLACEMENTS } from "../tools/lib/public-template.mjs";

const LISTING = "https://play.google.com/store/apps/details?id=fr.titanapp.app";
const root = new URL("../", import.meta.url);
const shipped = readdirSync(root).filter((f) => f.endsWith(".html"));
const generate = (route, url) => execFileSync(process.execPath, ["--input-type=module", "-e",
  `import { page, finalCta } from "./tools/lib/public-template.mjs"; process.stdout.write(page({ route: ${JSON.stringify(route)}, title: "Titre", description: "Description assez longue pour le test.", body: "<p>x</p>" + finalCta() }));`],
  { cwd: root.pathname, env: { ...process.env, TITAN_PLAY_STORE_URL: url } }).toString();

test("only the public listing of this application is accepted", () => {
  assert.equal(playStoreUrl(""), "");
  assert.equal(playStoreUrl("   "), "");
  assert.equal(playStoreUrl(LISTING), LISTING);
  for (const bad of ["http://play.google.com/store/apps/details?id=fr.titanapp.app", "https://play.google.com/store/apps/details?id=com.autre.app",
    `${LISTING}&hl=fr`, "https://example.com/store/apps/details?id=fr.titanapp.app", "https://play.google.com/store/apps/details?id=fr.titanapp.app.evil", "javascript:alert(1)", "https://play.google.com/"]) {
    assert.throws(() => playStoreUrl(bad), /not the public listing/, bad);
  }
});

test("the repository ships the official listing, and athlete.html carries the same address", () => {
  assert.equal(JSON.parse(readFileSync(new URL("tools/data/play-store.json", root), "utf8")).url, LISTING);
  const athlete = readFileSync(new URL("athlete.html", root), "utf8");
  assert.match(athlete, /<meta name="titan-play-store" content="https:\/\/play\.google\.com\/store\/apps\/details\?id=fr\.titanapp\.app" \/>/);
  assert.ok(athlete.indexOf("/js/play-store.js") < athlete.indexOf("/js/app/athlete.js"), "the listing is known before the card is drawn");
});

test("every Google Play link of every shipped page leads exactly to the listing, names a known placement and has a unique id", () => {
  let links = 0;
  for (const file of shipped) {
    const html = readFileSync(new URL(file, root), "utf8");
    const ids = [];
    for (const [tag] of html.matchAll(/<a\b[^>]*data-play-store="[^"]*"[^>]*>/g)) {
      links++;
      assert.match(tag, /\shref="https:\/\/play\.google\.com\/store\/apps\/details\?id=fr\.titanapp\.app"/, `${file}: ${tag}`);
      assert.ok(!/\shidden\b|target=/.test(tag), `${file}: a Play link shows without a script and opens in place: ${tag}`);
      const placement = tag.match(/data-play-store="([^"]*)"/)[1];
      assert.ok(PLAY_PLACEMENTS.includes(placement), `${file}: unknown placement ${placement}`);
      ids.push(tag.match(/\sid="([^"]+)"/)?.[1]);
    }
    assert.equal(new Set(ids).size, ids.length, `${file}: duplicated Play link id`);
    assert.ok(!ids.includes(undefined), `${file}: a Play link without id`);
    // Any other address towards the Play Store must be the subscriptions page of the legal texts, never another listing.
    for (const [, href] of html.matchAll(/href="(https:\/\/play\.google\.com\/[^"]*)"/g)) {
      assert.ok(href === LISTING || href === "https://play.google.com/store/account/subscriptions", `${file}: ${href}`);
    }
  }
  assert.ok(links >= 40, `only ${links} Play links found`);
});

test("the home page: one Web action and one Google Play action on the first screen, one reminder lower, the app declared", () => {
  const html = readFileSync(new URL("index.html", root), "utf8");
  const hero = html.match(/<section class="pub-hero">[\s\S]*?<\/section>/)[0];
  const actions = [...hero.match(/<div class="pub-cta">([\s\S]*?)<\/div>/)[1].matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(actions.length, 2, "two choices, no more");
  assert.match(actions[0], /asc-btn-primary" href="\/onboarding"/, "the Web version stays the main action");
  assert.match(actions[1], /data-play-store="hero"/);
  assert.match(hero, /Commencer sur le Web/);
  assert.equal((html.match(/data-play-store="hero"/g) || []).length, 1);
  assert.equal((html.match(/data-play-store="final"/g) || []).length, 1, "one reminder in the closing call to action");
  assert.equal((html.match(/data-play-store="footer"/g) || []).length, 1);
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1])["@graph"];
  const app = graph.find((n) => n["@type"] === "MobileApplication");
  assert.equal(app.installUrl, LISTING);
  assert.ok(!("aggregateRating" in app) && !("review" in app) && !("offers" in app), "no invented rating, review or price");
});

test("no shipped page offers TITAN on the App Store or calls iOS a download", () => {
  for (const file of shipped) {
    const text = readFileSync(new URL(file, root), "utf8");
    assert.doesNotMatch(text, /apps\.apple\.com|itunes\.apple\.com|App Store|Télécharger sur l[’']App/i, file);
  }
});

test("with no URL configured, a generated page contains nothing about Google Play (GP13)", () => {
  const html = generate("/", "");
  for (const mark of ["data-play-store", "titan-play-store", "play-store.js", "Google Play", "MobileApplication"]) assert.ok(!html.includes(mark), mark);
});

test("with the listing set, any generated page gets the footer link, the reminder, the meta tag and the script; only the home declares the app", () => {
  const html = generate("/titan-plus", LISTING);
  assert.match(html, /<a class="pub-play-text pub-play" id="play-footer" href="https:\/\/play\.google\.com\/store\/apps\/details\?id=fr\.titanapp\.app" rel="noopener" data-play-store="footer">/);
  assert.match(html, /<p class="pub-play-line" data-play-store-zone>.*id="play-final".*Télécharger sur Google Play<\/a><\/p>/);
  assert.match(html, /<meta name="titan-play-store" content="https:\/\/play\.google\.com\/store\/apps\/details\?id=fr\.titanapp\.app">/);
  assert.match(html, /<script src="\/js\/play-store\.js\?v=301\.0" defer><\/script>/);
  assert.ok(!html.includes("MobileApplication"), "only the home page declares the application");
});

test("the script adds no parameter, no fixed bar and sends nothing", () => {
  const js = readFileSync(new URL("js/play-store.js", root), "utf8");
  for (const forbidden of ["referrer=", "utm_", "position", "gtag", "fetch(", "sendBeacon", "createElement"]) assert.ok(!js.includes(forbidden), forbidden);
});
