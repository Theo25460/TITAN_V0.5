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
        { id: "r1", sport: `running ${evil}`, date: "2026-10-18T09:00:00Z", value: 20, unit: "km", durationMin: 60, historical: false, score: 8, state: "review", excludedFromRankings: true,
          signals: [{ code: "speed_jump", severity: "high", points: 8, detail: { kmh: 20, medianKmh: 10, priorSessions: 5 } }] },
        { id: "r2", sport: "cycling", date: "2026-10-17T09:00:00Z", value: 30, unit: "min", durationMin: 60, historical: false, score: 3, state: "watch", excludedFromRankings: false,
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
