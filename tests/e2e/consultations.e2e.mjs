// Communauté: votes and roadmap (COM-F3, COM-F4). Behind the server flag screens.consultations; a vote is a preference, results only after the close.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const OWNER = "00000000-0000-4000-8000-000000000571";
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

const POLLS = [
  { id: "p-open", title: "Quelle quête commune la semaine prochaine ?", detail: "Une seule voix par compte.", opensAt: "2026-10-28T08:00:00Z", closesAt: "2026-11-02T08:00:00Z", state: "open", myVote: null,
    options: [{ position: 1, label: "Endurance" }, { position: 2, label: "Force" }, { position: 3, label: "Multisport" }] },
  { id: "p-closed", title: "Quel thème pour la saison ?", detail: null, opensAt: "2026-10-01T08:00:00Z", closesAt: "2026-10-10T08:00:00Z", state: "closed", myVote: 2,
    options: [{ position: 1, label: "Forêt", votes: 3 }, { position: 2, label: "Montagne", votes: 9 }] },
];
const ITEMS = [
  { id: "i1", title: "Duels entre amis", detail: "Défier un ami sur une semaine.", status: "study", votes: 4, mine: false, history: [] },
  { id: "i2", title: "Cartes de statistiques", detail: null, status: "shipped", votes: 11, mine: true, history: [] },
  { id: "i3", title: "Mode sombre auto", detail: null, status: "wish", votes: 1, mine: true, history: [] },
];
async function page({ flag = true, missing = false, signedIn = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const p = await context.newPage();
  const errors = []; p.on("pageerror", e => errors.push(e.message));
  await p.goto(BASE + "/social");
  await p.waitForFunction(() => window.TitanConsultations && window.state?.user);
  await p.evaluate(({ flag, missing, signedIn, owner, polls, items }) => {
    window.calls = [];
    window.polls = polls; window.items = items;
    if (signedIn) {
      window.titanClient.rpc = (name, args = {}) => {
        window.calls.push([name, args]);
        let out = { data: null, error: { code: "PGRST202", message: "Could not find" } };
        if (!missing && name === "titan_polls_v1") out = { data: window.polls, error: null };
        if (!missing && name === "titan_roadmap_v1") out = { data: window.items, error: null };
        if (name === "titan_poll_vote_v1") { window.polls = window.polls.map(x => x.id === args.p_poll ? { ...x, myVote: args.p_option } : x); out = { data: { ok: true }, error: null }; }
        if (name === "titan_roadmap_vote_v1") {
          if (args.p_on && window.items.filter(x => x.mine && x.status !== "shipped").length >= 1 && window.limit) out = { data: null, error: { code: "22023", message: "VOTE_LIMIT_5" } };
          else { window.items = window.items.map(x => x.id === args.p_item ? { ...x, mine: args.p_on, votes: x.votes + (args.p_on ? 1 : -1) } : x); out = { data: {}, error: null }; }
        }
        const result = Promise.resolve(out); result.setHeader = () => result; return result;
      };
      window.state.user.id = owner;
    }
    window.titanFlags = { enabled: (key, fallback) => key === "screens.consultations" ? flag : fallback, refresh: async () => {} };
    window.dispatchEvent(new CustomEvent("titan:account-changed"));
  }, { flag, missing, signedIn, owner: OWNER, polls: POLLS, items: ITEMS });
  return { p, context, errors };
}

test("consultations: an open poll hides the counts, a vote is one choice and can be changed; a closed poll shows the results", async () => {
  const { p, context, errors } = await page();
  try {
    const open = p.locator("[data-poll=p-open]");
    await open.waitFor();
    assert.equal(await open.locator("input[type=radio]").count(), 3);
    assert.doesNotMatch(await open.innerText(), /voix au total/);
    await p.getByRole("button", { name: "Voter" }).click();
    assert.match(await p.locator("[data-cs-notice]").innerText(), /Choisis une option/);
    await open.getByLabel("Force").check();
    await p.getByRole("button", { name: "Voter" }).click();
    await p.getByRole("button", { name: "Changer mon vote" }).waitFor();
    assert.deepEqual(await p.evaluate(() => window.calls.filter(c => c[0] === "titan_poll_vote_v1")), [["titan_poll_vote_v1", { p_poll: "p-open", p_option: 2 }]]);
    const closed = p.locator("[data-poll=p-closed]");
    assert.match(await closed.innerText(), /Montagne/);
    assert.match(await closed.innerText(), /ton vote/);
    assert.match(await closed.innerText(), /12 voix au total/);
    assert.match(await closed.innerText(), /un vote éclaire, il n’engage pas/);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await p.emulateMedia({ reducedMotion: "reduce" });
    await p.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
    const axe = await p.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }).then(r => r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join("|")}`)));
    assert.deepEqual(axe, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("consultations: the roadmap groups ideas by honest status, supports a preference, never on a shipped idea, and explains the limit", async () => {
  const { p, context } = await page();
  try {
    const road = p.locator("[data-roadmap]");
    await road.waitFor();
    assert.match(await road.innerText(), /à l’étude[\s\S]*Duels entre amis/i);
    assert.match(await road.innerText(), /jusqu’à cinq idées/);
    assert.equal(await road.locator("[data-item=i2] button").count(), 0, "a shipped idea has no vote button");
    assert.match(await road.locator("[data-item=i2]").innerText(), /Livré/);
    await road.locator("[data-item=i1] button").click();
    await p.waitForFunction(() => document.querySelector("[data-item=i1] button")?.getAttribute("aria-pressed") === "true");
    assert.match(await road.locator("[data-item=i1]").innerText(), /5 soutiens/);
    await road.locator("[data-item=i1] button").click();
    await p.waitForFunction(() => document.querySelector("[data-item=i1] button")?.getAttribute("aria-pressed") === "false");
    await p.evaluate(() => { window.limit = true; });
    await road.locator("[data-item=i1] button").click();
    await p.locator("[data-cs-notice]").waitFor();
    assert.match(await p.locator("[data-cs-notice]").innerText(), /cinq idées/);
    assert.match(await p.locator("#consultations").innerText(), /un statut n’est pas une date/);
  } finally { await context.close(); }
});

test("consultations: nothing when the flag is off, for a guest, or on a server without the functions", async () => {
  for (const options of [{ flag: false }, { signedIn: false }, { missing: true }]) {
    const { p, context } = await page(options);
    try {
      await p.waitForTimeout(500);
      assert.equal(await p.locator("#consultations").isVisible(), false);
      assert.equal(await p.locator("#consultations").innerText(), "");
    } finally { await context.close(); }
  }
});
