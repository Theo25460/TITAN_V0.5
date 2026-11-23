// V1.6.2 — Rapprochement des séances, website. Real journal, real session sheet and real entry form, against a local fake of the two
// RPCs of migration 20261123090000 (their contract is proven on a real PostgreSQL by sql/tests/300_session_match_review.sql) and of the
// training_logs read-back. Scenarios: a real duplicate shown with both sources, their times and the diverging fields; an uncertain
// link split into two sessions and joined back (reversible, journaled); a typed session next to a GPX entry asks first and keeps the
// athlete's « two sessions » decision with the new session. External requests are blocked; no production account is used.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
let server, browser, BASE;
before(async () => {
  const port = await new Promise((ok) => { const s = createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => ok(port)); }); });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

const OWNER = "00000000-0000-4000-8000-0000000162aa";
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const RIDE = uuid(1), LIFT = uuid(2), RUN = uuid(3);
const at = (iso) => new Date(iso).toISOString();
const row = (id, o) => ({ id, user_id: OWNER, client_event_id: id, category: "cardio", xp: 120, revision: 1, archived_at: null, ...o });

function cloudState() {
  return {
    logs: [
      row(RIDE, { sport: "mountain_bike", unit: "km", val: 32, date: at("2026-11-14T08:00:00Z"), created_at: at("2026-11-14T11:00:00Z"), details: { duration: 120, note: "Boue au col" } }),
      row(LIFT, { sport: "muscu_gym", category: "strength", unit: "min", val: 60, date: at("2026-11-17T18:00:00Z"), created_at: at("2026-11-17T19:10:00Z"), details: { duration: 60 } }),
      row(RUN, { sport: "running", unit: "km", val: 8, date: at("2026-11-12T06:00:00Z"), created_at: at("2026-11-12T07:00:00Z"), details: { duration: 45 } }),
    ],
    links: [
      { source: "health_connect", external_id: "hc-ride", status: "linked", log_id: RIDE, linked_log_id: RIDE, split_log_id: null, sport: "cycling", started_at: at("2026-11-14T08:03:00Z"), duration_minutes: 118, distance_km: null, imported_at: at("2026-11-14T12:00:00Z"), match_rule: "v15_group_overlap", match_overlap: 0.983, needs_review: false, reasons: [], decision: null, decided_at: null, events: [{ action: "linked", actor: "engine", at: at("2026-11-14T12:00:00Z") }] },
      { source: "health_connect", external_id: "hc-lift", status: "linked", log_id: LIFT, linked_log_id: LIFT, split_log_id: null, sport: "weightlifting", started_at: at("2026-11-17T18:40:00Z"), duration_minutes: 20, distance_km: null, imported_at: at("2026-11-17T20:00:00Z"), match_rule: "v15_group_overlap", match_overlap: 1, needs_review: true, reasons: ["duration_gap"], decision: null, decided_at: null, events: [{ action: "flagged", actor: "engine", at: at("2026-11-17T20:00:00Z") }] },
    ],
    calls: [],
  };
}
let cloud = cloudState();

// The decision, with the semantics of public.titan_resolve_session_match_v1 (split creates once, rejoin archives, split again restores).
function resolve({ p_source, p_external_id, p_decision }) {
  const r = cloud.links.find((l) => l.source === p_source && l.external_id === p_external_id);
  if (!r) return { status: 400, body: { code: "22023", message: "MATCH_UNKNOWN" } };
  const now = new Date().toISOString();
  if (p_decision === "distinct" && r.status === "linked") {
    let split = r.split_log_id && cloud.logs.find((l) => l.id === r.split_log_id);
    if (split) split.archived_at = null;
    else {
      split = row(uuid(100 + cloud.logs.length), { sport: r.sport, category: "strength", unit: "min", val: r.duration_minutes, date: r.started_at, created_at: now, details: { duration: r.duration_minutes, match: { distinct_from: [r.linked_log_id] } } });
      cloud.logs.push(split);
    }
    Object.assign(r, { status: "imported", log_id: split.id, split_log_id: split.id, decision: "distinct", decided_at: now, needs_review: false });
    r.events = [...r.events, { action: "split", actor: "user", at: now }];
  } else if (p_decision === "same" && r.status === "imported") {
    cloud.logs.find((l) => l.id === r.log_id).archived_at = now;
    Object.assign(r, { status: "linked", log_id: r.linked_log_id, decision: "same", decided_at: now, needs_review: false });
    r.events = [...r.events, { action: "rejoined", actor: "user", at: now }];
  } else if (p_decision === "same") {
    Object.assign(r, { decision: "same", decided_at: now, needs_review: false });
    r.events = [...r.events, { action: "confirmed", actor: "user", at: now }];
  }
  return { status: 200, body: r };
}

async function device() {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block", timezoneId: "Europe/Paris" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("internetdisconnected"));
  await context.route("**/rest/v1/rpc/titan_session_matches_v1", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    cloud.calls.push(`matches:${body.p_log_id || "all"}`);
    const list = body.p_log_id ? cloud.links.filter((l) => [l.log_id, l.linked_log_id, l.split_log_id].includes(body.p_log_id)) : cloud.links.filter((l) => l.status === "linked" || l.linked_log_id);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(list) });
  });
  await context.route("**/rest/v1/rpc/titan_resolve_session_match_v1", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    cloud.calls.push(`resolve:${body.p_external_id}:${body.p_decision}`);
    const r = resolve(body);
    return route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.body) });
  });
  await context.route("**/rest/v1/training_logs?*", async (route) => {
    const url = new URL(route.request().url());
    const ids = (url.searchParams.get("id") || "").replace(/^in\.\(|\)$/g, "").split(",").map((s) => s.replace(/"/g, ""));
    cloud.calls.push(`read:${ids.length}`);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cloud.logs.filter((l) => ids.includes(l.id))) });
  });
  await context.route("**/rest/v1/rpc/titan_submit_training_session", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    cloud.calls.push(`submit:${JSON.stringify(body.p_details?.match || null)}`);
    const id = uuid(500 + cloud.logs.length);
    cloud.logs.push(row(id, { sport: body.p_sport, unit: body.p_unit, val: body.p_val, date: body.p_date, created_at: new Date().toISOString(), details: body.p_details, client_event_id: body.p_details.client_event_id }));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ log_id: id, xp: 120, credits: 10, xp_after: 120, credits_after: 10, level_after: 1 }]) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, errors };
}

async function signIn(page, path) {
  await page.goto(BASE + path);
  await page.waitForFunction(() => ["ready", "error"].includes(window.TitanAdventure?.status) && window.TitanQueue && window.state?.user);
  await page.evaluate(async ({ owner, logs }) => {
    window.state.user.id = owner;
    window.titanClient.auth.getSession = async () => ({ data: { session: { user: { id: owner }, access_token: "synthetic-token" } }, error: null });
    window.state.history = logs.filter((l) => !l.archived_at).map((l) => ({ ...l, cat: l.category, syncStatus: "confirmed" }));
    window.state.archivedHistory = [];
    window.dispatchEvent(new CustomEvent("titan:history-updated"));
  }, { owner: OWNER, logs: cloud.logs });
}
const openSheet = async (page, id) => {
  await page.locator(`[data-open="${id}"]`).click();
  await page.locator("dialog[open] .jr-match").first().waitFor();
  return page.locator("dialog[open] .jr-match").first();
};
const counted = (page) => page.evaluate(() => window.state.history.filter((l) => !l.archived_at).length);

test("a real duplicate is shown with both sources and counts once; an uncertain link is split then joined back, journaled", async () => {
  cloud = cloudState();
  const { page, context, errors } = await device();
  try {
    await signIn(page, "/journal");
    // Journal badges from the account's links.
    await page.locator(`[data-open="${LIFT}"] [data-match-badge="review"]`).waitFor();
    assert.equal(await page.locator(`[data-open="${RIDE}"] [data-match-badge="linked"]`).textContent(), "2 sources");
    assert.equal(await counted(page), 3);

    // 1. The certain duplicate: both sources, their times, the diverging fields, the rule; one session counted.
    let block = await openSheet(page, RIDE);
    assert.equal(await block.getAttribute("data-match-state"), "linked");
    const text = await block.textContent();
    for (const words of ["Même séance que Santé Connect", "Saisie manuelle", "Santé Connect", "Enregistrée", "Importée", "Règle", "règle V15", "rattachée automatiquement par TITAN"])
      assert.ok(text.includes(words), `sheet shows « ${words} »: ${text}`);
    assert.ok(await block.locator('tr[data-diverges="true"]', { hasText: "Distance" }).count(), "the distance only one source has is marked in words");
    assert.equal(await block.locator('tr[data-diverges="true"]', { hasText: "Début" }).count(), 0, "3 minutes apart is not a divergence");
    assert.equal(await block.locator('[data-match-action="distinct"]').count(), 1, "even a certain link can be split");
    await page.evaluate(() => document.querySelector("dialog[open]")?.close());

    // 2. The uncertain link: to check, reasons, two choices. « Non, deux séances » → confirmation → the server creates the session.
    block = await openSheet(page, LIFT);
    assert.equal(await block.getAttribute("data-match-state"), "review");
    assert.ok((await block.textContent()).includes("Les durées diffèrent nettement."));
    await block.locator('[data-match-action="distinct"]').click();
    const confirm = page.locator("dialog.asc-sheet[open]");
    await confirm.waitFor();
    assert.match(await confirm.textContent(), /Séparer en deux séances/);
    await confirm.locator("[data-ok]").click();
    await page.waitForFunction(() => window.state.history.filter((l) => !l.archived_at).length === 4);
    assert.ok(cloud.calls.includes("resolve:hc-lift:distinct"));
    const split = cloud.links.find((l) => l.external_id === "hc-lift").log_id;
    await page.waitForFunction((id) => !!document.querySelector(`[data-open="${id}"]`), split);

    // 3. Reversible: the split session offers to undo; joining back archives it, the journal counts one session again.
    block = await openSheet(page, split);
    assert.equal(await block.getAttribute("data-match-state"), "split");
    assert.ok((await block.textContent()).includes("Un nouvel import de la même activité garde ce choix."));
    await block.locator('[data-match-action="same"]').click();
    await page.locator("dialog.asc-sheet[open] [data-ok]").click();
    await page.waitForFunction(() => window.state.history.filter((l) => !l.archived_at).length === 3);
    assert.equal(await page.evaluate((id) => window.state.archivedHistory.some((l) => l.id === id), split), true, "archived, not deleted");
    block = await openSheet(page, LIFT);
    const history = await block.locator(".jr-match-log li").allTextContents();
    assert.deepEqual(history.map((h) => h.replace(/^.* : /, "")), ["rattachée, à vérifier par TITAN", "séparée en deux séances par toi", "réunie en une séance par toi"]);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("a typed session next to a GPX entry asks first with both sources, then keeps the « two sessions » decision with the new session", async () => {
  cloud = cloudState();
  cloud.logs.push(row(uuid(9), { sport: "running", unit: "km", val: 12.5, date: at("2026-11-22T17:00:00Z"), created_at: at("2026-11-22T18:30:00Z"), details: { duration: 62, hasGpx: true, gpxStats: { source: "gpx_import", distanceKm: 12.5, movingMinutes: 62 } } }));
  const { page, context, errors } = await device();
  try {
    await signIn(page, "/training?sport=running");
    await page.locator('[data-k="distance"]').waitFor();
    // 18:00 in Paris on 22 November, 60 minutes, 10 km: the GPX entry of the same hour says 12.5 km.
    await page.evaluate(() => {
      const set = (k, v) => { const el = document.querySelector(`[data-k="${k}"]`); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
      set("distance", "10"); set("durH", "1"); set("durM", "0");
    });
    const when = page.locator('[data-when="other"], [data-k="when"][value="other"]').first();
    if (await when.count()) await when.click();
    await page.evaluate(() => {
      const set = (k, v) => { const el = document.querySelector(`[data-k="${k}"]`); if (!el) return; el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
      set("date", "2026-11-22"); set("time", "18:00");
    });
    await page.locator('[data-act="save"]').click();
    const dialog = page.locator("dialog.asc-sheet[open]");
    await dialog.waitFor();
    const text = await dialog.textContent();
    for (const words of ["Même séance ? À vérifier", "Dans ton journal", "Fichier GPX", "Cette saisie : Saisie manuelle", "Les distances diffèrent nettement.", "Distance : 12,5 km dans le journal, 10 km ici"])
      assert.ok(text.includes(words), `question shows « ${words} »: ${text}`);
    assert.ok(!cloud.calls.some((c) => c.startsWith("submit:")), "nothing saved before the athlete decides");
    await dialog.locator("[data-ok]").click();
    for (let i = 0; i < 100 && !cloud.calls.some((c) => c.startsWith("submit:")); i++) await page.waitForTimeout(100);
    const submitted = cloud.calls.find((c) => c.startsWith("submit:"));
    assert.ok(submitted, "the session is saved once the athlete said they are two");
    assert.deepEqual(JSON.parse(submitted.slice(7)).distinct_from, [uuid(9)], "the decision travels with the new session");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
