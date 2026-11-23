// V1.6.3 — Contrôle et réconciliation, website. Real journal, real session sheet, real correction form and real CSV export, against a
// local fake of titan_update_training_session / titan_session_changes_v1 / titan_session_matches_v1 with the semantics proven on
// PostgreSQL by sql/tests/300_history_reconcile.sql (revision + 1 and a snapshot per change, no reward change, a rejoined session
// cannot be restored from the journal). Scenario: correct the typed run (only the changed fields leave), archive the Garmin duplicate,
// the record moves to the corrected run, export journal and archives, restore without a second reward. No external request.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
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
  browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
});
after(async () => { await browser?.close(); server?.kill(); });

const OWNER = "00000000-0000-4000-8000-0000000163aa";
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const RUN = uuid(1), GARMIN = uuid(2), OLD = uuid(3), JOINED = uuid(4);
const row = (id, o) => ({ id, user_id: OWNER, client_event_id: id, category: "cardio", sport: "running", unit: "km", xp: 60, revision: 1, archived_at: null, ...o });

function cloudState() {
  return {
    logs: [
      row(RUN, { val: 10.4, date: "2026-11-20T06:30:00.000Z", created_at: "2026-11-20T08:00:00.000Z", details: { duration: 52, note: "Sortie du vendredi" } }),
      row(GARMIN, { val: 10.6, date: "2026-11-20T06:31:00.000Z", created_at: "2026-11-20T09:00:00.000Z", details: { duration: 53 } }),
      row(OLD, { val: 9.8, date: "2026-11-17T17:00:00.000Z", created_at: "2026-11-17T18:00:00.000Z", details: { duration: 49 }, xp: 55 }),
      row(JOINED, { val: 8, date: "2026-11-15T17:00:00.000Z", created_at: "2026-11-15T18:00:00.000Z", details: { duration: 45 }, revision: 3, archived_at: "2026-11-16T08:00:00.000Z" }),
    ],
    links: [
      { source: "garmin", external_id: "g-77001", status: "imported", log_id: GARMIN, linked_log_id: RUN, split_log_id: GARMIN, sport: "running", started_at: "2026-11-20T06:31:00.000Z", duration_minutes: 53, distance_km: 10.6, imported_at: "2026-11-20T09:00:00.000Z", match_rule: "v15_group_overlap", match_overlap: 0.98, needs_review: false, reasons: [], decision: "distinct", decided_at: "2026-11-20T09:05:00.000Z", events: [{ action: "linked", actor: "engine", at: "2026-11-20T09:00:00.000Z" }, { action: "split", actor: "user", at: "2026-11-20T09:05:00.000Z" }] },
      { source: "health_connect", external_id: "hc-joined", status: "linked", log_id: OLD, linked_log_id: OLD, split_log_id: JOINED, sport: "running", started_at: "2026-11-15T17:00:00.000Z", duration_minutes: 45, distance_km: null, imported_at: "2026-11-15T19:00:00.000Z", match_rule: "v15_group_overlap", match_overlap: 1, needs_review: false, reasons: [], decision: "same", decided_at: "2026-11-16T08:00:00.000Z", events: [] },
    ],
    revisions: [],
    patches: [],
  };
}
let cloud = cloudState();

// private.titan_update_training_session + the V1.6.3 wrapper guard.
function update({ p_id, p_revision, p_patch }) {
  const l = cloud.logs.find((x) => x.id === p_id);
  if (!l) return { status: 400, body: { code: "42501", message: "SESSION_NOT_FOUND" } };
  if (l.revision !== p_revision) return { status: 400, body: { code: "40001", message: "SESSION_VERSION_CONFLICT" } };
  if (p_patch.archived === false && cloud.links.some((i) => i.split_log_id === p_id && i.status === "linked" && i.log_id !== p_id))
    return { status: 400, body: { code: "22023", message: "SESSION_MATCH_JOINED" } };
  cloud.patches.push({ id: p_id, keys: Object.keys(p_patch).sort() });
  cloud.revisions.push({ log_id: p_id, at: new Date().toISOString(), snapshot: JSON.parse(JSON.stringify(l)) });
  if ("val" in p_patch) l.val = p_patch.val;
  if ("duration" in p_patch) l.details = { ...l.details, duration: p_patch.duration, val2: p_patch.duration };
  if ("note" in p_patch) l.details = { ...l.details, note: p_patch.note };
  if ("date" in p_patch) l.date = p_patch.date;
  if ("archived" in p_patch) l.archived_at = p_patch.archived ? new Date().toISOString() : null;
  l.revision += 1;
  return { status: 200, body: l };
}
// public.titan_session_changes_v1: each snapshot against the next state, newest first.
function changes(id) {
  const revs = cloud.revisions.filter((r) => r.log_id === id);
  const cur = cloud.logs.find((l) => l.id === id);
  return revs.map((r, i) => {
    const b = r.snapshot, a = revs[i + 1]?.snapshot || cur, out = [];
    if (b.val !== a.val) out.push({ field: "val", before: b.val, after: a.val, unit: a.unit });
    if ((b.details?.duration ?? null) !== (a.details?.duration ?? null)) out.push({ field: "duration", before: b.details?.duration ?? null, after: a.details?.duration ?? null, unit: "min" });
    if (Math.floor(Date.parse(b.date) / 60000) !== Math.floor(Date.parse(a.date) / 60000)) out.push({ field: "date", before: b.date, after: a.date, unit: "" });
    if ((b.details?.note || "") !== (a.details?.note || "")) out.push({ field: "note", before: b.details?.note || "", after: a.details?.note || "", unit: "" });
    if (!b.archived_at !== !a.archived_at) out.push({ field: "archived", before: !!b.archived_at, after: !!a.archived_at, unit: "" });
    return { revision: a.revision, at: r.at, changes: out };
  }).filter((e) => e.changes.length).reverse();
}

async function device() {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block", timezoneId: "Europe/Paris", acceptDownloads: true });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("internetdisconnected"));
  const json = (route, r) => route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.body) });
  await context.route("**/rest/v1/rpc/titan_update_training_session", (route) => json(route, update(JSON.parse(route.request().postData() || "{}"))));
  await context.route("**/rest/v1/rpc/titan_session_changes_v1", (route) => json(route, { status: 200, body: changes(JSON.parse(route.request().postData() || "{}").p_log_id) }));
  await context.route("**/rest/v1/rpc/titan_session_matches_v1", (route) => {
    const id = JSON.parse(route.request().postData() || "{}").p_log_id;
    return json(route, { status: 200, body: id ? cloud.links.filter((l) => [l.log_id, l.linked_log_id, l.split_log_id].includes(id)) : cloud.links });
  });
  await context.route("**/rest/v1/training_logs?*", (route) => {
    const url = new URL(route.request().url());
    const ids = (url.searchParams.get("id") || "").replace(/^in\.\(|\)$/g, "").split(",").map((s) => s.replace(/"/g, ""));
    return json(route, { status: 200, body: cloud.logs.filter((l) => ids.includes(l.id)) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, errors };
}

async function signIn(page) {
  await page.goto(BASE + "/journal");
  await page.waitForFunction(() => ["ready", "error"].includes(window.TitanAdventure?.status) && window.TitanQueue && window.state?.user && window.TitanLedger);
  await page.evaluate(async ({ owner, logs }) => {
    window.state.user.id = owner;
    window.titanClient.auth.getSession = async () => ({ data: { session: { user: { id: owner }, access_token: "synthetic-token" } }, error: null });
    const rows = logs.map((l) => ({ ...l, cat: l.category, syncStatus: "confirmed" }));
    window.state.history = rows.filter((l) => !l.archived_at);
    window.state.archivedHistory = rows.filter((l) => l.archived_at);
    window.dispatchEvent(new CustomEvent("titan:history-updated"));
  }, { owner: OWNER, logs: cloud.logs });
}
const sheet = (page) => page.locator("dialog[open]").last();
async function open(page, id) {
  await page.locator(`[data-open="${id}"]`).click();
  await sheet(page).locator(".jr-actions").waitFor();
  return sheet(page);
}
const close = (page) => page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
const controls = (page) => page.evaluate(() => {
  const all = [...window.state.history, ...window.state.archivedHistory];
  const c = window.TitanLedger.controls(all, { now: Date.now() });
  const rec = Object.fromEntries(c.records.map((r) => [r.id, [r.value, r.ref]]));
  return { journal: c.journal, archives: c.archives, sessions: c.period.sessions, minutes: c.period.minutes, km: c.period.km, distance: rec["distance:running"], xp: all.reduce((s, l) => s + (Number(l.xp) || 0), 0) };
});
async function download(page, selector) {
  const [file] = await Promise.all([page.waitForEvent("download"), page.locator(selector).click()]);
  return readFileSync(await file.path(), "utf8").replace(/^﻿/, "").split("\r\n");
}

test("correct, archive the duplicate, export, restore: the journal, its totals, records and exports follow, nothing is credited twice", async () => {
  cloud = cloudState();
  const { page, context, errors } = await device();
  try {
    await signIn(page);
    assert.deepEqual(await controls(page), { journal: 3, archives: 1, sessions: 3, minutes: 154, km: 30.8, distance: [10.6, GARMIN.slice(0, 8)], xp: 235 });

    // 1. Correction: 10,4 → 10 km and 52 → 50 min. Only those two fields leave; the date (no seconds in the form) and the note stay.
    let s = await open(page, RUN);
    await s.locator("[data-edit]").click();
    const form = sheet(page);
    await form.locator('input[name="val"]').fill("10");
    await form.locator('input[name="duration"]').fill("50");
    await form.locator('[type="submit"]').click();
    await page.waitForFunction((id) => window.state.history.find((l) => l.id === id)?.revision === 2, RUN);
    assert.deepEqual(cloud.patches.at(-1), { id: RUN, keys: ["duration", "val"] });
    assert.match(await page.locator(".asc-toast, [role=status]").allTextContents().then((t) => t.join(" ")), /Distance : 10,4 → 10 km · Durée : 52 → 50 min/);
    // An unchanged form sends nothing.
    s = await open(page, RUN);
    await s.locator("[data-edit]").click();
    await sheet(page).locator('[type="submit"]').click();
    assert.match(await sheet(page).locator(".jr-edit-error").textContent(), /Rien n’a changé/);
    await close(page);
    assert.equal(cloud.patches.length, 1);

    // 2. The sheet shows what changed and the canonical reference.
    s = await open(page, RUN);
    await s.locator("[data-changes]").waitFor();
    const changesText = await s.locator("[data-changes]").textContent();
    assert.match(changesText, /Distance : 10,4 → 10 km · Durée : 52 → 50 min/);
    assert.match(changesText, new RegExp(`Référence ${RUN.slice(0, 8)}`));
    await close(page);
    assert.deepEqual(await controls(page), { journal: 3, archives: 1, sessions: 3, minutes: 152, km: 30.4, distance: [10.6, GARMIN.slice(0, 8)], xp: 235 });

    // 3. The Garmin duplicate: its sources say a later Garmin edit does not come back; it is archived.
    s = await open(page, GARMIN);
    await s.locator("[data-source-limit]").waitFor();
    assert.match(await s.locator("[data-source-limit]").textContent(), /modification faite ensuite dans Garmin ne revient pas dans TITAN/);
    await s.locator("[data-toggle-archive]").click();
    await page.locator("dialog.asc-sheet[open] [data-ok]").click();
    await page.waitForFunction((id) => window.state.archivedHistory.some((l) => l.id === id), GARMIN);
    assert.deepEqual(await controls(page), { journal: 2, archives: 2, sessions: 2, minutes: 99, km: 19.8, distance: [10, RUN.slice(0, 8)], xp: 235 });

    // 4. Exports: the journal view, then the archives view, each row with its state and reference.
    const journalCsv = await download(page, "[data-export]");
    assert.equal(journalCsv.length, 3);
    assert.match(journalCsv[0], /"État";"Référence"$/);
    assert.ok(journalCsv.some((l) => l.includes('"10"') && l.includes(`"Confirmée";"${RUN.slice(0, 8)}"`)), journalCsv.join("\n"));
    await page.locator("[data-archived]").click();
    const archiveCsv = await download(page, "[data-export]");
    assert.equal(archiveCsv.length, 3);
    assert.ok(archiveCsv.slice(1).every((l) => l.includes('"Archivée"')), archiveCsv.join("\n"));

    // 5. A session archived by a rejoin cannot be restored from the journal: the message points at « Séparer ».
    s = await open(page, JOINED);
    await s.locator("[data-toggle-archive]").click();
    await page.locator("dialog.asc-sheet[open] [data-ok]").click();
    await page.getByText(/la restaurer la compterait deux fois/).first().waitFor();
    await close(page);
    assert.equal(await page.evaluate((id) => window.state.archivedHistory.some((l) => l.id === id), JOINED), true);

    // 6. Restore the duplicate: totals come back to step 2, the XP total is unchanged.
    s = await open(page, GARMIN);
    await s.locator("[data-toggle-archive]").click();
    await page.locator("dialog.asc-sheet[open] [data-ok]").click();
    await page.waitForFunction((id) => window.state.history.some((l) => l.id === id), GARMIN);
    assert.deepEqual(await controls(page), { journal: 3, archives: 1, sessions: 3, minutes: 152, km: 30.4, distance: [10.6, GARMIN.slice(0, 8)], xp: 235 });
    await page.locator("[data-archived]").click().catch(() => {});
    s = await open(page, GARMIN);
    await s.locator("[data-changes]").waitFor();
    assert.match(await s.locator("[data-changes]").textContent(), /Restaurée[\s\S]*Archivée/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
