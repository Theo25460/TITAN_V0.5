// TITAN 300 — moderation screen of the admin control center, driven in Chromium against dist/.
// The administration client is replaced by a recorder: nothing here reaches a real project.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
let server;
let browser;
let BASE;

const freePort = () =>
  new Promise((ok) => {
    const s = createServer();
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

before(async () => {
  const port = await freePort();
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE + "/")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  server?.kill();
});

const P1 = "00000000-0000-4000-8000-0000000000a1";
const P2 = "00000000-0000-4000-8000-0000000000a2";
const P3 = "00000000-0000-4000-8000-0000000000a3";
const evil = '<img src=x onerror="window.pwned=1">';

// Installed before any page script; config.js cannot replace the stub.
function installFakeAdmin({ admin = true, mode = "ok" } = {}) {
  return ({ admin, mode, P1, P2, P3, evil }) => {
    const calls = [];
    const db = {
      status: { [P1]: "active", [P2]: "active", [P3]: "banned" },
      decisions: { [P1]: [], [P2]: [], [P3]: [] },
      dismissed: {},
      excluded: { r1: true },
      queueCalls: 0,
      next: 100,
    };
    const level = (s) => (s >= 40 ? "urgent" : s >= 20 ? "review" : s >= 8 ? "watch" : "low");
    const queue = () => ({
      version: 1, limit: 50, generated_at: "2026-10-19T10:00:00Z",
      entries: [
        { user_id: P1, username: `Alex ${evil}`, status: db.status[P1], score: 44, level: level(44),
          signals: [
            { reason: "TRAINING_REVIEW_RECOMMENDED", severity: "high", count: 5, points: 24, first_at: "2026-10-18T08:00:00Z", last_at: "2026-10-19T09:00:00Z" },
            { reason: "TRAINING_FREQUENCY_OUT_OF_RANGE", severity: "critical", count: 1, points: 20, first_at: "2026-10-19T07:00:00Z", last_at: "2026-10-19T07:00:00Z" },
          ],
          last_decision: db.decisions[P1][0] ? { id: db.decisions[P1][0].id, decision: db.decisions[P1][0].decision, at: db.decisions[P1][0].at } : null },
        { user_id: P2, username: "Sam", status: db.status[P2], score: 3, level: level(3),
          signals: [{ reason: "TRAINING_FREQUENCY_HIGH", severity: "low", count: 50, points: 3, first_at: "2026-10-10T08:00:00Z", last_at: "2026-10-19T09:00:00Z" }],
          last_decision: null },
      ].filter((e) => mode !== "empty" && !db.dismissed[e.user_id]),
    });
    const caseFile = (id) => ({
      version: 1,
      user: { id, username: id === P1 ? `Alex ${evil}` : id === P3 ? "Robin" : "Sam", status: db.status[id], is_suspended: db.status[id] === "suspended" },
      score: id === P1 ? 44 : 3, level: id === P1 ? "urgent" : "low",
      signals: id === P3 || db.dismissed[id] ? [] : queue().entries.find((e) => e.user_id === id).signals,
      signals_recent: [
        { id: "s1", at: "2026-10-19T09:00:00Z", action_type: "training_log.flagged", severity: "high", reason: "TRAINING_REVIEW_RECOMMENDED", status: "open", payload: { note: evil, distance: 42.2, filler: "x".repeat(1500) } },
      ],
      decisions: db.decisions[id].map((d) => ({ id: d.id, at: d.at, admin_id: "adm", decision: d.decision, reason: d.reason, reverts: d.reverts || null })),
    });
    const sessionRisk = (id) => ({
      sessions: id !== P1 ? [] : [
        { id: "r1", sport: `running ${evil}`, date: "2026-10-18T09:00:00Z", value: 20, unit: "km", durationMin: 60, historical: false, score: 8, state: "review", excludedFromRankings: !!db.excluded.r1,
          signals: [{ code: "speed_jump", severity: "high", points: 8, detail: { kmh: 20, medianKmh: 10, priorSessions: 5 } }] },
        { id: "r2", sport: "cycling", date: "2026-10-17T09:00:00Z", value: 30, unit: "min", durationMin: 60, historical: false, score: 3, state: "watch", excludedFromRankings: !!db.excluded.r2,
          signals: [{ code: "overlap", severity: "medium", points: 3, detail: { overlapMinutes: 50, shareOfShorter: 0.83 } }] },
        { id: "r3", sport: "yoga", date: "2026-10-16T09:00:00Z", value: 30, unit: "min", durationMin: 30, historical: false, score: 0, state: "normal", excludedFromRankings: false, signals: [] },
      ],
      rule: "Poids faible 1, moyen 3, haut 8, critique 20. Indicatif : rien n'est exclu automatiquement.",
      counts: { normal: id === P1 ? 1 : 0, watch: id === P1 ? 1 : 0, review: id === P1 ? 1 : 0, critical: 0 },
    });
    const fail = (message, code) => ({ data: null, error: { message, code } });
    window.__mod = { calls, db };
    const client = {
      auth: {
        getUser: async () => ({ data: { user: { id: "adm", email: "admin@example.test" } }, error: null }),
        signOut: async () => ({ error: null }),
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      from: () => { throw new Error("direct table access is not expected"); },
      rpc: async (name, params = {}) => {
        calls.push({ name, params });
        if (name === "titan_admin_list_profiles_v1") return { data: [{ id: P2, username: "Sam", status: "active", role: "user", created_at: "2026-10-01T00:00:00Z" }], error: null };
        if (name === "titan_admin_get_context_v1") return { data: { isAdmin: admin, role: admin ? "admin" : "user" }, error: null };
        if (name === "titan_session_exclusion_v1") {
          if (mode === "refuse-session") return fail("CANNOT_MODERATE_ADMIN", "42501");
          db.excluded[params.p_session] = params.p_excluded;
          return { data: { session: params.p_session, excluded: params.p_excluded, changed: true }, error: null };
        }
        if (name === "titan_session_risk_v1") {
          if (mode === "oldserver" || mode === "norisk") return fail("Could not find the function public." + name + " in the schema cache", "PGRST202");
          if (mode === "risk-throws") throw new Error("boom");
          if (mode === "risk-hang") return new Promise(() => {});
          if (mode === "risk-malformed") return { data: { sessions: [null, 7,
            { id: "m1", sport: "x", date: "2026-10-18T09:00:00Z", value: null, unit: "km", state: "review", score: 5, signals: {} },
            { id: "m2", sport: "y", date: "2026-10-18T10:00:00Z", value: 4, unit: "km", state: "critical", score: 25, excludedFromRankings: false,
              signals: [null, { code: "speed_jump", severity: "high", points: 8, detail: { kmh: null, medianKmh: "abc", priorSessions: 5 } }] }] }, error: null };
          if (mode === "risk-shapeless") return { data: { sessions: "x" }, error: null };
          return { data: sessionRisk(params.p_user), error: null };
        }
        if (name === "titan_appeal_list_v1") {
          if (mode === "oldserver") return fail("Could not find the function public.titan_appeal_list_v1 in the schema cache", "PGRST202");
          if (mode === "forbidden") return fail("ADMIN_ONLY", "42501");
          db.appeals = db.appeals || [
            { id: 7, userId: P1, kind: "session", sessionId: "r1", message: `Course faite avec ma montre ${evil}`, status: "open", createdAt: "2026-10-19T08:00:00Z", session: { sport: "running", date: "2026-10-18T09:00:00Z", excluded: true } },
            { id: 8, userId: P2, kind: "account", sessionId: null, message: "Suspension injustifiée.", status: "open", createdAt: "2026-10-19T08:30:00Z", session: null },
          ];
          return { data: { version: 1, appeals: mode === "empty" ? [] : db.appeals.filter((a) => a.status === "open") }, error: null };
        }
        if (name === "titan_appeal_decide_v1") {
          if (mode === "appeal-refused") return fail("STATE_CHANGED", "23514");
          const a = db.appeals.find((x) => x.id === params.p_id);
          a.status = params.p_accept ? "accepted" : "declined";
          return { data: { version: 1, id: a.id, status: a.status }, error: null };
        }
        if (name === "titan_verification_list_v1") {
          if (mode === "oldserver" || mode === "no-verif") return fail("Could not find the function public.titan_verification_list_v1 in the schema cache", "PGRST202");
          db.verif = db.verif || { [P1]: [{ id: 5, message: `Merci de confirmer ta séance ${evil}`, status: "answered", createdAt: "2026-10-18T08:00:00Z", answer: `Oui, c’était moi ${evil}`, answeredAt: "2026-10-18T09:00:00Z", closedAt: null }] };
          return { data: { version: 1, requests: (db.verif[params.p_user] || []) }, error: null };
        }
        if (name === "titan_verification_request_v1") {
          if (mode === "verify-refused") return fail("REQUEST_ALREADY_OPEN", "23505");
          db.verif = db.verif || {};
          (db.verif[params.p_user] = db.verif[params.p_user] || []).push({ id: 20, message: params.p_message, status: "open", createdAt: "2026-10-20T08:00:00Z", answer: null, answeredAt: null, closedAt: null });
          return { data: { version: 1, id: 20, status: "open" }, error: null };
        }
        if (name === "titan_verification_close_v1") {
          for (const list of Object.values(db.verif || {})) for (const r of list) if (r.id === params.p_id) r.status = "closed";
          return { data: { version: 1, id: params.p_id, status: "closed" }, error: null };
        }
        if (!name.startsWith("titan_moderation_")) return { data: null, error: { message: "unexpected rpc " + name } };
        if (mode === "oldserver") return fail("Could not find the function public." + name + " in the schema cache", "PGRST202");
        if (mode === "forbidden") return fail("ADMIN_ONLY", "42501");
        if (name === "titan_moderation_queue_v1") {
          db.queueCalls++;
          if (mode === "refresh-fails" && db.queueCalls > 1) return fail("upstream 503", "503");
          return { data: queue(), error: null };
        }
        if (name === "titan_moderation_case_v1") return { data: caseFile(params.p_user), error: null };
        if (name === "titan_moderation_decide_v1") {
          if (mode === "refuse-admin") return fail("CANNOT_MODERATE_ADMIN", "42501");
          const id = db.next++;
          db.decisions[params.p_user].unshift({ id, decision: params.p_decision, reason: params.p_reason, at: "2026-10-19T10:05:00Z" });
          if (params.p_decision === "suspend") db.status[params.p_user] = "suspended";
          if (params.p_decision === "restore") db.status[params.p_user] = "active";
          if (params.p_decision === "dismiss") db.dismissed[params.p_user] = true;
          return { data: { version: 1, decision_id: id, decision: params.p_decision, user_id: params.p_user }, error: null };
        }
        if (name === "titan_moderation_revert_v1") {
          const list = Object.values(db.decisions).flat();
          const target = list.find((d) => d.id === params.p_decision_id);
          const id = db.next++;
          for (const uid of Object.keys(db.decisions)) if (db.decisions[uid].includes(target)) {
            if (target.decision === "suspend") db.status[uid] = "active";
            if (target.decision === "dismiss") db.dismissed[uid] = false;
            db.decisions[uid].unshift({ id, decision: "revert", reason: params.p_reason, reverts: target.id, at: "2026-10-19T10:06:00Z" });
          }
          const partial = target.decision === "dismiss";
          return { data: { version: 1, decision_id: id, decision: "revert", reverts: target.id, reopened: partial ? 1 : 0, expected: partial ? 2 : 0 }, error: null };
        }
        return fail("unknown");
      },
    };
    Object.defineProperty(window, "waitForTitanSupabase", { configurable: true, get: () => async () => client, set() {} });
  };
}

async function open(width, opts = {}, hash = "moderation") {
  const context = await browser.newContext({ viewport: { width, height: width > 900 ? 900 : 844 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(installFakeAdmin(opts), { admin: opts.admin ?? true, mode: opts.mode ?? "ok", P1, P2, P3, evil });
  await page.goto(BASE + "/admin#" + hash, { waitUntil: "load" });
  return { page, context, errors };
}
const calls = (page) => page.evaluate(() => window.__mod.calls.map((c) => c.name + ":" + JSON.stringify(c.params)));

test("moderation queue: ranked accounts, explained signals, safe text, no raw payload", async () => {
  const { page, context, errors } = await open(1280);
  await page.getByRole("heading", { name: "Modération" }).first().waitFor();
  const rows = page.locator("[data-moderation-user]");
  await rows.first().waitFor();
  assert.equal(await rows.count(), 2);
  assert.equal(await rows.first().getAttribute("data-moderation-user"), P1, "highest risk first");
  const first = await rows.first().innerText();
  assert.match(first, /44/);
  assert.match(first, /urgent/i);
  assert.match(first, /TRAINING_REVIEW_RECOMMENDED/);
  assert.match(first, /×\s?5|5 fois|5 occurrences/);
  assert.match(await rows.nth(1).innerText(), /50/, "the real number of occurrences stays visible");
  assert.equal(await page.locator("#admin-view img").count(), 0, "account names and signals are escaped");
  assert.equal(await page.evaluate(() => window.pwned), undefined);
  assert.doesNotMatch(await page.locator("#admin-view").innerText(), /distance|payload/i, "raw payloads stay out of the queue");
  assert.match(await page.locator("#admin-view").innerText(), /aucune action n.est automatique/i);
  assert.ok((await calls(page)).some((c) => c.startsWith("titan_moderation_queue_v1:")));
  assert.deepEqual(errors, []);
  await context.close();
});

test("moderation queue: empty, old server and forbidden states are explained", async () => {
  for (const [mode, pattern] of [["empty", /Aucun compte à examiner/], ["oldserver", /migration 20261019150000/], ["forbidden", /réservée aux administrateurs/]]) {
    const { page, context, errors } = await open(1280, { mode });
    await page.locator("#admin-view").getByText(pattern).waitFor();
    assert.equal(await page.locator("[data-moderation-user]").count(), 0, mode);
    assert.deepEqual(errors, [], mode);
    await context.close();
  }
});

test("moderation screen: a non-administrator never reaches the moderation functions", async () => {
  const { page, context } = await open(1280, { admin: false });
  await page.locator("#gate-message").getByText(/refus/i).waitFor();
  assert.equal((await calls(page)).filter((c) => c.startsWith("titan_moderation_")).length, 0);
  await context.close();
});

test("moderation case: explained score, raw signals, decisions; a decision needs a reason and is reversible", async () => {
  const { page, context, errors } = await open(1280);
  await page.locator(`[data-moderation-open="${P1}"]`).click();
  const modal = page.locator("#admin-modal");
  await modal.getByText(/poids de la gravité/i).waitFor();
  const text = await modal.innerText();
  assert.match(text, /min\(occurrences, 3\)|au plus 3/i, "the scoring rule is explained");
  assert.match(text, /TRAINING_FREQUENCY_OUT_OF_RANGE/);
  assert.match(text, /distance/, "the case file shows the raw signal");
  assert.equal(await modal.locator("img").count(), 0, "payload text is escaped");
  assert.equal(await page.evaluate(() => window.pwned), undefined);

  // No reason, no request.
  await modal.locator('[data-moderation-decide="suspend"]').click();
  await page.locator("[data-confirm-ok]").click();
  assert.equal((await calls(page)).filter((c) => c.startsWith("titan_moderation_decide_v1")).length, 0, "empty reason sends nothing");
  await page.locator("[data-confirm-reason]").fill("Séances impossibles répétées");
  await page.locator("[data-confirm-ok]").click();
  await page.waitForFunction(() => window.__mod.db.status["00000000-0000-4000-8000-0000000000a1"] === "suspended");
  const decide = (await calls(page)).find((c) => c.startsWith("titan_moderation_decide_v1"));
  assert.match(decide, /"p_decision":"suspend"/);
  assert.match(decide, /Séances impossibles répétées/);
  assert.ok(decide.includes(P1));

  // The case file now offers the way back: restore, and revert of the latest decision.
  await modal.locator('[data-moderation-decide="restore"]').waitFor();
  assert.equal(await modal.locator('[data-moderation-decide="suspend"]').count(), 0, "no second suspension offered");
  await modal.locator("[data-moderation-revert]").first().click();
  await page.locator("[data-confirm-reason]").fill("Erreur de jugement");
  await page.locator("[data-confirm-ok]").click();
  await page.waitForFunction(() => window.__mod.db.status["00000000-0000-4000-8000-0000000000a1"] === "active");
  await modal.locator('[data-moderation-decide="suspend"]').waitFor();
  assert.equal(await modal.locator("[data-moderation-revert]").count(), 0, "a revert cannot itself be reverted");
  assert.deepEqual(errors, []);
  await context.close();
});

test("moderation decisions: server refusals are explained in French and nothing is applied", async () => {
  const { page, context } = await open(1280, { mode: "refuse-admin" });
  await page.locator(`[data-moderation-open="${P2}"]`).click();
  await page.locator('#admin-modal [data-moderation-decide="watch"]').click();
  await page.locator("[data-confirm-reason]").fill("Surveillance");
  await page.locator("[data-confirm-ok]").click();
  await page.locator("#admin-toast-stack").getByText(/administrateur/i).waitFor();
  assert.equal(await page.evaluate(() => window.__mod.db.decisions["00000000-0000-4000-8000-0000000000a2"].length), 0);
  await context.close();
});

test("moderation screen: usable at 360 px without horizontal overflow", async () => {
  const { page, context } = await open(360);
  await page.locator("[data-moderation-user]").first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, "page overflow");
  await page.locator(`[data-moderation-open="${P1}"]`).click();
  await page.locator('#admin-modal [data-moderation-decide="watch"]').waitFor();
  const box = await page.locator("#admin-modal .modal-card").boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 360 + 1, `the case file fits the screen: ${JSON.stringify(box)} modalScroll=${await page.evaluate(() => document.querySelector("#admin-modal").scrollWidth)}`);
  await context.close();
});

test("moderation: a dismissed account stays reachable by identifier and its decision can be reverted", async () => {
  const { page, context, errors } = await open(1280);
  await page.locator(`[data-moderation-open="${P1}"]`).click();
  await page.locator('#admin-modal [data-moderation-decide="dismiss"]').click();
  await page.locator("[data-confirm-reason]").fill("Faux positif confirmé");
  await page.locator("[data-confirm-ok]").click();
  await page.waitForFunction(() => window.__mod.db.dismissed["00000000-0000-4000-8000-0000000000a1"] === true);
  await page.locator("#modal-close").click();
  await page.locator(`[data-moderation-user="${P1}"]`).waitFor({ state: "detached" });
  const before = (await calls(page)).filter((c) => c.startsWith("titan_moderation_case_v1")).length;
  await page.locator("[data-moderation-lookup] [name=user]").fill("not-an-id");
  await page.locator("[data-moderation-lookup-submit]").click();
  await page.locator("#admin-toast-stack").getByText(/Identifiant invalide/).waitFor();
  assert.equal((await calls(page)).filter((c) => c.startsWith("titan_moderation_case_v1")).length, before, "an invalid identifier asks the server nothing");
  await page.locator("[data-moderation-lookup] [name=user]").fill(P1.toUpperCase());
  await page.locator("[data-moderation-lookup-submit]").click();
  await page.locator("#admin-modal [data-moderation-revert]").click();
  await page.locator("[data-confirm-reason]").fill("Finalement non");
  await page.locator("[data-confirm-ok]").click();
  await page.locator("#admin-toast-stack").getByText(/1 signal\(aux\) rouvert\(s\) sur 2/).waitFor();
  await page.locator(`[data-moderation-user="${P1}"]`).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test("moderation: closing the confirmation with the cross cancels it and returns to the case file", async () => {
  const { page, context } = await open(1280);
  await page.locator(`[data-moderation-open="${P1}"]`).click();
  await page.locator('#admin-modal [data-moderation-decide="suspend"]').click();
  await page.locator("[data-confirm-reason]").waitFor();
  await page.locator("#modal-close").click();
  await page.locator('#admin-modal [data-moderation-decide="suspend"]').waitFor();
  assert.equal((await calls(page)).filter((c) => c.startsWith("titan_moderation_decide_v1")).length, 0);
  await context.close();
});

test("moderation: a banned account offers no suspension, truncated evidence says so, and users link to the file", async () => {
  const { page, context } = await open(1280);
  await page.locator("[data-moderation-lookup] [name=user]").fill(P3);
  await page.locator("[data-moderation-lookup-submit]").click();
  const modal = page.locator("#admin-modal");
  await modal.getByText(/Compte banni/).waitFor();
  assert.equal(await modal.locator('[data-moderation-decide="suspend"], [data-moderation-decide="restore"]').count(), 0);
  await modal.locator('[data-moderation-decide="watch"]').waitFor();
  await page.locator(`[data-moderation-open="${P1}"]`).waitFor({ state: "attached" });
  await page.locator("#modal-close").click();
  await page.locator(`[data-moderation-open="${P1}"]`).click();
  await modal.getByText(/tronqué/).waitFor();
  await page.locator("#modal-close").click();
  await page.goto(BASE + "/admin#users", { waitUntil: "load" });
  await page.locator(`[data-moderation-open="${P2}"]`).click();
  await page.locator('#admin-modal [data-moderation-decide="watch"]').waitFor();
  await context.close();
});

test("moderation: a failed refresh after a recorded decision is reported, not hidden", async () => {
  const { page, context } = await open(1280, { mode: "refresh-fails" });
  await page.locator(`[data-moderation-open="${P2}"]`).click();
  await page.locator('#admin-modal [data-moderation-decide="watch"]').click();
  await page.locator("[data-confirm-reason]").fill("Surveillance");
  await page.locator("[data-confirm-ok]").click();
  await page.locator("#admin-toast-stack").getByText(/La décision est enregistrée/).waitFor();
  assert.equal(await page.evaluate(() => window.__mod.db.decisions["00000000-0000-4000-8000-0000000000a2"].length), 1);
  await context.close();
});

test("moderation case: sessions to review show state, score, explained signals and the existing exclusion", async () => {
  const { page, context, errors } = await open(1280);
  await page.locator(`[data-moderation-open="${P1}"]`).click();
  const modal = page.locator("#admin-modal");
  await modal.getByText(/Séances à examiner/i).waitFor();
  const section = modal.locator("[data-session-risk]");
  const text = await section.innerText();
  const badges = await section.locator("tbody .status-badge").allInnerTexts();
  assert.deepEqual(badges.map((b) => b.toLowerCase()), ["à examiner", "à surveiller"], "each flagged session carries its state badge, worst first");
  const cells = await section.locator("tbody tr").first().locator("td").allInnerTexts();
  assert.equal(cells[2].trim(), "8", "the score column shows the points");
  assert.match(text, /Vitesse inhabituelle/i);
  assert.match(text, /20 km\/h.*10 km\/h/s, "the comparison is spelled out");
  assert.match(text, /Chevauchement/i);
  assert.match(text, /50 min/);
  assert.match(text, /Exclue des classements/i, "the existing exclusion is reported");
  assert.doesNotMatch(text, /yoga/i, "normal sessions are not listed");
  assert.match(text, /3 séances analysées/, "the number of analysed sessions is stated");
  assert.match(text, /rien n'est exclu automatiquement/i, "the server rule text is shown");
  assert.equal(await section.locator("img").count(), 0, "sport names are escaped");
  assert.equal(await page.evaluate(() => window.pwned), undefined);
  assert.equal((await calls(page)).filter((c) => c.startsWith("titan_session_risk_v1")).length, 1);
  assert.deepEqual(errors, []);
  await context.close();
});

test("moderation case: no session to review and a server without the function are explained, the case still opens", async () => {
  let o = await open(1280);
  await o.page.locator(`[data-moderation-open="${P2}"]`).click();
  await o.page.locator("#admin-modal").getByText(/Aucune séance à examiner/i).waitFor();
  await o.context.close();
  o = await open(1280, { mode: "norisk" });
  await o.page.locator(`[data-moderation-open="${P1}"]`).click();
  const modal = o.page.locator("#admin-modal");
  await modal.getByText(/analyse des séances indisponible/i).waitFor();
  assert.match(await modal.innerText(), /Décisions/, "the rest of the case file is intact");
  assert.equal(await modal.locator('[data-moderation-decide="suspend"]').count(), 1, "decisions remain available");
  assert.deepEqual(o.errors, []);
  await o.context.close();
});

test("moderation case: a failing, hanging, malformed or shapeless risk analysis never costs the case file", async () => {
  for (const mode of ["risk-throws", "risk-malformed", "risk-shapeless"]) {
    const o = await open(1280, { mode });
    await o.page.locator(`[data-moderation-open="${P1}"]`).click();
    const modal = o.page.locator("#admin-modal");
    await modal.locator('[data-moderation-decide="suspend"]').waitFor();
    const section = await modal.locator("[data-session-risk]").innerText();
    if (mode === "risk-throws") assert.match(section, /indisponible/i, mode);
    if (mode === "risk-shapeless") assert.match(section, /illisible/i, "a shapeless answer is not shown as an empty analysis");
    if (mode === "risk-malformed") {
      assert.match(section, /Urgent/i, "critical maps to the urgent badge");
      assert.match(section, /\? km\/h contre \? km\/h/, "missing numbers are shown as unknown, not 0");
      assert.doesNotMatch(section, /0 km\/h/, mode);
    }
    assert.deepEqual(o.errors, [], mode);
    await o.context.close();
  }
  const h = await open(1280, { mode: "risk-hang" });
  await h.page.locator(`[data-moderation-open="${P1}"]`).click();
  const modal = h.page.locator("#admin-modal");
  await modal.getByText(/délai dépassé/i).waitFor({ timeout: 15000 });
  assert.equal(await modal.locator('[data-moderation-decide="suspend"]').count(), 1, "the case file opens after the timeout");
  await h.context.close();
});

test("session exclusion: an administrator excludes or restores a session with a reason; nothing is sent without one", async () => {
  const { page, context, errors } = await open(1280);
  await page.locator(`[data-moderation-open="${P1}"]`).click();
  const modal = page.locator("#admin-modal");
  const section = modal.locator("[data-session-risk]");
  await section.locator('[data-session-exclude="r2"]').waitFor();
  assert.equal(await section.locator('[data-session-exclude="r2"]').innerText().then((t) => t.trim()), "Exclure des classements");
  assert.equal(await section.locator('[data-session-exclude="r1"]').innerText().then((t) => t.trim()), "Rétablir dans les classements");
  const sent = async () => (await calls(page)).filter((c) => c.startsWith("titan_session_exclusion_v1"));

  // No reason, no request.
  await section.locator('[data-session-exclude="r2"]').click();
  await page.locator("[data-confirm-ok]").click();
  assert.equal((await sent()).length, 0, "an empty reason sends nothing");
  // Closing the confirmation with the cross cancels it and returns to the case file.
  await page.locator("#modal-close").click();
  await modal.locator('[data-session-exclude="r2"]').waitFor();
  assert.equal((await sent()).length, 0, "cancelling sends nothing");

  // With a reason the exclusion is recorded and the case file shows it.
  await modal.locator('[data-session-exclude="r2"]').click();
  await page.locator("[data-confirm-reason]").fill("Chevauchement avéré avec une autre séance");
  await page.locator("[data-confirm-ok]").click();
  await modal.locator('[data-session-exclude="r2"]').filter({ hasText: /Rétablir/ }).waitFor();
  const [call] = await sent();
  assert.match(call, /"p_session":"r2"/);
  assert.match(call, /"p_excluded":true/);
  assert.match(call, /Chevauchement avéré/);
  assert.match(await section.innerText(), /Exclue des classements/);

  // Restoring is the same flow with the opposite choice.
  await modal.locator('[data-session-exclude="r1"]').click();
  await page.locator("[data-confirm-reason]").fill("Vérifié : séance légitime");
  await page.locator("[data-confirm-ok]").click();
  await modal.locator('[data-session-exclude="r1"]').filter({ hasText: /Exclure/ }).waitFor();
  assert.match((await sent()).at(-1), /"p_session":"r1".*"p_excluded":false|"p_excluded":false.*"p_session":"r1"/);
  assert.deepEqual(errors, []);
  await context.close();
});

test("session exclusion: a server refusal is explained in French and the file stays as it was", async () => {
  const { page, context } = await open(1280, { mode: "refuse-session" });
  await page.locator(`[data-moderation-open="${P1}"]`).click();
  const modal = page.locator("#admin-modal");
  await modal.locator('[data-session-exclude="r2"]').click();
  await page.locator("[data-confirm-reason]").fill("Test de refus");
  await page.locator("[data-confirm-ok]").click();
  await page.locator("#admin-toast-stack").getByText(/administrateur/i).waitFor();
  assert.equal(await modal.locator('[data-session-exclude="r2"]').innerText().then((t) => t.trim()), "Exclure des classements", "unchanged after a refusal");
  await context.close();
});

test("admin image fields accept only site paths and the project's storage (the CSP blocks every other image host)", async () => {
  const { page, context } = await open(1280);
  await page.locator("[data-moderation-user]").first().waitFor();
  const verdicts = await page.evaluate(() => {
    const check = window.titanAdminValidators.imageUrlProblem;
    return Object.fromEntries(["", null, "/image/boss.webp", "./image/boss.webp", "image/boss.webp", "https://oubmftfufwwzwpgvrcag.supabase.co/storage/v1/object/public/avatars/a.png",
      "https://evil.example.test/p.gif", "//evil.example.test/p.gif", "http://oubmftfufwwzwpgvrcag.supabase.co/x.png", "javascript:alert(1)", "data:image/png;base64,AAAA",
      "https://oubmftfufwwzwpgvrcag.supabase.co.evil.test/x.png"].map((v) => [String(v), check(v)]));
  });
  for (const ok of ["", "null", "/image/boss.webp", "./image/boss.webp", "image/boss.webp", "https://oubmftfufwwzwpgvrcag.supabase.co/storage/v1/object/public/avatars/a.png"]) assert.equal(verdicts[ok], null, `${ok} is accepted`);
  for (const bad of ["https://evil.example.test/p.gif", "//evil.example.test/p.gif", "http://oubmftfufwwzwpgvrcag.supabase.co/x.png", "javascript:alert(1)", "data:image/png;base64,AAAA", "https://oubmftfufwwzwpgvrcag.supabase.co.evil.test/x.png"]) {
    assert.match(verdicts[bad], /Image/, `${bad} is refused with a French explanation`);
  }
  await context.close();
});

test("appeals: open appeals listed with safe text; a decision needs a note and removes the appeal", async () => {
  const { page, context, errors } = await open(1280, {}, "appeals");
  const rows = page.locator("[data-appeal-row]");
  await rows.first().waitFor();
  assert.equal(await rows.count(), 2);
  assert.match(await rows.first().innerText(), /Course faite avec ma montre/);
  assert.equal(await page.locator("#admin-view img").count(), 0, "player text is escaped");
  assert.equal(await page.evaluate(() => window.pwned), undefined);
  // No note, no request.
  await rows.first().locator('[data-appeal-decide="accept"]').click();
  await page.locator("[data-confirm-ok]").click();
  assert.equal((await calls(page)).filter((c) => c.startsWith("titan_appeal_decide_v1")).length, 0, "empty note sends nothing");
  await page.locator("[data-confirm-reason]").fill("Contexte vérifié, séance rétablie");
  await page.locator("[data-confirm-ok]").click();
  await page.waitForFunction(() => window.__mod.db.appeals[0].status === "accepted");
  const decide = (await calls(page)).find((c) => c.startsWith("titan_appeal_decide_v1"));
  assert.match(decide, /"p_id":7/);
  assert.match(decide, /"p_accept":true/);
  assert.match(decide, /Contexte vérifié/);
  await page.waitForFunction(() => document.querySelectorAll("[data-appeal-row]").length === 1);
  // Decline the other one.
  await rows.first().locator('[data-appeal-decide="decline"]').click();
  await page.locator("[data-confirm-reason]").fill("Chevauchement avéré");
  await page.locator("[data-confirm-ok]").click();
  await page.waitForFunction(() => window.__mod.db.appeals[1].status === "declined");
  await page.locator("#admin-view").getByText(/Aucun recours en attente/).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test("appeals: empty, old server, forbidden and a refused acceptance are explained", async () => {
  for (const [mode, pattern] of [["empty", /Aucun recours en attente/], ["oldserver", /migration 20261019230000/], ["forbidden", /réservée aux administrateurs/]]) {
    const { page, context, errors } = await open(1280, { mode }, "appeals");
    await page.locator("#admin-view").getByText(pattern).waitFor();
    assert.equal(await page.locator("[data-appeal-row]").count(), 0, mode);
    assert.deepEqual(errors, [], mode);
    await context.close();
  }
  const { page, context } = await open(1280, { mode: "appeal-refused" }, "appeals");
  await page.locator("[data-appeal-row]").first().waitFor();
  await page.locator('[data-appeal-decide="accept"]').first().click();
  await page.locator("[data-confirm-reason]").fill("Je tente quand même");
  await page.locator("[data-confirm-ok]").click();
  await page.getByText(/plus rien à lever/).first().waitFor();
  assert.equal(await page.locator("[data-appeal-row]").count(), 2, "the appeal stays open after a refusal");
  await context.close();
});

test("verification requests: the file shows past requests and the player's answer escaped; a request needs a message and is sent once", async () => {
  const { page, context, errors } = await open(1280);
  await page.locator(`[data-moderation-open="${P1}"]`).click();
  const modal = page.locator("#admin-modal");
  await modal.getByText("Demandes de vérification").waitFor();
  assert.match(await modal.locator("[data-verification-list]").innerText(), /Réponse reçue/);
  assert.match(await modal.locator("[data-verification-list]").innerText(), /Oui, c’était moi/);
  assert.equal(await modal.locator("[data-verification-list] img").count(), 0, "the player's answer and the message are escaped");
  assert.equal(await page.evaluate(() => window.pwned), undefined);

  // No message, no request.
  await modal.locator("[data-verify-request]").click();
  await page.locator("[data-confirm-ok]").click();
  assert.equal((await calls(page)).filter((c) => c.startsWith("titan_verification_request_v1")).length, 0, "an empty message sends nothing");
  await page.locator("[data-confirm-reason]").fill("Peux-tu envoyer la trace de ta course de dimanche ?");
  await page.locator("[data-confirm-ok]").click();
  await page.waitForFunction(() => window.__mod.db.verif["00000000-0000-4000-8000-0000000000a1"].some((r) => r.id === 20));
  const sent = (await calls(page)).find((c) => c.startsWith("titan_verification_request_v1"));
  assert.ok(sent.includes(P1));
  assert.match(sent, /trace de ta course/);
  // One open request at a time: the button is gone, and the open request can be closed.
  await modal.locator("[data-verification='20']").waitFor();
  assert.equal(await modal.locator("[data-verify-request]").count(), 0);
  await modal.locator("[data-verify-close='20']").click();
  await page.waitForFunction(() => window.__mod.db.verif["00000000-0000-4000-8000-0000000000a1"].find((r) => r.id === 20).status === "closed");
  await modal.locator("[data-verify-request]").waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test("verification requests: a refusal is explained and an older server hides the feature without breaking the file", async () => {
  let r = await open(1280, { mode: "verify-refused" });
  await r.page.locator(`[data-moderation-open="${P2}"]`).click();
  await r.page.locator("#admin-modal [data-verify-request]").click();
  await r.page.locator("[data-confirm-reason]").fill("Peux-tu confirmer cette séance de samedi ?");
  await r.page.locator("[data-confirm-ok]").click();
  await r.page.getByText(/déjà ouverte pour ce joueur/).first().waitFor();
  await r.context.close();
  r = await open(1280, { mode: "no-verif" });
  await r.page.locator(`[data-moderation-open="${P1}"]`).click();
  const modal = r.page.locator("#admin-modal");
  await modal.getByText(/ne sont pas disponibles sur ce serveur/).waitFor();
  assert.equal(await modal.locator("[data-verify-request]").count(), 0, "no request button without the function");
  assert.match(await modal.innerText(), /Signaux qui composent le score/, "the case file still opens");
  await r.context.close();
});
