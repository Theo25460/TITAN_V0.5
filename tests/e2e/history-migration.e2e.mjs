// V1.6.4 — Migration de l’historique, website. Real journal, real import sheet, real file chosen in the page, against a local fake of
// the RPCs of migration 20261130100300 (their contract is proven on a real PostgreSQL by sql/tests/300_history_migration.sql and the
// 5 000-row proofs of tools/db/test-history-migration.mjs). Scenario: a CSV profile file is previewed (time zone, units, rows already in
// the journal, an unknown sport classified, invalid rows explained), imported until the daily history budget stops it, resumed after a
// reload by choosing the same file again, read back as a per-row report, then withdrawn after a preview of its effects: the session that
// was already in the journal stays. External requests are blocked; no production account is used.
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
  browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
});
after(async () => { await browser?.close(); server?.kill(); });

const OWNER = "00000000-0000-4000-8000-0000000164aa";
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TYPED = uuid(1);
const row = (id, o) => ({ id, user_id: OWNER, client_event_id: id, category: "cardio", xp: 0, revision: 1, archived_at: null, created_at: "2024-03-12T09:00:00Z", ...o });

// 12/03/2024 07:15 in Paris is 06:15 UTC: the typed run of that morning is the same effort as the first row.
const FILE = [
  "identifiant;date;heure;sport;durée;distance;unité;ressenti;note",
  "r1;12/03/2024;07:15;Course à pied;0:52:10;10,4;km;6;Fractionné",
  "r2;14/03/2024;18:00;Natation;40 min;1500;m;;",
  "r3;16/03/2024;08:00;Zumba X;45;;;;",
  "r4;17/03/2024;;Course à pied;30;5;km;;",
  "r5;10/11/2026;08:00;Course à pied;30;5;km;;",
  "r6;19/07/2024;07:00;Vélo;2h05;52;km;;Col",
].join("\n");

function cloudState() {
  return {
    logs: [row(TYPED, { sport: "running", unit: "km", val: 10.4, date: "2024-03-12T06:17:00Z", details: { duration: 52, note: "Ma saisie" } })],
    batches: [], rows: {}, budget: 2, calls: [],
  };
}
let cloud = cloudState();
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const batchJson = (b) => {
  const rs = Object.values(cloud.rows[b.id] || {});
  const n = (o) => rs.filter((r) => r.outcome === o).length;
  const reasons = {};
  for (const r of rs) if (r.reason) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
  return { ...b, done_rows: rs.length, next_row: Math.max(0, ...rs.map((r) => r.row)) + 1, counts: { added: n("added"), linked: n("linked"), duplicate: n("duplicate"), skipped: n("skipped"), review: 0 }, reasons };
};
// The semantics of the five RPCs: one live batch per file, one result per row, history budget, withdrawal of untouched additions only.
const RPC = {
  titan_import_batches_v1: () => cloud.batches.map(batchJson).reverse(),
  titan_import_batch_open_v1: ({ p_format, p_file_hash, p_total, p_file_name }) => {
    let b = cloud.batches.find((x) => x.file_hash === p_file_hash && x.status !== "withdrawn");
    if (b) return { ...batchJson(b), resumed: true };
    b = { id: uuid(900 + cloud.batches.length), format: p_format, file_hash: p_file_hash, file_name: p_file_name, total_rows: p_total, status: "open", created_at: new Date().toISOString() };
    cloud.batches.push(b);
    cloud.rows[b.id] = {};
    return { ...batchJson(b), resumed: false };
  },
  titan_import_batch_rows_v1: ({ p_batch, p_items }) => {
    const b = cloud.batches.find((x) => x.id === p_batch);
    const rs = cloud.rows[b.id];
    let processed = 0, limited = false;
    for (const it of p_items) {
      if (rs[it.row]) continue;
      if (it.skip) { rs[it.row] = { row: it.row, outcome: "skipped", reason: it.skip }; processed++; continue; }
      const t = Date.parse(it.startedAt);
      const same = cloud.logs.find((l) => !l.archived_at && l.sport === it.sport && Math.abs(Date.parse(l.date) - t) < 30 * 60000);
      if (same) { rs[it.row] = { row: it.row, outcome: "linked", external_id: it.id, log_id: same.id }; processed++; continue; }
      if (cloud.budget <= 0) { limited = true; break; }
      cloud.budget--;
      const id = uuid(100 + cloud.logs.length);
      const unit = it.sport === "swimming" ? "m" : it.km ? "km" : "min";
      cloud.logs.push(row(id, { sport: it.sport, unit, val: unit === "m" ? it.km * 1000 : it.km || it.minutes, date: it.startedAt, created_at: new Date().toISOString(), details: { duration: it.minutes, historical: true, note: it.note } }));
      rs[it.row] = { row: it.row, outcome: "added", external_id: it.id, log_id: id, log_revision: 1 };
      processed++;
    }
    if (Object.keys(rs).length >= b.total_rows) Object.assign(b, { status: "done", finished_at: new Date().toISOString() });
    cloud.calls.push(`rows:${p_items.length}:${processed}${limited ? ":limited" : ""}`);
    return { ...batchJson(b), processed, limited, busy: false, replayed: 0 };
  },
  titan_import_batch_v1: ({ p_batch, p_outcome }) => {
    const b = cloud.batches.find((x) => x.id === p_batch);
    const rows = Object.values(cloud.rows[b.id]).filter((r) => !p_outcome || r.outcome === p_outcome).sort((x, y) => x.row - y.row).map((r) => {
      const l = cloud.logs.find((x) => x.id === r.log_id);
      return { ...r, needs_review: false, session: l ? { date: l.date, sport: l.sport, val: l.val, unit: l.unit, archived: !!l.archived_at, corrected: l.revision > 1 } : null };
    });
    return { ...batchJson(b), rows };
  },
  titan_import_batch_withdraw_v1: ({ p_batch, p_apply }) => {
    const b = cloud.batches.find((x) => x.id === p_batch);
    const rs = Object.values(cloud.rows[b.id]);
    const plan = rs.map((r) => r.outcome === "added" ? (cloud.logs.find((l) => l.id === r.log_id)?.revision === 1 ? "removed" : "kept_corrected") : r.outcome === "linked" ? "detached" : "none");
    const effects = { remove: plan.filter((p) => p === "removed").length, detach: plan.filter((p) => p === "detached").length, kept_corrected: plan.filter((p) => p === "kept_corrected").length };
    cloud.calls.push(`withdraw:${p_apply}`);
    if (!p_apply) return { ...batchJson(b), applied: false, effects };
    rs.forEach((r, i) => { r.withdrawn = plan[i]; if (plan[i] === "removed") cloud.logs = cloud.logs.filter((l) => l.id !== r.log_id); });
    Object.assign(b, { status: "withdrawn", withdrawn_at: new Date().toISOString(), withdraw_report: effects });
    return { ...batchJson(b), applied: true, effects };
  },
};

async function device() {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block", timezoneId: "Europe/Paris" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("internetdisconnected"));
  for (const name of Object.keys(RPC)) {
    await context.route(`**/rest/v1/rpc/${name}`, (route) => json(route, RPC[name](JSON.parse(route.request().postData() || "{}"))));
  }
  await context.route("**/rest/v1/training_logs?*", (route) => {
    const list = cloud.logs.slice().sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": `0-${Math.max(0, list.length - 1)}/${list.length}` }, body: JSON.stringify(list) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, errors };
}
async function signIn(page) {
  await page.goto(BASE + "/journal");
  await page.waitForFunction(() => window.TitanQueue && window.state?.user && window.titanHistoryMigration);
  await page.evaluate(async ({ owner, logs }) => {
    window.state.user.id = owner;
    window.titanClient.auth.getSession = async () => ({ data: { session: { user: { id: owner }, access_token: "synthetic-token" } }, error: null });
    window.state.history = logs.filter((l) => !l.archived_at).map((l) => ({ ...l, cat: l.category, syncStatus: "confirmed" }));
    window.state.archivedHistory = [];
    window.dispatchEvent(new CustomEvent("titan:history-updated"));
  }, { owner: OWNER, logs: cloud.logs });
}
const sheet = (page) => page.locator("dialog.mig-sheet[open]");
async function openWithFile(page) {
  await page.locator("[data-history-import]").click();
  await sheet(page).locator("[data-mig-step=pick]").waitFor();
  await sheet(page).locator("[data-mig-file]").setInputFiles({ name: "historique.csv", mimeType: "text/csv", buffer: Buffer.from(FILE, "utf8") });
  await sheet(page).locator("[data-mig-step=preview]").waitFor();
}
const counts = async (page) => Object.fromEntries(await Promise.all(["add", "link", "review", "skip"].map(async (k) => [k, Number((await sheet(page).locator(`[data-mig-count="${k}"]`).textContent().catch(() => "0")) || 0)])));

test("preview, classification, a budget stop, a resume after reload, the per-row report and a safe withdrawal", async () => {
  cloud = cloudState();
  let { page, context, errors } = await device();
  try {
    await signIn(page);
    await openWithFile(page);
    // Preview: Paris times, metres and miles read, the typed run recognised, every left-out row explained.
    let c = await counts(page);
    assert.deepEqual(c, { add: 2, link: 1, review: 0, skip: 3 });
    const text = await sheet(page).textContent();
    for (const words of ["CSV « TITAN historique v1 »", "6 lignes", "Les heures du fichier sont celles de", "« Zumba X » · 1 ligne", "Sport à classer", "Heure de début absente", "Séance des 30 derniers jours"])
      assert.ok(text.includes(words), `preview shows « ${words} »`);
    assert.match(await sheet(page).locator('[data-mig-plan="link"] li').first().textContent(), /Ligne 2 · Course à pied · 12 mars 2024, 07:15 · 52,2 min · 10,4 km — avec ta séance du 12 mars 2024, 07:17/);
    assert.match(await sheet(page).locator('[data-mig-plan="add"] li').first().textContent(), /Ligne 3 · Natation .* 1,5 km/);
    // The athlete classifies the unknown sport: the row moves to « à ajouter ».
    await sheet(page).locator('[data-mig-sport="Zumba X"]').selectOption("dance");
    await page.waitForFunction(() => document.querySelector('dialog.mig-sheet [data-mig-count="add"]')?.textContent === "3");
    c = await counts(page);
    assert.deepEqual(c, { add: 3, link: 1, review: 0, skip: 2 });

    // Import: the daily budget (2 sessions here) stops the batch cleanly.
    await sheet(page).locator("[data-mig-run]").click();
    await sheet(page).locator("[data-mig-paused=limited]").waitFor();
    assert.match(await sheet(page).locator("[data-mig-paused]").textContent(), /Limite du jour atteinte .* reprend à la ligne/);
    assert.equal(cloud.logs.length, 3, "two sessions added before the stop");
    await page.waitForFunction(() => window.state.history.length === 3);

    // « Restart »: the page is reloaded; nothing is kept on the device, the server lists the batch in progress.
    await context.close();
    cloud.budget = 300; // the next day
    ({ page, context, errors } = await device());
    await signIn(page);
    await page.locator("[data-history-import]").click();
    await sheet(page).locator("[data-mig-batch]").waitFor();
    assert.match(await sheet(page).locator("[data-mig-batch]").textContent(), /En cours \(\d\/6 lignes\).*choisis à nouveau ce fichier/s);
    await sheet(page).locator("[data-mig-file]").setInputFiles({ name: "historique.csv", mimeType: "text/csv", buffer: Buffer.from(FILE, "utf8") });
    await sheet(page).locator("[data-mig-step=preview]").waitFor();
    await sheet(page).locator('[data-mig-sport="Zumba X"]').selectOption("dance");
    // The two sessions added before the stop are now in the journal: the preview shows them as already there.
    await page.waitForFunction(() => document.querySelector('dialog.mig-sheet [data-mig-count="add"]')?.textContent === "1");
    assert.deepEqual(await counts(page), { add: 1, link: 3, review: 0, skip: 2 });
    await sheet(page).locator("[data-mig-run]").click();
    await sheet(page).locator("[data-mig-step=report]").waitFor();
    assert.equal(cloud.batches.length, 1, "the same file resumed the same batch");
    const sent = cloud.calls.filter((x) => x.startsWith("rows:"));
    assert.equal(sent.at(-1), "rows:1:1", "only the rows after the last recorded one were sent: " + sent.join(" "));
    // The report, from the server: one result per row, reasons in words.
    assert.match(await sheet(page).locator("[data-mig-final]").textContent(), /3 ajoutées.*1 associée.*0 déjà importée.*2 ignorées/);
    assert.match(await sheet(page).locator("[data-mig-measure]").textContent(), /6 \/ 6 lignes importées ou expliquées \(100 %\)/);
    assert.equal(await sheet(page).locator("[data-mig-report-row]").count(), 6);
    assert.match(await sheet(page).locator('[data-mig-report-row="5"]').textContent(), /Ignorée · Heure de début absente/);
    await page.waitForFunction(() => window.state.history.length === 4);

    // Withdrawal: the effects first, then only the batch's untouched additions go; the typed run stays.
    await sheet(page).locator("[data-mig-withdraw]").click();
    const confirm = page.locator("dialog.asc-sheet[open]:not(.mig-sheet)");
    await confirm.waitFor();
    const effects = await confirm.textContent();
    assert.match(effects, /3 séances ajoutées par ce lot retirées du journal\. 1 lien vers des séances déjà au journal défait : ces séances restent telles quelles\./);
    assert.equal(cloud.logs.length, 4, "the preview changes nothing");
    await confirm.locator("[data-ok]").click();
    await sheet(page).locator('[data-mig-status="withdrawn"]').waitFor();
    assert.deepEqual(cloud.logs.map((l) => l.id), [TYPED]);
    await page.waitForFunction(() => window.state.history.length === 1);
    assert.equal(await page.evaluate(() => window.state.history[0].details.note), "Ma saisie");
    assert.match(await sheet(page).locator("[data-mig-effects]").textContent(), /3 séances ajoutées par ce lot retirées/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
