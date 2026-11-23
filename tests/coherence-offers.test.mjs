// Lot 6, global coherence: what TITAN says must be what TITAN does. The figures are read from the code that enforces them
// (SQL migrations, the ad policy, the feature-flag defaults) and compared with every place that states them: the Android
// billing texts, the generated public pages, the legal texts and the texts of the web application. A wording change that
// reintroduces a contradiction (another number of coached athletes, a price written by hand, « sans publicité » for the whole
// product, TITAN LIVE presented as open to everyone, a new per-player table the privacy policy ignores) fails here.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");
const MIGRATIONS = readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
const sql = (file) => read(`supabase/migrations/${file}`);
/** The body of the LAST migration that defines a function: a later migration that changes a limit moves this test with it. */
const latestFunction = (name) => {
  const marker = `create or replace function ${name}(`;
  const file = MIGRATIONS.filter((f) => sql(f).includes(marker)).at(-1);
  assert.ok(file, `no migration defines ${name}`);
  const text = sql(file);
  const start = text.lastIndexOf(marker);
  return text.slice(start, text.indexOf("$function$;", start));
};
const int = (text, re, what) => {
  const m = text.match(re);
  assert.ok(m, `the SQL no longer states ${what}: update this test with the new rule, then every text that quotes it`);
  return Number(m[1]);
};
const NBSP = /[  ]/g;
/** Visible text of a page: no scripts, styles or tags; entities and non-breaking spaces normalised. */
const visible = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(NBSP, " ").replace(/\s+/g, " ");

/* ---------- The generated public pages, rebuilt from their generators (the committed copies equal them: public-generators.test.mjs). ---------- */
const output = mkdtempSync(join(tmpdir(), "titan-coherence-"));
after(() => rmSync(output, { recursive: true, force: true }));
symlinkSync(join(root, "js"), join(output, "js"), "dir");
for (const generator of ["tools/build-public-site.mjs", "tools/build-public-docs.mjs"]) execFileSync(process.execPath, [join(root, generator)], { cwd: output, stdio: "pipe" });
const PAGES = Object.fromEntries(readdirSync(output).filter((f) => f.endsWith(".html")).map((f) => [f, visible(readFileSync(join(output, f), "utf8"))]));
const page = (name) => { assert.ok(PAGES[name], `${name} is no longer generated`); return PAGES[name]; };
/** Pages that describe data processing: they may name a feature that is not open to everyone, with its condition. */
const LEGAL_DATA_PAGES = ["legal_privacy.html", "supprimer-mon-compte.html"];

/* ---------- Sources of truth ---------- */
const coachPlan = latestFunction("private.titan_coach_plan");
const coachCapacity = latestFunction("private.titan_coach_capacity");
const SEATS = {
  coach: int(coachPlan, /case pp\.plan when 'coach_pro' then \d+ else (\d+) end/, "the Coach seats"),
  coach_pro: int(coachPlan, /case pp\.plan when 'coach_pro' then (\d+) else \d+ end/, "the Coach Ultra seats"),
  plus: int(coachCapacity, /then (\d+) else \d+ end/, "the capacity of a personal TITAN+"),
  free: int(coachCapacity, /then \d+ else (\d+) end/, "the free capacity"),
};
const seatsMigration = sql(MIGRATIONS.filter((f) => sql(f).includes("create table if not exists private.titan_plan_products")).at(-1));
const SERVER_PLANS = seatsMigration.match(/plan text not null check \(plan in \(([^)]+)\)\)/)[1].split(",").map((s) => s.trim().replace(/'/g, "")).sort();

const billing = read("mobile/src/lib/playBilling.ts");
const ANDROID_PLANS = [...billing.matchAll(/\{ id: [^,]+, plan: "([a-z_]+)", kind: "([a-z]+)", name: "([^"]+)", tagline: "([^"]+)", perks: \[([^\]]+)\] \}/g)]
  .map((m) => ({ plan: m[1], kind: m[2], name: m[3], tagline: m[4], perks: [...m[5].matchAll(/"([^"]+)"/g)].map((p) => p[1]) }));
const androidPlan = (key) => ANDROID_PLANS.find((p) => p.plan === key);
const plusScreen = read("mobile/src/screens/settings/TitanPlusScreen.tsx");
const tour = read("mobile/src/lib/tour.ts");
const atelier = read("js/app/atelier.js");
const coaching = read("js/app/coaching.js");
const seance = read("js/app/seance.js");

test("the server's plans are the ones Android sells, under the same keys", () => {
  assert.deepEqual(SERVER_PLANS, ["coach", "coach_pro", "titan_plus"]);
  assert.deepEqual(ANDROID_PLANS.map((p) => p.plan).sort(), SERVER_PLANS, "PLANS of playBilling.ts and private.titan_plan_products agree");
  assert.equal(androidPlan("coach_pro").name, "Coach Ultra");
  assert.equal(androidPlan("coach").name, "Coach");
  assert.equal(androidPlan("titan_plus").name, "TITAN+");
});

test("the higher coach offer has one public name everywhere: Coach Ultra", () => {
  assert.match(coaching, /snapshot\.plan\.plan === "coach_pro" \? "Coach Ultra" : "Coach"/, "the coach workspace names the server plan like the store");
  const texts = { ...PAGES, "playBilling.ts": billing, "TitanPlusScreen.tsx": plusScreen, "tour.ts": tour, "atelier.js": atelier, "coaching.js": coaching };
  for (const [name, text] of Object.entries(texts)) assert.doesNotMatch(text, /Coach Pro\b|Coach Premium|TITAN Coach Pro/, `${name}: the offer is called Coach Ultra`);
});

test("coached-athlete capacities: SQL, Android offers, public pages, legal terms and the web application state the same four numbers", () => {
  assert.deepEqual(SEATS, { coach: 5, coach_pro: 15, plus: 20, free: 3 }, "a capacity changed on the server: every text below must change with it");
  const { coach, coach_pro: ultra, plus, free } = SEATS;

  // Android: the offer cards and the first-use tour.
  assert.equal(androidPlan("coach").tagline, `Pour accompagner ${coach} sportifs`);
  assert.ok(androidPlan("coach").perks.includes(`${coach} sportifs suivis bénéficient de TITAN+`));
  assert.equal(androidPlan("coach_pro").tagline, `Pour accompagner ${ultra} sportifs`);
  assert.ok(androidPlan("coach_pro").perks.includes(`${ultra} sportifs suivis bénéficient de TITAN+`));
  assert.ok(tour.includes(`d’accompagner ${coach} ou ${ultra} sportifs`), "tour: coach capacities");

  // Public offer pages (landing and /titan-plus share one source).
  for (const name of ["index.html", "titan-plus.html"]) {
    const text = page(name);
    assert.ok(text.includes(`Accompagne ${coach} sportifs.`) && text.includes(`Toi + ${coach} sportifs avec TITAN+ inclus`), `${name}: Coach`);
    assert.ok(text.includes(`Accompagne ${ultra} sportifs.`) && text.includes(`Toi + ${ultra} sportifs avec TITAN+ inclus`), `${name}: Coach Ultra`);
    assert.ok(text.includes(`coaching jusqu’à ${free} sportifs`), `${name}: free capacity`);
    assert.ok(text.includes(`Jusqu’à ${plus} sportifs dans l’espace coach`), `${name}: TITAN+ capacity`);
    assert.ok(text.includes(`celui de l’offre (${coach} ou ${ultra}) ; TITAN+ seul permet d’en suivre ${plus}`), `${name}: the rule in one sentence`);
  }
  assert.ok(page("titan-plus.html").includes(`Sportifs suivis dans l’espace coach ${free} ${plus}`), "comparison table");
  assert.ok(page("titan-plus.html").includes(`${free} → ${plus} sportifs suivis`), "capacity card");
  assert.ok(page("titan-plus.html").includes(`la capacité coach revient à ${free} : les suivis au-delà sont mis en pause`), "end of TITAN+");
  assert.ok(page("fonctionnalites.html").includes("le suivi de trois sportifs"), "features FAQ");

  // The coach guide: its table and its search description.
  const guide = page("pour-les-coachs.html");
  for (const row of [`Classique Gratuit ${free} Non`, `TITAN+ (individuel) Affiché par Google Play ${plus} Non`, `Coach Tarif affiché par Google Play ${coach} Inclus`, `Coach Ultra Tarif affiché par Google Play ${ultra} Inclus`]) {
    assert.ok(guide.includes(row), `coach guide table: ${row}`);
  }
  assert.ok(readFileSync(join(output, "pour-les-coachs.html"), "utf8").includes(`${free} sportifs sans abonnement, ${plus} avec TITAN+, ${coach} ou ${ultra} avec une offre Coach.`), "coach guide description");
  // 20261121100000: the places apply to every coach action; links beyond them are paused, never revoked (sql/tests/300_monetisation_coach_capacity.sql).
  assert.ok(guide.includes("au-delà (passage de Coach Ultra à Coach, fin de l’offre), les suivis les plus récents sont mis en pause. Rien n’est supprimé ni révoqué"), "coach guide: the pause rule");
  assert.ok(readFileSync(join(root, "supabase/migrations/20261121100000_coach_capacity_enforced.sql"), "utf8").includes("'COACH_CAPACITY_PAUSED'"), "the rule the guide states is the server's");

  // Terms and partnerships.
  const terms = page("legal_cgu.html");
  assert.ok(terms.includes(`Coach comprend le coach et ${coach} sportifs avec TITAN+ inclus ; Coach Ultra comprend le coach et ${ultra} sportifs`), "terms 4.2 bis: seats");
  assert.ok(terms.includes(`celui de l’offre : ${coach} ou ${ultra}. Sans offre Coach, un compte peut suivre ${free} sportifs, ou ${plus} avec TITAN+`), "terms 4.2 bis: capacities");
  assert.ok(terms.includes("le coaching de trois sportifs sont gratuits"), "terms 3: free capacity");
  const words = { 3: "Trois", 5: "cinq", 15: "quinze", 20: "vingt" };
  assert.ok(page("partenariats.html").includes(`${words[free]} sportifs suivis sans abonnement, ${words[plus]} avec TITAN+ ; ${words[coach]} avec Coach et ${words[ultra]} avec Coach Ultra`), "partnerships");

  // Web application.
  assert.ok(atelier.includes(`<strong>${plus} sportifs</strong> suivis avec TITAN+ seul ; ${coach} ou ${ultra} avec une offre Coach`), "Atelier offer");
  assert.ok(atelier.includes(`Espace coach : ${plus} sportifs suivis avec TITAN+ seul ; ${coach} ou ${ultra} avec une offre Coach`), "Atelier active offer");
  assert.ok(coaching.includes(`<strong>${free} sportifs suivis gratuitement</strong>, ${plus} avec TITAN+`), "coach workspace");

  // No other number of coached athletes anywhere an offer is described.
  const allowed = new Set(Object.values(SEATS));
  const offerTexts = { ...Object.fromEntries(["index.html", "titan-plus.html", "pour-les-coachs.html", "legal_cgu.html", "partenariats.html", "fonctionnalites.html"].map((n) => [n, page(n)])),
    "playBilling.ts": billing, "tour.ts": tour, "TitanPlusScreen.tsx": plusScreen, "atelier.js": atelier, "coaching.js": coaching };
  for (const [name, text] of Object.entries(offerTexts)) {
    for (const m of text.replace(NBSP, " ").matchAll(/(\d+) (?:sportifs|athlètes)\b/g)) assert.ok(allowed.has(Number(m[1])), `${name}: « ${m[0]} » is not a capacity the server knows`);
  }
});

test("the seat rotation limit of the server is published in the terms and explained in the coach workspace", () => {
  const accept = sql(MIGRATIONS.filter((f) => sql(f).includes("SEAT_CHURN_LIMIT")).at(-1));
  const rule = accept.match(/accepted_at>now\(\)-interval '(\d+) days'\)>=greatest\(v_limit\*(\d+),(\d+)\) then raise exception 'SEAT_CHURN_LIMIT'/);
  assert.ok(rule, "the rotation rule moved: update the terms with it");
  assert.deepEqual(rule.slice(1).map(Number), [30, 2, 6]);
  assert.ok(page("legal_cgu.html").includes("le nombre de suivis acceptés sur 30 jours glissants est limité à deux fois sa capacité (6 au moins)"));
  assert.match(coaching, /SEAT_CHURN_LIMIT: "Trop de nouveaux suivis ces 30 derniers jours/);
});

test("no price is written by hand: Google Play shows it (Android texts, web application, every public page)", () => {
  const amount = /\d+(?:[,.]\d{1,2})? ?(?:€|euros?\b|EUR\b)(?: ?(?:\/|par) ?(?:mois|an))?/g;
  for (const [name, text] of Object.entries({ ...PAGES, "playBilling.ts": billing.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ""), "TitanPlusScreen.tsx": plusScreen, "tour.ts": tour, "atelier.js": atelier, "coaching.js": coaching })) {
    const found = [...text.replace(NBSP, " ").matchAll(amount)].map((m) => m[0]).filter((a) => !/^0 ?€$/.test(a));
    assert.deepEqual(found, [], `${name}: a price is written (${found.join(", ")}); the only amount TITAN states is « 0 € » for the free offer`);
  }
  assert.match(billing, /The PRICE is never written here: it comes from Google Play/);
  assert.match(plusScreen, /Le prix et les conditions sont ceux que Google Play affiche avant toute validation\./);
  for (const name of ["index.html", "titan-plus.html", "pour-les-coachs.html"]) assert.match(page(name), /Tarif affiché par Google Play/, name);
  assert.ok(page("legal_cgu.html").includes("le prix applicable, les taxes, la période facturée, les conditions d’une éventuelle offre et le renouvellement sont ceux affichés par Google Play"));
});

test("TITAN+ limits: comparisons, saved views and routines are the ones the code enforces", () => {
  const comparisons = sql(MIGRATIONS.filter((f) => /p_weeks not in \(/.test(sql(f))).at(-1)).match(/p_weeks not in \((\d+),(\d+),(\d+)\)/).slice(1).map(Number);
  assert.deepEqual(comparisons, [4, 12, 26]);
  const [a, b, c] = comparisons;
  assert.ok(androidPlan("titan_plus").perks.some((p) => p.includes(`Comparaisons sur ${a}, ${b} ou ${c} semaines`) && p.includes("titan-app.fr")), "Android says where the comparisons are read");
  for (const name of ["index.html", "titan-plus.html"]) assert.ok(page(name).includes(`Comparaisons de ${a}, ${b} ou ${c} semaines`), name);

  const views = int(sql(MIGRATIONS.filter((f) => sql(f).includes("raise exception 'VIEW_LIMIT'")).at(-1)), /titan_analysis_views where user_id=u\)>=(\d+) then\s+raise exception 'VIEW_LIMIT'/, "the saved views limit");
  assert.equal(views, 10);
  for (const name of ["index.html", "titan-plus.html"]) assert.ok(page(name).includes(`${views} vues d’analyse privées`), name);
  assert.ok(page("titan-plus.html").includes(`Retrouve ${views} vues privées`) && page("titan-plus.html").includes(`Nomme jusqu’à ${views} vues`));

  const routines = seance.match(/const limit = window\.titanIsElite\?\.\(\) \? (\d+) : (\d+);/);
  assert.ok(routines, "the routine limit moved in js/app/seance.js");
  const [plus, free] = routines.slice(1).map(Number);
  assert.deepEqual([plus, free], [20, 5]);
  for (const name of ["index.html", "titan-plus.html"]) assert.ok(page(name).includes(`${plus} routines nommées au lieu de ${free}`) && page(name).includes(`${free} routines, coaching`), name);
  assert.ok(atelier.includes(`<strong>${plus} routines</strong> nommées au lieu de ${free}`));
  // Routines exist on the website only: the Android card must say where the benefit is used.
  const routinePerk = androidPlan("titan_plus").perks.find((p) => /routines/.test(p));
  assert.equal(routinePerk, `${plus} routines nommées au lieu de ${free}, sur titan-app.fr`);
});

test("advertising: the texts describe what the Android ad code and the website really do", () => {
  // The three banner placements of the code are the three screens the terms name.
  const placements = read("mobile/src/ads/adIds.ts").match(/export type Placement = ([^;]+);/)[1].split("|").map((s) => s.trim().replace(/"/g, "")).sort();
  assert.deepEqual(placements, ["hq", "journal", "stats"]);
  const mobileSources = (dir) => readdirSync(join(root, dir), { recursive: true }).filter((f) => /\.tsx$/.test(f)).map((f) => [f, read(`${dir}/${f}`)]);
  const hosts = mobileSources("mobile/src/screens").filter(([, text]) => /<AdBanner placement="/.test(text)).map(([f, text]) => `${f.split("/").at(-1)}:${text.match(/<AdBanner placement="([a-z]+)"/)[1]}`).sort();
  assert.deepEqual(hosts, ["HomeScreen.tsx:hq", "JournalScreen.tsx:journal", "ProgressScreen.tsx:stats"], "a banner moved or was added: the terms (article 3) must say so");
  // The terms describe the placements and rules of a free build with ads as a condition (see the next test: the release shipped has none).
  const terms = page("legal_cgu.html");
  assert.ok(terms.includes("une bannière sur le QG, le Journal et Progrès, et parfois un écran après l’enregistrement d’une séance"));
  // Never during a session, never for a premium right (own TITAN+, coach plan or a seat received from a coach).
  const policy = read("mobile/src/ads/policy.ts");
  assert.match(policy, /if \(c\.premium\) return no\("premium"\);/);
  assert.match(policy, /if \(c\.sessionActive\) return no\("session-active"\);/);
  assert.match(policy, /if \(!c\.consent\) return no\("no-consent"\);/);
  assert.ok(terms.includes("elles n’apparaîtront qu’après le formulaire de consentement de Google"));
  assert.ok(terms.includes("jamais pendant une séance, et jamais avec TITAN+, y compris une place reçue d’un coach, ni avec une offre Coach"));
  for (const plan of ANDROID_PLANS) assert.ok(plan.perks.includes("Aucune publicité"), `${plan.name}: the paid offer says it has no ads`);

  // The website loads no advertising script, and no page may promise an ad-free TITAN without saying « site »: a free Android build with ads
  // can ship one day (the code is ready, behind the build option), and « sans publicité » for the whole product would then be false.
  for (const file of readdirSync(root).filter((f) => f.endsWith(".html"))) {
    assert.doesNotMatch(read(file), /<script[^>]+(?:googlesyndication|doubleclick|adservice|googletagservices|imasdk)/i, `${file} loads an advertising script`);
  }
  const wholeProduct = /Gratuit, sans publicité|TITAN est gratuit et sans publicité|sans aucune publicité/;
  for (const [name, text] of Object.entries(PAGES)) assert.doesNotMatch(text, wholeProduct, `${name}: « sans publicité » is true of the website only`);
  for (const file of readdirSync(join(root, "js/app")).filter((f) => f.endsWith(".js"))) assert.doesNotMatch(read(`js/app/${file}`), wholeProduct, `js/app/${file}: « sans publicité » is true of the website only`);
  assert.ok(page("index.html").includes("Site sans publicité") && page("titan-plus.html").includes("Google AdMob seulement si une version gratuite de l’application Android avec publicités voit le jour"));

  // Android: a sentence that promises or announces ads is always chosen by the build (a build without ads never sells « no ads », AUD-03).
  const adClaim = /sans publicité|aucune publicité|retire (?:aussi )?les publicités|des publicités|n’en affichent aucune/i;
  const claiming = [...mobileSources("mobile/src/screens"), ["tour.ts", tour]].filter(([, text]) => adClaim.test(text));
  assert.ok(claiming.length >= 5, "the screens that talk about ads are found");
  for (const [file, text] of claiming) assert.match(text, /\bADS_BUILD\b/, `${file}: a sentence about ads is shown whatever the build`);
  assert.match(tour, /adsBuild \? "TITAN\+ retire les publicités et ajoute des analyses\." : "TITAN\+ ajoute des analyses\."/);
  assert.match(billing, /visiblePerks = \(perks: readonly string\[\], adsBuild: boolean\) => perks\.filter\(\(p\) => adsBuild \|\| !mentionsAds\(p\)\)/);
});

test("advertising: the Android release being shipped shows no ad, and no public text says that it does", () => {
  // The Play Console guide names the build options of the release being shipped (§ 4 bis). With ads=off, ADS_BUILD is false: no ad is ever
  // requested, and the app's own Legal and Privacy screens say « sans publicité ». The public terms, policy and offers may then describe
  // AdMob only as what a future free build with ads would do; a TITAN+ « no ads » perk is a promise for that day, not a current benefit.
  const releaseRow = read("mobile/docs/PUBLIER_PLAY_CONSOLE.md").split("\n").find((line) => /\(\*\*release [\d.]+\*\*\)/.test(line));
  assert.ok(releaseRow, "the Play Console guide no longer names the build options of the release being shipped");
  assert.equal(releaseRow.match(/`ads=([a-z]+)`/)?.[1], "off", "the release shipped now shows ads: state them as a present fact in CGU § 3, the privacy policy and the offers, then update this test");
  assert.match(read("mobile/src/ads/adIds.ts"), /export const ADS_BUILD = process\.env\.EXPO_PUBLIC_TITAN_ADS === "1";/, "ads=off really means no ad build");
  assert.match(read("mobile/src/screens/settings/LegalScreen.tsx"), /: "TITAN est gratuit et sans publicité\./, "the ads-off app says it has no ads");

  const terms = page("legal_cgu.html");
  assert.ok(terms.includes("L’application Android n’affiche aujourd’hui aucune publicité. Si une version gratuite avec publicités Google AdMob est publiée"), "CGU § 3 says the Android app shows no ad today, and AdMob only conditionally");
  assert.ok(page("legal_privacy.html").includes("l’application Android n’affiche aujourd’hui aucune publicité"), "the privacy policy says so in its summary");
  assert.ok(page("legal_privacy.html").includes("Publicité (application Android, seulement si une version gratuite avec publicités est publiée)"), "the AdMob processing stays described, as a condition");
  // A sentence stating that the Android application shows ads now, or that TITAN+ removes them now, is refused on every generated page.
  const presentAds = /(?:application Android|version gratuite)[^.;]{0,40}\baffich(?:e|ent) (?:des|quelques) publicités|Dans l’application Android gratuite,|retire (?:aussi )?(?:la|les) publicités? de l’application|Aucune publicité dans l’application Android|publicités de l’offre gratuite reviennent|Google AdMob dans l’application Android|Google AdMob \(application Android gratuite\)/i;
  for (const [name, text] of Object.entries(PAGES)) assert.doesNotMatch(text, presentAds, `${name} says the Android application shows ads today`);
});

test("TITAN LIVE is off by default and never presented as available to everyone", () => {
  // Defaults in the code: off unless the server answers true for this account.
  assert.match(read("js/app/live.js"), /enabled\?\.\("screens\.live", false\) === true/);
  assert.match(seance, /enabled\?\.\("screens\.live", false\) === true/);
  assert.match(read("mobile/src/data/live.ts"), /enabled: flags\?\.flags\?\.\["screens\.live"\] === true/);
  assert.match(sql("20261117090000_live_rpg_v1.sql"), /->>'screens\.live'\)::boolean,false\)/, "the settlement itself refuses when the flag is absent");
  for (const f of MIGRATIONS) assert.doesNotMatch(sql(f), /insert into private\.titan_feature_flags[^;]*'screens\.live'/, `${f} switches TITAN LIVE on for everyone`);
  // The page exists for the accounts that have it, out of the index and of the sitemap, and says « Bientôt disponible » to the others.
  assert.match(read("seance-live.html"), /<meta name="robots" content="noindex,nofollow" \/>/);
  assert.doesNotMatch(readFileSync(join(output, "sitemap.xml"), "utf8"), /seance-live/);
  assert.match(read("js/app/live.js"), /if \(!flagOn\(\)\) \{[\s\S]{0,400}Bientôt disponible/);
  // No public page, offer text or tour step promises it. Pages about data may name it, with its condition.
  const promise = /TITAN LIVE|séance en direct|Vivre la séance|Camp de base/i;
  for (const [name, text] of Object.entries(PAGES)) if (!LEGAL_DATA_PAGES.includes(name)) assert.doesNotMatch(text, promise, `${name} presents TITAN LIVE while screens.live is off by default`);
  for (const [name, text] of Object.entries({ "playBilling.ts": billing, "TitanPlusScreen.tsx": plusScreen, "tour.ts": tour, "atelier.js": atelier })) assert.doesNotMatch(text, promise, `${name}`);
  assert.ok(page("legal_privacy.html").includes("Séance en direct (TITAN LIVE, seulement si elle est ouverte pour ton compte)"));
});

test("Garmin is behind its flag: the public changelog and the Android screen say so", () => {
  assert.match(read("js/app/profil.js"), /enabled\?\.\("screens\.garmin", false\) === true/);
  assert.match(read("mobile/src/lib/nativeConnections.ts"), /enabled: flags\?\.flags\?\.\["screens\.garmin"\] === true/);
  assert.match(read("mobile/src/lib/sources.ts"), /label: "Bientôt", tone: "default", detail: "Pas encore activé pour cette version\."/);
  for (const [name, text] of Object.entries(PAGES)) {
    if (LEGAL_DATA_PAGES.includes(name) || !/Garmin/.test(text)) continue;
    for (const sentence of text.split(/(?<=[.!?]) /).filter((s) => /connexion Garmin|Connecter Garmin|montre Garmin/.test(s))) {
      assert.match(sentence, /lorsqu’elle est ouverte pour ton compte/, `${name}: Garmin is not open to every account: « ${sentence.trim().slice(0, 140)} »`);
    }
  }
  assert.ok(page("changelog.html").includes("connexion Garmin facultative, proposée dans Profil seulement lorsqu’elle est ouverte pour ton compte"));
  assert.ok(page("legal_privacy.html").includes("Si tu connectes Garmin"), "the privacy policy states the Garmin processing as a choice");
});

test("credits: the weekly reward of the server is the one the rules and the terms publish, and no subscription earns more", () => {
  const cadence = sql("20261117120000_cadence_week_reward.sql");
  const reward = int(cadence, /set credits = coalesce\(credits, 0\) \+ (\d+) where id = v_uid/, "the held-week reward");
  assert.equal(int(cadence, /'reward', (\d+)\)/, "the announced held-week reward"), reward, "the amount shown and the amount credited agree");
  assert.equal(reward, 50);
  assert.doesNotMatch(cadence, /is_elite|titan_entitlements/, "the reward is the same for subscribers");
  assert.ok(page("niveaux-et-xp.html").includes(`Semaine tenue ${reward} crédits, une fois par semaine, à réclamer dans l’application Android lorsqu’elle le propose ; aucune XP`));
  assert.ok(page("legal_cgu.html").includes(`avec une semaine tenue (${reward} crédits, une fois par semaine, à réclamer)`));
  // Android shows the amount the server sends, never its own.
  assert.match(read("mobile/src/screens/community/EventsScreen.tsx"), /Récupérer \+\$\{w\.reward\} crédits/);
  for (const [name, text] of Object.entries(PAGES)) assert.doesNotMatch(text, /crédits se gagnent uniquement avec les séances/, `${name}: a held week also earns credits`);
  assert.ok(page("legal_cgu.html").includes("ne s’achètent pas, ne se vendent pas, ne s’échangent pas"));
  assert.match(plusScreen, /Il ne donne ni XP, ni crédits, ni avance\./);
  assert.ok(page("titan-plus.html").includes("Pas d’XP en plus, pas de crédits en plus, pas de plafond relevé"));
});

test("privacy: every per-player table added since 17 November 2026 is erased with the account and named in the policy and on the deletion page", () => {
  /* table → [words the privacy policy must contain, words the deletion page must contain]. A migration that adds a table holding a
     player's data must add its line here, in the policy (tools/build-public-docs.mjs) and on the deletion page: the test fails until then. */
  const KNOWN = {
    titan_cadence_claims: ["Semaines tenues réclamées : la semaine, tes jours actifs, ta cadence et les crédits reçus", "semaines tenues réclamées"],
    titan_time_capsules: ["Lettres à toi-même : le message", "lettres à toi-même"],
    titan_life_chapters: ["Chapitres de vie : le titre", "chapitres de vie"],
    titan_live_settlements: ["Séance en direct (TITAN LIVE", "monde TITAN LIVE"],
    titan_live_wallets: ["Ton monde : ressources", "ressources"],
    titan_live_buildings: ["bâtiments du Camp de base", "bâtiments"],
    titan_live_collection: ["trouvailles", "trouvailles"],
    titan_cordee_titles: ["cordées de la Grande Cordée et titres de route obtenus", "tes cordées et tes titres de route"],
    titan_import_batches: ["Imports d’historique : le nom et l’empreinte du fichier importé", "tes imports d’historique et leurs rapports"],
  };
  const privacy = page("legal_privacy.html"), deletion = page("supprimer-mon-compte.html");
  const found = [];
  for (const f of MIGRATIONS.filter((m) => m >= "20261117")) {
    for (const m of sql(f).matchAll(/create table if not exists private\.(titan_[a-z_]+)\s*\(([\s\S]*?)\);/g)) {
      if (!/\buser_id uuid\b/.test(m[2])) continue; // catalogues hold no player data
      found.push(m[1]);
      assert.match(m[2], /user_id uuid (?:primary key|not null) references auth\.users\(id\) on delete cascade/, `${m[1]} must be erased with the account`);
      assert.ok(KNOWN[m[1]], `${m[1]} holds player data: describe it in the privacy policy and on the deletion page, then register it in this test`);
      assert.ok(privacy.includes(KNOWN[m[1]][0]), `privacy policy: ${m[1]} (« ${KNOWN[m[1]][0]} »)`);
      assert.ok(deletion.includes(KNOWN[m[1]][1]), `deletion page: ${m[1]} (« ${KNOWN[m[1]][1]} »)`);
    }
  }
  assert.deepEqual(found.sort(), Object.keys(KNOWN).sort(), "the list of per-player tables of the 17 November migrations");
  // They are part of « Exporter toutes mes données ».
  const exportChain = MIGRATIONS.filter((m) => m >= "20261117").map(sql).join("\n");
  for (const key of ["cadenceWeekClaims", "timeCapsules", "lifeChapters"]) assert.ok(exportChain.includes(`'${key}'`), `account export: ${key}`);
  assert.match(sql("20261117170000_live_in_account_export.sql"), /titan_live_export/);
});

test("privacy: the limits and the device-side features the policy quotes are the ones of the code", () => {
  const privacy = page("legal_privacy.html");
  const capsules = sql("20261117130000_time_capsules.sql");
  const months = capsules.match(/months integer not null check \(months in \((\d+), (\d+), (\d+)\)\)/).slice(1);
  const length = int(capsules, /char_length\(message\) between 1 and (\d+)/, "the capsule length");
  assert.ok(privacy.includes(`le message (${length} caractères au plus), le délai choisi (${months[0]}, ${months[1]} ou ${months[2]} mois)`));
  const title = int(sql("20261117160000_life_chapters.sql"), /char_length\(title\) between 2 and (\d+)/, "the chapter title length");
  assert.ok(privacy.includes(`le titre que tu donnes à une période (${title} caractères au plus)`));
  assert.match(sql("20261117160000_life_chapters.sql"), /create or replace function public\.titan_chapter_delete_v1\(/, "a chapter can be deleted one by one, as the policy says");
  // History import from a Strava export: the file is read on the phone, five fields per session are sent.
  assert.match(read("mobile/src/screens/settings/HistoryImportScreen.tsx"), /parseStravaActivities\(await FileSystem\.readAsStringAsync\(file\.uri\)\)/);
  assert.match(read("mobile/src/data/api.ts"), /importHistory = \(owner: string, items: \{ id: string; sport: string; startedAt: string; minutes: number; km: number \| null \}\[\]\)/);
  assert.ok(privacy.includes("fichier activities.csv d’un export Strava") && privacy.includes("la date, le sport, la durée, la distance et l’identifiant de l’activité") && privacy.includes("le fichier est lu sur ton téléphone et n’est pas envoyé"));
  // Voice announcements and the session picture stay on the phone; the microphone is never requested.
  assert.match(read("mobile/src/lib/voiceCoach.ts"), /import \* as Speech from "expo-speech";/);
  assert.match(read("mobile/src/lib/shareImage.ts"), /result: "tmpfile"/);
  const config = read("mobile/app.config.ts");
  const blocked = config.slice(config.indexOf("blockedPermissions: ["));
  for (const permission of ["RECORD_AUDIO", "CAMERA", "ACCESS_BACKGROUND_LOCATION"]) assert.ok(blocked.includes(`"android.permission.${permission}"`), `${permission} stays blocked`);
  assert.ok(privacy.includes("les annonces vocales (sortie GPS, séance en direct) passent par la synthèse vocale du téléphone, sans rien enregistrer"));
  assert.ok(privacy.includes("l’image d’une séance à partager est créée sur ton téléphone et TITAN ne l’envoie nulle part"));
  // Health Connect: the two data types the policy names are the only ones the application may read.
  const granted = config.slice(config.indexOf("permissions: ["), config.indexOf("blockedPermissions: ["));
  assert.deepEqual([...granted.matchAll(/android\.permission\.health\.([A-Z_]+)/g)].map((m) => m[1]).sort(), ["READ_EXERCISE", "READ_STEPS"]);
  assert.ok(privacy.includes("TITAN ne lit ni le rythme cardiaque, ni le sommeil, ni les calories, ni le poids, ni la position, et n’écrit rien dans Santé Connect"));
  // GPS library: the two ceilings of the server.
  const routes = sql(MIGRATIONS.filter((f) => sql(f).includes("raise exception 'ROUTE_LIMIT'")).at(-1));
  const points = int(routes, /if v_points > (\d+) then raise exception 'TRACK_TOO_LARGE'/, "the points of a route");
  const library = int(routes, /titan_routes where user_id = v_uid\) >= (\d+) then raise exception 'ROUTE_LIMIT'/, "the routes of a library");
  assert.ok(privacy.includes(`(${points.toLocaleString("fr-FR").replace(NBSP, " ")} points et ${library} parcours au plus)`));
  // Chat messages expire; the thread between a coach and an athlete does not, and the policy must not let one be taken for the other.
  const thread = int(sql(MIGRATIONS.filter((f) => sql(f).includes("raise exception 'THREAD_FULL'")).at(-1)), /titan_coach_messages where link_id = p_link\) >= (\d+) then raise exception 'THREAD_FULL'/, "the size of a coach thread");
  assert.ok(privacy.includes(`Messages d’un suivi entre un coach et un sportif, check-ins, modèles de séance Tant que le compte existe (${thread} messages au plus par suivi)`));
  assert.ok(privacy.includes("Messages de discussion 48 à 72 heures selon l’espace"));
});

test("legal texts agree with each other on the age limit, the seller and where to cancel", () => {
  const privacy = page("legal_privacy.html"), terms = page("legal_cgu.html");
  for (const text of [privacy, terms]) assert.ok(text.includes("TITAN est ouvert à partir de 13 ans"));
  for (const [name, text] of Object.entries(PAGES)) assert.doesNotMatch(text, /à partir de (?:1[0-24-9]|[0-9]) ans|réservé aux (?:majeurs|adultes)/, `${name}: another age limit`);
  for (const name of ["legal_cgu.html", "supprimer-mon-compte.html", "titan-plus.html"]) assert.match(page(name), /ne résilie pas l’abonnement/, `${name}: deleting the account does not cancel the subscription`);
  assert.match(read("mobile/src/screens/settings/DeleteAccountScreen.tsx"), /Supprimer ton compte ne résilie pas un abonnement\./);
  for (const name of ["index.html", "titan-plus.html", "pour-les-coachs.html", "legal_cgu.html", "legal_mentions.html"]) assert.match(page(name), /uniquement dans l’application Android|dans l’application Android uniquement/, `${name}: sold in the Android application only`);
  // The legal pages carry a version and a date, and the three documents changed together carry the same date.
  const stamp = (name) => page(name).match(/Version (\d+) · mise à jour le (\d{1,2} \S+ \d{4})/);
  for (const name of ["legal_privacy.html", "legal_cgu.html", "supprimer-mon-compte.html", "regles-communaute.html"]) assert.ok(stamp(name), `${name}: version and date`);
  assert.ok(Number(stamp("legal_privacy.html")[1]) >= 13 && Number(stamp("legal_cgu.html")[1]) >= 9 && Number(stamp("supprimer-mon-compte.html")[1]) >= 3, "a legal version never goes back");
});
