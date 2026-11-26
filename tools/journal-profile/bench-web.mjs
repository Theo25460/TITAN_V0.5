// V1.6.6 — Journal longue durée, website benchmark. The real built site (dist/ of the tree given by --tree), the real Supabase SDK
// and the real journal, signed in on a synthetic account that holds the 10 000-session profile of dataset.mjs, served by
// fake-postgrest.mjs over a modelled network (--net local | faible). Chromium in this container, 390 × 900 viewport, CPU not
// throttled. Measures, per run: first usable journal (first row painted) cold and warm, complete history, filter latency (p50/p95
// over 60 family changes and 20 searches), opening an old session, correcting its elevation until the journal and its records are
// redrawn, the offline reload. Usage:
//   node tools/journal-profile/bench-web.mjs --tree . --net faible --runs 3 --label après --out docs/v166/web-apres-faible.json
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";
import { generate, OWNER, NOW } from "./dataset.mjs";
import { query, delayOf, networkProfile } from "./fake-postgrest.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? [...a, [v.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]] : a), []));
const TREE = resolve(args.tree || ".");
const NET = networkProfile(args.net || "local");
const RUNS = Number(args.runs || 3);
const N = Number(args.n || 10000);

const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : null; };
const round = (x) => (x === null || x === undefined ? null : Math.round(x));

async function freePort() {
  return new Promise((ok) => { const s = createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => ok(port)); }); });
}

function makeCloud() {
  const { logs, oldId } = generate({ n: N });
  return { logs: logs.map((l) => structuredClone(l)), oldId, requests: [], bytes: 0, gz: 0 };
}

async function device(browser, cloud, base) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block", timezoneId: "Europe/Paris" });
  context.setDefaultTimeout(240000);
  const now = Math.floor(Date.now() / 1000), user = { id: OWNER, email: "longue-duree@example.test", aud: "authenticated", app_metadata: {}, user_metadata: {} };
  const token = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ sub: OWNER, aud: "authenticated", role: "authenticated", iat: now, exp: now + 7200 })).toString("base64url"), "synthetic-signature"].join(".");
  await context.addInitScript((session) => {
    if (!localStorage.getItem("titan_supabase_auth_v1")) localStorage.setItem("titan_supabase_auth_v1", JSON.stringify(session));
    localStorage.setItem("titan_first_run_guide_v2", "seen-by-test");
    // First journal row painted: the moment the athlete can read and open a session.
    window.__bench = { firstRow: null, longTasks: 0, longTaskMs: 0 };
    // Time to the frame after an action: the update has been laid out and handed to the compositor.
    window.__nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    new MutationObserver((_, obs) => {
      if (!window.__bench.firstRow && document.querySelector("#journal .jr-row")) {
        requestAnimationFrame(() => { window.__bench.firstRow = performance.now(); });
        obs.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__bench.longTasks++; window.__bench.longTaskMs += e.duration; } }).observe({ type: "longtask", buffered: true }); } catch {}
  }, { access_token: token, refresh_token: "synthetic-refresh", token_type: "bearer", expires_in: 7200, expires_at: now + 7200, user });
  let busyUntil = 0;
  const profile = { id: OWNER, username: "Athlète longue durée", friend_code: "TN-LONGUE", xp: 900000, credits: 500, level: 40, state_version: 1, game_state: { user: { id: OWNER, onboardedAt: "2021-11-01", onboardingComplete: true }, history: [] } };
  const handle = async (route) => {
    const req = route.request(), url = new URL(req.url());
    if (url.hostname.endsWith("supabase.co")) {
      if (cloud.offline) return route.abort("internetdisconnected");
      const reply = async (body, extra = {}) => {
        const text = JSON.stringify(body);
        const d = delayOf(NET, text);
        if (d.ms) {
          const start = Math.max(Date.now() + NET.rtt, busyUntil);
          busyUntil = start + (d.ms - NET.rtt);
          await new Promise((r) => setTimeout(r, busyUntil - Date.now()));
        }
        if (/training_logs/.test(url.pathname)) { cloud.requests.push(url.search.slice(0, 160)); cloud.bytes += text.length; cloud.gz += d.gz; }
        return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "content-range", ...extra }, body: text });
      };
      if (url.pathname === "/auth/v1/user") return reply(user);
      if (url.pathname === "/rest/v1/profiles") return reply(profile);
      if (url.pathname === "/rest/v1/training_logs") {
        const r = query(cloud.logs, url, req.headers());
        return reply(r.body, { "content-range": r.contentRange });
      }
      if (url.pathname === "/rest/v1/rpc/titan_update_training_session") {
        const { p_id, p_revision, p_patch } = req.postDataJSON();
        const l = cloud.logs.find((x) => x.id === p_id);
        if (!l || l.revision !== p_revision) return route.fulfill({ status: 400, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ code: "40001", message: "SESSION_VERSION_CONFLICT" }) });
        if ("elevation" in p_patch) l.details = { ...l.details, elevation: p_patch.elevation };
        if ("extras" in p_patch) l.details = { ...l.details, extras: { ...(l.details.extras || {}), ...p_patch.extras } };
        if ("val" in p_patch) l.val = p_patch.val;
        if ("duration" in p_patch) l.details = { ...l.details, duration: p_patch.duration, val2: p_patch.duration };
        if ("note" in p_patch) l.details = { ...l.details, note: p_patch.note };
        if ("archived" in p_patch) l.archived_at = p_patch.archived ? new Date().toISOString() : null;
        l.revision += 1;
        return reply(l);
      }
      if (url.pathname === "/rest/v1/rpc/titan_get_progression_snapshot") return reply([{ server_user_id: OWNER, xp: profile.xp, credits: profile.credits, level: profile.level, checked_at: new Date().toISOString() }]);
      if (url.pathname === "/rest/v1/rpc/titan_session_matches_v1" || url.pathname === "/rest/v1/rpc/titan_session_changes_v1") return reply([]);
      if (url.pathname.startsWith("/rest/v1/rpc/")) return route.fulfill({ status: 404, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ code: "PGRST202", message: "Optional synthetic RPC unavailable" }) });
      if (url.pathname.startsWith("/rest/v1/")) return reply([]);
      return route.abort("internetdisconnected");
    }
    if (url.hostname !== "127.0.0.1") return route.abort("internetdisconnected");
    return route.continue();
  };
  await context.route("**/*", async (route) => { try { await handle(route); } catch {} });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page, errors };
}


async function loadJournal(page, base, expectedActive, { reload = false } = {}) {
  if (reload) await page.reload(); else await page.goto(base + "/journal");
  await page.waitForFunction(() => window.__bench?.firstRow, null, { polling: 50, timeout: 300000 });
  await page.waitForFunction((n) => window.titanCloudHistoryLoadedAt && (window.state?.history?.length || 0) >= n
    && (!window.TitanHistoryWindow || window.titanHistoryCoverage?.complete !== false), expectedActive, { polling: 50, timeout: 300000 });
  return page.evaluate(() => ({ firstRow: window.__bench.firstRow, complete: performance.now(), longTasks: window.__bench.longTasks, longTaskMs: window.__bench.longTaskMs, heapMb: performance.memory ? performance.memory.usedJSHeapSize / 1e6 : null }));
}

async function filterTimes(page) {
  return page.evaluate(async () => {
    const next = window.__nextFrame;
    const out = { family: [], search: [] };
    const fams = ["endurance", "force", "technique", "mobilite", "all"];
    for (let k = 0; k < 60; k++) {
      const b = document.querySelector(`#journal [data-family="${fams[k % fams.length]}"].seance-chip`);
      const t0 = performance.now();
      b.click();
      await next();
      out.family.push(performance.now() - t0);
    }
    document.querySelector('#journal [data-family="all"].seance-chip').click();
    const terms = ["vélo", "galibier", "squat", "", "course 2023", "", "vtt", ""];
    for (let k = 0; k < 20; k++) {
      const input = document.getElementById("jr-q");
      const box = document.getElementById("jr-results");
      const changed = new Promise((r) => { const o = new MutationObserver(() => { o.disconnect(); r(); }); o.observe(box, { childList: true, subtree: true, characterData: true }); setTimeout(() => { o.disconnect(); r(); }, 3000); });
      const t0 = performance.now();
      input.value = terms[k % terms.length];
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await changed;
      await next();
      out.search.push(performance.now() - t0);
    }
    return out;
  });
}

async function openOld(page, oldId) {
  await page.evaluate(async () => {
    const input = document.getElementById("jr-q");
    input.value = "galibier";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    await window.__nextFrame();
  }, {});
  return page.evaluate(async ({ id }) => {
    const row = document.querySelector(`#journal [data-open="${id}"]`);
    if (!row) return { ms: null, found: false };
    const t0 = performance.now();
    row.click();
    for (let i = 0; i < 400; i++) {
      if (document.querySelector("dialog[open] .jr-actions")) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    await window.__nextFrame();
    return { ms: performance.now() - t0, found: !!document.querySelector("dialog[open] .jr-actions") };
  }, { id: oldId });
}

// The correction of the old ride: its duration (a field every version can correct, so before and after follow the same path), or
// its elevation (--edit elevation, V1.6.6). Measured from the submit to the journal redrawn with the corrected row.
const EDIT = args.edit || "duration";
const read = (l, field) => (field === "elevation" ? l?.details?.elevation : l?.details?.duration);
async function correctElevation(page, oldId, value) {
  await page.locator("dialog[open] [data-edit]").click();
  const input = page.locator(`dialog[open] form.jr-edit [name="${EDIT}"]`);
  await input.waitFor({ state: "attached" });
  await input.fill(String(value));
  // BENCH_PROFILE=<file>: a CPU profile of the correction, from the submit to the redrawn journal (diagnosis only).
  let cdp = null;
  if (process.env.BENCH_PROFILE) { cdp = await page.context().newCDPSession(page); await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start"); }
  const result = await page.evaluate(async ({ id, value, field }) => {
    const read = (l) => (field === "elevation" ? l?.details?.elevation : l?.details?.duration);
    const form = document.querySelector("dialog[open] form.jr-edit");
    const journal = document.getElementById("journal");
    const before = window.state.history.find((l) => l.id === id)?.revision;
    let redrawn = null;
    const obs = new MutationObserver(() => { if (window.state.history.find((l) => l.id === id)?.revision > before) redrawn = performance.now(); });
    obs.observe(journal, { childList: true, subtree: true });
    const t0 = performance.now();
    form.requestSubmit();
    for (let i = 0; i < 2000 && !redrawn; i++) await new Promise((r) => setTimeout(r, 5));
    await window.__nextFrame();
    obs.disconnect();
    const t1 = performance.now();
    const row = window.state.history.find((l) => l.id === id);
    const r0 = performance.now();
    const records = window.TitanInsights.records(window.state.history, "all", Date.now()).length;
    const recordsMs = performance.now() - r0;
    return { ms: redrawn ? t1 - t0 : null, field, value: read(row), revision: row?.revision, ok: Number(read(row)) === value, records, recordsFullMs: recordsMs };
  }, { id: oldId, value, field: EDIT });
  if (cdp) { const { profile } = await cdp.send("Profiler.stop"); writeFileSync(process.env.BENCH_PROFILE, JSON.stringify(profile)); }
  return result;
}

// Offline: the site itself stays served (the service worker is blocked in this bench), the Supabase host is cut and the browser
// says it is offline, as a phone without network that reopens the installed app.
async function offlineReload(page, context, base, cloud) {
  cloud.offline = true;
  await context.addInitScript(() => { Object.defineProperty(Navigator.prototype, "onLine", { configurable: true, get: () => false }); });
  await page.goto(base + "/journal").catch(() => {});
  await page.waitForFunction(() => window.__bench?.firstRow, null, { polling: 50, timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({
    firstRow: window.__bench?.firstRow || null,
    rows: (window.state?.history || []).length,
    coverage: document.querySelector("#journal [data-coverage]")?.textContent?.trim().replace(/\s+/g, " ") || null,
  }));
  return r;
}

async function main() {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [resolve(TREE, "tools/serve-public.mjs"), String(port)], { cwd: TREE, stdio: "ignore" });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(base + "/")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const runs = [];
  try {
    for (let run = 0; run < RUNS; run++) {
      const cloud = makeCloud();
      const expected = cloud.logs.filter((l) => !l.archived_at).length;
      const { context, page, errors } = await device(browser, cloud, base);
      try {
        const cold = await loadJournal(page, base, expected);
        const coldTraffic = { requests: cloud.requests.length, mb: cloud.bytes / 1e6, gzMb: cloud.gz / 1e6, sample: cloud.requests.slice(0, 3) };
        const filters = await filterTimes(page);
        const open = await openOld(page, cloud.oldId);
        const edit = open.found ? await correctElevation(page, cloud.oldId, (EDIT === "elevation" ? 1650 : 200) + run) : { ms: null };
        await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
        cloud.requests = []; cloud.bytes = 0; cloud.gz = 0;
        await page.waitForTimeout(1500);
        await page.evaluate(() => { window.__bench.firstRow = null; });
        // Warm: the same browser profile, IndexedDB filled by the previous load.
        const warm = await loadJournal(page, base, expected, { reload: true });
        const warmTraffic = { requests: cloud.requests.length, mb: cloud.bytes / 1e6, gzMb: cloud.gz / 1e6 };
        const stillThere = await page.evaluate(({ id, field }) => { const l = window.state.history.find((x) => x.id === id); return field === "elevation" ? l?.details?.elevation : l?.details?.duration; }, { id: cloud.oldId, field: EDIT });
        const offline = await offlineReload(page, context, base, cloud);
        runs.push({ run, cold, coldTraffic, filters, open, edit, warm, warmTraffic, editKeptAfterReload: stillThere, offline, errors: errors.slice(0, 5) });
        console.error(`run ${run}: cold ${round(cold.firstRow)}/${round(cold.complete)} ms, warm ${round(warm.firstRow)}/${round(warm.complete)} ms, family p95 ${round(pct(filters.family, 95))} ms, search p95 ${round(pct(filters.search, 95))} ms, open ${round(open.ms)} ms, edit ${round(edit.ms)} ms`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); server.kill(); }
  const all = (f) => runs.flatMap(f);
  const summary = {
    label: args.label || "", tree: TREE, network: NET.label, sessions: N, runs: RUNS, browser: `Chromium ${chromium.name?.() || ""}`.trim(), viewport: "390×900", date: new Date().toISOString(), datasetNow: new Date(NOW).toISOString(),
    coldFirstRowMs: runs.map((r) => round(r.cold.firstRow)), coldCompleteMs: runs.map((r) => round(r.cold.complete)),
    warmFirstRowMs: runs.map((r) => round(r.warm.firstRow)), warmCompleteMs: runs.map((r) => round(r.warm.complete)),
    coldTraffic: runs[0]?.coldTraffic, warmTraffic: runs[0]?.warmTraffic,
    familyFilter: { n: all((r) => r.filters.family).length, p50: round(pct(all((r) => r.filters.family), 50)), p95: round(pct(all((r) => r.filters.family), 95)), max: round(Math.max(...all((r) => r.filters.family))) },
    searchFilter: { n: all((r) => r.filters.search).length, p50: round(pct(all((r) => r.filters.search), 50)), p95: round(pct(all((r) => r.filters.search), 95)), debounceMs: 120 },
    openOldMs: runs.map((r) => round(r.open.ms)), editRedrawMs: runs.map((r) => round(r.edit.ms)), recordsFullMs: runs.map((r) => round(r.edit.recordsFullMs)),
    edit: EDIT, editOk: runs.every((r) => r.edit.ok && Number(r.editKeptAfterReload) === Number(r.edit.value)),
    longTasksCold: runs.map((r) => [r.cold.longTasks, round(r.cold.longTaskMs)]), heapMbCold: runs.map((r) => round(r.cold.heapMb)),
    offline: runs.map((r) => r.offline), errors: runs.flatMap((r) => r.errors),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (args.out) { mkdirSync(dirname(resolve(args.out)), { recursive: true }); writeFileSync(resolve(args.out), JSON.stringify({ summary, runs }, null, 2) + "\n"); }
}
main().catch((e) => { console.error(e); process.exit(1); });
