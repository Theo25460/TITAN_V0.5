// Exercise the real public generator in an isolated output directory.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = mkdtempSync(join(tmpdir(), "titan-public-offer-"));
after(() => rmSync(output, { recursive: true, force: true }));
symlinkSync(join(root, "js"), join(output, "js"), "dir");
execFileSync(process.execPath, [join(root, "tools/build-public-site.mjs")], { cwd: output });
const generated = (name) => readFileSync(join(output, name), "utf8");

test("regeneration preserves the permanent inventory policy in visible and structured answers", () => {
  const html = generated("tarifs.html");
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1])["@graph"];
  const faq = graph.find((x) => x["@type"] === "FAQPage");
  const expiry = faq.mainEntity.find((x) => /fin de TITAN\+/.test(x.name)).acceptedAnswer.text;
  assert.match(expiry, /pièces acquises avec tes crédits restent à toi/);
  assert.match(expiry, /seul l’accès temporaire aux pièces non acquises prend fin/);
  assert.ok(html.includes(`<p>${expiry}</p>`), "visible FAQ and structured FAQ agree");
  assert.doesNotMatch(expiry, /pièces TITAN\+ reviennent au style d’origine/);
});

test("both generated offers explain temporary access and free acquisition", () => {
  for (const name of ["index.html", "tarifs.html"]) {
    const html = generated(name);
    assert.ok(/Accès temporaire à Aegis, Givre, Aurores et Obsidienne, aussi gagnables gratuitement avec les crédits d’activité/.test(html), `${name}: explain the free acquisition path`);
    assert.ok(!/4 pièces de collection TITAN\+/.test(html), `${name}: no exclusive collection promise`);
  }
});

test("the real offer distinguishes paid period comparisons from free basic analyses", () => {
  const html = generated("tarifs.html");
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1])["@graph"];
  const answer = graph.find((x) => x["@type"] === "FAQPage").mainEntity.find((x) => /analyses sportives/.test(x.name)).acceptedAnswer.text;
  assert.match(answer, /4, 12 ou 26 semaines/);
  assert.match(answer, /gratuit/);
  assert.doesNotMatch(answer, /mêmes analyses/);
  assert.match(html, /href="\/stats#analyses"/);
});

test("committed landing and prices are reproducible from the offer generator", () => {
  for (const name of ["index.html", "tarifs.html"]) {
    assert.ok(generated(name) === readFileSync(join(root, name), "utf8"), `${name}: regenerate after editing the source`);
  }
});

test("generated report offer explains aggregated CSV, provisional periods and free journal exports", () => {
  const html = generated("tarifs.html");
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1])["@graph"];
  const answer = graph.find(x => x["@type"] === "FAQPage").mainEntity.find(x => /bilans/.test(x.name))?.acceptedAnswer.text;
  assert.ok(answer, "report FAQ exists");
  assert.match(answer, /mensuel.*annuel/);
  assert.match(answer, /provisoire/);
  assert.match(answer, /CSV agrégé/);
  assert.match(answer, /CSV et JSON.*gratuit/);
  assert.match(answer, /mise à jour du serveur/);
  assert.ok(html.includes(`<p>${answer}</p>`));
  assert.match(html, /href="\/stats#bilans"/);
  assert.match(generated("index.html"), /Bilans mensuels et annuels.*après mise à jour serveur/);
  assert.equal(graph.find(x => x["@type"] === "Product").offers.price, "5");
});

test("saved views offer describes private parameters, retention, free favorites and unchanged price", () => {
  const html=generated('tarifs.html');
  const graph=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1])['@graph'];
  const answer=graph.find(x=>x['@type']==='FAQPage').mainEntity.find(x=>/vues sauvegardées/.test(x.name))?.acceptedAnswer.text;
  assert.ok(answer,'saved views FAQ');assert.match(answer,/10 vues/);assert.match(answer,/paramètres/);assert.match(answer,/conservées.*supprimées/);
  assert.match(answer,/favoris.*gratuits/);assert.match(answer,/mise à jour du serveur/);assert.ok(html.includes(`<p>${answer}</p>`));
  assert.match(html,/href="\/stats#vues"/);assert.match(generated('index.html'),/10 vues d’analyse privées.*après mise à jour serveur/);
  assert.equal(graph.find(x=>x['@type']==='Product').offers.price,'5');
});

// These contracts exercise the generated XML and HTML, not the generator's source text.
const sitemapUrls = () => [...generated("sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
const headTags = (html, name) => {
  const head = html.replace(/<!--[\s\S]*?-->/g, "").match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || "";
  return [...head.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map(([tag]) =>
    Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map(match => [match[1].toLowerCase(), match[3]])));
};
const metaDirectives = html => headTags(html, "meta")
  .filter(tag => ["robots", "googlebot", "bingbot"].includes(tag.name?.toLowerCase()))
  .flatMap(tag => (tag.content || "").toLowerCase().split(/[,\s]+/));

test("sitemap regeneration omits unverified modification dates and reproduces the committed XML", () => {
  assert.doesNotMatch(generated("sitemap.xml"), /<lastmod\b/i, "no lastmod until reliable per-page dates are available");
  assert.equal(generated("sitemap.xml"), readFileSync(join(root, "sitemap.xml"), "utf8"));
});

test("generated sitemap uses each public page's own canonical exactly once", () => {
  const urls = sitemapUrls();
  assert.equal(new Set(urls).size, urls.length, "no duplicate canonical");
  const expected = [];
  for (const file of readdirSync(root).filter(file => file.endsWith(".html") && !["sys_core_override_99.html", "googleb8fedd43e28cf7d4.html"].includes(file))) {
    // The generator owns some public pages; the other served pages remain authored files.
    const html = existsSync(join(output, file)) ? generated(file) : readFileSync(join(root, file), "utf8");
    const directives = metaDirectives(html);
    // Indexing is allowed by default even when no robots tag is present.
    if (directives.includes("noindex") || directives.includes("none")) continue;
    const route = file === "index.html" ? "/" : "/" + file.replace(/\.html$/, "");
    const canonicals = headTags(html, "link").filter(tag => tag.rel?.toLowerCase() === "canonical").map(tag => tag.href);
    assert.deepEqual(canonicals, ["https://titan-app.fr" + route], file + ": canonical matches its own public route");
    expected.push(canonicals[0]);
  }
  assert.ok(expected.length > 0, "public inventory must not be empty");
  assert.deepEqual([...urls].sort(), expected.sort(), "sitemap and public page inventory agree");
});

test("account, application and shared-card HTML keep noindex and stay out of the generated sitemap", () => {
  const urls = new Set(sitemapUrls());
  const privatePages = ["404", "admin", "adventure", "athlete", "aujourdhui", "boutique", "coaching", "dynamic-page", "journal", "login", "network-error", "objectifs", "onboarding", "prevoir", "profile", "records", "social", "stats", "training", "update-password"];
  for (const page of privatePages) {
    const html = readFileSync(join(root, page + ".html"), "utf8");
    const genericRobots = headTags(html, "meta").filter(tag => tag.name?.toLowerCase() === "robots")
      .flatMap(tag => (tag.content || "").toLowerCase().split(/[,\s]+/));
    assert.ok(genericRobots.includes("noindex"), page + ": generic noindex in the initial head, not just a bot-specific exclusion");
    assert.ok(!urls.has("https://titan-app.fr/" + page), page + ": absent from sitemap");
  }
});

test("documented search and social previews match the current homepage metadata", () => {
  const html = generated("index.html");
  const preview = readFileSync(join(root, "PUBLIC_SEARCH_PREVIEW.md"), "utf8");
  const title = html.match(/<title>(.*?)<\/title>/s)[1];
  const meta = headTags(html, "meta");
  const value = key => meta.find(tag => (tag.name || tag.property) === key)?.content;
  for (const current of [title, value("description"), value("og:image")]) {
    assert.ok(preview.includes(current), "preview must reflect current metadata: " + current);
  }
  assert.doesNotMatch(preview, /og-titan-os\.png/, "no retired share image in the release reference");
});

test("all public share heads use current branding and agree with page metadata", () => {
  for (const url of sitemapUrls()) {
    const route = new URL(url).pathname;
    const file = route === "/" ? "index.html" : route.slice(1) + ".html";
    const html = existsSync(join(output, file)) ? generated(file) : readFileSync(join(root, file), "utf8");
    const meta = headTags(html, "meta");
    const value = key => {
      const matches = meta.filter(tag => (tag.name || tag.property) === key);
      assert.equal(matches.length, 1, file + ": one " + key);
      return matches[0].content;
    };
    const title = html.match(/<title>(.*?)<\/title>/s)[1];
    for (const key of ["og:title", "twitter:title"]) assert.equal(value(key), title, file + ": " + key);
    for (const key of ["og:description", "twitter:description"]) assert.equal(value(key), value("description"), file + ": " + key);
    assert.equal(value("og:url"), url, file + ": shared canonical");
    for (const key of ["og:image", "twitter:image"]) assert.equal(value(key), "https://titan-app.fr/image/og-titan.jpg", file + ": current share image");
    assert.equal(value("og:image:width"), "1200", file);
    assert.equal(value("og:image:height"), "630", file);
    assert.ok(value("og:image:alt")?.trim(), file + ": image description");
    const links = headTags(html, "link");
    for (const [rel, href] of [["icon", "/favicon.ico"], ["apple-touch-icon", "/image/apple-touch-icon.png"], ["manifest", "/manifest.json"]]) {
      assert.ok(links.some(link => link.rel === rel && link.href === href), file + ": " + rel);
    }
  }
});
