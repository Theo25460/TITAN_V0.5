// V1.9.4 — Programmation multi-semaines on the website, coach and athlete. Real UI, server answers replayed from
// tests/fixtures/coach-program.json (printed by tools/db/coach-program/fixtures.sql on PostgreSQL 16). Synthetic accounts only.
// Every answer waits LATENCY ms, as a network would. Screenshots: docs/v194/*.png.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, readFileSync } from "node:fs";
import { before, after, test } from "node:test";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
const FX = JSON.parse(readFileSync(ROOT + "tests/fixtures/coach-program.json", "utf8"));
const COACH = FX.snapshot.owner;
const INES = FX.snapshot_ines.owner;
const LINK = Object.fromEntries(FX.snapshot.links.map((l) => [l.athlete_name, l.id]));
const SHOTS = ROOT + "docs/v194/";
const LATENCY = 120;
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

// stage: which recorded state of the server answers (start, sent, answered, aged, changes, paused).
async function fixture({ width = 1280, as = "coach", stage = "start", flag = true, scale = 1, drop = [] } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1100 }, deviceScaleFactor: scale, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const calls = [], errors = [];
  const state = { stage, created: 0, applied: 0, dropped: new Set() };
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/js/app/coaching.js?*", (r) => r.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto(BASE + "/coaching");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready");
  await page.evaluate(({ me, flag }) => {
    window.state.user.id = me;
    window.titanClient = {
      auth: { getSession: async () => ({ data: { session: { user: { id: window.state.user.id }, access_token: "fixture" } } }) },
      rpc: async (fn, args) => { const r = await fetch(`${window.TITAN_SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args) }); const data = await r.json(); return { data: r.ok ? data : null, error: r.ok ? null : { message: data.message || "UNAVAILABLE" } }; },
    };
    const old = window.titanFlags.enabled;
    window.titanFlags.enabled = (k, f) => (k === "screens.coach_programs" ? flag : ["screens.coach_followup", "screens.coach_review", "screens.coachtools"].includes(k) ? true : k === "screens.coach_feedback" ? false : old(k, f));
  }, { me: as === "coach" ? COACH : INES, flag });
  const json = async (route, body, status = 200) => { await new Promise((r) => setTimeout(r, LATENCY)); return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }).catch(() => {}); };
  const lose = async (route, what) => { if (drop.includes(what) && !state.dropped.has(what)) { state.dropped.add(what); await new Promise((r) => setTimeout(r, LATENCY)); await route.abort("connectionreset"); return true; } return false; };
  const snapshot = () => as === "coach" ? (state.stage === "paused" ? FX.snapshot_paused : FX.snapshot) : state.stage === "paused" ? FX.snapshot_ines_paused : FX.snapshot_ines;
  await page.route("**/rest/v1/rpc/titan_coach_portal", async (route) => {
    const { p_action: action, p_data: data } = route.request().postDataJSON();
    calls.push({ fn: "portal", action, data });
    if (action === "snapshot") return json(route, snapshot());
    if (action === "sessions") return json(route, { owner: as === "coach" ? COACH : INES, link_id: data.link_id, revision: snapshot().links.find((l) => l.id === data.link_id)?.revision ?? 1, rows: [], total: 0, offset: 0 });
    if (action === "assignments") return json(route, data.link_id === LINK["Inès"] && state.stage !== "start" ? FX.assignments_sent : { link_id: data.link_id, revision: snapshot().links.find((l) => l.id === data.link_id)?.revision ?? 1, total: 0, offset: 0, rows: [] });
    return json(route, {});
  });
  await page.route("**/rest/v1/rpc/titan_coach_followup_v1", async (route) => {
    const { p_action: action, p_data: data } = route.request().postDataJSON();
    calls.push({ fn: "followup", action, data });
    if (action === "queue") return json(route, ["answered"].includes(state.stage) ? FX.queue_discuss : { owner: COACH, today: FX.plan_answered.today, counts: { wait: 0, gap: 0, suggest: 0 }, athletes: [], paused: 0, rows: [] });
    if (action === "list") return json(route, { link_id: data.link_id, revision: 1, role: as, total: 0, offset: 0, rows: [] });
    return json(route, {});
  });
  await page.route("**/rest/v1/rpc/titan_coach_review_v1", async (route) => {
    calls.push({ fn: "review" });
    return state.stage === "answered" ? json(route, FX.review_discuss) : json(route, { message: "FEATURE_DISABLED" }, 400);
  });
  await page.route("**/rest/v1/rpc/titan_coach_program_v1", async (route) => {
    const { p_action: action, p_data: data } = route.request().postDataJSON();
    calls.push({ fn: "program", action, data });
    if (!flag) return json(route, { message: "FEATURE_DISABLED" }, 400);
    if (action === "library") return json(route, FX.library);
    if (action === "link") {
      if (as === "coach") {
        if (data.link_id !== LINK["Inès"]) return json(route, { link_id: data.link_id, role: "coach", plans: [] });
        if (state.stage === "paused") return json(route, { message: FX.paused_error }, 400);
        return json(route, { start: FX.link_empty, draft: FX.link_draft, sent: FX.link_sent, answered: FX.link_answered, aged: FX.link_aged, revised: FX.link_aged }[state.stage]);
      }
      return json(route, { sent: FX.link_ines_sent, changes: FX.link_ines_changes, paused: FX.link_ines_paused, answered: FX.link_ines_changes }[state.stage] || FX.link_ines_sent);
    }
    if (action === "plan") {
      if (as === "athlete") return json(route, { sent: FX.athlete_sent, changes: FX.athlete_changes, paused: FX.athlete_paused }[state.stage].plans[0]);
      return json(route, { answered: FX.plan_answered, aged: FX.plan_aged, sent: FX.send.plan, revised: FX.plan_week }[state.stage] || FX.plan_answered);
    }
    if (action === "adapt") { state.stage = "draft"; return json(route, FX.adapt); }
    if (action === "edit") return json(route, FX.edit);
    if (action === "send") {
      if (data.revision !== FX.edit.plan.revision) return json(route, { message: "COACH_CONFLICT" }, 400);
      if (state.created === 0) { state.created = 1; state.stage = "sent"; if (await lose(route, "send")) return; return json(route, FX.send); }
      return json(route, FX.send_again);
    }
    if (action === "revise") {
      if (data.dry_run) return json(route, data.scope === "occurrence" ? FX.dry_occurrence : FX.dry_week);
      const dry = data.scope === "occurrence" ? FX.dry_occurrence : FX.dry_week;
      if (data.preview_key !== dry.preview_key) return json(route, { message: "COACH_CONFLICT" }, 400);
      if (state.applied === 0) { state.applied = 1; state.op = data.op_id; if (await lose(route, "revise")) return; return json(route, data.scope === "occurrence" ? FX.revise_occurrence : FX.revise_week); }
      return json(route, data.op_id === state.op ? FX.revise_week_again : { message: "COACH_CONFLICT" }, data.op_id === state.op ? 200 : 400);
    }
    if (action === "answer") { state.answered = data; return json(route, data.all ? FX.answer_all : data.decisions.some((d) => d.answer.includes("change") || d.answer === "keep_version") ? FX.answer_changes : FX.answer); }
    return json(route, {});
  });
  await page.route("**/rest/v1/rpc/titan_coach_checkins_v1", (route) => json(route, { rows: [] }));
  await page.route("**/rest/v1/rpc/titan_coach_templates_v1", (route) => json(route, []));
  await page.route("**/rest/v1/rpc/titan_coach_messages_v1", (route) => json(route, { rows: [], more: false }));
  await page.route("**/rest/v1/rpc/titan_coach_messages_read_v1", (route) => json(route, 0));
  await page.addScriptTag({ path: ROOT + "/js/app/coaching.js" });
  return { page, context, calls, errors, state };
}

async function audit(page, selector) {
  await page.addScriptTag({ content: readFileSync(ROOT + "/node_modules/axe-core/axe.min.js", "utf8") });
  const v = await page.evaluate(async (selector) => (await axe.run(document.querySelector(selector), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target).join(", ")}`), selector);
  assert.deepEqual(v, []);
}
const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const openIness = async (page) => {
  await page.locator('[data-mode="coach"]').click();
  await page.locator(`[data-link="${LINK["Inès"]}"]`).click();
  await page.locator("[data-cp]").waitFor();
};
const sheetWith = (page, sel) => page.locator("dialog[open]").filter({ has: page.locator(sel) });

test("the coach prepares four weeks from a template, adapts them for Inès, previews what differs, sends once even when the answer is lost", async () => {
  for (const width of [390, 1280]) {
    const { page, context, calls, state, errors } = await fixture({ width, scale: width === 390 ? 2 : 1, drop: ["send"] });
    try {
      await openIness(page);
      const section = page.locator("[data-cp]");
      await section.locator("[data-cp-empty]").waitFor();
      assert.match(await section.locator("[data-cp-library] summary").innerText(), /Mes modèles multi-semaines \(1\)/);
      await section.getByRole("button", { name: "Préparer un programme" }).click();
      let dialog = page.locator("dialog[open]");
      assert.equal(await dialog.getByLabel("Partir du modèle").inputValue(), FX.library.programs[0].id);
      await dialog.getByLabel("Premier lundi du cycle").selectOption(FX.adapt.plan.start_date);
      await dialog.getByRole("button", { name: "Créer le brouillon" }).click();
      dialog = sheetWith(page, "[data-cp-rows]");
      await dialog.waitFor();
      assert.equal(await dialog.locator("[data-cp-row]").count(), 12, "the twelve sessions of the template");
      assert.equal(state.created, 0, "nothing is sent while preparing");
      // Adapted for Inès: no Thursday in week 1; week 2 on Monday and Sunday, core work instead of the Thursday.
      await dialog.getByLabel("Nom du programme").fill("Course et renforcement — Inès");
      await dialog.locator('[data-cp-row][data-key="w1-thu"] [data-cp-remove]').click();
      await dialog.locator('[data-cp-row][data-key="w2-tue"] [name=day]').selectOption("1");
      const thu = dialog.locator('[data-cp-row][data-key="w2-thu"]');
      await thu.locator("[name=day]").selectOption("7");
      await thu.locator("[name=title]").fill("Gainage 20 min");
      await thu.locator("[name=instructions]").fill("Planche, gainage latéral");
      await dialog.locator('[data-cp-row][data-key="w2-sat"] [name=day]').selectOption("7");
      await dialog.getByRole("button", { name: "Voir l’aperçu" }).click();
      dialog = sheetWith(page, "[data-cp-preview]");
      await dialog.waitFor();
      const edit = calls.filter((c) => c.fn === "program" && c.action === "edit").at(-1).data;
      assert.equal(edit.revision, 1, "the edit names the revision it read");
      assert.equal(edit.sessions.length, 11);
      assert.deepEqual(edit.sessions.find((s) => s.key === "w2-thu"), { key: "w2-thu", week: 2, day: 7, title: "Gainage 20 min", sport: "muscu_home", instructions: "Planche, gainage latéral" });
      assert.deepEqual(await dialog.locator("[data-cp-changes] tbody tr").evaluateAll((r) => r.map((x) => `${x.dataset.key}:${x.dataset.kind}`)),
        ["w1-thu:removed", "w2-tue:changed", "w2-sat:changed", "w2-thu:changed", "w2-thu:changed", "w2-thu:changed"]);
      assert.equal(await dialog.locator("[data-cp-receive] [data-cp-session]").count(), 11);
      if (width === 390) await dialog.screenshot({ path: SHOTS + "draft-preview.png" });
      await audit(page, "dialog[open]");
      // The first send reaches the server but its answer is lost: the sheet keeps an error; the retry is answered « déjà envoyé ».
      await dialog.getByRole("button", { name: "Envoyer à Inès" }).click();
      await dialog.locator("[data-cp-error]").filter({ hasText: /La demande n’a pas été confirmée|Hors ligne/ }).waitFor();
      await dialog.getByRole("button", { name: "Envoyer à Inès" }).click();
      await page.getByText("Déjà envoyé", { exact: true }).waitFor();
      const sends = calls.filter((c) => c.fn === "program" && c.action === "send").map((c) => c.data);
      assert.deepEqual(sends, [{ id: FX.edit.plan.id, revision: 2 }, { id: FX.edit.plan.id, revision: 2 }], "the retry sends the same draft and revision");
      assert.equal(state.created, 1, "one set of proposals");
      await section.locator(`[data-cp-plan="${FX.send.plan.id}"][data-state="sent"]`).waitFor();
      assert.equal(await section.locator("[data-cp-summary]").innerText(), "11 en attente de réponse");
      assert.ok(await noHorizontalScroll(page), "no horizontal scroll at " + width);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("the coach sees which sessions were accepted; the case to discuss is in the queue and the review; one occurrence is replaced", async () => {
  const { page, context, calls, errors } = await fixture({ width: 1280, stage: "answered" });
  try {
    await openIness(page);
    const section = page.locator("[data-cp]");
    await section.locator("[data-cp-summary]").filter({ hasText: "9 acceptées · 1 à discuter · 1 déclinée" }).waitFor();
    const q = page.locator('[data-co-queue] [data-queue-row]').filter({ has: page.locator('[data-state="to_discuss"]') });
    await q.waitFor();
    assert.equal(await q.locator("[data-plan-line]").innerText(), "Programme « Course et renforcement — Inès » · semaine 3 sur 4");
    const card = page.locator("[data-rv-card]").filter({ has: page.locator("strong", { hasText: /^Inès$/ }) });
    assert.match(await card.locator("[data-rv-dossier]").innerText(), /^Le sportif souhaite en discuter : « Je préfère des côtes ce samedi-là »/);
    assert.equal(await card.locator("[data-rv-plan]").innerText(), "Programme « Course et renforcement — Inès » · semaine 3 sur 4");
    await section.getByRole("button", { name: "Ouvrir le programme" }).click();
    let dialog = sheetWith(page, "[data-cp-detail]");
    await dialog.waitFor();
    const w3 = dialog.locator('[data-cp-session="w3-sat"]');
    assert.equal(await w3.getAttribute("data-state"), "to_discuss");
    assert.match(await w3.innerText(), /À discuter/);
    assert.equal(await dialog.locator('[data-cp-session="w4-thu"] .asc-chip').innerText(), "Déclinée");
    assert.equal(await dialog.locator("[data-cp-versions] li").count(), 1);
    await dialog.screenshot({ path: SHOTS + "plan-answered.png" });
    await audit(page, "dialog[open]");
    await w3.getByRole("button", { name: "Réviser cette séance" }).click();
    dialog = page.locator("dialog[open]").filter({ has: page.getByLabel("Consignes") });
    await dialog.getByLabel("Séance").fill("Sortie 10 km avec côtes");
    await dialog.getByLabel("Consignes").fill("6 côtes de 200 m au milieu");
    await dialog.getByLabel("Un mot pour Inès (facultatif)").fill("Côtes comme demandé");
    await dialog.getByRole("button", { name: "Voir l’aperçu" }).click();
    dialog = sheetWith(page, "[data-cp-revision]");
    await dialog.waitFor();
    assert.equal(await dialog.locator('[data-cp-effect="updated"] .asc-chip').innerText(), "Mise à jour");
    assert.equal(calls.filter((c) => c.action === "revise" && !c.data.dry_run).length, 0, "the preview writes nothing");
    await dialog.getByRole("button", { name: "Appliquer" }).click();
    await page.getByText("Programme révisé · version 2").waitFor();
    const applied = calls.filter((c) => c.action === "revise" && !c.data.dry_run)[0].data;
    assert.equal(applied.preview_key, FX.dry_occurrence.preview_key);
    assert.match(applied.op_id, /^[0-9a-f-]{36}$/);
    assert.equal(applied.key, "w3-sat");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("two weeks later: week 1 is played, week 2 is shifted without replacing the session done; a lost answer replays the same revision", async () => {
  const { page, context, calls, state, errors } = await fixture({ width: 390, scale: 2, stage: "aged", drop: ["revise"] });
  try {
    await openIness(page);
    await page.locator("[data-cp]").getByRole("button", { name: "Ouvrir le programme" }).click();
    let dialog = sheetWith(page, "[data-cp-detail]");
    await dialog.waitFor();
    assert.equal(await dialog.locator('[data-cp-week="1"]').getAttribute("data-week-state"), "played");
    assert.equal(await dialog.locator('[data-cp-week="1"] [data-cp-shift]').count(), 0, "a played week is not revised");
    assert.equal(await dialog.locator('[data-cp-week="2"]').getAttribute("data-week-state"), "current");
    assert.equal(await dialog.locator('[data-cp-session="w1-tue"] .asc-chip').innerText(), "Liée");
    assert.equal(await dialog.locator('[data-cp-session="w2-tue"] [data-cp-revise-one]').count(), 0, "a session done is never revised");
    await dialog.locator('[data-cp-week="2"] [data-cp-shift="week"]').click();
    dialog = page.locator("dialog[open]").filter({ has: page.getByLabel("Décaler de") });
    await dialog.getByLabel("Décaler de").selectOption("2");
    await dialog.getByLabel("Un mot pour Inès (facultatif)").fill("Déplacement pro dimanche");
    await dialog.getByRole("button", { name: "Voir l’aperçu" }).click();
    dialog = sheetWith(page, "[data-cp-revision]");
    await dialog.waitFor();
    assert.equal(await dialog.locator("h2").innerText(), "La semaine 2 est décalée de 2 jours plus tard");
    assert.deepEqual(await dialog.locator("[data-cp-effect]").evaluateAll((n) => n.map((x) => `${x.dataset.key}:${x.dataset.cpEffect}`)), ["w2-tue:kept_done", "w2-sat:change_proposed", "w2-thu:change_proposed"]);
    assert.equal(await dialog.locator('[data-cp-effect="kept_done"] p').innerText(), "Faite et liée à une séance : conservée telle quelle.");
    await dialog.screenshot({ path: SHOTS + "shift-week-preview.png" });
    await audit(page, "dialog[open]");
    await dialog.getByRole("button", { name: "Appliquer" }).click();
    await dialog.locator("[data-cp-error]").filter({ hasText: /La demande n’a pas été confirmée|Hors ligne/ }).waitFor();
    await dialog.getByRole("button", { name: "Appliquer" }).click();
    await page.getByText("Déjà appliquée").waitFor();
    const applied = calls.filter((c) => c.action === "revise" && !c.data.dry_run).map((c) => c.data);
    assert.equal(applied.length, 2);
    assert.equal(applied[0].op_id, applied[1].op_id, "the retry carries the same op_id");
    assert.equal(state.applied, 1, "one revision applied");
    assert.ok(await noHorizontalScroll(page));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("Inès answers session by session (accept, decline, to discuss), then accepts one change and keeps her version of another", async () => {
  let f = await fixture({ width: 390, scale: 2, as: "athlete", stage: "sent" });
  try {
    const section = f.page.locator("[data-cp]");
    await section.locator("[data-cp-todo]").filter({ hasText: "11 séance(s) à décider" }).waitFor();
    await section.getByRole("button", { name: "Ouvrir le programme" }).click();
    const dialog = sheetWith(f.page, "[data-cp-answers]");
    await dialog.waitFor();
    assert.equal(await dialog.locator("[data-cp-answer]").count(), 11);
    for (const key of FX.athlete_sent.plans[0].sessions.map((s) => s.key)) {
      const v = key === "w3-sat" ? "discuss" : key === "w4-thu" ? "decline" : "accept";
      await dialog.locator(`[data-cp-answer="${key}"] input[value="${v}"]`).check();
    }
    await dialog.locator('[data-cp-answer="w3-sat"] [data-cp-note] input').fill("Je préfère des côtes ce samedi-là");
    await dialog.screenshot({ path: SHOTS + "athlete-answers.png" });
    await audit(f.page, "dialog[open]");
    await dialog.getByRole("button", { name: "Envoyer mes réponses" }).click();
    await f.page.getByText("Réponses envoyées").waitFor();
    const d = f.state.answered.decisions;
    assert.equal(d.length, 11);
    assert.deepEqual(d.find((x) => x.key === "w3-sat"), { key: "w3-sat", answer: "discuss", note: "Je préfère des côtes ce samedi-là" });
    assert.deepEqual(d.find((x) => x.key === "w4-thu"), { key: "w4-thu", answer: "decline" });
    assert.equal(f.calls.filter((c) => c.fn === "portal" && !["snapshot", "sessions", "assignments"].includes(c.action)).length, 0, "nothing else is written");
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
  f = await fixture({ width: 1280, as: "athlete", stage: "changes" });
  try {
    await f.page.locator("[data-cp]").getByRole("button", { name: "Ouvrir le programme" }).click();
    const dialog = sheetWith(f.page, "[data-cp-answers]");
    await dialog.waitFor();
    assert.equal(await dialog.locator("[data-cp-answer]").count(), 2, "the two changes waiting");
    assert.match(await dialog.locator('[data-cp-session="w2-thu"] [data-cp-change]').innerText(), /Changement en attente de ta réponse[\s\S]*Date/);
    await dialog.locator('[data-cp-answer="w2-thu"] input[value="accept_change"]').check();
    await dialog.locator('[data-cp-answer="w2-sat"] input[value="keep_version"]').check();
    await dialog.getByRole("button", { name: "Envoyer mes réponses" }).click();
    await f.page.getByText("Réponses envoyées").waitFor();
    assert.deepEqual(f.state.answered.decisions.map((x) => `${x.key}:${x.answer}`).sort(), ["w2-sat:keep_version", "w2-thu:accept_change"]);
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});

test("paused by the places of the offer: the athlete reads her programme and her own session, the coach reads nothing; flag closed: no call", async () => {
  let f = await fixture({ width: 1280, as: "athlete", stage: "paused" });
  try {
    const section = f.page.locator("[data-cp]");
    await section.locator("[data-cp-readonly]").filter({ hasText: "Suivi en pause : lecture seule, rien n’est supprimé." }).waitFor();
    await section.getByRole("button", { name: "Ouvrir le programme" }).click();
    const dialog = sheetWith(f.page, "[data-cp-detail]");
    await dialog.waitFor();
    assert.equal(await dialog.locator("[data-cp-answers]").count(), 0, "nothing to answer while paused");
    assert.equal(await dialog.locator('[data-cp-session="w1-tue"]').getAttribute("data-state"), "linked");
    assert.match(await dialog.locator('[data-cp-session="w1-tue"]').innerText(), /Reliée à ta séance du/);
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
  f = await fixture({ width: 1280, stage: "paused" });
  try {
    await f.page.locator('[data-mode="coach"]').click();
    await f.page.locator(`[data-link="${LINK["Inès"]}"]`).click();
    const section = f.page.locator("[data-cp]");
    await section.locator(".asc-note.err").filter({ hasText: "Ce suivi est en pause faute de place dans l’offre du coach" }).waitFor();
    assert.equal(await section.getByRole("button", { name: "Préparer un programme" }).count(), 0);
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
  f = await fixture({ width: 1280, flag: false, stage: "sent" });
  try {
    await f.page.locator('[data-mode="coach"]').click();
    await f.page.locator(`[data-link="${LINK["Inès"]}"]`).click();
    await f.page.locator("[data-co-card]").waitFor();
    await f.page.waitForTimeout(400);
    assert.equal(await f.page.locator("[data-cp]").count(), 0);
    assert.equal(f.calls.filter((c) => c.fn === "program").length, 0, "flag closed: no call");
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});
