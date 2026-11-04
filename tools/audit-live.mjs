// Live audit of the PUBLISHED site (not the repository). Run by .github/workflows/audit-live.yml from a GitHub runner, which can reach titan-app.fr.
// Read-only: it never signs in, never creates an account, never writes. Anything that needs a human session is listed as "À FAIRE À LA MAIN".
// Usage: node tools/audit-live.mjs [origin]
import { chromium } from "playwright";

const ORIGIN = (process.argv[2] || "https://titan-app.fr").replace(/\/+$/, "");
const out = { ok: [], fail: [], warn: [], manual: [] };
const ok = (m) => { out.ok.push(m); console.log("ok    :", m); };
const fail = (m) => { out.fail.push(m); console.log("ÉCHEC :", m); };
const warn = (m) => { out.warn.push(m); console.log("alerte:", m); };
const check = (cond, good, bad) => (cond ? ok(good) : fail(bad));
const get = async (path, init = {}) => {
  try {
    const r = await fetch(ORIGIN + path, { redirect: "manual", signal: AbortSignal.timeout(20000), ...init });
    return { status: r.status, headers: r.headers, text: init.method === "POST" || r.status >= 300 ? "" : await r.text(), location: r.headers.get("location") };
  } catch (e) { return { status: 0, headers: new Headers(), text: "", error: String(e).slice(0, 80) }; }
};

/* 1. Pages: every app and public page answers, carries a title, a description and a canonical, and the public ones are indexable. */
const APP = ["aujourdhui", "training", "journal", "stats", "records", "carriere", "objectifs", "prevoir", "adventure", "profile", "social", "coaching", "boutique", "onboarding", "login", "service"];
const PUBLIC = ["", "titan-plus", "fonctionnalites", "pour-les-coachs", "niveaux-et-xp", "aventures-sportives", "comprendre-mes-donnees", "debuter-titan", "sports", "changelog", "legal_privacy", "legal_cgu", "legal_mentions", "legal_hub", "regles-communaute", "supprimer-mon-compte", "partenariats", "journal-entrainement", "suivi-sportif", "motivation-sport"];
const pages = {};
for (const p of [...APP, ...PUBLIC]) {
  const r = await get(`/${p}`);
  pages[p] = r;
  if (r.status === 200) ok(`/${p} → 200`); else if (r.status === 404 && p === "carriere") warn(`/carriere → 404 (page de la branche V1.2, pas encore publiée sur le Web)`); else fail(`/${p} → ${r.status}${r.location ? " " + r.location : ""}${r.error ? " " + r.error : ""}`);
}
for (const p of PUBLIC) {
  const t = pages[p]?.text || "";
  if (!t) continue;
  const title = /<title>([^<]*)<\/title>/.exec(t)?.[1] ?? "";
  if (!title) fail(`/${p} : pas de <title>`);
  if (!/<meta name="description" content="[^"]{20,}/.test(t)) warn(`/${p} : description absente ou courte`);
  if (!/<link rel="canonical" href="https:\/\/titan-app\.fr/.test(t)) warn(`/${p} : canonique absente`);
  if (/name="robots" content="[^"]*noindex/.test(t) && !/^(legal_hub|supprimer)/.test(p)) warn(`/${p} : noindex`);
}
for (const p of APP.filter((x) => x !== "login")) {
  const t = pages[p]?.text || "";
  if (t && !/noindex/.test(t) && !/X-Robots/i.test(JSON.stringify([...pages[p].headers]))) warn(`/${p} : page d'application sans noindex`);
}

/* 2. Sign-in surface: the Google button code, the flag read, the SDK order, the e-mail form. */
const login = pages.login.text, auth = (await get("/js/app/auth.js")).text, cfg = (await get("/js/config.js")).text;
check(auth.includes("Continuer avec Google") && auth.includes("data-google"), "auth.js servi : bouton « Continuer avec Google »", "auth.js servi SANS le bouton Google");
check(auth.includes('"auth.google"') && auth.includes("titan_feature_flags_v1"), "auth.js servi : lecture du drapeau auth.google", "auth.js servi SANS la lecture du drapeau");
check(/signInWithOAuth\(\{\s*provider:\s*"google"/.test(auth), "auth.js servi : appel OAuth Google", "auth.js servi SANS appel OAuth");
check(auth.includes("signInWithPassword"), "auth.js servi : connexion e-mail", "auth.js servi SANS connexion e-mail");
const sdkAt = login.indexOf("/js/vendor/supabase-"), cfgAt = login.indexOf("/js/config.js");
check(sdkAt >= 0, "/login charge le SDK Supabase (après le formulaire, ordre mesuré : le formulaire s'affiche d'abord)", "/login : SDK Supabase absent");
check(auth.includes("waitForTitanSupabase"), "auth.js attend le client avant chaque action", "auth.js n'attend plus le client Supabase");
check((await get("/js/vendor/supabase-2.111.0.js")).status === 200, "SDK Supabase servi", "SDK Supabase introuvable");
const key = /eyJ[\w-]+\.[\w-]+\.[\w-]+/.exec(cfg)?.[0];
if (key) {
  const S = "https://oubmftfufwwzwpgvrcag.supabase.co";
  const settings = await (await fetch(`${S}/auth/v1/settings`, { headers: { apikey: key } })).json();
  check(settings.external?.google === true && settings.external?.email === true, "Supabase Auth : Google et e-mail actifs", `Supabase Auth : providers ${JSON.stringify(settings.external)}`);
  const flags = await (await fetch(`${S}/rest/v1/rpc/titan_feature_flags_v1`, { method: "POST", headers: { apikey: key, "content-type": "application/json" }, body: "{}" })).json().catch(() => null);
  check(flags?.flags?.["auth.google"] === true, "drapeau auth.google = vrai (lu comme le fait le navigateur)", `drapeau auth.google illisible ou faux : ${JSON.stringify(flags).slice(0, 80)}`);
  for (const [name, redirect] of [["web", `${ORIGIN}/login?via=google`], ["android", "titan://auth-callback"]]) {
    const r = await fetch(`${S}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirect)}`, { headers: { apikey: key }, redirect: "manual" });
    const loc = r.headers.get("location") || "";
    check(r.status === 302 && loc.startsWith("https://accounts.google.com/"), `OAuth Google ${name} : redirige vers Google`, `OAuth Google ${name} : ${r.status} ${loc.slice(0, 60)}`);
    // Supabase silently falls back to the Site URL when the redirect is not allow-listed: the state token carries the real redirect.
    const state = new URL(loc || "https://x/").searchParams.get("state") || "";
    try {
      const payload = JSON.parse(Buffer.from(state.split(".")[1] || "", "base64url").toString("utf8"));
      check(String(payload.redirect_to || "").startsWith(redirect), `OAuth Google ${name} : l'adresse de retour ${redirect} est AUTORISÉE`, `OAuth Google ${name} : l'adresse de retour demandée n'est PAS autorisée (Supabase la remplace par ${payload.redirect_to})`);
    } catch { warn(`OAuth Google ${name} : état opaque, adresse de retour non vérifiable`); }
  }
} else fail("clé publique Supabase introuvable dans config.js");

/* 3. Server functions: present, protected, and what each says about its configuration. */
const fn = async (name, init) => (await get(`/.netlify/functions/${name}`, init)).status;
const results = {
  garminStart: await fn("garmin?action=start", { method: "POST" }),
  garminPush: await fn("garmin?action=push", { method: "POST" }),
  assistance: await fn("assistance", { method: "POST" }),
  billing: await fn("play-billing", { method: "POST" }),
  notifications: await fn("play-notifications", { method: "POST" }),
  reconcile: await fn("play-reconcile", { method: "POST" }),
  webhook: await fn("webhook", { method: "POST" }),
};
for (const [k, v] of Object.entries(results)) check(v !== 404 && v !== 0 && v < 500 || v === 503, `fonction ${k} présente (${v})`, `fonction ${k} absente ou en erreur (${v})`);
check(results.garminStart === 401 && results.garminPush === 401, "Garmin : start et push protégés (401), fonction configurée", `Garmin : réponses ${results.garminStart}/${results.garminPush} (503 = non configurée)`);
if (results.billing === 503 || results.notifications === 503) warn(`Google Play Billing éteint côté serveur (play-billing ${results.billing}, play-notifications ${results.notifications}) : PLAY_BILLING_ENABLED / PLAY_SERVICE_ACCOUNT_JSON absents : volontaire tant qu'aucun achat réel n'est validé`);
const cb = await get("/auth/garmin/callback?code=probe&state=probe");
check(cb.status === 302 && /garmin=error/.test(cb.location || ""), "callback Garmin : redirige proprement avec un état invalide", `callback Garmin : ${cb.status} ${cb.location}`);

/* 4. SEO and caching. */
const sm = await get("/sitemap.xml"), robots = await get("/robots.txt"), sw = await get("/sw.js"), man = await get("/manifest.json");
const locs = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
check(locs.length >= 15, `sitemap : ${locs.length} adresses`, `sitemap : ${locs.length} adresses seulement`);
let bad = 0;
for (const u of locs) { const r = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(20000) }).catch(() => null); if (!r || r.status !== 200) { bad++; fail(`sitemap : ${u} → ${r?.status}`); } }
if (!bad) ok("sitemap : toutes les adresses répondent 200");
check(/Sitemap:\s*https:\/\/titan-app\.fr\/sitemap\.xml/.test(robots.text), "robots.txt déclare le sitemap", "robots.txt ne déclare pas le sitemap");
check(/CACHE_NAME = '[^']+'/.test(sw.text), `service worker servi (${/CACHE_NAME = '([^']+)'/.exec(sw.text)?.[1]})`, "service worker introuvable");
check(/no-cache|max-age=0|must-revalidate/i.test(sw.headers.get("cache-control") || ""), "sw.js non mis en cache durablement", `sw.js Cache-Control : ${sw.headers.get("cache-control")}`);
check(man.status === 200 && man.text.includes('"name"'), "manifest.json servi", "manifest.json absent");
for (const [path, to] of [["/personnage", "/profile"], ["/records.html", "/records"], ["/stats.html", "/stats"]]) {
  const r = await get(path);
  check([301, 302, 200].includes(r.status), `redirection ${path} → ${r.status} ${r.location ?? ""}`, `redirection ${path} cassée (${r.status})`);
}
for (const p of ["/ads.txt", "/app-ads.txt"]) check((await get(p)).status === 200, `${p} servi`, `${p} absent`);
const notFound = await get("/page-qui-nexiste-pas-xyz");
check(notFound.status === 404, "une page inconnue répond 404 (pas de faux 200)", `page inconnue → ${notFound.status}`);

/* 5. Real browser: every page at phone / tablet / desktop widths — no script error, no failed first-party request, no horizontal overflow. */
const browser = await chromium.launch();
const widths = [[360, 740], [768, 1024], [1280, 800]];
for (const p of ["", "login", "aujourdhui", "training", "journal", "stats", "profile", "adventure", "titan-plus", "onboarding", "service", "coaching", "boutique"]) {
  for (const [w, h] of widths) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = [], failed = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 100)));
    page.on("response", (r) => { if (r.url().startsWith(ORIGIN) && r.status() >= 400 && !/\/(favicon|apple-touch|rum)/.test(r.url())) failed.push(`${r.status()} ${r.url().replace(ORIGIN, "")}`); });
    await page.goto(`${ORIGIN}/${p}`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(600);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth).catch(() => 0);
    const label = `/${p} @${w}`;
    if (errors.length) fail(`${label} : erreur de script ${errors[0]}`);
    if (failed.length) fail(`${label} : requête en échec ${failed.slice(0, 2).join(", ")}`);
    if (over > 1) fail(`${label} : débordement horizontal ${over}px`);
    if (!errors.length && !failed.length && over <= 1) ok(`${label} : propre`);
    if (p === "login" && w === 360) {
      const google = await page.locator("[data-google]").count();
      check(google > 0, "/login rendu : le bouton « Continuer avec Google » est affiché (navigateur réel, drapeau lu en direct)", "/login rendu : AUCUN bouton Google visible");
      check((await page.locator("input[type=email], input[name=email]").count()) > 0 && (await page.locator("input[type=password]").count()) > 0, "/login rendu : formulaire e-mail + mot de passe présent", "/login rendu : formulaire e-mail absent");
      const status = await page.evaluate(() => window.TITAN_SUPABASE_STATUS?.state ?? null);
      check(status === "client_ready", `client Supabase initialisé dans le navigateur (${status})`, `client Supabase non initialisé (${status})`);
      await page.screenshot({ path: "audit-login-360.png" }).catch(() => {});
    }
    await page.close();
  }
}
await browser.close();

out.manual = [
  "Clic réel « Continuer avec Google » (ordinateur et mobile) puis retour connecté sur TITAN Web",
  "Connexion e-mail / mot de passe avec un compte de test, actualisation, déconnexion, reconnexion",
  "Création d'un compte (l'e-mail de confirmation est exigé : mailer_autoconfirm=false)",
  "Enregistrement d'une séance connecté, puis lecture dans journal / statistiques / profil",
];
console.log(`\nRÉSUMÉ : ${out.ok.length} ok, ${out.warn.length} alertes, ${out.fail.length} échecs`);
for (const m of out.warn) console.log("  alerte :", m);
for (const m of out.manual) console.log("  À FAIRE À LA MAIN :", m);
process.exit(out.fail.length ? 1 : 0);
