// V1.9.5 — Bilans de cycle partageables on the website, coach and athlete. Real UI, server answers replayed from
// tests/fixtures/coach-cycle.json (printed by tools/db/coach-cycle/fixtures.sql on PostgreSQL 16). Synthetic accounts only.
// Every answer waits LATENCY ms, as a network would. Screenshots: docs/v195/*.png.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, readFileSync } from "node:fs";
import { before, after, test } from "node:test";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
const FX = JSON.parse(readFileSync(ROOT + "tests/fixtures/coach-cycle.json", "utf8"));
const COACH = FX.snapshot.owner;
const INES = FX.snapshot_ines.owner;
const LINK = Object.fromEntries(FX.snapshot.links.map((l) => [l.athlete_name, l.id]));
const RID = FX.start.report.id;
const SHOTS = ROOT + "docs/v195/";
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

// stage: which recorded state of the server answers — none, draft, proposed, published, retracted, next, withdrawn, v2, revalidate, paused, revoked.
async function fixture({ width = 1280, as = "coach", stage = "none", flag = true, scale = 1, drop = [] } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1100 }, deviceScaleFactor: scale, serviceWorkers: "block", acceptDownloads: true });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const calls = [], errors = [];
  const state = { stage, dropped: new Set(), proposed: 0, validated: new Map(), next: 0 };
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
    window.titanFlags.enabled = (k, f) => (k === "screens.coach_cycle_report" ? flag : ["screens.coach_followup", "screens.coach_programs"].includes(k) ? true : ["screens.coach_feedback", "screens.coach_review", "screens.coachtools"].includes(k) ? false : old(k, f));
  }, { me: as === "coach" ? COACH : INES, flag });
  const json = async (route, body, status = 200) => { await new Promise((r) => setTimeout(r, LATENCY)); return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }).catch(() => {}); };
  const err = (route, code) => json(route, { message: code }, 400);
  const lose = async (route, what) => { if (drop.includes(what) && !state.dropped.has(what)) { state.dropped.add(what); await new Promise((r) => setTimeout(r, LATENCY)); await route.abort("connectionreset"); return true; } return false; };
  const snapshot = () => as === "coach" ? (state.stage === "paused" ? FX.snapshot_paused : FX.snapshot) : state.stage === "paused" ? FX.snapshot_ines_paused : state.stage === "revoked" ? FX.snapshot_ines_revoked : FX.snapshot_ines;
  await page.route("**/rest/v1/rpc/titan_coach_portal", async (route) => {
    const { p_action: action, p_data: data } = route.request().postDataJSON();
    calls.push({ fn: "portal", action, data });
    if (action === "snapshot") return json(route, snapshot());
    if (["sessions", "assignments"].includes(action)) return json(route, { owner: as === "coach" ? COACH : INES, link_id: data.link_id, revision: snapshot().links.find((l) => l.id === data.link_id)?.revision ?? 1, rows: [], total: 0, offset: 0 });
    return json(route, {});
  });
  await page.route("**/rest/v1/rpc/titan_coach_followup_v1", async (route) => {
    const { p_action: action, p_data: data } = route.request().postDataJSON();
    calls.push({ fn: "followup", action });
    if (action === "queue") return json(route, { owner: COACH, today: "2026-11-25", counts: { wait: 0, gap: 0, suggest: 0 }, athletes: [], paused: 0, rows: [] });
    return json(route, { link_id: data?.link_id, revision: 1, role: as, total: 0, offset: 0, rows: [] });
  });
  await page.route("**/rest/v1/rpc/titan_coach_program_v1", async (route) => {
    const { p_action: action } = route.request().postDataJSON();
    calls.push({ fn: "program", action });
    if (action === "library") return json(route, FX.program_library);
    if (action === "link") return json(route, as === "coach" ? (state.next ? FX.program_link_next : FX.program_link) : state.stage === "paused" ? err(route, "COACH_CAPACITY_PAUSED") : FX.program_link_ines);
    if (action === "athlete") return json(route, FX.program_athlete_next);
    return json(route, {});
  });
  await page.route("**/rest/v1/rpc/titan_coach_cycle_v1", async (route) => {
    const { p_action: action, p_data: data } = route.request().postDataJSON();
    calls.push({ fn: "cycle", action, data });
    if (!flag) return err(route, "FEATURE_DISABLED");
    const s = state.stage;
    if (as === "coach") {
      if (s === "paused") return err(route, "COACH_CAPACITY_PAUSED");
      if (s === "revoked") return err(route, "SHARING_UNAVAILABLE");
      if (action === "link") return json(route, { none: FX.link_none, draft: FX.link_draft, proposed: FX.link_proposed, published: FX.link_published, withdrawn: FX.link_withdrawn }[s] || FX.link_published);
      if (action === "start") { state.stage = "draft"; return json(route, FX.start); }
      if (action === "report") return json(route, { draft: FX.save.report, proposed: FX.report_proposed, published: state.next ? FX.report_next : FX.report_published, retracted: FX.report_retracted, withdrawn: FX.report_withdrawn, v2: FX.report_v2, revalidate: FX.report_revalidate }[s]);
      if (action === "save") {
        if (s === "proposed") return err(route, "INVALID_TRANSITION");
        if (data.revision !== FX.start.report.revision) return err(route, "COACH_CONFLICT");
        state.saved = data; return json(route, FX.save);
      }
      if (action === "propose") {
        if (data.revision !== FX.save.report.revision) return err(route, "COACH_CONFLICT");
        state.proposed++; state.stage = "proposed";
        if (state.proposed === 1) { if (await lose(route, "propose")) return; return json(route, FX.propose); }
        return json(route, FX.propose_again);
      }
      if (action === "export") {
        if (s === "withdrawn") return err(route, "REPORT_WITHDRAWN");
        if (s === "revalidate") return err(route, "REPORT_REVALIDATION");
        return json(route, s === "retracted" ? FX.export_coach_retracted : FX.export_coach);
      }
      if (action === "next") { state.next++; if (state.next === 1 && await lose(route, "next")) return; return json(route, state.next === 1 ? FX.next : FX.next_again); }
      return err(route, "INVALID_ACTION");
    }
    if (s === "revoked" && ["validate", "return"].includes(action)) return err(route, "SHARING_UNAVAILABLE");
    if (action === "link") return json(route, { none: FX.link_ines_none, proposed: FX.link_ines_proposed }[s] || FX.link_ines_published);
    if (action === "athlete") return json(route, s === "revoked" ? FX.athlete_revoked : FX.athlete_published);
    if (action === "report") return json(route, { proposed: FX.report_ines_proposed, published: FX.report_ines_published, retracted: FX.report_ines_retracted, withdrawn: FX.report_ines_withdrawn,
      revalidate: FX.report_ines_revalidate, paused: FX.report_ines_paused, revoked: FX.report_ines_revoked, next: FX.report_ines_next }[s]);
    if (action === "validate") {
      if (s === "paused") return err(route, "COACH_CAPACITY_PAUSED");
      // As the server: a replayed op_id returns the version it created, before anything else is checked.
      if (state.validated.has(data.op_id)) return json(route, FX.validate_again);
      const proposal = (s === "proposed" ? FX.report_ines_proposed : FX.report_ines_withdrawn).proposal;
      if (data.preview_key !== proposal.preview_key) return err(route, "COACH_CONFLICT");
      state.validated.set(data.op_id, data);
      const first = s === "proposed";
      state.stage = first ? "published" : "v2";
      if (await lose(route, "validate")) return;
      return json(route, first ? FX.validate : FX.validate_v2);
    }
    if (action === "retract") { state.stage = "retracted"; state.retracted = data; return json(route, FX.retract); }
    if (action === "withdraw") { state.stage = "withdrawn"; return json(route, FX.withdraw); }
    if (action === "export") { state.exported = (state.exported || 0) + 1; return json(route, FX.export_ines); }
    if (action === "return") { state.returned = data; return json(route, { ok: true, report: FX.report_ines_published }); }
    return err(route, "INVALID_ACTION");
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
  await page.locator("[data-cy]").waitFor();
};
const sheetWith = (page, sel) => page.locator("dialog[open]").filter({ has: page.locator(sel) });
const figureValues = (loc) => loc.locator("[data-cy-figure]").evaluateAll((els) => Object.fromEntries(els.map((e) => [e.dataset.cyFigure + (e.dataset.unit ? ":" + e.dataset.unit : ""), e.querySelector("[data-cy-value]").textContent])));
const weeks = (loc) => loc.locator("[data-cy-weeks] tbody tr").evaluateAll((rows) => rows.map((r) => [...r.querySelectorAll("td")].map((td) => Number(td.textContent))));
// The reference report of the lot (sql/tests/300_coach_cycle_reports.sql, tests/coach-cycle.test.mjs).
const REFERENCE = { proposed: "18", accepted: "16", done: "8", moved: "3", declared: "1", open: "6", declined: "1", cancelled: "1", archived: "1", "duration:min": "6 h 54", "volume:km": "70 km" };
const REFERENCE_WEEKS = [[3, 3, 0], [3, 2, 1], [2, 0, 0], [3, 2, 1], [3, 2, 1], [2, 0, 0]];

test("the coach prepares the report: sourced figures, observations tied to sessions, decisions; proposed once even when the answer is lost", async () => {
  for (const width of [390, 1280]) {
    const { page, context, calls, state, errors } = await fixture({ width, scale: width === 390 ? 2 : 1, drop: ["propose"] });
    try {
      await openIness(page);
      const section = page.locator("[data-cy]");
      const card = section.locator(`[data-cy-cycle="${FX.link_none.cycles[0].plan_id}"]`);
      await card.waitFor();
      assert.match(await card.innerText(), /Course et renforcement — 6 semaines[\s\S]*Aucun bilan pour ce cycle/);
      await card.getByRole("button", { name: "Préparer le bilan" }).click();
      const dialog = sheetWith(page, "[data-cy-editor]");
      await dialog.waitFor();
      // Every figure with its period and its source; the moved sessions named.
      const figs = await figureValues(dialog);
      assert.deepEqual({ done: figs.done, moved: figs.moved, archived: figs.archived, km: figs["volume:km"], min: figs["duration:min"] }, { done: "8", moved: "3", archived: "1", km: "70 km", min: "7 h 24" });
      assert.match(await dialog.locator("[data-cy-period]").innerText(), /^Période : du lundi \d+ \S+ au dimanche \d+ \S+ · 6 semaine\(s\)\./);
      assert.equal(await dialog.locator("[data-cy-figure] [data-cy-source]").count(), await dialog.locator("[data-cy-figure]").count(), "a source for every figure");
      const moved = dialog.locator('[data-cy-figure="moved"]');
      await moved.locator("summary").click();
      assert.deepEqual(await moved.locator("li").evaluateAll((l) => l.map((x) => x.dataset.key)), ["w2-sat", "w3-tue", "w5-tue"]);
      assert.deepEqual(await weeks(dialog), REFERENCE_WEEKS);
      assert.doesNotMatch(await dialog.innerText(), /Genou|Bonnes jambes|Semaine chargée/, "no private note, no check-in in the coach's working copy");
      // Two observations tied to source sessions, three decisions.
      await dialog.getByRole("button", { name: "Ajouter un constat" }).click();
      let obs = dialog.locator("[data-cy-obs]").last();
      await obs.locator("[name=text]").fill("Les sorties longues passent mieux le dimanche");
      await obs.locator("summary").click();
      for (const k of ["w2-sat", "w5-sat"]) await obs.locator(`[name=source][value="${k}"]`).check();
      await dialog.getByRole("button", { name: "Ajouter un constat" }).click();
      obs = dialog.locator("[data-cy-obs]").last();
      await obs.locator("[name=text]").fill("Le renforcement du jeudi reste souvent sans séance liée");
      await obs.locator("summary").click();
      for (const k of ["w2-thu", "w3-thu", "w5-thu"]) await obs.locator(`[name=source][value="${k}"]`).check();
      const goals = [["goal", "Courir 12 km en aisance"], ["goal", "Un renforcement par semaine, le jeudi ou le vendredi"], ["session", "Test 10 km"]];
      for (const [kind, text] of goals) {
        await dialog.getByRole("button", { name: "Ajouter une décision" }).click();
        const dec = dialog.locator("[data-cy-dec]").last();
        await dec.locator("[name=kind]").selectOption(kind);
        await dec.locator("[name=text]").fill(text);
      }
      assert.equal(await dialog.locator("[data-cy-dec]").last().locator("[data-cy-sport]").isVisible(), true, "a session to propose has a sport");
      if (width === 390) await dialog.screenshot({ path: SHOTS + "coach-draft.png" });
      await audit(page, "dialog[open]");
      // The first proposal reaches the server, its answer is lost; the retry is answered « déjà proposé » and does not save again.
      await dialog.getByRole("button", { name: "Proposer à Inès" }).click();
      await dialog.locator("[data-cy-error]").filter({ hasText: /La demande n’a pas été confirmée|Hors ligne/ }).waitFor();
      await dialog.getByRole("button", { name: "Proposer à Inès" }).click();
      await page.getByText("Déjà proposé", { exact: true }).waitFor();
      const saves = calls.filter((c) => c.fn === "cycle" && c.action === "save");
      assert.equal(saves.length, 1, "saved once");
      assert.deepEqual(saves[0].data.observations.map((o) => o.sources), [["w2-sat", "w5-sat"], ["w2-thu", "w3-thu", "w5-thu"]]);
      assert.deepEqual(saves[0].data.decisions.map((d) => [d.kind, d.text]), goals);
      assert.equal(saves[0].data.decisions[2].sport, "running");
      assert.deepEqual(calls.filter((c) => c.fn === "cycle" && c.action === "propose").map((c) => c.data), [{ id: RID, revision: 2 }, { id: RID, revision: 2 }], "the retry proposes the same revision");
      assert.equal(state.proposed, 2);
      await page.locator("dialog[open] [data-cy-state]").filter({ hasText: "Proposé au sportif" }).waitFor();
      assert.equal(await page.locator("dialog[open] [data-cy-editor]").count(), 0, "no edit while it waits for Inès");
      assert.ok(await noHorizontalScroll(page), "no horizontal scroll at " + width);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("Inès validates item by item: no note nor check-in ticked for her; validated once even when the answer is lost", async () => {
  for (const width of [390, 1280]) {
    const { page, context, calls, state, errors } = await fixture({ width, scale: width === 390 ? 2 : 1, as: "athlete", stage: "proposed", drop: ["validate"] });
    try {
      const section = page.locator("[data-cy]");
      await section.getByRole("button", { name: "Relire et valider" }).click();
      const dialog = sheetWith(page, "[data-cy-validate]");
      await dialog.waitFor();
      const picks = (kind) => dialog.locator(`[data-cy-pick="${kind}"]`).evaluateAll((els) => els.map((e) => [e.value, e.checked]));
      assert.equal((await picks("measures")).length, 8, "eight measures offered (the archived run is not)");
      assert.ok((await picks("notes")).every(([, c]) => !c), "no note ticked for her");
      assert.ok((await picks("checkins")).every(([, c]) => !c), "no check-in ticked for her, even the one already shared with the check-in tool");
      assert.match(await dialog.locator("[data-cy-share-summary]").innerText(), /^Ton coach verra : 8 mesure\(s\) sur 8, aucune note, aucun check-in\./);
      // Her choices: the strength session's measure stays private; two notes; the week-2 check-in.
      await dialog.locator('[data-cy-pick="measures"][value="w1-thu"]').uncheck();
      await dialog.locator('[data-cy-pick="notes"][value="w1-sat"]').check();
      await dialog.locator('[data-cy-pick="notes"][value="w2-sat"]').check();
      await dialog.locator(`[data-cy-pick="checkins"][value="${FX.report_ines_proposed.proposal.checkins[0].week}"]`).check();
      // A note goes with its measure: unticking the measure unticks and locks the note.
      await dialog.locator('[data-cy-pick="measures"][value="w1-tue"]').uncheck();
      assert.equal(await dialog.locator('[data-cy-pick="notes"][value="w1-tue"]').isDisabled(), true);
      await dialog.locator('[data-cy-pick="measures"][value="w1-tue"]').check();
      assert.match(await dialog.locator("[data-cy-share-summary]").innerText(), /^Ton coach verra : 7 mesure\(s\) sur 8, 2 notes, 1 check-in\./);
      for (const [k, v] of [["d1", "approve"], ["d2", "decline"], ["d3", "approve"]]) await dialog.locator(`[name="d-${k}"][value="${v}"]`).check();
      await dialog.getByLabel(/Autoriser Coach Lou à télécharger un fichier/).check();
      await dialog.getByLabel(/Mon mot sur ce cycle/).fill("Bon cycle, le dimanche me va mieux");
      await dialog.getByLabel("Oui, c’est clair").check();
      assert.match(await dialog.locator("[data-cy-share-notice]").innerText(), /Un fichier déjà téléchargé ne peut pas être repris/);
      if (width === 390) await dialog.screenshot({ path: SHOTS + "athlete-validation.png" });
      await audit(page, "dialog[open]");
      await dialog.getByRole("button", { name: "Valider et publier" }).click();
      await dialog.locator("[data-cy-error]").filter({ hasText: /La demande n’a pas été confirmée|Hors ligne/ }).waitFor();
      await dialog.getByRole("button", { name: "Valider et publier" }).click();
      await page.getByText("Déjà validé", { exact: true }).waitFor();
      const v = calls.filter((c) => c.fn === "cycle" && c.action === "validate").map((c) => c.data);
      assert.equal(v.length, 2);
      assert.equal(v[0].op_id, v[1].op_id, "the retry replays the same validation");
      assert.equal(state.validated.size, 1, "one version");
      assert.deepEqual(v[0].share, { measures: ["w1-tue", "w1-sat", "w2-tue", "w2-sat", "w3-tue", "w5-tue", "w5-sat"], notes: ["w1-sat", "w2-sat"], checkins: [FX.report_ines_proposed.proposal.checkins[0].week] },
        "exactly what the fixtures' validation sent to PostgreSQL");
      assert.deepEqual(v[0].decisions, [{ key: "d1", answer: "approve" }, { key: "d2", answer: "decline" }, { key: "d3", answer: "approve" }]);
      assert.equal(v[0].allow_export, true);
      assert.equal(v[0].understood, "clear");
      // What she now reads is what her coach sees: the reference figures.
      const seen = page.locator("dialog[open] [data-cy-published]");
      await seen.waitFor();
      assert.deepEqual(await figureValues(seen), REFERENCE);
      assert.deepEqual(await weeks(seen), REFERENCE_WEEKS);
      assert.equal(await seen.locator("[data-cy-note]").count(), 2);
      assert.ok(await noHorizontalScroll(page), "no horizontal scroll at " + width);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("the coach reads the published version (= reference), downloads the authorised fields, prepares the next cycle from approved decisions only", async () => {
  const { page, context, calls, errors } = await fixture({ width: 1280, stage: "published", drop: ["next"] });
  try {
    await openIness(page);
    const section = page.locator("[data-cy]");
    await section.locator('[data-cy-cycle][data-hosted="online"]').waitFor();
    await section.getByRole("button", { name: "Ouvrir le bilan" }).click();
    const dialog = sheetWith(page, "[data-cy-hosted]");
    await dialog.waitFor();
    const pub = dialog.locator("[data-cy-published]");
    assert.deepEqual(await figureValues(pub), REFERENCE, "displayed = reference report");
    assert.deepEqual(await weeks(pub), REFERENCE_WEEKS);
    assert.equal(await pub.locator('[data-cy-session="w1-thu"] [data-cy-measure]').count(), 0, "the measure she kept private is not shown");
    assert.match(await pub.locator('[data-cy-session="w1-sat"] [data-cy-note]').innerText(), /Genou sensible à la fin/);
    assert.match(await pub.locator("[data-cy-checkins]").innerText(), /Semaine chargée au travail/);
    assert.deepEqual(await pub.locator("[data-cy-observation]").evaluateAll((l) => l.map((o) => o.querySelectorAll("[data-key]").length)), [2, 3], "observations with their source sessions");
    assert.deepEqual(await pub.locator("[data-cy-decision]").evaluateAll((l) => l.map((d) => d.dataset.state)), ["approved", "declined", "approved"]);
    assert.equal(await pub.locator("[data-cy-retract]").count(), 0, "the coach cannot retract");
    await page.screenshot({ path: SHOTS + "coach-published.png", fullPage: false });
    await audit(page, "dialog[open]");
    // A file of the authorised fields; the notice says it does not follow later retractions.
    assert.match(await dialog.locator("[data-cy-export-notice]").innerText(), /Il ne se met pas à jour/);
    const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Télécharger un fichier" }).click()]);
    assert.equal(download.suggestedFilename(), "bilan-course-et-renforcement-6-semaines-v1.txt");
    const text = readFileSync(await download.path(), "utf8");
    assert.match(text, /- Réalisées : 8 — du lundi/);
    assert.match(text, /- Volume : 70 km \(7 séances\)/);
    assert.match(text, /Note du sportif : Genou sensible à la fin/);
    assert.doesNotMatch(text, /Bonnes jambes|19500000-/, "the note she did not tick and the journal ids are not in the file");
    // The next cycle: only what she approved; a lost answer then a retry creates one draft.
    await dialog.getByRole("button", { name: "Préparer le cycle suivant" }).click();
    const next = sheetWith(page, "[data-cy-approved]");
    await next.waitFor();
    assert.deepEqual(await next.locator("[data-cy-approved] li").evaluateAll((l) => l.map((x) => x.innerText.trim().replace(/\s+/g, " "))), ["Objectif Courir 12 km en aisance", "Séance à proposer Test 10 km"]);
    await next.getByRole("button", { name: "Créer le brouillon" }).click();
    await next.locator("[data-cy-error]").filter({ hasText: /La demande n’a pas été confirmée|Hors ligne/ }).waitFor();
    await next.getByRole("button", { name: "Créer le brouillon" }).click();
    await page.getByText("Brouillon déjà créé", { exact: true }).waitFor();
    assert.equal(calls.filter((c) => c.fn === "cycle" && c.action === "next").length, 2);
    await page.locator(`[data-cp-plan="${FX.next.plan.id}"][data-state="draft"]`).waitFor();
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("Inès retracts a note (gone from what her coach sees and from the next file), withdraws the access, then validates again", async () => {
  let f = await fixture({ width: 390, scale: 2, as: "athlete", stage: "published" });
  try {
    await f.page.locator("[data-cy]").getByRole("button", { name: "Ouvrir le bilan" }).click();
    const dialog = sheetWith(f.page, "[data-cy-published]");
    await dialog.waitFor();
    assert.match(await dialog.locator("[data-cy-exports]").innerText(), /^Ton coach · .* · version 1 · 7 mesure\(s\), 2 note\(s\), 1 check-in\(s\)$/, "she sees the file her coach downloaded");
    await dialog.locator('[data-cy-session="w1-sat"]').getByRole("button", { name: "Retirer cette note" }).click();
    await f.page.getByText("Retiré de la version en ligne").waitFor();
    assert.deepEqual(f.state.retracted, { id: RID, items: [{ kind: "note", key: "w1-sat" }] });
    assert.doesNotMatch(await dialog.innerText(), /Genou/);
    assert.match(await dialog.locator("[data-cy-retracted]").innerText(), /une note · retiré le/);
    assert.equal(await dialog.locator('[data-cy-session="w1-sat"] [data-cy-measure]').count(), 1, "only the note is retracted");
    await dialog.screenshot({ path: SHOTS + "athlete-retracted.png" });
    await audit(f.page, "dialog[open]");
    // Her own file of the version now online: without the retracted note.
    const [download] = await Promise.all([f.page.waitForEvent("download"), dialog.getByRole("button", { name: "Télécharger mon fichier" }).click()]);
    const text = readFileSync(await download.path(), "utf8");
    assert.doesNotMatch(text, /Genou/);
    assert.match(text, /un fichier ne peut pas être repris/);
    assert.match(text, /1 élément retiré par le sportif depuis la validation/);
    // Withdraw the access.
    await dialog.getByRole("button", { name: "Retirer l’accès de mon coach" }).click();
    const confirm = f.page.locator("dialog[open]").filter({ hasText: "Retirer l’accès de ton coach ?" });
    assert.match(await confirm.innerText(), /même avec un lien direct[\s\S]*Un fichier déjà téléchargé ne peut pas être repris/);
    await confirm.getByRole("button", { name: "Retirer l’accès" }).click();
    await dialog.locator("[data-cy-state]").filter({ hasText: "Accès retiré" }).waitFor();
    assert.equal(await dialog.getByRole("button", { name: "Retirer l’accès de mon coach" }).count(), 0);
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
  f = await fixture({ width: 1280, as: "athlete", stage: "withdrawn" });
  try {
    await f.page.locator("[data-cy]").getByRole("button", { name: "Ouvrir le bilan" }).click();
    await sheetWith(f.page, "[data-cy-published]").waitFor();
    await f.page.locator("dialog[open]").getByRole("button", { name: "Valider à nouveau" }).click();
    const dialog = sheetWith(f.page, "[data-cy-validate]");
    await dialog.waitFor();
    // Her last choices are kept; the note she retracted is not ticked again.
    assert.equal(await dialog.locator('[data-cy-pick="measures"][value="w1-thu"]').isChecked(), false);
    assert.equal(await dialog.locator('[data-cy-pick="notes"][value="w1-sat"]').isChecked(), false);
    assert.equal(await dialog.locator('[data-cy-pick="notes"][value="w2-sat"]').isChecked(), true);
    await dialog.locator(`[data-cy-pick="checkins"][value="${FX.report_ines_withdrawn.proposal.checkins[0].week}"]`).uncheck();
    await dialog.getByLabel(/Autoriser Coach Lou à télécharger un fichier/).check();
    await dialog.getByRole("button", { name: "Valider et publier" }).click();
    await f.page.getByText("Bilan publié · version 2", { exact: true }).waitFor();
    const v = [...f.state.validated.values()][0];
    assert.deepEqual(v.share, { measures: ["w1-tue", "w1-sat", "w2-tue", "w2-sat", "w3-tue", "w5-tue", "w5-sat"], notes: ["w2-sat"], checkins: [] }, "the validation the fixtures replayed for version 2");
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});

test("after a withdrawal, a revision of the sharing scope, a pause or a revocation, the coach is shown no shared content", async () => {
  for (const stage of ["withdrawn", "revalidate"]) {
    const { page, context, calls, errors } = await fixture({ width: 1280, stage });
    try {
      await openIness(page);
      await page.locator("[data-cy]").getByRole("button", { name: "Ouvrir le bilan" }).click();
      const dialog = sheetWith(page, `[data-cy-hosted="${stage}"]`);
      await dialog.waitFor();
      const text = await dialog.innerText();
      assert.match(text, stage === "withdrawn" ? /Le sportif a retiré l’accès à la version en ligne/ : /Le périmètre du partage a changé depuis la validation/);
      assert.doesNotMatch(text, /Sortie décalée|Semaine chargée|Bon cycle|Genou/, `${stage}: no shared content`);
      assert.equal(await dialog.locator("[data-cy-published]").count(), 0);
      assert.equal(await dialog.getByRole("button", { name: "Télécharger un fichier" }).count(), 0);
      // A direct call with the report's id answers with the server's refusal, not the content.
      const direct = await page.evaluate((id) => window.titanClient.rpc("titan_coach_cycle_v1", { p_action: "export", p_data: { id } }), RID);
      assert.equal(direct.error?.message, stage === "withdrawn" ? "REPORT_WITHDRAWN" : "REPORT_REVALIDATION");
      if (stage === "withdrawn") await dialog.screenshot({ path: SHOTS + "coach-withdrawn.png" });
      assert.ok(calls.some((c) => c.fn === "cycle" && c.action === "report"));
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  for (const stage of ["paused", "revoked"]) {
    const { page, context, errors } = await fixture({ width: 390, stage });
    try {
      await page.locator('[data-mode="coach"]').click();
      const direct = await page.evaluate((id) => window.titanClient.rpc("titan_coach_cycle_v1", { p_action: "report", p_data: { id } }), RID);
      assert.equal(direct.error?.message, stage === "paused" ? "COACH_CAPACITY_PAUSED" : "SHARING_UNAVAILABLE");
      assert.equal(direct.data, null);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("Inès keeps a read-only view while paused and after revoking; a closed flag makes no call", async () => {
  for (const stage of ["paused", "revoked"]) {
    const { page, context, errors } = await fixture({ width: 390, as: "athlete", stage });
    try {
      // Paused: the link is still listed. Revoked: it is not any more; her reports are under « Bilans de suivis arrêtés ».
      const section = page.locator(stage === "paused" ? "[data-cy]" : "[data-cy-ended]");
      await section.waitFor().catch(async (e) => { console.log(await page.locator("#co-panel-athlete").innerHTML().catch(() => "")); throw e; });
      await section.getByRole("button", { name: "Ouvrir le bilan" }).click();
      const dialog = sheetWith(page, "[data-cy-published]");
      await dialog.waitFor();
      assert.match(await dialog.locator("[data-cy-readonly]").innerText(), stage === "paused" ? /Suivi en pause : lecture seule/ : /Partage arrêté : lecture seule/);
      assert.equal(await dialog.getByRole("button", { name: /valider|Modifier ce que je partage/i }).count(), 0, "nothing new is published");
      assert.equal(await dialog.getByRole("button", { name: "Télécharger mon fichier" }).count(), 1, "her own file stays");
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  const { page, context, calls, errors } = await fixture({ width: 1280, flag: false });
  try {
    await page.locator('[data-mode="coach"]').click();
    await page.locator(`[data-link="${LINK["Inès"]}"]`).click();
    await page.locator("[data-co-cycle-slot]").waitFor({ state: "attached" });
    await page.waitForTimeout(400);
    assert.equal(await page.locator("[data-cy]").count(), 0);
    assert.equal(calls.filter((c) => c.fn === "cycle").length, 0, "no call to the server with the flag closed");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
