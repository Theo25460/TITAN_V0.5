// V1.9.1 — Une séance assignée, coach on the website. Real UI, server answers replayed from tests/fixtures/coach-followup.json (printed by
// tools/db/coach-followup/fixtures.sql on PostgreSQL 16). Synthetic accounts only. Screenshots: docs/v191/*.png.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, readFileSync } from "node:fs";
import { before, after, test } from "node:test";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
const FX = JSON.parse(readFileSync(ROOT + "tests/fixtures/coach-followup.json", "utf8"));
const F = (await import("node:module")).createRequire(import.meta.url)("../../js/core/coach-followup.js");
const COACH = "19100000-0000-4000-8000-0000000000c1";
const INES = FX.list_before.link_id;
const MALO = FX.queue_before.rows.find((r) => r.athlete_name === "Malo").link_id;
const SHOTS = ROOT + "docs/v191/";
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

const portalRow = (r) => ({ id: r.id, link_id: r.link_id, title: r.title, sport: r.sport, planned_date: r.planned_date, instructions: r.instructions, status: r.status, revision: r.revision, created_at: r.created_at, updated_at: r.updated_at, session_id: null });

async function fixture({ width = 390, flag = true, stage = "before", scale = 1 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1100 }, deviceScaleFactor: scale, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  const calls = [], errors = [];
  const state = { stage };
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/js/app/coaching.js?*", (r) => r.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto(BASE + "/coaching");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready");
  await page.evaluate(({ COACH, flag }) => {
    window.state.user.id = COACH;
    window.titanClient = { auth: { getSession: async () => ({ data: { session: { user: { id: window.state.user.id }, access_token: "fixture" } } }) } };
    const old = window.titanFlags.enabled;
    window.followFlag = flag;
    window.titanFlags.enabled = (k, f) => (k === "screens.coach_followup" ? window.followFlag : old(k, f));
  }, { COACH, flag });
  const links = [
    { id: INES, coach_id: COACH, athlete_id: "a1", athlete_name: "Inès", coach_name: "Coach Lou", sport: null, since_date: "2026-10-25", accepted_at: "2026-10-25T08:00:00Z", revision: 1, share_details: false, share_notes: false, paused: false },
    { id: MALO, coach_id: COACH, athlete_id: "a2", athlete_name: "Malo", coach_name: "Coach Lou", sport: null, since_date: "2026-10-25", accepted_at: "2026-10-24T08:00:00Z", revision: 1, share_details: false, share_notes: false, paused: false },
  ];
  const queueOf = () => state.stage === "revoked" ? FX.queue_revoked : state.stage === "after" ? FX.queue_after : FX.queue_before;
  await page.route("**/rest/v1/rpc/titan_coach_portal", async (route) => {
    const { p_action: action, p_data: data } = route.request().postDataJSON();
    calls.push({ fn: "portal", action, data });
    let body = {};
    const live = state.stage === "revoked" ? links.filter((l) => l.id !== INES) : links;
    if (action === "snapshot") body = { owner: COACH, capacity: 3, invites: [], links: live, seatsUsed: live.length };
    if (action === "sessions") body = { owner: COACH, link_id: data.link_id, revision: 1, rows: [], total: 0, offset: 0, from_date: data.from_date, to_date: data.to_date };
    if (action === "assignments") {
      const rows = data.link_id === INES ? FX.list_before.rows : FX.queue_before.rows.filter((r) => r.link_id === MALO);
      body = { link_id: data.link_id, revision: 1, total: rows.length, offset: 0, rows: rows.map(portalRow) };
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) }).catch(() => {});
  });
  await page.route("**/rest/v1/rpc/titan_coach_followup_v1", async (route) => {
    const { p_action: action, p_data: data } = route.request().postDataJSON();
    calls.push({ fn: "followup", action, data });
    let body = {}, status = 200;
    if (!flag) { status = 400; body = { message: "FEATURE_DISABLED" }; }
    else if (action === "queue") {
      const q = queueOf();
      body = { ...q, rows: q.rows.filter((r) => (!data.action || r.coach_next === data.action) && (!data.link_id || r.link_id === data.link_id)) };
      if (state.stage === "seen") body = { ...FX.queue_after, rows: FX.queue_after.rows.filter((r) => r.title !== "Côtes · 8 × 45 s") };
    } else if (action === "list") {
      if (state.stage === "revoked" && data.link_id === INES) { status = 400; body = { message: "SHARING_UNAVAILABLE" }; }
      else body = data.link_id === INES ? FX.list_before : { link_id: data.link_id, revision: 1, role: "coach", total: 2, offset: 0, rows: FX.queue_before.rows.filter((r) => r.link_id === MALO) };
    } else if (action === "detail") {
      const all = [FX.detail_linked, ...FX.queue_after.rows, ...FX.queue_before.rows];
      const row = state.stage === "before" ? FX.queue_before.rows.find((r) => r.id === data.id) : all.find((r) => r.id === data.id);
      if (state.stage === "revoked" && row?.link_id === INES) { status = 400; body = { message: "SHARING_UNAVAILABLE" }; } else body = row;
    } else if (action === "seen") { state.stage = "seen"; body = { ...FX.detail_linked, seen: true }; }
    else if (action === "propose_change") body = { ...FX.queue_before.rows.find((r) => r.id === data.id), state: "reproposed", pending_change: { ...data } };
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }).catch(() => {});
  });
  await page.addScriptTag({ path: ROOT + "/js/app/coaching.js" });
  await page.locator('[data-mode="coach"]').click();
  return { page, context, calls, errors, state };
}

async function audit(page, selector) {
  await page.addScriptTag({ content: readFileSync(ROOT + "/node_modules/axe-core/axe.min.js", "utf8") });
  const v = await page.evaluate(async (selector) => (await axe.run(document.querySelector(selector), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target).join(", ")}`), selector);
  assert.deepEqual(v, []);
}
const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const row = (page, title) => page.locator("[data-queue-row]").filter({ hasText: title });

test("a session moved before being linked: planned date, date in force and the decision, in one queue", async () => {
  for (const width of [390, 1280]) {
    const f = await fixture({ width, scale: width === 390 ? 2 : 1 }), { page } = f;
    try {
      const queue = page.locator("[data-co-queue]");
      await queue.locator("[data-queue-row]").first().waitFor();
      const hill = FX.queue_before.rows.find((r) => r.title === "Côtes · 8 × 45 s");
      const item = row(page, "Côtes · 8 × 45 s");
      assert.match(await item.innerText(), /Inès/);
      assert.equal(await item.locator('[data-state="to_match"]').innerText(), "À rapprocher");
      assert.equal(await item.locator('[data-date="planned"] dd').innerText(), F.day(hill.planned_date));
      assert.equal(await item.locator('[data-date="moved"] dd').innerText(), F.day(hill.moved_date));
      assert.equal(await item.locator('[data-date="done"]').count(), 0, "not linked yet: no date done");
      assert.match(await item.locator("[data-gap-text]").innerText(), /le sportif doit confirmer le rapprochement/);
      assert.match(await item.locator('[data-next="wait"]').innerText(), /Attendre une réponse/);
      // Every case of the scenario is told apart.
      for (const [title, label] of [["Footing souple", "Proposée à nouveau"], ["Sortie vélo 2 h", "Faite sans correspondance"], ["Natation technique", "En attente"], ["Tempo 3 × 10 min", "Déclinée"]])
        assert.equal(await row(page, title).locator(".asc-chip").innerText(), label, title);
      assert.match(await row(page, "Footing souple").locator("[data-co-diff]").innerText(), /En vigueur[\s\S]*45 min en aisance[\s\S]*50 min dont 10 min allure marathon/);
      assert.ok(await noHorizontalScroll(page), "no horizontal scroll at " + width);
      await audit(page, "[data-co-queue]");
      if (width === 390) {
        await page.addStyleTag({ content: "nav, .shell-tabbar, [class*=tabbar], [class*=bottom-nav] { visibility: hidden !important; }" });
        await queue.screenshot({ path: SHOTS + "queue-moved-before-link.png" });
      }
      assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
  }
});

test("the queue filters by action and by athlete, and asks the server each time", async () => {
  const f = await fixture(), { page } = f;
  try {
    await page.locator("[data-queue-row]").first().waitFor();
    await page.locator("#co-queue-f-gap").click();
    await page.waitForFunction(() => document.querySelectorAll("[data-queue-row]").length === 1);
    assert.equal(f.calls.filter((c) => c.action === "queue").at(-1).data.action, "gap");
    assert.match(await page.locator("[data-queue-row]").innerText(), /Malo[\s\S]*Sortie vélo 2 h[\s\S]*Traiter un écart/);
    assert.equal(await page.locator("#co-queue-f-gap").getAttribute("aria-pressed"), "true");
    await page.locator("#co-queue-f-all").click();
    await page.getByLabel("Filtrer par sportif").selectOption(MALO);
    await page.waitForFunction(() => document.querySelectorAll("[data-queue-row]").length === 2);
    assert.equal(f.calls.filter((c) => c.action === "queue").at(-1).data.link_id, MALO);
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});

test("linked after the move, a refused second link, the dossier keeps the original, the correction and the activity; the coach handles the gap", async () => {
  const f = await fixture({ stage: "after", scale: 2 }), { page } = f;
  try {
    const item = row(page, "Côtes · 8 × 45 s");
    await item.waitFor();
    const d = FX.detail_linked;
    assert.equal(await item.locator(".asc-chip").innerText(), "Liée");
    assert.equal(await item.locator('[data-date="done"] dd').innerText(), F.day(d.done_date));
    assert.equal(await item.locator("[data-gap-text]").innerText(), `Prévue ${F.day(d.planned_date)}, faite ${F.day(d.done_date)} : 2 jours plus tard.`);
    await item.getByRole("button", { name: "Ouvrir le dossier" }).click();
    const dossier = page.locator("[data-co-dossier]");
    await dossier.waitFor();
    assert.match(await dossier.locator('[data-co-version="original"]').innerText(), new RegExp(`Côtes · 8 × 45 s[\\s\\S]*${F.day(d.accepted_version.planned_date)}`));
    assert.match(await dossier.locator('[data-co-version="correction"]').innerText(), /Aucune correction/);
    assert.match(await dossier.locator('[data-co-version="activity"]').innerText(), new RegExp(`${F.day(d.done_date)}[\\s\\S]*9,4 km`));
    const history = await dossier.locator("[data-co-history] li").allInnerTexts();
    assert.ok(history.some((t) => /Déplacée du .+ au .+ \(« Réunion jeudi soir »\)/.test(t)), history.join(" / "));
    assert.ok(history.some((t) => /Seconde tentative de lien refusée : le lien en place est gardé/.test(t)), history.join(" / "));
    assert.equal(await dossier.locator('[data-kind="linked"]').count(), 1, "one link in the history");
    await audit(page, "dialog[open]");
    await page.locator("dialog[open]").screenshot({ path: SHOTS + "dossier-linked-refused-attempt.png" });
    await dossier.getByRole("button", { name: "Prendre acte" }).click();
    await page.getByRole("button", { name: "Prendre acte", exact: true }).last().click();
    await page.waitForFunction(() => ![...document.querySelectorAll("[data-queue-row]")].some((e) => e.textContent.includes("Côtes")));
    const seen = f.calls.find((c) => c.action === "seen");
    assert.equal(seen.data.state_key, d.state_key, "the gap handled is the one on screen");
    assert.equal(f.calls.filter((c) => /link|move|answer|declare|unlink/.test(c.action)).length, 0, "the coach never acts on the athlete's journal");
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});

test("proposing again keeps the accepted version and sends only what changes", async () => {
  const f = await fixture({ scale: 2 }), { page } = f;
  try {
    const item = row(page, "Tempo 3 × 10 min");
    await item.getByRole("button", { name: "Proposer à nouveau" }).click();
    const dialog = page.locator("dialog[open]");
    await dialog.getByText("La version acceptée reste en vigueur tant que le sportif n’a pas répondu.").waitFor();
    const next = new Date(Date.parse(FX.queue_before.rows.find((r) => r.title === "Tempo 3 × 10 min").planned_date + "T12:00:00Z") + 2 * 86400000).toISOString().slice(0, 10);
    await dialog.getByLabel("Date prévue").fill(next);
    await dialog.getByLabel("Un mot pour le sportif (facultatif)").fill("Samedi plutôt, au calme");
    await dialog.screenshot({ path: SHOTS + "propose-again.png" });
    await dialog.getByRole("button", { name: "Envoyer le changement" }).click();
    await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    const call = f.calls.find((c) => c.action === "propose_change");
    assert.deepEqual(Object.keys(call.data).sort(), ["id", "note", "planned_date", "revision"]);
    assert.equal(call.data.planned_date, next);
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});

test("after a revocation: the athlete leaves the queue and her dossier is no longer readable", async () => {
  const f = await fixture({ stage: "revoked" }), { page } = f;
  try {
    await page.locator("[data-queue-row]").first().waitFor();
    assert.equal(await page.locator("[data-queue-row]").filter({ hasText: "Inès" }).count(), 0);
    assert.equal(await page.locator("[data-queue-row]").count(), FX.queue_revoked.rows.length);
    assert.equal(await page.locator(".co-person, [data-co-card]").filter({ hasText: "Inès" }).count(), 0, "nothing of Inès is left on the coach's side");
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});

test("closed flag: no queue, no follow-up request, the existing proposals stay as before", async () => {
  const f = await fixture({ flag: false }), { page } = f;
  try {
    await page.locator(".co-task").first().waitFor();
    await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
    assert.equal(await page.locator("[data-co-queue]").count(), 0);
    assert.equal(await page.locator("[data-co-follow]").count(), 0);
    assert.equal(f.calls.filter((c) => c.fn === "followup").length, 0);
    await page.evaluate(() => { window.followFlag = true; window.dispatchEvent(new Event("titan:flags-updated")); });
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});
