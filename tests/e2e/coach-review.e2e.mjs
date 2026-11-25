// V1.9.3 — Revue de suivi, coach on the website. Real UI, server answers replayed from tests/fixtures/coach-review.json (printed by
// tools/db/coach-review/fixtures.sql on PostgreSQL 16). Synthetic accounts only. Every answer waits LATENCY ms, as a network would.
// Screenshots: docs/v193/*.png. The « before / after » timing of the same scenario is written to docs/v193/measure.json.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { before, after, test } from "node:test";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
const FX = JSON.parse(readFileSync(ROOT + "tests/fixtures/coach-review.json", "utf8"));
const COACH = FX.snapshot.owner;
const WEEK = FX.week_all.week;
const LINK = Object.fromEntries(FX.snapshot.links.map((l) => [l.athlete_name, l.id]));
const SHOTS = ROOT + "docs/v193/";
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

async function fixture({ width = 1280, review = true, scale = 1, dropFirstSend = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1100 }, deviceScaleFactor: scale, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const calls = [], errors = [];
  // The server's state as the fixtures recorded it, step by step.
  const state = { stage: "start", sends: 0, created: 0, assigned: 0 };
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/js/app/coaching.js?*", (r) => r.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto(BASE + "/coaching");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready");
  await page.evaluate(({ me, review }) => {
    window.state.user.id = me;
    window.titanClient = {
      auth: { getSession: async () => ({ data: { session: { user: { id: window.state.user.id }, access_token: "fixture" } } }) },
      rpc: async (fn, args) => { const r = await fetch(`${window.TITAN_SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args) }); return { data: await r.json(), error: r.ok ? null : { message: "UNAVAILABLE" } }; },
    };
    const old = window.titanFlags.enabled;
    window.rvFlag = review;
    window.titanFlags.enabled = (k, f) => (k === "screens.coach_review" ? window.rvFlag : ["screens.coach_followup", "screens.coach_feedback", "screens.coachtools"].includes(k) ? true : old(k, f));
  }, { me: COACH, review });
  const json = async (route, body, status = 200) => { await new Promise((r) => setTimeout(r, LATENCY)); return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }).catch(() => {}); };
  const paused = (id) => FX.snapshot.links.find((l) => l.id === id)?.paused;
  const live = () => state.stage === "revoked" ? FX.snapshot.links.filter((l) => l.id !== LINK["Noé"]).map((l) => (l.id === LINK["Paul"] ? { ...l, paused: false } : l)) : FX.snapshot.links;
  await page.route("**/rest/v1/rpc/titan_coach_portal", async (route) => {
    const { p_action: action, p_data: data } = route.request().postDataJSON();
    calls.push({ fn: "portal", action, data });
    if (action === "snapshot") return json(route, { ...FX.snapshot, links: live() });
    if (paused(data.link_id) && ["sessions", "assignments"].includes(action)) return json(route, { message: "COACH_CAPACITY_PAUSED" }, 400);
    if (action === "sessions") return json(route, { owner: COACH, link_id: data.link_id, revision: 1, rows: [], total: 0, offset: 0, from_date: data.from_date, to_date: data.to_date });
    if (action === "assignments") return json(route, FX["assignments:" + data.link_id] || { link_id: data.link_id, revision: 1, total: 0, offset: 0, rows: [] });
    if (action === "assign") { state.assigned++; return json(route, { id: FX.send.assignment.id, link_id: data.link_id, title: data.title, sport: data.sport, planned_date: data.planned_date, status: "proposed", revision: 1 }); }
    return json(route, {});
  });
  await page.route("**/rest/v1/rpc/titan_coach_followup_v1", async (route) => {
    const { p_action: action, p_data: data } = route.request().postDataJSON();
    calls.push({ fn: "followup", action, data });
    if (action === "queue") return json(route, FX.queue);
    if (action === "list") return json(route, FX["list:" + data.link_id] || { message: "COACH_CAPACITY_PAUSED" }, FX["list:" + data.link_id] ? 200 : 400);
    if (action === "detail") return json(route, data.id === FX.send.assignment.id ? FX.detail_sent : Object.keys(FX).filter((k) => k.startsWith("list:")).flatMap((k) => FX[k].rows).find((r) => r.id === data.id));
    return json(route, {});
  });
  await page.route("**/rest/v1/rpc/titan_coach_feedback_v1", async (route) => {
    const { p_action: action, p_data: data } = route.request().postDataJSON();
    calls.push({ fn: "feedback", action, data });
    if (action === "list") return json(route, FX["feedback:" + data.link_id] || { link_id: data.link_id, role: "coach", rows: [] });
    return json(route, { message: "UNAVAILABLE" }, 400);
  });
  await page.route("**/rest/v1/rpc/titan_coach_review_v1", async (route) => {
    const { p_action: action, p_data: data } = route.request().postDataJSON();
    calls.push({ fn: "review", action, data });
    if (!review) return json(route, { message: "FEATURE_DISABLED" }, 400);
    if (action === "week") {
      if (data.week && data.week > WEEK) return json(route, FX.week_next);
      if (data.week && data.week < WEEK) return json(route, FX.week_previous);
      const w = { start: data.filter === "all" ? FX.week_all : FX.week_actionable, draft: FX.week_resume, revoked: FX.week_revoked, sent: FX.week_sent }[state.stage] || FX.week_all;
      return json(route, data.filter === "all" || state.stage !== "start" ? { ...w, filter: data.filter, cards: data.filter === "all" ? w.cards : w.cards.filter((c) => c.actionable || c.next === "paused") } : w);
    }
    if (action === "prepare") {
      if (data.link_id === LINK["Noé"]) { state.noe = true; return json(route, FX.prep_noe); }
      if (data.revision) { state.stage = "draft"; state.revision = FX.prep2.draft.revision; return json(route, FX.prep2); }
      if (state.stage === "draft") return json(route, FX.resumed);
      state.stage = "draft"; state.revision = FX.prep1.draft.revision;
      return json(route, FX.prep1);
    }
    if (action === "send") {
      if (data.id === FX.prep_noe.draft.id) { state.stage = "revoked"; return json(route, { message: FX.send_revoked }, 400); }
      state.sends++;
      if (data.revision !== state.revision) return json(route, { message: "COACH_CONFLICT" }, 400);
      if (state.sends === 1) { state.created++; state.stage = "sent"; if (dropFirstSend) { await new Promise((r) => setTimeout(r, LATENCY)); return route.abort("connectionreset"); } return json(route, FX.send); }
      return json(route, FX.send_again);
    }
    return json(route, {});
  });
  await page.route("**/rest/v1/rpc/titan_coach_checkins_v1", (route) => { const { p_link } = route.request().postDataJSON(); calls.push({ fn: "checkins", link: p_link }); return json(route, FX["checkins:" + p_link] || { rows: [] }); });
  await page.route("**/rest/v1/rpc/titan_coach_templates_v1", (route) => { calls.push({ fn: "templates" }); return json(route, FX.templates); });
  await page.route("**/rest/v1/rpc/titan_coach_messages_v1", (route) => json(route, { rows: [], more: false }));
  await page.route("**/rest/v1/rpc/titan_coach_messages_read_v1", (route) => json(route, 0));
  await page.route("**/rest/v1/rpc/titan_coach_template*", (route) => route.fallback());
  await page.addScriptTag({ path: ROOT + "/js/app/coaching.js" });
  return { page, context, calls, errors, state };
}

async function audit(page, selector) {
  await page.addScriptTag({ content: readFileSync(ROOT + "/node_modules/axe-core/axe.min.js", "utf8") });
  const v = await page.evaluate(async (selector) => (await axe.run(document.querySelector(selector), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target).join(", ")}`), selector);
  assert.deepEqual(v, []);
}
const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const rvCard = (page, name) => page.locator("[data-rv-card]").filter({ has: page.locator("strong", { hasText: new RegExp(`^${name}$`) }) });
const futureDay = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

test("Monday review: for each athlete the case, the next action and its source; paused links named; all athletes on demand", async () => {
  for (const width of [390, 1280]) {
    const { page, context, errors } = await fixture({ width, scale: width === 390 ? 2 : 1 });
    try {
      await page.locator('[data-mode="coach"]').click();
      const section = page.locator("[data-co-review]");
      await section.locator("[data-rv-list]").waitFor();
      assert.equal(await section.locator("[data-rv-status]").innerText(), "2 réponses attendues · 1 retour à laisser · 2 suites à préparer · 2 suivis en pause");
      assert.deepEqual(await section.locator("[data-rv-card]").evaluateAll((n) => n.map((x) => x.dataset.rvNext)), ["feedback", "prepare", "prepare"], "only what the coach can act on");
      const lina = rvCard(page, "Lina");
      assert.match(await lina.locator("[data-rv-dossier]").innerText(), /^Séance « Footing 8 km » faite le .+, liée par le sportif, sans retour pour l’instant\.$/);
      assert.match(await lina.locator("[data-rv-source]").innerText(), /^Source · Séance liée du .+ · proposition « Footing 8 km »$/);
      assert.equal(await lina.getByRole("button", { name: "Laisser un retour" }).count(), 1);
      const zoe = rvCard(page, "Zoé");
      assert.match(await zoe.locator("[data-rv-checkin]").innerText(), /Check-in partagé · Semaine du .+ · Fatigue 2\/5 · Énergie 4\/5 · Sommeil 4\/5 · Motivation 5\/5/);
      assert.match(await zoe.locator("[data-rv-source]").innerText(), /Proposition « Sortie longue 10 km » du /);
      assert.equal(await rvCard(page, "Noé").locator("[data-rv-source]").innerText(), "Source · Dossier vide : aucune proposition ni séance liée pour l’instant");
      assert.match(await section.locator("[data-rv-paused]").innerText(), /En pause, faute de place dans ton offre : Léa, Paul\. Rien n’est lu ni envoyé/);
      assert.equal(await section.getByText("Semaine très dure").count(), 0, "an unshared check-in is never shown");
      assert.equal(await section.locator("[data-rv-week-label]").textContent(), await page.evaluate((w) => window.TitanCoachReview.weekLabel(w), WEEK));
      if (width === 390) await section.screenshot({ path: SHOTS + "review-week.png" });
      await audit(page, "[data-co-review]");
      assert.ok(await noHorizontalScroll(page), "no horizontal scroll at " + width);
      await section.getByRole("button", { name: /^Tous les sportifs · 7$/ }).click();
      await page.waitForFunction(() => document.querySelectorAll("[data-rv-card]").length === 5);
      assert.equal(await rvCard(page, "Inès").locator("[data-rv-dossier]").innerText(), "« Footing 45 min » attend sa réponse.");
      assert.equal(await rvCard(page, "Malo").locator("[data-rv-dossier]").innerText(), "Changement proposé sur « Fractionné 6 × 400 m » : le sportif décide.");
      assert.equal(await rvCard(page, "Inès").locator("[data-rv-checkin]").count(), 0);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("prepare from a template, preview the change, interrupted and resumed, sent once even when the first answer is lost", async () => {
  const { page, context, calls, state, errors } = await fixture({ width: 390, scale: 2, dropFirstSend: true });
  try {
    await page.locator('[data-mode="coach"]').click();
    await rvCard(page, "Zoé").getByRole("button", { name: "Préparer la suite" }).click();
    let dialog = page.locator("dialog[open]");
    await dialog.getByLabel("Partir de").waitFor();
    assert.equal(await dialog.getByLabel("Partir de").inputValue(), `template:${FX.templates[0].id}`, "an existing template is the default basis");
    assert.equal(await dialog.getByLabel("Nom").inputValue(), FX.templates[0].title);
    assert.match(await dialog.locator("[data-rv-prepare-source]").innerText(), /Source · Proposition « Sortie longue 10 km »/);
    await dialog.getByLabel("Date prévue").fill(FX.prep1.draft.content.planned_date);
    await dialog.getByRole("button", { name: "Voir l’aperçu" }).click();
    dialog = page.locator("dialog[open]").filter({ has: page.locator("[data-rv-preview]") });
    await dialog.waitFor();
    assert.equal(state.created, 0, "nothing is sent while preparing");
    assert.deepEqual(await dialog.locator("[data-rv-changes] tbody th").allInnerTexts(), ["Date prévue"]);
    // The coach adapts the instructions; the preview shows before and after.
    await dialog.getByRole("button", { name: "Modifier" }).click();
    dialog = page.locator("dialog[open]").filter({ has: page.getByLabel("Consignes") });
    await dialog.getByLabel("Consignes").fill(FX.prep2.draft.content.instructions);
    await dialog.getByRole("button", { name: "Voir l’aperçu" }).click();
    dialog = page.locator("dialog[open]").filter({ has: page.locator("[data-rv-preview]") });
    await dialog.locator('[data-rv-changes] tr[data-field="instructions"]').waitFor();
    const edit = calls.filter((c) => c.fn === "review" && c.action === "prepare").at(-1).data;
    assert.equal(edit.revision, 1, "the edit names the revision it read");
    assert.equal(edit.template_id, undefined, "the basis is kept");
    assert.match(await dialog.locator('[data-rv-changes] tr[data-field="instructions"]').innerText(), /récupération 2 min[\s\S]*récupération 3 min/);
    await dialog.screenshot({ path: SHOTS + "prepare-preview.png" });
    await audit(page, "dialog[open]");
    // Interruption: the coach closes the sheet and reloads; the review says « Reprendre » and the same draft comes back.
    await dialog.locator("[data-cancel]").click();
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    const zoe = rvCard(page, "Zoé");
    await zoe.getByRole("button", { name: "Reprendre la proposition préparée" }).waitFor();
    assert.match(await zoe.locator("[data-rv-source]").innerText(), /Proposition préparée le .+ à partir de « Seuil 3 × 8 min »/);
    await zoe.getByRole("button", { name: "Reprendre la proposition préparée" }).click();
    dialog = page.locator("dialog[open]").filter({ has: page.locator(`[data-rv-preview="${FX.prep2.draft.id}"]`) });
    await dialog.waitFor();
    // The first send reaches the server but its answer is lost: an error, the sheet stays; the retry is answered « déjà envoyée ».
    await dialog.getByRole("button", { name: "Envoyer à Zoé" }).click();
    await dialog.locator(".jr-edit-error").filter({ hasText: /La demande n’a pas été confirmée|Hors ligne/ }).waitFor();
    await dialog.getByRole("button", { name: "Envoyer à Zoé" }).click();
    await page.getByText("Déjà envoyée").waitFor();
    assert.equal(state.created, 1, "one proposal, not two");
    assert.equal(state.sends, 2);
    const sends = calls.filter((c) => c.fn === "review" && c.action === "send").map((c) => c.data);
    assert.deepEqual(sends, [{ id: FX.prep2.draft.id, revision: 2 }, { id: FX.prep2.draft.id, revision: 2 }], "the retry sends the same draft and revision");
    // Sent: Zoé leaves the cases to handle (she decides now); « Tous les sportifs » shows what left and its state.
    await page.waitForFunction(() => !document.querySelector("[data-rv-list]")?.textContent.includes("Zoé"));
    assert.match(await page.locator("[data-co-review] [data-rv-status]").innerText(), /^3 réponses attendues/);
    await page.getByRole("button", { name: /^Tous les sportifs/ }).click();
    await rvCard(page, "Zoé").locator("[data-rv-sent]").waitFor();
    assert.match(await rvCard(page, "Zoé").locator("[data-rv-sent]").innerText(), /« Seuil 3 × 8 min » du .+ envoyée : en attente de sa réponse/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("revocation in the middle of the review: the send is refused, nothing reaches the athlete, the review follows the link", async () => {
  const { page, context, state, errors } = await fixture();
  try {
    await page.locator('[data-mode="coach"]').click();
    await rvCard(page, "Noé").getByRole("button", { name: "Préparer la suite" }).click();
    let dialog = page.locator("dialog[open]");
    await dialog.getByLabel("Date prévue").fill(FX.prep_noe.draft.content.planned_date);
    await dialog.getByRole("button", { name: "Voir l’aperçu" }).click();
    dialog = page.locator("dialog[open]").filter({ has: page.locator("[data-rv-preview]") });
    await dialog.waitFor();
    // Noé stops sharing now (another device): the send is refused with its reason.
    await dialog.getByRole("button", { name: "Envoyer à Noé" }).click();
    await dialog.locator(".jr-edit-error").filter({ hasText: "Ce partage a été arrêté ou n’est plus accessible : rien n’a été envoyé." }).waitFor();
    assert.equal(state.created, 0);
    await dialog.locator("[data-cancel]").click();
    await page.waitForFunction(() => !document.querySelector("[data-co-review]")?.textContent.includes("Noé"));
    assert.match(await page.locator("[data-co-review] [data-rv-status]").innerText(), /2 suites à préparer/);
    assert.equal(await rvCard(page, "Paul").getByRole("button", { name: "Préparer la suite" }).count(), 1, "a place freed: Paul's link resumes");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("the decision comes back the following week; change of period; flag closed: no call, no section", async () => {
  let f = await fixture();
  try {
    await f.page.locator('[data-mode="coach"]').click();
    await f.page.locator("[data-co-review] [data-rv-list]").waitFor();
    await f.page.getByRole("button", { name: /Semaine suivante/ }).click();
    await rvCard(f.page, "Zoé").locator("[data-rv-previous]").waitFor();
    assert.match(await rvCard(f.page, "Zoé").locator("[data-rv-previous]").innerText(), /^Décision sur la revue précédente · « Seuil 3 × 8 min » du .+ : acceptée$/);
    assert.equal(f.calls.filter((c) => c.fn === "review" && c.action === "week").at(-1).data.week, FX.week_next.week);
    assert.equal(await f.page.getByRole("button", { name: /Semaine suivante/ }).isDisabled(), true, "one week ahead at most");
    await f.page.getByRole("button", { name: "Cette semaine" }).click();
    await f.page.getByRole("button", { name: "Cette semaine" }).waitFor({ state: "detached" });
    await f.page.getByRole("button", { name: /Semaine précédente/ }).click();
    await f.page.waitForFunction((w) => document.querySelector("[data-rv-week-label]")?.textContent.includes(w), await f.page.evaluate((w) => window.TitanCoachReview.weekLabel(w).slice(10, 30), FX.week_previous.week));
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
  f = await fixture({ review: false });
  try {
    await f.page.locator('[data-mode="coach"]').click();
    await f.page.locator("[data-co-queue]").waitFor();
    assert.equal(await f.page.locator("[data-co-review]").count(), 0);
    assert.equal(f.calls.filter((c) => c.fn === "review").length, 0, "flag closed: no review call");
  } finally { await f.context.close(); }
});

// The pilot measure of the specification is the coach's own time. This is its automated proxy on the SAME scenario (five athletes, two
// paused links, one next proposal from a template): user actions, server calls and elapsed time with LATENCY ms per answer.
test("measure: the same scenario before (existing screens) and after (weekly review)", async () => {
  const runs = { before: [], after: [] };
  for (let i = 0; i < 3; i++) {
    // BEFORE: open each athlete, read proposals and shared check-ins, then reuse the template for Zoé.
    let f = await fixture({ review: false });
    try {
      const { page, calls } = f; let actions = 0;
      const t0 = Date.now();
      await page.locator('[data-mode="coach"]').click(); actions++;
      await page.locator("[data-co-queue] .co-queue-list").waitFor();
      for (const name of ["Inès", "Malo", "Zoé", "Noé", "Lina"]) {
        await page.locator(`[data-link="${LINK[name]}"]`).click(); actions++;
        await page.locator("[data-ct-checkins]").waitFor();
        await page.locator("[data-co-card] h3", { hasText: name }).waitFor();
        await page.waitForFunction(() => !document.querySelector(".co-detail .asc-skeleton"));
        if (name === "Zoé") {
          assert.match(await page.locator("[data-ct-checkins]").innerText(), /Fatigue 2\/5/);
          await page.locator("[data-ct-use]").first().click(); actions++;
          const dialog = page.locator("dialog[open]");
          await dialog.getByLabel("Date prévue").fill(FX.prep2.draft.content.planned_date); actions++;
          await dialog.getByLabel("Consignes").fill(FX.prep2.draft.content.instructions); actions++;
          await dialog.getByRole("button", { name: "Envoyer la proposition" }).click(); actions++;
          await dialog.waitFor({ state: "detached" });
        }
      }
      runs.before.push({ ms: Date.now() - t0, actions, calls: calls.length });
      assert.equal(f.state.assigned, 1);
    } finally { await f.context.close(); }
    // AFTER: the review shows every case with its source; the next proposal is prepared from the template, previewed and sent.
    f = await fixture();
    try {
      const { page, calls } = f; let actions = 0;
      const t0 = Date.now();
      await page.locator('[data-mode="coach"]').click(); actions++;
      await page.locator("[data-co-review] [data-rv-list]").waitFor();
      await page.getByRole("button", { name: /^Tous les sportifs/ }).click(); actions++;
      await page.waitForFunction(() => document.querySelectorAll("[data-rv-card]").length === 5);
      await rvCard(page, "Zoé").getByRole("button", { name: "Préparer la suite" }).click(); actions++;
      let dialog = page.locator("dialog[open]");
      await dialog.getByLabel("Date prévue").fill(FX.prep2.draft.content.planned_date); actions++;
      await dialog.getByLabel("Consignes").fill(FX.prep2.draft.content.instructions); actions++;
      await dialog.getByRole("button", { name: "Voir l’aperçu" }).click(); actions++;
      dialog = page.locator("dialog[open]").filter({ has: page.locator("[data-rv-preview]") });
      await dialog.getByRole("button", { name: "Envoyer à Zoé" }).click(); actions++;
      await page.getByText("Proposition envoyée").waitFor();
      runs.after.push({ ms: Date.now() - t0, actions, calls: calls.length });
      assert.equal(f.state.created, 1);
    } finally { await f.context.close(); }
  }
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const out = {
    scenario: "Coach Lou, 5 athletes followed + 2 paused links; find the case of each athlete, then send Zoé's next proposal from the template « Seuil 3 × 8 min »",
    latency_ms_per_answer: LATENCY, runs,
    before: { median_ms: median(runs.before.map((r) => r.ms)), actions: runs.before[0].actions, server_calls: runs.before[0].calls },
    after: { median_ms: median(runs.after.map((r) => r.ms)), actions: runs.after[0].actions, server_calls: runs.after[0].calls },
  };
  out.reduction_percent = Math.round((1 - out.after.median_ms / out.before.median_ms) * 100);
  writeFileSync(SHOTS + "measure.json", JSON.stringify(out, null, 1) + "\n");
  console.log(`measure: before ${out.before.median_ms} ms / ${out.before.actions} actions / ${out.before.server_calls} calls — after ${out.after.median_ms} ms / ${out.after.actions} actions / ${out.after.server_calls} calls (−${out.reduction_percent} %)`);
  assert.ok(out.after.median_ms < out.before.median_ms, "the review is faster on the same scenario");
});
