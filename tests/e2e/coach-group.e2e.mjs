// V1.9.6 — Suivi collectif individualisé on the website (coach). Real UI, server answers replayed from tests/fixtures/coach-group.json
// (printed by tools/db/coach-group/fixtures.sql on PostgreSQL 16). Synthetic accounts only. Every answer waits LATENCY ms, as a network
// would. The mock refuses like the server: a stale revision or preview is COACH_CONFLICT, a replayed op_id returns its results.
// Screenshots: docs/v196/*.png.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, readFileSync } from "node:fs";
import { before, after, test } from "node:test";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
const FX = JSON.parse(readFileSync(ROOT + "tests/fixtures/coach-group.json", "utf8"));
const COACH = FX.ids.coach;
const LINK = FX.ids.links;
const GID = FX.create_group.id;
const SHOTS = ROOT + "docs/v196/";
const LATENCY = 120;
const VARIANTS = {
  [LINK["Paul"]]: [{ shift_weeks: 1 }, FX.variant_paul],
  [LINK["Inès"]]: [{ day_map: { 2: 3 } }, FX.variant_ines],
  [LINK["Malo"]]: [{ moves: [{ key: "w2-sat", week: 2, day: 7 }], skip: ["w4-sat"] }, FX.variant_malo],
};
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

// created: the group exists; d: the block as the server holds it now; review: the group review after the answers.
async function fixture({ width = 1280, scale = 1, flag = true, as = "coach", created = false, d = null, review = false, drop = [] } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1100 }, deviceScaleFactor: scale, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const calls = [], errors = [];
  const state = { created, d, review, deleted: false, ops: new Map(), sends: 0, dropped: new Set() };
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
    window.titanFlags.enabled = (k, f) => (k === "screens.coach_groups" ? flag : ["screens.coach_followup", "screens.coach_programs"].includes(k) ? true : ["screens.coach_feedback", "screens.coach_review", "screens.coachtools", "screens.coach_cycle_report"].includes(k) ? false : old(k, f));
  }, { me: as === "coach" ? COACH : FX.snapshot_zoe.owner, flag });
  const json = async (route, body, status = 200) => { await new Promise((r) => setTimeout(r, LATENCY)); return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }).catch(() => {}); };
  const err = (route, code) => json(route, { message: code }, 400);
  const lose = async (route, what) => { if (drop.includes(what) && !state.dropped.has(what)) { state.dropped.add(what); await new Promise((r) => setTimeout(r, LATENCY)); await route.abort("connectionreset"); return true; } return false; };
  await page.route("**/rest/v1/rpc/titan_coach_portal", async (route) => {
    const { p_action: action, p_data: data } = route.request().postDataJSON();
    calls.push({ fn: "portal", action });
    if (action === "snapshot") return json(route, as === "coach" ? FX.snapshot : FX.snapshot_zoe);
    if (["sessions", "assignments"].includes(action)) return json(route, { link_id: data.link_id, revision: 1, rows: [], total: 0, offset: 0 });
    return json(route, {});
  });
  await page.route("**/rest/v1/rpc/titan_coach_followup_v1", async (route) => {
    const { p_action: action, p_data: data } = route.request().postDataJSON();
    calls.push({ fn: "followup", action });
    if (action === "queue") return json(route, { owner: COACH, today: FX.ids.monday, counts: { wait: 0, gap: 0, suggest: 0 }, athletes: [], paused: 0, rows: [] });
    return json(route, { link_id: data?.link_id, revision: 1, role: as, total: 0, offset: 0, rows: [] });
  });
  await page.route("**/rest/v1/rpc/titan_coach_program_v1", async (route) => {
    const { p_action: action } = route.request().postDataJSON();
    calls.push({ fn: "program", action });
    if (action === "library") return json(route, FX.library);
    if (action === "athlete") return json(route, FX.program_athlete_zoe);
    if (action === "link") return json(route, as === "coach" ? { link_id: null, role: "coach", plans: [] } : { link_id: LINK["Zoé"], role: "athlete", plans: FX.program_athlete_zoe.plans });
    return json(route, {});
  });
  await page.route("**/rest/v1/rpc/titan_coach_group_v1", async (route) => {
    const { p_action: action, p_data: data } = route.request().postDataJSON();
    calls.push({ fn: "group", action, data });
    if (!flag) return err(route, "FEATURE_DISABLED");
    if (as !== "coach") return err(route, "COACH_ONLY");
    if (action === "groups") return json(route, state.deleted ? FX.groups_after_delete : state.created ? FX.groups : FX.groups_empty);
    if (action === "create_group") {
      if (data.title !== "Groupe 10 km du mardi" || data.link_ids.length !== 8) return err(route, "INVALID_INPUT");
      state.created = true; return json(route, FX.create_group);
    }
    if (action === "review") return json(route, state.review ? FX.review : FX.group);
    if (action === "prepare") {
      if (data.group_id !== GID || data.program_id !== FX.ids.program) return err(route, "PROGRAM_UNAVAILABLE");
      state.d = FX.dispatch_blocked; return json(route, { ok: true, dispatch: state.d });
    }
    if (action === "dispatch") return json(route, state.d);
    if (action === "variant") {
      if (data.revision !== state.d.revision) return err(route, "COACH_CONFLICT");
      if (data.excluded === true && data.link_id === LINK["Sacha"]) { state.d = FX.variant_exclude.dispatch; return json(route, FX.variant_exclude); }
      const [want, fx] = VARIANTS[data.link_id] || [];
      assert.deepEqual(data.variant, want, `the variant sent for ${data.link_id}`);
      state.d = fx.dispatch; return json(route, fx);
    }
    if (action === "send") {
      // As the server: a replayed op_id returns its results before anything else is checked.
      if (state.ops.has(data.op_id)) return json(route, state.ops.get(data.op_id));
      if (data.preview_key !== state.d.preview_key || state.staleOnce) { state.staleOnce = false; return err(route, "COACH_CONFLICT"); }
      const step = state.d === FX.variant_malo.dispatch ? [FX.send1, FX.dispatch_sent1, FX.send1_replay] : state.d === FX.dispatch_sent1 ? [FX.send2, FX.dispatch_sent2]
        : state.d === FX.dispatch_resume ? [FX.send3, FX.dispatch_sent3] : state.d === FX.variant_exclude.dispatch ? [FX.send4, FX.dispatch_complete] : null;
      if (!step) return err(route, "COACH_CONFLICT");
      state.sends++; state.ops.set(data.op_id, step[2] || { ...step[0], already: true }); state.d = step[1];
      if (await lose(route, "send")) return;
      return json(route, step[0]);
    }
    if (action === "delete_group") { state.deleted = true; return json(route, FX.delete_group); }
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
const sheetWith = (page, sel) => page.locator("dialog[open]").filter({ has: page.locator(sel) });
const asCoach = async (page) => { await page.locator('[data-mode="coach"]').click(); await page.locator("[data-gr]").waitFor(); };
const openGroup = async (page) => { await page.locator(`[data-gr-toggle="${GID}"]`).click(); await page.locator(`[data-gr-open="${GID}"] [data-gr-review]`).waitFor(); };
const outcomes = (dialog) => dialog.locator("[data-gr-recipient]").evaluateAll((els) => Object.fromEntries(els.map((e) => [e.querySelector("strong").textContent, e.dataset.outcome])));

test("the coach groups eight athletes, prepares one block, adapts it for three of them and sees who will receive which version", async () => {
  for (const width of [390, 1280]) {
    const { page, context, calls, errors } = await fixture({ width, scale: width === 390 ? 2 : 1 });
    try {
      await asCoach(page);
      assert.match(await page.locator("[data-gr-empty]").innerText(), /Aucun groupe/);
      await page.locator("[data-gr-new]").click();
      let dialog = sheetWith(page, "[name=link]");
      await dialog.locator("[name=title]").fill("Groupe 10 km du mardi");
      for (const box of await dialog.locator("[name=link]").all()) await box.check();
      await dialog.getByRole("button", { name: "Créer le groupe" }).click();
      await page.locator(`[data-gr-open="${GID}"]`).waitFor();
      assert.match(await page.locator(`[data-gr-group="${GID}"]`).innerText(), /7 membres · 5 actifs · 2 en pause · 1 suivi arrêté/);
      // Prepare from the template, then adapt three versions.
      await page.locator("[data-gr-prepare]").click();
      dialog = sheetWith(page, "[name=program]");
      await dialog.getByRole("button", { name: "Préparer le bloc" }).click();
      dialog = sheetWith(page, "[data-gr-dispatch-body]");
      await dialog.locator("[data-gr-recipient]").first().waitFor();
      const adapt = async (name, fill) => {
        await dialog.getByRole("button", { name: `Adapter pour ${name}` }).click();
        const v = sheetWith(page, "[name=shift]");
        await fill(v);
        await v.getByRole("button", { name: "Enregistrer sa version" }).click();
        await v.waitFor({ state: "detached" });
      };
      await adapt("Paul", (v) => v.locator("[name=shift]").selectOption("1"));
      await adapt("Inès", (v) => v.locator("[name=map-2]").selectOption("3"));
      await adapt("Malo", async (v) => { await v.locator('[name="day-w2-sat"]').selectOption("7"); await v.locator('[name="keep-w4-sat"]').uncheck(); });
      await dialog.locator('[data-gr-recipient] >> text=Commence 1 semaine plus tard').waitFor();
      assert.equal(await dialog.locator("[data-gr-headline]").innerText(), "5 sportifs recevront sa version · 3 versions adaptées");
      assert.deepEqual(await outcomes(dialog), { Zoé: "ready", Noé: "ready", Paul: "ready", Inès: "ready", Malo: "ready", Léa: "COACH_CAPACITY_PAUSED", Hugo: "COACH_CAPACITY_PAUSED", "Suivi arrêté": "SHARING_UNAVAILABLE" });
      const malo = dialog.locator(`[data-gr-recipient="${LINK["Malo"]}"]`);
      assert.match(await malo.innerText(), /Sortie longue 2 : dimanche, semaine 2 · Sans Course 10 km[\s\S]*11 séances/);
      await malo.locator("summary").click();
      assert.match(await malo.locator("[data-gr-version]").innerText(), /dimanche[^\n]*Sortie longue 2 \(adaptée\)[\s\S]*Sans : Course 10 km/);
      assert.match(await dialog.locator(`[data-gr-recipient="${LINK["Inès"]}"]`).innerText(), /mardi → mercredi/);
      assert.match(await dialog.locator(`[data-gr-recipient="${LINK["Léa"]}"]`).innerText(), /Ne recevra rien : suivi en pause[\s\S]*faute de place dans ton offre/);
      const ended = dialog.locator(`[data-gr-recipient="${LINK["Sacha"]}"]`);
      assert.doesNotMatch(await ended.innerText(), /Sacha/, "an ended link has no name");
      assert.equal(await ended.locator("[data-gr-version]").count(), 0);
      assert.equal(await dialog.getByRole("button", { name: "Envoyer (5 sportifs)" }).count(), 1);
      if (width === 390) await dialog.screenshot({ path: SHOTS + "preview.png" });
      await audit(page, "dialog[open]");
      assert.ok(await noHorizontalScroll(page));
      assert.equal(calls.filter((c) => c.action === "send").length, 0, "nothing sent before the coach decides");
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("the send is told recipient by recipient; a lost answer is retried with the same op_id and nothing is sent twice", async () => {
  const { page, context, calls, state, errors } = await fixture({ width: 1280, created: true, d: FX.variant_malo.dispatch, drop: ["send"] });
  try {
    await asCoach(page);
    await openGroup(page);
    await page.locator(`[data-gr-dispatch-open="${FX.variant_malo.dispatch.id}"]`).click();
    const dialog = sheetWith(page, "[data-gr-dispatch-body]");
    await dialog.getByRole("button", { name: "Envoyer (5 sportifs)" }).click();
    await dialog.locator("[data-gr-error]").filter({ hasText: "rien ne sera envoyé deux fois" }).waitFor();
    await dialog.getByRole("button", { name: "Envoyer (5 sportifs)" }).click();
    const res = dialog.locator("[data-gr-results]");
    await res.waitFor();
    const sends = calls.filter((c) => c.action === "send");
    assert.equal(sends.length, 2);
    assert.equal(sends[0].data.op_id, sends[1].data.op_id, "the retry replays the same op_id");
    assert.equal(state.sends, 1, "the server sent once");
    assert.match(await res.innerText(), /5 envois réussis · 3 sportifs n’ont rien reçu[\s\S]*Cet envoi avait déjà été fait : rien n’a été renvoyé\./);
    assert.match(await res.locator(`[data-gr-result="${LINK["Malo"]}"]`).innerText(), /Malo · Envoyé \(11 séances\)/);
    assert.match(await res.locator(`[data-gr-result="${LINK["Hugo"]}"]`).innerText(), /Hugo · Ne recevra rien : suivi en pause/);
    assert.match(await res.locator(`[data-gr-result="${LINK["Sacha"]}"]`).innerText(), /Suivi arrêté · Ne recevra rien : suivi arrêté/);
    // The places are still full: nothing is ready, the incomplete send waits.
    assert.match(await dialog.locator("[data-gr-wait]").innerText(), /Personne n’est prêt à recevoir/);
    assert.equal(await dialog.locator("[data-gr-send]").count(), 0);
    await dialog.screenshot({ path: SHOTS + "results.png" });
    await audit(page, "dialog[open]");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("once a place is free the resumption serves only the athletes left, and a stale preview is refused", async () => {
  const { page, context, calls, state, errors } = await fixture({ width: 390, scale: 2, created: true, d: FX.dispatch_sent2 });
  try {
    await asCoach(page);
    await openGroup(page);
    await page.locator(`[data-gr-dispatch-open="${FX.dispatch_sent2.id}"]`).click();
    const dialog = sheetWith(page, "[data-gr-dispatch-body]");
    await dialog.locator("[data-gr-wait]").waitFor();
    // Coach Pro again (on the server): the coach checks the preview again.
    state.d = FX.dispatch_resume;
    await dialog.getByRole("button", { name: "Revérifier l’aperçu" }).click();
    await dialog.getByRole("button", { name: "Reprendre les envois incomplets (2 sportifs)" }).waitFor();
    assert.deepEqual(await outcomes(dialog), { Hugo: "ready", Inès: "sent", Léa: "ready", Malo: "sent", Noé: "sent", Paul: "sent", Zoé: "sent", "Suivi arrêté": "SHARING_UNAVAILABLE" });
    assert.equal(await dialog.locator('[data-outcome="sent"] [data-gr-adapt]').count(), 0, "a version already sent is not edited from the block");
    // Something moves on the server between the preview and the send: refused, nothing sent, the preview is read again.
    state.staleOnce = true;
    await dialog.getByRole("button", { name: "Reprendre les envois incomplets (2 sportifs)" }).click();
    await dialog.locator("[data-gr-error]").filter({ hasText: "Relis l’aperçu avant d’envoyer" }).waitFor();
    assert.equal(state.sends, 0, "nothing sent on a stale preview");
    assert.equal(calls.filter((c) => c.action === "dispatch").length >= 3, true, "the preview was read again");
    await dialog.getByRole("button", { name: "Reprendre les envois incomplets (2 sportifs)" }).click();
    const res = dialog.locator("[data-gr-results]");
    await res.waitFor();
    assert.match(await res.innerText(), /2 envois réussis · 1 sportif n’a rien reçu/);
    assert.deepEqual((await res.locator('[data-sent="true"] strong').allInnerTexts()).sort(), ["Hugo", "Léa"], "only Léa and Hugo, never the five already served");
    assert.equal(state.sends, 1);
    const send = calls.filter((c) => c.action === "send").at(-1);
    assert.equal(send.data.preview_key, FX.dispatch_resume.preview_key);
    // The ended link is left out: the block is complete and the next send sends nothing.
    await dialog.getByRole("button", { name: "Laisser de côté" }).click();
    await dialog.locator('[data-outcome="excluded"]').waitFor();
    assert.equal(await dialog.locator("[data-gr-send]").count(), 0, "nothing left to send");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("the group review shows the next action per athlete and the load, never their data; deleting the group keeps what they received", async () => {
  for (const width of [390, 1280]) {
    const { page, context, calls, errors } = await fixture({ width, scale: width === 390 ? 2 : 1, created: true, d: FX.dispatch_complete, review: true });
    try {
      await asCoach(page);
      await openGroup(page);
      const rv = page.locator("[data-gr-review]");
      assert.equal(await rv.locator("[data-gr-load] strong").innerText(), "1 cas à traiter · 1 sportif à voir · 70 réponses attendues");
      assert.match(await rv.locator("[data-gr-load]").innerText(), /7 \/ 15 places de ton offre/);
      assert.match(await rv.locator(`[data-gr-member="${LINK["Noé"]}"]`).innerText(), /Noé[\s\S]*À discuter[\s\S]*Répondre à une demande de discussion/);
      assert.match(await rv.locator(`[data-gr-member="${LINK["Zoé"]}"]`).innerText(), /À jour[\s\S]*Bloc 10 km — 4 semaines · 12\/12 acceptées/);
      assert.match(await rv.locator(`[data-gr-member="${LINK["Sacha"]}"]`).innerText(), /Suivi arrêté[\s\S]*Plus rien à suivre/);
      assert.doesNotMatch(await page.locator("[data-gr]").innerText(), /Genou|6 × 400|Sacha/, "no note, no instruction, no ended name");
      assert.equal(await rv.locator(`[data-gr-member="${LINK["Noé"]}"] [data-link="${LINK["Noé"]}"]`).count(), 1, "the details are in Noé's own view");
      if (width === 390) await page.locator(`[data-gr-open="${GID}"]`).screenshot({ path: SHOTS + "review.png" });
      await audit(page, "[data-gr]");
      assert.ok(await noHorizontalScroll(page));
      await page.locator("[data-gr-delete]").click();
      const confirm = page.locator("dialog[open]").filter({ hasText: "Supprimer « Groupe 10 km du mardi » ?" });
      assert.match(await confirm.innerText(), /Les programmes déjà reçus restent aux sportifs, avec leurs réponses/);
      await confirm.getByRole("button", { name: "Supprimer le groupe" }).click();
      await page.locator("[data-gr-empty]").waitFor();
      assert.equal(calls.filter((c) => c.action === "delete_group").length, 1);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("flag closed: no group and no call; an athlete never sees a group", async () => {
  {
    const { page, context, calls, errors } = await fixture({ flag: false });
    try {
      await page.locator('[data-mode="coach"]').click();
      await page.locator("[data-co-review-slot]").waitFor({ state: "attached" });
      await page.waitForTimeout(400);
      assert.equal(await page.locator("[data-gr]").count(), 0);
      assert.equal(calls.filter((c) => c.fn === "group").length, 0, "no call while the flag is closed");
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  {
    const { page, context, calls, errors } = await fixture({ as: "athlete" });
    try {
      await page.locator("[data-co-review-slot]").waitFor({ state: "attached" });
      await page.waitForTimeout(400);
      assert.equal(await page.locator("[data-gr], [data-co-groups-slot]").count(), 0);
      assert.equal(calls.filter((c) => c.fn === "group").length, 0, "the athlete's space never asks for a group");
      assert.doesNotMatch(await page.locator("main").innerText(), /Groupe 10 km|Noé|Inès/);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});
