// V1.9.2 — Retour sur la séance, coach and athlete on the website. Real UI, server answers replayed from tests/fixtures/coach-feedback.json
// (printed by tools/db/coach-feedback/fixtures.sql on PostgreSQL 16). Synthetic accounts only. Screenshots: docs/v192/*.png.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, readFileSync } from "node:fs";
import { before, after, test } from "node:test";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
const FX = JSON.parse(readFileSync(ROOT + "tests/fixtures/coach-feedback.json", "utf8"));
const COACH = "19200000-0000-4000-8000-0000000000c1";
const INES = "19200000-0000-4000-8000-0000000000a1";
const LINK = FX.list_coach.link_id;
const DONE = FX.given.assignment.id;
const [NEXT, MOB] = FX.compose.targets.map((t) => t.id);
const SHOTS = ROOT + "docs/v192/";
mkdirSync(SHOTS, { recursive: true });
let server, browser, BASE;

before(async () => {
  const port = await new Promise((resolve) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

const assignments = () => [
  { id: DONE, link_id: LINK, title: "Force · Squat 4 × 6", sport: "muscu_gym", planned_date: FX.compose.session.day, instructions: "4 séries de 6 à 80 kg, RIR 2", status: "completed", revision: 3, session_id: "19200000-0000-4000-8000-0000000005a1", created_at: FX.given.created_at, updated_at: FX.given.created_at },
  { id: NEXT, link_id: LINK, title: "Force · Squat 5 × 5", sport: "muscu_gym", planned_date: FX.compose.targets[0].planned_date, instructions: "5 séries de 5 à 82,5 kg", status: "accepted", revision: 2, session_id: null, created_at: FX.given.created_at, updated_at: FX.given.created_at },
  { id: MOB, link_id: LINK, title: "Mobilité hanches", sport: "muscu_gym", planned_date: FX.compose.targets[1].planned_date, instructions: "", status: "proposed", revision: 1, session_id: null, created_at: FX.given.created_at, updated_at: FX.given.created_at },
];

async function fixture({ width = 390, role = "coach", stage = "before", flag = true, hash = "", scale = 1, failFirstGive = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1100 }, deviceScaleFactor: scale, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  const calls = [], errors = [];
  const state = { stage, gives: 0 };
  const me = role === "coach" ? COACH : INES;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/js/app/coaching.js?*", (r) => r.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto(BASE + "/coaching" + hash);
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready");
  await page.evaluate(({ me, flag }) => {
    window.state.user.id = me;
    window.titanClient = {
      auth: { getSession: async () => ({ data: { session: { user: { id: window.state.user.id }, access_token: "fixture" } } }) },
      rpc: async (fn, args) => { const r = await fetch(`${window.TITAN_SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args) }); return { data: await r.json(), error: r.ok ? null : { message: "UNAVAILABLE" } }; },
    };
    const old = window.titanFlags.enabled;
    window.fbFlag = flag;
    window.titanFlags.enabled = (k, f) => (k === "screens.coach_feedback" ? window.fbFlag : ["screens.coach_followup", "screens.coachtools"].includes(k) ? true : old(k, f));
  }, { me, flag });
  const link = { id: LINK, coach_id: COACH, athlete_id: INES, athlete_name: "Inès", coach_name: "Coach Lou", sport: null, since_date: "2026-10-25", accepted_at: "2026-10-25T08:00:00Z", revision: 1,
    share_details: state.stage !== "withdrawn", share_notes: false, paused: false };
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }).catch(() => {});
  await page.route("**/rest/v1/rpc/titan_coach_portal", async (route) => {
    const { p_action: action, p_data: data } = route.request().postDataJSON();
    calls.push({ fn: "portal", action, data });
    const live = state.stage === "revoked" ? [] : [link];
    if (action === "snapshot") return json(route, { owner: me, capacity: 3, invites: [], links: live, seatsUsed: live.length });
    if (action === "sessions") return json(route, { owner: me, link_id: data.link_id, revision: 1, rows: [], total: 0, offset: 0, from_date: data.from_date, to_date: data.to_date });
    if (action === "assignments") return json(route, { link_id: data.link_id, revision: 1, total: 3, offset: 0, rows: assignments() });
    return json(route, {});
  });
  await page.route("**/rest/v1/rpc/titan_coach_followup_v1", async (route) => {
    const { p_action: action, p_data: data } = route.request().postDataJSON();
    calls.push({ fn: "followup", action, data });
    if (action === "queue") return json(route, { owner: me, today: FX.compose.session.day, counts: { wait: 0, gap: 0, suggest: 0 }, athletes: [], paused: 0, rows: [] });
    return json(route, { link_id: data.link_id, revision: 1, role, total: 0, offset: 0, rows: [] });
  });
  await page.route("**/rest/v1/rpc/titan_coach_feedback_v1", async (route) => {
    const { p_action: action, p_data: data } = route.request().postDataJSON();
    calls.push({ fn: "feedback", action, data });
    if (!flag) return json(route, { message: "FEATURE_DISABLED" }, 400);
    if (role === "coach" && state.stage === "revoked") return json(route, { message: "SHARING_UNAVAILABLE" }, 400);
    if (action === "compose") return json(route, FX.compose);
    if (action === "give") {
      state.gives++;
      if (failFirstGive && state.gives === 1) return json(route, { message: "SESSION_CHANGED" }, 400);
      state.stage = "given";
      return json(route, FX.given);
    }
    if (action === "list") {
      if (role === "athlete") return json(route, { link_id: LINK, role, rows: FX.athlete_inbox.rows });
      return json(route, state.stage === "withdrawn" ? FX.list_coach_withdrawn : FX.list_coach);
    }
    if (action === "detail") {
      if (role === "athlete") return json(route, FX.athlete_inbox.rows.find((r) => r.id === data.id) || FX.athlete_session.rows[0]);
      if (state.stage === "withdrawn") return json(route, FX.detail_coach_withdrawn);
      return json(route, FX.list_coach.rows.find((r) => r.id === data.id) || FX.given);
    }
    if (action === "answer") return json(route, FX.answer_accepted);
    return json(route, {});
  });
  await page.route("**/rest/v1/rpc/titan_coach_messages_v1", (route) => json(route, { link: LINK, rows: FX.thread_athlete.rows.map((m) => ({ ...m, mine: role === "coach" })), more: false }));
  await page.route("**/rest/v1/rpc/titan_coach_messages_read_v1", (route) => json(route, 0));
  await page.route("**/rest/v1/rpc/titan_coach_checkins_v1", (route) => json(route, { rows: [] }));
  await page.route("**/rest/v1/rpc/titan_coach_templates_v1", (route) => json(route, []));
  await page.addScriptTag({ path: ROOT + "/js/app/coaching.js" });
  // A direct link opens its feedback on arrival, whichever tab is shown: the modal sheet then covers the tabs.
  if (role === "coach" && !hash) await page.locator('[data-mode="coach"]').click();
  return { page, context, calls, errors, state };
}

async function audit(page, selector) {
  await page.addScriptTag({ content: readFileSync(ROOT + "/node_modules/axe-core/axe.min.js", "utf8") });
  const v = await page.evaluate(async (selector) => (await axe.run(document.querySelector(selector), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target).join(", ")}`), selector);
  assert.deepEqual(v, []);
}
const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const card = (page, title) => page.locator(".co-task").filter({ has: page.locator("h3", { hasText: title }) });

test("the coach comments the session linked to the proposal, on its shared measures, and suggests an adjustment of the next proposal", async () => {
  for (const width of [390, 1280]) {
    const f = await fixture({ width, scale: width === 390 ? 2 : 1, failFirstGive: true }), { page } = f;
    try {
      const done = card(page, "Force · Squat 4 × 6");
      await done.locator("[data-fb-preview]").first().waitFor();
      assert.equal(await card(page, "Force · Squat 5 × 5").locator("[data-fb-compose]").count(), 0, "only a linked session can be commented");
      await done.getByRole("button", { name: "Laisser un retour" }).click();
      const dialog = page.locator("dialog[open]");
      const session = dialog.locator("[data-fb-session]");
      await session.waitFor();
      assert.equal(await session.getAttribute("data-fb-session"), "shared");
      assert.match(await session.innerText(), /Squat · 4 × 6 à 80 kg[\s\S]*80 kg × 5 \(RIR 0\)/);
      assert.match(await session.locator("[data-fb-checkin]").innerText(), /Fatigue 4\/5 · Sommeil 2\/5/);
      assert.equal((await session.locator("[data-fb-hidden]").innerText()).trim(), "Non partagé par le sportif : la note.");
      assert.equal(await dialog.getByText("Épaule").count(), 0, "the private note is nowhere");
      await dialog.getByLabel("Observation : ce que tu as remarqué").fill("La dernière série est descendue à RIR 0 : on garde la charge mais on vise RIR 2 partout.");
      await dialog.getByLabel("Ajuster une séance prévue").check();
      await dialog.getByLabel("Séance à ajuster").selectOption(NEXT);
      await dialog.getByLabel("Consignes").fill("5 séries de 5 à 80 kg, RIR 2 sur chaque série");
      await dialog.getByLabel("Un mot pour le sportif (facultatif)").fill("On consolide avant de monter");
      if (width === 390) await dialog.screenshot({ path: SHOTS + "coach-compose-shared-measures.png" });
      await audit(page, "dialog[open]");
      // The athlete corrected the session while the coach was writing: refused, the text is kept, the measures are read again.
      await dialog.getByRole("button", { name: "Envoyer le retour" }).click();
      await dialog.getByText("La séance ou son partage a changé pendant ta rédaction").waitFor();
      assert.match(await dialog.getByLabel("Observation : ce que tu as remarqué").inputValue(), /^La dernière série/);
      assert.equal(f.calls.filter((c) => c.action === "compose").length, 2, "the composer read the session again");
      await dialog.getByRole("button", { name: "Envoyer le retour" }).click();
      await page.waitForFunction(() => !document.querySelector("dialog[open]"));
      const give = f.calls.filter((c) => c.action === "give").at(-1).data;
      assert.equal(give.id, DONE, "the feedback is sent on the commented proposal");
      assert.equal(give.session_key, FX.compose.session_key, "with the key of the session the coach read");
      assert.deepEqual(give.adjustment, { target_id: NEXT, instructions: "5 séries de 5 à 80 kg, RIR 2 sur chaque série", note: "On consolide avant de monter" }, "only what changes");
      assert.ok(await noHorizontalScroll(page), "no horizontal scroll at " + width);
      assert.equal(f.calls.filter((c) => /^(link|unlink|move|declare_done|scope)$/.test(c.action)).length, 0, "the coach never acts on the journal or the sharing");
      assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
  }
});

test("observation and proposal are separate in the feedback, which the thread opens too", async () => {
  const f = await fixture({ scale: 2 }), { page } = f;
  try {
    const msg = page.locator(`[data-ct-feedback-msg="${FX.given.id}"]`);
    await msg.waitFor();
    await msg.getByRole("button", { name: "Voir la séance et la proposition" }).click();
    const sheet = page.locator("dialog[open] [data-co-feedback]");
    await sheet.waitFor();
    assert.match(await sheet.locator("[data-fb-observation]").innerText(), /Observation du coach[\s\S]*La dernière série/);
    const adj = sheet.locator(".co-fb-adj");
    assert.equal(await adj.getAttribute("data-fb-adj-state"), "accepted");
    assert.match(await adj.innerText(), /Proposition pour la suite[\s\S]*Acceptée[\s\S]*Ajuster « Force · Squat 5 × 5 »[\s\S]*82,5 kg[\s\S]*RIR 2 sur chaque série/);
    assert.equal(await sheet.locator("[data-fb-observation]").getByText("RIR 2 sur chaque série").count(), 0, "the proposal is not inside the observation");
    await audit(page, "dialog[open]");
    await page.locator("dialog[open]").screenshot({ path: SHOTS + "coach-feedback-observation-proposal.png" });
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});

test("the athlete withdraws the details: previews and the feedback lose the exercises and the check-in at the next read", async () => {
  const f = await fixture({ stage: "withdrawn", width: 1280 }), { page } = f;
  try {
    const previews = page.locator("[data-fb-preview]");
    await previews.first().waitFor();
    for (const t of await previews.allInnerTexts()) assert.doesNotMatch(t, /exercice/, t);
    await page.locator(`[data-fb-open="${FX.given.id}"]`).click();
    const sheet = page.locator("dialog[open] [data-co-feedback]");
    await sheet.waitFor();
    const s = sheet.locator("[data-fb-session]");
    assert.equal(await s.locator("[data-fb-exercises]").count(), 0);
    assert.equal(await s.locator("[data-fb-checkin]").count(), 0);
    assert.equal((await s.locator("[data-fb-hidden]").innerText()).trim(), "Non partagé par le sportif : le détail des exercices et la note.");
    assert.equal(await page.getByText("80 kg × 5").count(), 0, "no copy of a withdrawn measure anywhere on the page");
    assert.match(await sheet.locator("[data-fb-observation]").innerText(), /La dernière série/, "the context stays");
    await page.locator("dialog[open]").screenshot({ path: SHOTS + "coach-after-details-withdrawn.png" });
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});

test("a direct link opens the feedback; after revocation the same link shows nothing to the coach", async () => {
  const ok = await fixture({ hash: `#retour=${FX.given.id}` });
  try {
    await ok.page.locator("dialog[open] [data-co-feedback]").waitFor();
    assert.ok(ok.calls.some((c) => c.action === "detail" && c.data.id === FX.given.id));
  } finally { await ok.context.close(); }
  const f = await fixture({ hash: `#retour=${FX.given.id}`, stage: "revoked" }), { page } = f;
  try {
    await page.waitForFunction(() => document.querySelector(".asc-toasts")?.textContent.includes("ce retour ne peut plus être ouvert"));
    assert.ok(f.calls.some((c) => c.action === "detail" && c.data.id === FX.given.id), "the direct link asked the server, which re-checked access");
    assert.equal(await page.locator("dialog[open]").count(), 0);
    assert.equal(await page.getByText("La dernière série").count(), 0, "nothing of the feedback is shown");
    assert.equal(await page.getByText("Squat").count(), 0, "nor of the session");
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});

test("the athlete reads the feedback from the proposal and accepts the adjustment", async () => {
  const f = await fixture({ role: "athlete", scale: 2 }), { page } = f;
  try {
    const pending = FX.athlete_inbox.rows.find((r) => r.can_answer);
    const row = page.locator(`[data-fb-row="${pending.id}"]`);
    await row.waitFor();
    assert.match(await row.innerText(), /proposition à confirmer/);
    await row.getByRole("button", { name: "Ouvrir le retour" }).click();
    const sheet = page.locator("dialog[open] [data-co-feedback]");
    await sheet.waitFor();
    assert.match(await sheet.locator(".co-fb-adj").innerText(), /À confirmer[\s\S]*Ajouter « Décharge »[\s\S]*Rien ne change tant que tu n’as pas répondu. Accepter l’ajoute à tes séances proposées/);
    assert.equal((await sheet.locator("[data-fb-hidden]").innerText()).trim(), "Tu ne partages pas : la note.");
    await audit(page, "dialog[open]");
    await page.locator("dialog[open]").screenshot({ path: SHOTS + "athlete-feedback-decide.png" });
    await sheet.getByRole("button", { name: "Accepter l’ajustement" }).click();
    await page.getByRole("button", { name: "Accepter l’ajustement", exact: true }).last().click();
    await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    const answer = f.calls.find((c) => c.action === "answer");
    assert.deepEqual(answer.data, { id: pending.id, revision: pending.revision, accept: true });
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});

test("closed flag: no feedback request and nothing new on the proposals", async () => {
  const f = await fixture({ flag: false }), { page } = f;
  try {
    await page.locator(".co-task").first().waitFor();
    await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
    assert.equal(await page.locator("[data-co-fb], [data-fb-compose]").count(), 0);
    assert.equal(f.calls.filter((c) => c.fn === "feedback").length, 0);
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});
