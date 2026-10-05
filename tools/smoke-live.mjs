// TITAN 300 — live smoke test of the production site (read only: GET requests and one unsigned webhook POST).
// Usage: node tools/smoke-live.mjs [https://titan-app.fr]
// Checks pages, noindex on private pages, the /u/ rewrite, the v300 service worker and that the payment webhook
// is deployed and refuses an unsigned call. Exits 1 on the first failed expectation list.
const BASE = (process.argv[2] || "https://titan-app.fr").replace(/\/$/, "");
const failures = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${msg}`);
  if (!cond) failures.push(msg);
};

async function get(path, init) {
  const r = await fetch(BASE + path, { redirect: "manual", ...init });
  const text = r.status < 300 ? await r.text() : "";
  return { r, text, robots: (text.match(/<meta name="robots" content="([^"]+)"/) || [])[1] || "", header: r.headers.get("x-robots-tag") || "" };
}

const PUBLIC = ["/", "/tarifs", "/fonctionnalites", "/niveaux-et-xp", "/aventures-sportives", "/comprendre-mes-donnees", "/debuter-titan", "/pour-les-coachs", "/sports", "/legal_privacy", "/legal_cgu", "/legal_mentions", "/service", "/changelog"];
const PRIVATE = ["/aujourdhui", "/training", "/journal", "/stats", "/records", "/objectifs", "/prevoir", "/adventure", "/profile", "/social", "/coaching", "/boutique", "/onboarding", "/login", "/update-password", "/u/abcdefghij"];

for (const p of PUBLIC) {
  const { r, text, robots } = await get(p);
  ok(r.status === 200 && /<h1/.test(text) && !/noindex/.test(robots), `${p} : ${r.status}, indexable, un titre`);
}
for (const p of PRIVATE) {
  const { r, robots, header } = await get(p);
  ok(r.status === 200 && (/noindex/.test(robots) || /noindex/.test(header)), `${p} : ${r.status}, noindex (${robots || header || "absent"})`);
}

const athlete = await get("/u/abcdefghij");
ok(/id="athlete"/.test(athlete.text), "/u/<lien> sert la page carte d’athlète");

const sw = await get("/sw.js");
ok(sw.r.status === 200 && sw.text.includes("titan-os-v300-ascension") && !sw.text.includes("/* PRECACHE */"), "sw.js v300 avec la liste hors ligne générée");

const manifest = await get("/manifest.json");
ok(manifest.r.status === 200 && /"start_url"/.test(manifest.text), "manifest.json");

for (const p of ["/sitemap.xml", "/robots.txt", "/favicon.ico", "/image/og-titan.jpg", "/js/config.js"]) {
  const { r } = await get(p);
  ok(r.status === 200, `${p} : ${r.status}`);
}
const config = await get("/js/config.js");
ok(/300\.0/.test(config.text), "js/config.js annonce la version 300.0");
ok(!/service_role/i.test(config.text), "aucune clé service_role dans la configuration publique");

for (const p of ["/sql/", "/supabase/migrations/", "/tools/build-public.mjs", "/docs/DEPLOYMENT.md", "/package.json"]) {
  const { r } = await get(p);
  ok(r.status === 404 || r.status === 403 || (r.status >= 300 && r.status < 400), `${p} non publié (${r.status})`);
}

for (const [from, to] of [["/trophies", "/profile#collection"], ["/bilan", "/stats"]]) {
  const { r } = await get(from);
  ok(r.status === 301 && (r.headers.get("location") || "").endsWith(to), `${from} → ${to} (${r.status})`);
}

// Public API as an anonymous visitor, with the anon key the site itself publishes.
const url = (config.text.match(/TITAN_SUPABASE_URL = '([^']+)'/) || [])[1];
const key = (config.text.match(/TITAN_SUPABASE_ANON_KEY = '([^']+)'/) || [])[1];
ok(Boolean(url && key), "URL et clé publique Supabase lisibles dans js/config.js");
if (url && key) {
  const api = (path, init = {}) => fetch(url + path, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  const card = await api("/rest/v1/rpc/titan_public_card", { method: "POST", body: JSON.stringify({ p_slug: "abcdefghij" }) });
  const cardBody = await card.text();
  // An unknown link raises CARD_NOT_FOUND by design (the page then says the card is unavailable); 404 PGRST202 would mean the function is missing.
  ok(card.status !== 404 && cardBody.includes("CARD_NOT_FOUND"), `titan_public_card existe et refuse un lien inconnu (${card.status} CARD_NOT_FOUND)`);
  const atelier = await api("/rest/v1/rpc/titan_atelier", { method: "POST", body: "{}" });
  ok(atelier.status !== 404 && atelier.status !== 200, `titan_atelier existe et refuse un visiteur (${atelier.status})`);
  const write = await api("/rest/v1/shop_history", { method: "POST", body: "{}" });
  ok(write.status === 401 || write.status === 403, `shop_history fermé en écriture (${write.status})`);
  const profiles = await api("/rest/v1/profiles?select=id&limit=1");
  const rows = profiles.status === 200 ? await profiles.json() : [];
  ok(Array.isArray(rows) && rows.length === 0, `aucun profil lisible par un visiteur (${profiles.status}, ${rows.length} ligne)`);
}

const hook = await fetch(BASE + "/.netlify/functions/webhook", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
ok(hook.status !== 404 && hook.status < 500 && hook.status >= 400, `webhook déployé et refuse un appel non signé (${hook.status})`);

console.log(failures.length ? `\n${failures.length} échec(s)` : "\nTout est conforme.");
process.exit(failures.length ? 1 : 0);
