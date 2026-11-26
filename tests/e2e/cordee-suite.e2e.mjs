// V1.8.3 — Un groupe qui se retrouve, on the website. Our cordée is over: its card stays closed and readable with its story (shareable
// steps and the group's decisions, never a session), « Repartir ensemble » shows the proposals; I propose a new route at the suggested
// pace without any text field, I accept once (a double tap sends one call) and the group sets off; two distinct proposals are a choice;
// a refusal is a count, never a name; a member already roped in elsewhere reads why they cannot accept; the new cordée names the one it
// follows; « Depuis ta dernière visite » shows the answer the group waits for. The server (titan_cordee_suite_v1) is replaced by a
// recorder; its rules are proven by sql/tests/300_cordee_suite.sql and tools/db/test-cordee-suite-concurrency.sh.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const OWNER = "00000000-0000-4000-8000-000000000c03";
const SHOTS = process.env.TITAN_SUITE_SHOTS || "";
let server, browser, BASE;
before(async () => {
  const port = await new Promise(resolve => { const probe = createServer(); probe.listen(0, () => { const p = probe.address().port; probe.close(() => resolve(p)); }); });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  let ready = false;
  for (let i = 0; i < 50 && !ready; i++) { try { ready = (await fetch(BASE + "/")).ok; } catch {} if (!ready) await new Promise(r => setTimeout(r, 100)); }
  assert.ok(ready);
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

const evil = '<img src=x onerror="window.pwned=1">';
const day = (n) => new Date(Date.now() + n * 86400000).toISOString();
const ME = { name: "Moi", me: true };
const LEA = { name: `Léa ${evil}`, me: false };
const STORY = [
  { kind: "formed", at: day(-16), members: 4 },
  { kind: "relay_opened", at: day(-10), who: { name: `Léa ${evil}`, me: false, family: "technique" } },
  { kind: "relay_confirmed", at: day(-8), who: { name: "Moi", me: true, family: "endurance" } },
  { kind: "camps", camps: 4, total: 40, target: 40 },
  { kind: "summit", at: day(-2), total: 40 },
];
const FINISHED = {
  id: "k1", title: "Les crêtes de l’Aube", route: "aube", pace: "soutenue", startsAt: day(-16), endsAt: day(-2), days: 14,
  status: "summited", summitedAt: day(-2), mine: true, myStatus: "joined", share: 10, cap: 15, target: 40, longueurs: 34, variety: 6, total: 40, percent: 100, camps: 4,
  families: ["technique", "endurance"], joined: 4, title_key: "cordee:aube", earned: true, kept: 0, needs: 2, contributors: 4,
  me: { pitches: 12, counted: 12, days: 8, families: ["endurance"], strand: true },
  members: [
    { id: OWNER, name: "Moi", status: "joined", me: true, pitches: 12, strand: true, families: ["endurance"] },
    { id: "u-lea", name: `Léa ${evil}`, status: "joined", me: false, pitches: 10, strand: true, families: ["technique"] },
    { id: null, name: "Membre de la cordée", status: "joined", me: false },
    { id: null, name: "Membre de la cordée", status: "joined", me: false },
  ],
  relay: null, follows: null, story: STORY,
};
const suiteOf = (suite) => ({ ...FINISHED, suite: { closesAt: day(12), can: [], group: 4, waiting: 0, choice: false, previous: { route: "aube", pace: "soutenue", days: 14, summited: true }, proposals: [], hint: "propose", ...suite } });
const P = (p) => ({ id: "p1", route: "marees", pace: "douce", days: 14, status: "open", by: LEA, mine: false, myAnswer: null, yes: 1, no: 0, eligible: 4, waiting: 3,
  accepted: [LEA], others: 0, expiresAt: day(3), createdAt: day(-1), startedId: null, startedAt: null, myStatus: null, joined: null, turn: ["accept", "decline"], ...p });

async function social({ cordees = [], digest = null, flags = ["screens.cordee", "screens.cordee_suite"] } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "UTC", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(BASE + "/social");
  await page.waitForFunction(() => window.state?.user && window.titanClient && window.TitanCordee && window.TitanCordeeView && window.TitanRetour);
  await page.evaluate(async () => { await window.syncWithSupabase?.(); window.syncWithSupabase = async () => {}; });
  await page.evaluate(({ owner, cordees, digest, flags }) => {
    window.calls = []; window.cordees = cordees; window.digest = digest;
    window.titanClient.auth.getSession = async () => ({ data: { session: { access_token: "t", user: { id: owner } } }, error: null });
    window.titanClient.rpc = (name, args = {}) => {
      window.calls.push([name, args]);
      let out = { data: null, error: { code: "PGRST202", message: "Could not find" } };
      if (name === "titan_cordees_v1") out = { data: { cordees: window.cordees, titles: ["aube"] }, error: null };
      if (name === "titan_social_digest_v1" && window.digest) out = { data: window.digest, error: null };
      if (name === "titan_challenge_respond") { window.cordees = window.cordees.map(c => c.id === args.p_id ? { ...c, myStatus: args.p_action === "join" ? "joined" : "declined" } : c); out = { data: { status: "joined" }, error: null }; }
      if (name === "titan_cordee_suite_v1") {
        const answer = window.suiteAnswer ? window.suiteAnswer(args) : null;
        out = answer && answer.error ? { data: null, error: answer.error } : { data: answer, error: null };
        if (answer && !answer.error && answer.cordees) window.cordees = answer.cordees;
      }
      const delay = window.suiteDelay && name === "titan_cordee_suite_v1" ? window.suiteDelay : 0;
      const result = new Promise(r => setTimeout(() => r(out), delay)); result.setHeader = () => result; return result;
    };
    let pinned = window.state.user; pinned.id = owner;
    Object.defineProperty(window.state, "user", { configurable: true, get: () => pinned, set: (next) => { pinned = Object.assign(next || {}, { id: owner }); } });
    const f = { enabled: (key, fallback) => flags.includes(key) ? true : key.startsWith("screens.") ? false : fallback, refresh: async () => {} };
    Object.defineProperty(window, "titanFlags", { configurable: true, get: () => f, set: () => {} });
    window.dispatchEvent(new CustomEvent("titan:account-changed"));
  }, { owner: OWNER, cordees, digest, flags });
  return { page, context, errors };
}
const shot = async (locator, name) => { if (SHOTS) await locator.screenshot({ path: `${SHOTS}/${name}.png` }); };

test("our cordée is over: its story stays readable, I propose a new route at the suggested pace, nobody is asked for a text", async () => {
  const { page, context, errors } = await social({ cordees: [suiteOf({ can: ["propose"], hint: "propose" })] });
  try {
    const card = page.locator("[data-cordee=k1]");
    const story = card.locator("[data-cordee-story]");
    await story.waitFor();
    const text = await story.innerText();
    assert.match(text, /La cordée se forme à 4 sur « Les crêtes de l’Aube »\.[\s\S]*ouvre le passage de la Sentinelle\.[\s\S]*Tu reçois le relais[\s\S]*4 camps atteints[\s\S]*Sommet atteint : La crête de l’Aube, 40 longueurs ensemble\./);
    assert.doesNotMatch(text, /min|km|séance|course|escalade/i, "only shareable steps: no session, sport, duration or distance");
    const suite = card.locator("[data-cordee-suite]");
    assert.match(await suite.innerText(), /Votre cordée est terminée\. Propose un nouvel itinéraire : seuls ceux qui acceptent repartent, avec des compteurs à zéro\./);
    await shot(card, "suite-finished");
    await suite.getByRole("button", { name: "Proposer un nouvel itinéraire" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.waitFor();
    assert.equal(await sheet.locator("textarea, input[type=text]").count(), 0, "no text is ever asked");
    assert.equal(await sheet.locator("input[name=route]").count(), 4, "the four existing routes");
    assert.equal(await sheet.locator("input[name=pace]").count(), 3, "the three tested paces");
    assert.equal(await sheet.locator("input[name=pace]:checked").getAttribute("value"), "soutenue", "after a summit, the same pace is suggested");
    assert.match(await sheet.innerText(), /Soutenue · conseillée · celle de la dernière cordée/);
    assert.match(await sheet.innerText(), /seuls ceux qui acceptent y entrent\. « Les crêtes de l’Aube » reste consultable/);
    if (SHOTS) await sheet.screenshot({ path: `${SHOTS}/suite-propose-sheet.png` });
    await page.evaluate(() => {
      window.suiteAnswer = (a) => ({ proposal: "p9", status: "open", started: null, canonical: false, changed: true, cordees: window.cordees.map(c => ({ ...c, suite: { ...c.suite, can: [], hint: "mine",
        proposals: [{ id: "p9", route: a.p_route, pace: a.p_pace, days: a.p_days, status: "open", by: { name: "Moi", me: true }, mine: true, myAnswer: "yes", yes: 1, no: 0, eligible: 4, waiting: 3,
          accepted: [{ name: "Moi", me: true }], others: 0, expiresAt: new Date(Date.now() + 3 * 86400000).toISOString(), turn: ["withdraw"] }] } })) });
    });
    await sheet.getByLabel(/La passe des Marées/).check();
    await sheet.getByLabel(/^Douce/).check();
    await sheet.locator("select[name=days]").selectOption("21");
    await sheet.getByRole("button", { name: "Proposer" }).click();
    await page.locator(".asc-toast").filter({ hasText: "Itinéraire proposé" }).first().waitFor();
    assert.deepEqual(await page.evaluate(() => window.calls.filter(c => c[0] === "titan_cordee_suite_v1").map(c => c[1])),
      [{ p_from: "k1", p_action: "propose", p_suite: null, p_route: "marees", p_pace: "douce", p_days: 21 }]);
    const mine = card.locator("[data-suite=p9]");
    assert.match(await mine.innerText(), /« La passe des Marées » · allure douce · 21 jours[\s\S]*Ta proposition[\s\S]*1 sur 4 a accepté · 3 n’ont pas encore répondu[\s\S]*Tu as accepté en proposant\./);
    assert.equal(await mine.getByRole("button", { name: "Retirer ma proposition" }).count(), 1);
    await shot(card, "suite-mine");
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("a proposal waits for me: I accept once (double tap = one call), the group sets off; a refusal is a count, never a name", async () => {
  const waiting = suiteOf({ hint: "answer", waiting: 1, proposals: [P({ yes: 1, no: 1, waiting: 2 })] });
  const { page, context, errors } = await social({ cordees: [waiting] });
  try {
    const item = page.locator("[data-cordee=k1] [data-suite=p1]");
    await item.waitFor();
    const text = await item.innerText();
    assert.match(text, /Proposée par Léa[\s\S]*1 sur 4 a accepté · 1 a décliné · 2 n’ont pas encore répondu[\s\S]*A accepté : Léa/);
    assert.match(await page.locator("[data-cordee-suite-hint]").innerText(), /rien ne part sans deux acceptations/);
    await shot(page.locator("[data-cordee=k1]"), "suite-answer");
    await page.evaluate(() => {
      window.suiteDelay = 300;
      window.suiteAnswer = () => ({ proposal: "p1", status: "started", started: "n1", canonical: false, changed: true, cordees: [
        { ...window.cordees[0], suite: { ...window.cordees[0].suite, hint: "in", waiting: 0, proposals: [{ ...window.cordees[0].suite.proposals[0], status: "started", myAnswer: "yes", myStatus: "joined", yes: 2, joined: 2, accepted: [{ name: "Léa", me: false }, { name: "Moi", me: true }], turn: [] }] } },
        { ...window.cordees[0], id: "n1", route: "marees", title: "La passe des Marées", pace: "douce", status: "active", summitedAt: null, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 14 * 86400000).toISOString(),
          earned: false, share: 5, cap: 8, target: 10, longueurs: 0, variety: 0, total: 0, percent: 0, camps: 0, joined: 2, families: [], suite: null, story: null,
          me: { pitches: 0, counted: 0, days: 0, families: [], strand: false },
          members: [{ id: "u-lea", name: "Léa", status: "joined", me: false, pitches: 0, strand: false, families: [] }, { id: "o", name: "Moi", status: "joined", me: true, pitches: 0, strand: false, families: [] }, { id: null, name: "Membre de la cordée", status: "invited", me: false }],
          follows: { id: "k1", route: "aube", pace: "soutenue", summited: true, endedAt: new Date().toISOString(), proposedBy: { name: "Léa", me: false }, group: 4, camps: 4, total: 40, target: 40 } }] });
    });
    await item.getByRole("button", { name: "Accepter" }).dblclick();
    await page.locator(".asc-toast").filter({ hasText: "La cordée repart" }).first().waitFor();
    assert.equal(await page.evaluate(() => window.calls.filter(c => c[0] === "titan_cordee_suite_v1").length), 1, "one call for a double tap");
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_cordee_suite_v1")[1]), { p_from: "k1", p_action: "accept", p_suite: "p1" });
    const fresh = page.locator("[data-cordee=n1]");
    await fresh.waitFor();
    assert.match(await fresh.locator("[data-cordee-follows]").innerText(), /Suite de « Les crêtes de l’Aube » \(sommet atteint, à 4\)\. Proposée par Léa\. Les compteurs sont repartis de zéro\./);
    assert.match(await fresh.innerText(), /0 \/ 10/, "the new cordée starts at zero");
    const old = page.locator("[data-cordee=k1]");
    assert.match(await old.locator("[data-cordee-suite]").innerText(), /Repartie à 2[\s\S]*Tu fais partie de la nouvelle cordée\./);
    assert.match(await old.locator("[data-cordee-story]").innerText(), /Sommet atteint/, "the finished cordée stays readable");
    assert.doesNotMatch(await old.innerText(), /a décliné :|décliné par/i, "nobody is named for a refusal");
    await shot(fresh, "suite-new-cordee");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("two distinct proposals: an explicit choice; already roped in elsewhere, I read why I cannot accept", async () => {
  const two = suiteOf({ hint: "answer", waiting: 2, choice: true, proposals: [P({}), P({ id: "p2", route: "forge", pace: "reguliere", days: 21, by: { name: "Membre de la cordée", me: false }, accepted: [], others: 1 })] });
  const { page, context, errors } = await social({ cordees: [two] });
  try {
    const suite = page.locator("[data-cordee=k1] [data-cordee-suite]");
    await suite.waitFor();
    assert.match(await suite.locator("[data-cordee-suite-choice]").innerText(), /chacun choisit le sien, une acceptation à la fois/);
    assert.match(await suite.locator("[data-suite=p2]").innerText(), /« Les cols d’Obsidienne » · allure régulière · 21 jours[\s\S]*Proposée par Membre de la cordée[\s\S]*A accepté : 1 membre/);
    await shot(page.locator("[data-cordee=k1]"), "suite-choice");
    await page.evaluate(() => { window.suiteAnswer = () => ({ error: { code: "22023", message: "SUITE_ALREADY_IN" } }); });
    await suite.locator("[data-suite=p2]").getByRole("button", { name: "Accepter" }).click();
    await page.locator("[data-cordee-notice]").filter({ hasText: "Tu es déjà reparti·e avec une autre proposition" }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("the flag closed: the story stays, only my own proposal can still be withdrawn; the digest shows the answer the group waits for", async () => {
  const mine = suiteOf({ hint: "mine", proposals: [P({ id: "p3", by: ME, mine: true, myAnswer: "yes", accepted: [ME], turn: ["withdraw"] })] });
  const other = { ...suiteOf({ hint: "answer", proposals: [P({})] }), id: "k2" };
  const digest = { since: day(-3), requestsIn: 0, cheersReceived: 0, friendMoments: { count: 0, latest: [] }, friendsActive: [], duo: null, challengesEnded: [], memories: [], suggestion: null,
    cordees: [{ id: "n1", route: "marees", status: "active", myStatus: "invited", percent: 0, camps: 0, total: 0, target: 10, mine: 0, earned: false, summitedSince: false, follows: "aube" }],
    suites: [{ id: "k2", route: "aube", waiting: 1, choice: false, proposals: [{ id: "p1", route: "forge", pace: "douce", days: 14, status: "open", mine: false, by: "Léa", myAnswer: null, yes: 1, eligible: 4, turn: ["accept", "decline"] }] }] };
  const { page, context, errors } = await social({ cordees: [mine, other], digest, flags: ["screens.cordee", "screens.digest"] });
  try {
    await page.locator("[data-cordee=k1] [data-cordee-story]").waitFor();
    assert.equal(await page.locator("[data-cordee=k2] [data-cordee-suite]").count(), 0, "nothing to answer with the flag closed");
    const k1 = page.locator("[data-cordee=k1] [data-cordee-suite]");
    assert.equal(await k1.getByRole("button", { name: "Retirer ma proposition" }).count(), 1);
    assert.equal(await k1.getByRole("button", { name: "Proposer un nouvel itinéraire" }).count(), 0);
    const retour = page.locator("[data-retour]");
    await retour.waitFor();
    const lines = await retour.innerText();
    assert.match(lines, /Ton groupe de « Les crêtes de l’Aube » est reparti sur « La passe des Marées », compteurs à zéro\. Tu peux t’encorder ou décliner\./);
    assert.match(lines, /Léa propose à ta cordée de « Les crêtes de l’Aube » de repartir sur « Les cols d’Obsidienne » · allure douce · 14 jours\. Accepte ou décline quand tu veux\./);
    assert.equal(await retour.locator("a[href='#cordee']").count(), 2);
    if (SHOTS) await page.locator("#retour").screenshot({ path: `${SHOTS}/suite-digest.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no sideways scroll at 390 px");
    await page.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
    const axe = await page.evaluate(() => window.axe.run(document.querySelector("#cordee"), { runOnly: ["wcag2a", "wcag2aa"] }).then(r => r.violations.map(v => v.id)));
    assert.deepEqual(axe, []);
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
