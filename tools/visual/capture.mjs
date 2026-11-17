// Visual capture bench: opens real pages of a served build (a Netlify preview, the live site or `pnpm run preview`) in Chromium and writes,
// for each page x width x account state, a first-screen capture, a full-page capture and layout measurements (horizontal overflow, elements
// that leave the screen, broken images, page errors). The captures are what a person looks at; the measurements only point at where to look.
//
//   node tools/visual/capture.mjs --base https://deploy-preview-149--titano-app.netlify.app --out /tmp/shots --widths 390,1440 --state visitor
//   node tools/visual/capture.mjs --base http://127.0.0.1:4173 --pages qg,seance --widths 320,768 --state populated
//   node tools/visual/capture.mjs --base http://127.0.0.1:4173 --pages qg,communaute,profil,coaching,coachingCoach --widths 390 --state connected
//
// `--details open` opens every <details> of the page first (profile groups, optional quests, rules…), for what sits behind a disclosure.
//
// Flags: `--flags production` (default) answers the feature-flag request with tools/visual/flags-production.json, the set a real visitor
// receives; `--flags none` leaves every flag off (what the network-cut e2e journeys see); `--flags live` adds screens.live to production.
//
// States: `visitor` (first visit, discovery mode, no session), `populated` (the same discovery account holding about 400 sessions in a dozen
// sports, injected in the page like tests/e2e/populated-accounts.e2e.mjs does), `connected` (a simulated signed-in, established account:
// fixture-connected.mjs plays the server inside the page, so the blocks behind the production flags are drawn; the manifest lists in
// `unmockedRpc` the server calls the fixture has no answer for). No production data is read: every request that leaves the served host
// is refused.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { buildConnectedData, connectedScript, installConnected } from "./fixture-connected.mjs";

export const PAGES = {
  // application
  qg: "/aujourdhui", seance: "/training", journal: "/journal", progres: "/stats", records: "/records", carriere: "/carriere",
  aventure: "/adventure", communaute: "/social", profil: "/profile", atelier: "/boutique", plus: "/titan-plus", coaching: "/coaching",
  objectifs: "/objectifs", prevoir: "/prevoir", service: "/service", recours: "/recours", defi: "/defi", athlete: "/athlete",
  // entry
  accueil: "/", connexion: "/login", onboarding: "/onboarding", motdepasse: "/update-password",
  // public
  fonctionnalites: "/fonctionnalites", sports: "/sports", coachs: "/pour-les-coachs", debuter: "/debuter-titan", niveaux: "/niveaux-et-xp",
  changelog: "/changelog", donnees: "/comprendre-mes-donnees", cgu: "/legal_cgu", confidentialite: "/legal_privacy", mentions: "/legal_mentions",
  legal: "/legal_hub", regles: "/regles-communaute", partenariats: "/partenariats", supprimer: "/supprimer-mon-compte",
  seoJournal: "/journal-entrainement", seoCourse: "/journal-course-a-pied", seoMuscu: "/carnet-musculation", seoEscalade: "/suivi-escalade",
  seoSuivi: "/suivi-sportif", seoAventures: "/aventures-sportives", seoMotivation: "/motivation-sport", seoProgression: "/progression-sportive",
  introuvable: "/cette-page-n-existe-pas", horsligne: "/network-error",
  // states of a page that a signed-in account reaches by a link or a tab (not in the default list: ask for them with --pages)
  profilIdentite: "/profile#identite", profilSport: "/profile#cadence", profilCompte: "/profile#sources", profilPreferences: "/profile#preferences",
  coachingCoach: "/coaching"
};
const VARIANTS = new Set(["profilIdentite", "profilSport", "profilCompte", "profilPreferences", "coachingCoach"]);
// A control pressed once the page is ready, for the states no address leads to.
const PRESS = { coachingCoach: "#co-tab-coach" };

const args = {};
for (let i = 2; i < process.argv.length; i++) { const key = process.argv[i]; if (!key.startsWith("--")) continue; const next = process.argv[i + 1]; args[key.slice(2)] = next && !next.startsWith("--") ? (i++, next) : "1"; }
const BASE = (args.base || "http://127.0.0.1:4173").replace(/\/$/, "");
const OUT = args.out || "visual-out";
const WIDTHS = (args.widths || "390,1440").split(",").map(Number);
const STATE = args.state || "visitor";
const NAMES = args.pages ? args.pages.split(",") : Object.keys(PAGES).filter(name => !VARIANTS.has(name));
const OPEN = args.details === "open"; // `--details open`: every <details> is opened before the captures (file names end in --open)
const ZOOM = Number(args.zoom || 1); // 2 = the text-at-200 % check: same CSS width, half the layout viewport
const SHA = args.sha || (() => { try { return execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim(); } catch { return "unknown"; } })();
const FLAGS = args.flags || "production";
const flagBody = (() => { if (FLAGS === "none") return null; const set = JSON.parse(readFileSync(new URL("./flags-production.json", import.meta.url), "utf8")); if (FLAGS === "live") set.flags["screens.live"] = true; return JSON.stringify({ flags: set.flags, version: set.version }); })();
const connected = STATE === "connected" ? buildConnectedData({ live: FLAGS === "live", flags: FLAGS !== "none" }) : null;
const heightFor = w => (w < 600 ? 844 : w < 1100 ? 1024 : 900);

function measure() {
  const vw = document.documentElement.clientWidth, out = { overflowX: document.documentElement.scrollWidth - vw, offscreen: [], brokenImages: [], clipped: [], tiny: [] };
  const label = el => { let s = el.tagName.toLowerCase(); if (el.id) s += "#" + el.id; else if (el.classList.length) s += "." + [...el.classList].slice(0, 2).join("."); return s; };
  const scrollsX = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === "auto" || o === "scroll" || o === "hidden" || o === "clip") && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
  for (const el of document.body.querySelectorAll("*")) {
    const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    if ((r.right > vw + 1 || r.left < -1) && r.width <= vw * 3 && !scrollsX(el) && !el.closest("[hidden],[aria-hidden='true'],.sr-only,.visually-hidden,.skip-link") && cs.position !== "fixed" && out.offscreen.length < 12) out.offscreen.push(`${label(el)} [${Math.round(r.left)}..${Math.round(r.right)}]`);
    if (el.tagName === "IMG" && el.complete && !el.naturalWidth && out.brokenImages.length < 12) out.brokenImages.push(el.currentSrc || el.src);
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (own && (cs.overflowX === "hidden" || cs.overflowX === "clip") && el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== "ellipsis" && out.clipped.length < 12) out.clipped.push(`${label(el)} "${el.textContent.trim().slice(0, 40)}"`);
    if (own && parseFloat(cs.fontSize) < 11 && out.tiny.length < 8) out.tiny.push(`${label(el)} ${cs.fontSize} "${el.textContent.trim().slice(0, 30)}"`);
  }
  return out;
}

function populate(count) {
  const sports = Object.keys(window.SPORTS_CONFIG || {}).slice(0, 12); if (!sports.length || !window.state) return false;
  const day = 86400000, now = Date.now() - 2 * 3600000;
  window.state.history = Array.from({ length: count }, (_, i) => {
    const sport = sports[i % sports.length], minutes = 25 + ((i * 7) % 80);
    return { id: `p${i}`, sport, date: new Date(now - Math.floor(i * 365 / count) * day - (i % 5) * 3600000).toISOString(), val: minutes, unit: "min", xp: 20 + (i % 40), details: { duration: minutes, rpe: 3 + (i % 6) } };
  });
  window.dispatchEvent(new Event("titan:history-updated"));
  return true;
}

mkdirSync(OUT, { recursive: true });
const remote = BASE.startsWith("https://");
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined), ...(remote && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) });
const manifest = [];
for (const width of WIDTHS) {
  const context = await browser.newContext({ viewport: { width: Math.round(width / ZOOM), height: Math.round(heightFor(width) / ZOOM) }, deviceScaleFactor: ZOOM, locale: "fr-FR", timezoneId: "Europe/Paris", serviceWorkers: "block", reducedMotion: "reduce" });
  await context.addInitScript(() => { try { if (localStorage.getItem("titan_ga4_consent_v1") === null) localStorage.setItem("titan_ga4_consent_v1", "denied"); } catch (_) { /* storage blocked */ } });
  const host = new URL(BASE).host;
  await context.route(url => url.host !== host, route => {
    if (flagBody && /\/rpc\/titan_feature_flags_v1$/.test(new URL(route.request().url()).pathname)) return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: flagBody });
    return route.abort("internetdisconnected");
  });
  // connected: the fixture is appended to the served js/config.js, so the app signs itself in through its own start-up path.
  if (connected) {
    await context.route(url => url.host === host && /\/js\/config\.js$/.test(url.pathname), async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()) + connectedScript(connected) });
    });
  }
  for (const name of NAMES) {
    const path = PAGES[name]; if (!path) { console.error("unknown page", name); continue; }
    const page = await context.newPage(), errors = [], missing = [];
    page.on("pageerror", e => errors.push(e.message.slice(0, 200)));
    page.on("response", r => { if (r.status() >= 400 && new URL(r.url()).host === host && !r.url().includes("/.netlify/")) missing.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    const entry = { page: name, path, width, zoom: ZOOM, state: STATE, flags: FLAGS, sha: SHA, base: BASE };
    try {
      await page.goto(BASE + path, { waitUntil: "load", timeout: 45000 });
      await page.waitForFunction(() => !document.querySelector("script[src*='js/state.js']") || (window.state && window.state.user), null, { timeout: 9000 }).catch(() => { entry.note = "state not ready"; });
      if (flagBody) entry.flagsOn = await page.waitForFunction(() => !window.titanFlags || window.titanFlags.enabled("screens.activityhub"), null, { timeout: 4000 }).then(() => true, () => false);
      if (STATE === "populated") entry.populated = await page.evaluate(populate, Number(args.count || 400)).catch(() => false);
      if (connected) {
        // The app's own sign-in (profile, history, snapshots) runs from the fixture; the second call only steps in when it did not.
        await page.waitForFunction(owner => window.state?.user?.id === owner && window.titanCloudHistoryLoadedAt, connected.owner, { timeout: 6000 }).catch(() => {});
        entry.connected = await page.evaluate(installConnected, connected).catch(error => ({ failure: String(error.message || error).slice(0, 200) }));
        await page.waitForTimeout(1800);
      }
      if (PRESS[name]) { await page.locator(PRESS[name]).click({ timeout: 3000 }).then(() => page.waitForTimeout(1200), () => { entry.note = `${PRESS[name]} not found`; }); }
      if (OPEN) entry.opened = await page.evaluate(() => { const all = [...document.querySelectorAll("details:not([open])")]; all.forEach(d => { d.open = true; }); return all.length; });
      await page.waitForTimeout(1500);
      await page.evaluate(() => document.fonts && document.fonts.ready);
      entry.finalUrl = page.url().replace(BASE, ""); entry.title = await page.title();
      const stem = `${name}--${width}${ZOOM !== 1 ? "z" + ZOOM : ""}--${STATE}${OPEN ? "--open" : ""}`;
      await page.screenshot({ path: join(OUT, stem + "--fold.png") });
      Object.assign(entry, await page.evaluate(measure));
      entry.height = await page.evaluate(() => document.documentElement.scrollHeight);
      // Images marked loading="lazy" below the first screen only load when they come near the viewport: walk the page once, then go
      // back to its top, so the full-page capture shows them instead of empty frames.
      await page.evaluate(async () => {
        const step = Math.max(200, window.innerHeight - 100);
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
        window.scrollTo(0, 0); // the first-screen capture already holds where the page stood (an anchor); fixed bars belong at the top of the long one
        await Promise.all([...document.images].filter(i => !i.complete).map(i => new Promise(r => { i.addEventListener("load", r, { once: true }); i.addEventListener("error", r, { once: true }); setTimeout(r, 1500); })));
      }).catch(() => {});
      await page.waitForTimeout(150);
      await page.screenshot({ path: join(OUT, stem + "--full.png"), fullPage: true });
      entry.fold = stem + "--fold.png"; entry.full = stem + "--full.png";
    } catch (error) { entry.failure = String(error.message || error).slice(0, 200); }
    if (connected) {
      const seen = await page.evaluate(() => ({ rpc: [...(window.__unmockedRpc || [])].sort(), from: [...(window.__unmockedFrom || [])].sort() })).catch(() => ({ rpc: [], from: [] }));
      entry.unmockedRpc = seen.rpc; entry.unmockedFrom = seen.from;
    }
    entry.errors = errors; entry.missing = [...new Set(missing)];
    manifest.push(entry);
    const flags = [entry.failure && "FAILED", entry.overflowX > 1 && `overflow-x ${entry.overflowX}px`, entry.offscreen?.length && `${entry.offscreen.length} offscreen`, entry.brokenImages?.length && `${entry.brokenImages.length} broken img`, entry.clipped?.length && `${entry.clipped.length} clipped`, errors.length && `${errors.length} js error`, entry.unmockedRpc?.length && `${entry.unmockedRpc.length} unmocked rpc`, entry.missing.length && `${entry.missing.length} http error`].filter(Boolean);
    console.log(`${name.padEnd(16)} ${String(width).padStart(4)} ${STATE.padEnd(9)} ${flags.join(", ") || "ok"}`);
    await page.close();
  }
  await context.close();
}
await browser.close();
writeFileSync(join(OUT, `manifest--${STATE}${OPEN ? "-open" : ""}${ZOOM !== 1 ? "-z" + ZOOM : ""}--${WIDTHS.join("-")}.json`), JSON.stringify(manifest, null, 2));
