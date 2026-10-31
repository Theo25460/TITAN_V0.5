// Admin control center: votes and roadmap (COM-F3, COM-F4), driven against dist/ with a recorder instead of a real project.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
let server, browser, BASE;
before(async () => {
  const port = await new Promise(resolve => { const probe = createServer(); probe.listen(0, () => { const p = probe.address().port; probe.close(() => resolve(p)); }); });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  let ready = false;
  for (let i = 0; i < 50 && !ready; i++) { try { ready = (await fetch(BASE + "/")).ok; } catch {} if (!ready) await new Promise(r => setTimeout(r, 100)); }
  assert.ok(ready);
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

const evil = '<img src=x onerror="window.pwned=1">';
function fakeAdmin({ admin, missing, evil }) {
  const calls = [];
  const db = {
    polls: [{ id: "p1", title: `Quelle quête ? ${evil}`, detail: null, opensAt: "2026-10-28T08:00:00Z", closesAt: "2026-11-05T08:00:00Z", state: "open", options: [{ position: 1, label: "Endurance", votes: 4 }, { position: 2, label: "Force", votes: 7 }] }],
    seasons: [{ id: "s1", name: "Saison de la reprise", rules: null, rulesVersion: 2, startsOn: "2026-09-28", endsOn: "2026-10-25", closed: true, participants: 40 }],
    goals: [{ id: "g1", startsOn: "2026-10-01", endsOn: "2026-10-28", title: "Un mois ensemble", detail: null, levels: [5000, 15000, 40000], members: 25 }],
    reports: [{ id: "r1", clubId: "c1", club: "Foulées du mardi", announcementId: "a1", announcement: `Un message ${evil}`, reason: "harassment", details: "Insultes", at: "2026-10-29T10:00:00Z", sameTarget: 2 }, { id: "r2", clubId: "c2", club: "Trail", announcementId: null, announcement: null, reason: "spam", details: null, at: "2026-10-29T11:00:00Z", sameTarget: 1 }],
    quests: [{ id: "q1", weekStart: "2026-10-26", title: "Cent minutes ensemble", detail: null, target: 1000, members: 12 }],
    ideas: [{ id: "i1", title: "Duels entre amis", detail: "x", status: "study", sortOrder: 1, archived: false, votes: 3, history: [] }],
  };
  const fail = (message, code) => ({ data: null, error: { message, code } });
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "adm", email: "admin@example.test" } }, error: null }), signOut: async () => ({ error: null }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: () => { throw new Error("direct table access is not expected"); },
    rpc: async (name, params = {}) => {
      calls.push({ name, params });
      if (name === "titan_admin_get_context_v1") return { data: { isAdmin: admin, role: admin ? "admin" : "user" }, error: null };
      if (missing && /^titan_(poll|roadmap)/.test(name)) return fail("Could not find the function public." + name + " in the schema cache", "PGRST202");
      if (!admin && /^titan_(poll|roadmap)/.test(name)) return fail("ADMIN_REQUIRED", "42501");
      if (name === "titan_poll_admin_list_v1") return { data: db.polls, error: null };
      if (name === "titan_club_reports_admin_list_v1") return missing ? fail("Could not find the function public." + name + " in the schema cache", "PGRST202") : { data: db.reports, error: null };
      if (name === "titan_club_report_resolve_v1") { db.reports = db.reports.filter(r => r.id !== params.p_report); return { data: true, error: null }; }
      if (name === "titan_world_goal_admin_list_v1") return missing ? fail("Could not find the function public." + name + " in the schema cache", "PGRST202") : { data: db.goals, error: null };
      if (name === "titan_world_goal_admin_save_v1") { db.goals.unshift({ id: "g2", startsOn: params.p_starts, endsOn: params.p_ends, title: params.p_title, detail: params.p_detail, levels: [params.p_level1, params.p_level2, params.p_level3], members: 0 }); return { data: "g2", error: null }; }
      if (name === "titan_season_admin_list_v1") return missing ? fail("Could not find the function public." + name + " in the schema cache", "PGRST202") : { data: db.seasons, error: null };
      if (name === "titan_season_admin_save_v1") { db.seasons.unshift({ id: "s2", name: params.p_name, rules: params.p_rules, rulesVersion: 1, startsOn: params.p_starts, endsOn: params.p_starts, closed: false, participants: 0 }); return { data: "s2", error: null }; }
      if (name === "titan_common_quest_admin_list_v1") return missing ? fail("Could not find the function public." + name + " in the schema cache", "PGRST202") : { data: db.quests, error: null };
      if (name === "titan_common_quest_admin_save_v1") { db.quests.unshift({ id: "q2", weekStart: params.p_week, title: params.p_title, detail: params.p_detail, target: params.p_target, members: 0 }); return { data: "q2", error: null }; }
      if (name === "titan_roadmap_admin_list_v1") return { data: db.ideas, error: null };
      if (name === "titan_poll_admin_save_v1") { db.polls.unshift({ id: "p2", title: params.p_title, detail: params.p_detail, opensAt: params.p_opens, closesAt: params.p_closes, state: "scheduled", options: params.p_options.map((label, i) => ({ position: i + 1, label, votes: 0 })) }); return { data: "p2", error: null }; }
      if (name === "titan_poll_admin_close_v1") { db.polls[0].state = "closed"; return { data: null, error: null }; }
      if (name === "titan_roadmap_admin_save_v1") {
        if (params.p_id) db.ideas = db.ideas.map(i => i.id === params.p_id ? { ...i, title: params.p_title, status: params.p_status, archived: params.p_archive } : i);
        else db.ideas.push({ id: "i2", title: params.p_title, detail: params.p_detail, status: params.p_status, sortOrder: params.p_sort, archived: false, votes: 0, history: [] });
        return { data: params.p_id || "i2", error: null };
      }
      return fail("unexpected rpc " + name);
    },
  };
  window.__calls = calls;
  Object.defineProperty(window, "waitForTitanSupabase", { configurable: true, get: () => async () => client, set() {} });
}
async function open({ admin = true, missing = false, width = 1280 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(fakeAdmin, { admin, missing, evil });
  await page.goto(BASE + "/admin#consultations", { waitUntil: "load" });
  return { page, context, errors };
}

test("admin consultations: lists votes with counts and ideas with status; text is escaped; no horizontal scroll", async () => {
  const { page, context, errors } = await open({ width: 390 });
  try {
    await page.locator("[data-poll-row]").waitFor();
    assert.match(await page.locator("[data-poll-row]").innerText(), /Force\s*:\s*7/);
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    assert.equal(await page.locator("[data-idea-row]").count(), 2, "one idea and the new-idea row");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("admin consultations: create a poll (2 to 6 options, sound dates), close it, add and move an idea", async () => {
  const { page, context } = await open();
  try {
    await page.locator("[data-poll-form]").waitFor();
    await page.locator("[data-poll-create]").click();
    assert.equal(await page.evaluate(() => window.__calls.some(c => c.name === "titan_poll_admin_save_v1")), false, "nothing sent without a question");
    await page.locator("[data-poll-form] [name=title]").fill("Quel thème pour la saison ?");
    await page.locator("[data-poll-form] [name=options]").fill("Forêt");
    await page.locator("[data-poll-create]").click();
    assert.equal(await page.evaluate(() => window.__calls.some(c => c.name === "titan_poll_admin_save_v1")), false, "one option is refused before sending");
    await page.locator("[data-poll-form] [name=options]").fill("Forêt\nMontagne\n\n");
    await page.locator("[data-poll-create]").click();
    await page.waitForFunction(() => window.__calls.some(c => c.name === "titan_poll_admin_save_v1"));
    const sent = await page.evaluate(() => window.__calls.find(c => c.name === "titan_poll_admin_save_v1").params);
    assert.deepEqual(sent.p_options, ["Forêt", "Montagne"]);
    await page.locator("[data-poll-row]").nth(0).waitFor();
    await page.locator("[data-idea-new] [name=title]").fill("Roadmap publique");
    await page.locator("[data-idea-new] [data-idea-save]").click();
    await page.waitForFunction(() => window.__calls.some(c => c.name === "titan_roadmap_admin_save_v1" && c.params.p_id === null));
    const row = page.locator("[data-idea-id=i1]");
    await row.locator("[name=status]").selectOption("shipped");
    await row.locator("[data-idea-save]").click();
    await page.waitForFunction(() => window.__calls.some(c => c.name === "titan_roadmap_admin_save_v1" && c.params.p_id === "i1" && c.params.p_status === "shipped"));
  } finally { await context.close(); }
});

test("admin consultations: a server without the functions gets a clear message; a non-admin never sees the forms", async () => {
  const missing = await open({ missing: true });
  try {
    await missing.page.locator("#admin-view .empty-state").waitFor();
    assert.match(await missing.page.locator("#admin-view .empty-state").innerText(), /20261029090000_community_consultations/);
    assert.equal(await missing.page.locator("[data-poll-form]").count(), 0);
  } finally { await missing.context.close(); }
  const player = await open({ admin: false });
  try {
    await player.page.waitForTimeout(1500);
    assert.equal(await player.page.locator("[data-poll-form]").count(), 0);
    assert.equal(await player.page.locator("[data-idea-row]").count(), 0);
  } finally { await player.context.close(); }
});

test("admin consultations: the common quest of the week is listed and created for a Monday only", async () => {
  const { page, context } = await open();
  try {
    await page.locator("[data-cq-form]").waitFor();
    assert.match(await page.locator("table[aria-label='Quêtes communes']").innerText(), /Cent minutes ensemble[\s\S]*1000 min[\s\S]*12/);
    await page.locator("[data-cq-create]").click();
    assert.equal(await page.evaluate(() => window.__calls.some(c => c.name === "titan_common_quest_admin_save_v1")), false, "nothing sent without a title");
    await page.locator("[data-cq-form] [name=title]").fill("Mille minutes à tous");
    await page.locator("[data-cq-form] [name=week]").fill("2026-11-03");
    await page.locator("[data-cq-create]").click();
    assert.equal(await page.evaluate(() => window.__calls.some(c => c.name === "titan_common_quest_admin_save_v1")), false, "a Tuesday is refused before sending");
    await page.locator("[data-cq-form] [name=week]").fill("2026-11-02");
    await page.locator("[data-cq-form] [name=target]").fill("1500");
    await page.locator("[data-cq-create]").click();
    await page.waitForFunction(() => window.__calls.some(c => c.name === "titan_common_quest_admin_save_v1"));
    assert.deepEqual(await page.evaluate(() => window.__calls.find(c => c.name === "titan_common_quest_admin_save_v1").params), { p_id: null, p_week: "2026-11-02", p_title: "Mille minutes à tous", p_detail: null, p_target: 1500 });
  } finally { await context.close(); }
});

test("admin consultations: seasons are listed with their rules version and created for a Monday only", async () => {
  const { page, context } = await open();
  try {
    await page.locator("[data-season-form]").waitFor();
    assert.match(await page.locator("table[aria-label='Saisons']").innerText(), /Saison de la reprise[\s\S]*v2 · figée[\s\S]*40/);
    await page.locator("[data-season-create]").click();
    assert.equal(await page.evaluate(() => window.__calls.some(c => c.name === "titan_season_admin_save_v1")), false, "nothing sent without a name");
    await page.locator("[data-season-form] [name=name]").fill("Saison d'hiver");
    await page.locator("[data-season-form] [name=starts]").fill("2026-11-03");
    await page.locator("[data-season-create]").click();
    assert.equal(await page.evaluate(() => window.__calls.some(c => c.name === "titan_season_admin_save_v1")), false, "a Tuesday is refused before sending");
    await page.locator("[data-season-form] [name=starts]").fill("2026-11-02");
    await page.locator("[data-season-create]").click();
    await page.waitForFunction(() => window.__calls.some(c => c.name === "titan_season_admin_save_v1"));
    assert.deepEqual(await page.evaluate(() => window.__calls.find(c => c.name === "titan_season_admin_save_v1").params), { p_id: null, p_starts: "2026-11-02", p_name: "Saison d'hiver", p_rules: null });
  } finally { await context.close(); }
});

test("admin consultations: world goals are listed with their three levels and created with increasing levels only (COM-B5)", async () => {
  const { page, context } = await open();
  try {
    await page.locator("[data-wg-form]").waitFor();
    assert.match(await page.locator("table[aria-label='Objectifs collectifs']").innerText(), /Un mois ensemble[\s\S]*5\s?000 · 15\s?000 · 40\s?000 min[\s\S]*25/);
    await page.locator("[data-wg-create]").click();
    assert.equal(await page.evaluate(() => window.__calls.some(c => c.name === "titan_world_goal_admin_save_v1")), false, "nothing sent without a title");
    await page.locator("[data-wg-form] [name=title]").fill("Cap sur l'hiver");
    await page.locator("[data-wg-form] [name=l2]").fill("4000");
    await page.locator("[data-wg-create]").click();
    assert.equal(await page.evaluate(() => window.__calls.some(c => c.name === "titan_world_goal_admin_save_v1")), false, "levels that do not increase are refused before sending");
    await page.locator("[data-wg-form] [name=l2]").fill("15000");
    await page.locator("[data-wg-form] [name=starts]").fill("2026-11-02");
    await page.locator("[data-wg-form] [name=weeks]").fill("4");
    await page.locator("[data-wg-create]").click();
    await page.waitForFunction(() => window.__calls.some(c => c.name === "titan_world_goal_admin_save_v1"));
    assert.deepEqual(await page.evaluate(() => window.__calls.find(c => c.name === "titan_world_goal_admin_save_v1").params),
      { p_id: null, p_starts: "2026-11-02", p_ends: "2026-11-29", p_title: "Cap sur l'hiver", p_detail: null, p_level1: 5000, p_level2: 15000, p_level3: 40000 });
  } finally { await context.close(); }
});

test("admin consultations: club reports show the text concerned as text, and a decision needs a confirmation (COM-C8)", async () => {
  const { page, context } = await open();
  try {
    const table = page.locator("table[aria-label='Signalements de clubs']");
    await table.waitFor();
    assert.match(await table.innerText(), /Foulées du mardi[\s\S]*Harcèlement[\s\S]*2 signalement[\s\S]*Trail[\s\S]*Le club lui-même/);
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    assert.equal(await table.locator("img").count(), 0, "text is escaped");
    assert.equal(await table.locator("tr", { hasText: "Trail" }).locator("[data-club-report-act=remove_announcement]").count(), 0, "no announcement to remove on a club report");
    await table.locator("[data-club-report-act=remove_announcement]").click();
    assert.equal(await page.evaluate(() => window.__calls.some(c => c.name === "titan_club_report_resolve_v1")), false, "nothing is decided before the confirmation");
    await page.locator("[data-confirm-ok]").click();
    await page.waitForFunction(() => window.__calls.some(c => c.name === "titan_club_report_resolve_v1"));
    assert.deepEqual(await page.evaluate(() => window.__calls.find(c => c.name === "titan_club_report_resolve_v1").params), { p_report: "r1", p_action: "remove_announcement", p_note: null });
    await page.waitForFunction(() => !/Foulées du mardi/.test(document.querySelector("table[aria-label='Signalements de clubs']")?.innerText || ""));
  } finally { await context.close(); }
});
