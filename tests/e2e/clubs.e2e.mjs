// Communauté: club spaces (COM-C8). Private by default, code only for administrators, announcements and moderation, no other member shown to a member.
// Behind the server flag screens.clubs; driven with a recorder instead of a real project.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const OWNER = "00000000-0000-4000-8000-000000000931";
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
const DATA = {
  mine: [
    { id: "c1", name: `Foulées du mardi ${evil}`, description: "Course à pied.", discoverable: false, role: "admin", members: 3, code: "ABCD2345",
      roster: [{ userId: "u1", name: "Alba", role: "admin" }, { userId: "u2", name: "Basile", role: "member" }, { userId: "u3", name: "Chloé", role: "member" }],
      announcements: [{ id: "a1", body: `Sortie mardi 18h30 ${evil}`, at: "2026-10-28T10:00:00Z", mine: true }] },
    { id: "c2", name: "Trail du dimanche", description: null, discoverable: true, role: "member", members: 12, code: null, roster: null,
      announcements: [{ id: "a2", body: "Rendez-vous au parking.", at: "2026-10-27T10:00:00Z", mine: false }] },
  ],
  found: [{ id: "c3", name: "Natation de quartier", description: "Lundi soir.", members: 8 }],
};
// The section fades in after every render: wait for it to settle before clicking a control that was just redrawn.
async function tap(page, locator) { await locator.scrollIntoViewIfNeeded(); await page.waitForTimeout(500); await locator.click({ timeout: 5000 }); }
async function panel({ flag = true, missing = false, signedIn = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "UTC", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(BASE + "/social");
  await page.waitForFunction(() => window.TitanClubs && window.state?.user);
  // Let the app finish its own profile sync as a guest first: a sync that starts after the identity below is set would see no session and end the account.
  await page.evaluate(async () => { await window.syncWithSupabase?.(); window.syncWithSupabase = async () => {}; });
  await page.evaluate(({ flag, missing, signedIn, owner, data }) => {
    window.calls = []; window.data = structuredClone(data);
    if (signedIn) {
      window.titanClient.rpc = (name, args = {}) => {
        window.calls.push([name, args]);
        let out = { data: null, error: { code: "PGRST202", message: "Could not find" } };
        if (!missing) {
          if (name === "titan_club_my_v1") out = { data: window.data.mine, error: null };
          if (name === "titan_club_discover_v1") out = { data: window.data.found, error: null };
          if (name === "titan_club_announce_v1") { window.data.mine[0].announcements.unshift({ id: "a3", body: args.p_body, at: "2026-10-29T10:00:00Z", mine: true }); out = { data: "a3", error: null }; }
          if (name === "titan_club_announce_remove_v1") { window.data.mine[0].announcements = window.data.mine[0].announcements.filter(a => a.id !== args.p_announcement); out = { data: true, error: null }; }
          if (name === "titan_club_join_v1") out = window.wrongCode ? { data: null, error: { code: "22023", message: "CLUB_NOT_FOUND" } } : { data: "c3", error: null };
          if (name === "titan_club_create_v1") { window.data.mine.push({ id: "c9", name: args.p_name, description: args.p_description, discoverable: args.p_discoverable, role: "admin", members: 1, code: "ZZZZ9999", roster: [{ userId: "u1", name: "Alba", role: "admin" }], announcements: [] }); out = { data: "c9", error: null }; }
          if (name === "titan_club_set_v1") out = { data: true, error: null };
          if (name === "titan_club_member_remove_v1") { window.data.mine[0].roster = window.data.mine[0].roster.filter(m => m.userId !== args.p_user); window.data.mine[0].members -= 1; out = { data: true, error: null }; }
          if (name === "titan_club_leave_v1") { window.data.mine = window.data.mine.filter(c => c.id !== args.p_club); out = { data: true, error: null }; }
        }
        const result = Promise.resolve(out); result.setHeader = () => result; return result;
      };
      // The app may replace state.user while it loads its own profile; keep the signed-in identity of this scenario.
      let pinned = window.state.user; pinned.id = owner;
      Object.defineProperty(window.state, "user", { configurable: true, get: () => pinned, set: (next) => { pinned = Object.assign(next || {}, { id: owner }); } });
    }
    const flags = { enabled: (key, fallback) => key === "screens.clubs" ? flag : fallback, refresh: async () => {} };
    Object.defineProperty(window, "titanFlags", { configurable: true, get: () => flags, set: () => {} });
    window.dispatchEvent(new CustomEvent("titan:account-changed"));
  }, { flag, missing, signedIn, owner: OWNER, data: DATA });
  return { page, context, errors };
}

test("clubs: an administrator sees the code, the members and moderates; a member sees neither; text is never markup", async () => {
  const { page, context, errors } = await panel();
  try {
    const admin = page.locator("[data-club=c1]");
    await admin.waitFor();
    assert.match(await admin.innerText(), /Foulées du mardi/);
    assert.equal(await page.evaluate(() => window.pwned), undefined, "no markup is executed");
    assert.equal(await page.locator("#clubs img").count(), 0, "text is escaped");
    assert.equal(await admin.locator("[data-club-code]").innerText(), "ABCD2345");
    await admin.locator("summary").click();
    assert.match(await admin.innerText(), /Alba · administrateur[\s\S]*Basile[\s\S]*Chloé/);
    const member = page.locator("[data-club=c2]");
    assert.equal(await member.locator("[data-club-code]").count(), 0, "a member does not see the code");
    assert.equal(await member.locator("details").count(), 0, "a member does not see the member list");
    assert.equal(await member.locator("[data-club-announce]").count(), 0, "a member does not announce");
    assert.match(await member.innerText(), /12 membres/);
    // Announce.
    await admin.locator("textarea").fill("Nouvelle sortie samedi.");
    await admin.locator("[data-club-announce]").click();
    await page.waitForFunction(() => /Nouvelle sortie samedi\./.test(document.querySelector("[data-club=c1]")?.innerText || ""));
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_club_announce_v1")[1]), { p_club: "c1", p_body: "Nouvelle sortie samedi." });
    await page.locator("[data-club-ann-remove=a3]").click();
    await page.waitForFunction(() => !/Nouvelle sortie samedi\./.test(document.querySelector("[data-club=c1]")?.innerText || ""));
    // Remove a member after a confirmation.
    await tap(page, admin.locator("[data-club-kick][data-user=u2]"));
    await page.getByRole("button", { name: "Retirer", exact: true }).last().click();
    await page.waitForFunction(() => window.calls.some(c => c[0] === "titan_club_member_remove_v1"));
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_club_member_remove_v1")[1]), { p_club: "c1", p_user: "u2" });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
    const axe = await page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }).then(r => r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join("|")}`)));
    assert.deepEqual(axe, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("clubs: joining with a code, from the open list, creating a club (private unless ticked) and leaving", async () => {
  const { page, context, errors } = await panel();
  try {
    await page.locator("[data-club=c1]").waitFor();
    await page.evaluate(() => { window.wrongCode = true; });
    await page.locator("[data-club-join-form] input").fill("zzzz9999");
    await page.locator("[data-club-join-form] button[type=submit]").click();
    await page.locator("[data-club-notice]").waitFor();
    assert.match(await page.locator("[data-club-notice]").innerText(), /Ce code ne correspond à aucun club/);
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_club_join_v1")[1]), { p_code: "zzzz9999", p_club: null });
    await page.evaluate(() => { window.wrongCode = false; });
    await page.locator("[data-club-join-id=c3]").click();
    await page.waitForFunction(() => window.calls.filter(c => c[0] === "titan_club_join_v1").length === 2);
    assert.deepEqual(await page.evaluate(() => window.calls.filter(c => c[0] === "titan_club_join_v1")[1][1]), { p_code: null, p_club: "c3" });
    // Create: private by default; a name is required.
    await page.locator("[data-club-create-form] button[type=submit]").click();
    assert.match(await page.locator("[data-club-notice]").innerText(), /entre 3 et 60/);
    await page.locator("[data-club-create-form] [data-club-draft=name]").fill("Vélo du jeudi");
    await page.locator("[data-club-create-form] button[type=submit]").click();
    await page.locator("[data-club=c9]").waitFor();
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_club_create_v1")[1]), { p_name: "Vélo du jeudi", p_description: null, p_discoverable: false });
    assert.match(await page.locator("[data-club=c9]").innerText(), /privé/);
    // Leave after a confirmation.
    await tap(page, page.locator("[data-club-leave=c2]"));
    await page.getByRole("button", { name: "Quitter", exact: true }).last().click();
    await page.waitForFunction(() => !document.querySelector("[data-club=c2]"));
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_club_leave_v1")[1]), { p_club: "c2" });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("clubs: nothing when the flag is off, for a guest, or on a server without the functions", async () => {
  for (const options of [{ flag: false }, { signedIn: false }, { missing: true }]) {
    const { page, context, errors } = await panel(options);
    try {
      await page.waitForTimeout(400);
      assert.equal(await page.locator("#clubs").isVisible(), false, JSON.stringify(options));
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});
