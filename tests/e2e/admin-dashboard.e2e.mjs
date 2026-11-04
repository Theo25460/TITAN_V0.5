// Admin dashboard reliability: an unknown figure is never shown as 0, a failed trend is not "seven empty days", and an expired session says so
// instead of showing zeros or a bare refusal. Driven in Chromium with a recording client (nothing real is reached).
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

function installFake({ mode }) {
  const err = (message, code, status) => ({ data: null, error: { message, code, status } });
  const query = (table) => {
    const q = { select: () => q, gte: () => q, limit: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }),
      then: (ok) => ok(mode === "expired" ? err("JWT expired", "PGRST301", 401) : mode === "norpc" ? { data: null, error: { message: "denied", code: "42501" }, count: null } : { data: [], error: null, count: 3 }) };
    return q;
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "adm", email: "a@example.test" } }, error: null }), signOut: async () => ({ error: null }),
      getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: query,
    rpc: async (name) => {
      if (name === "titan_admin_get_context_v1") return mode === "expired" ? err("JWT expired", "PGRST301", 401) : { data: { isAdmin: true, role: "admin" }, error: null };
      if (name === "titan_admin_dashboard_v1") return mode === "ok" ? { data: { users_total: 12, users_today: 0, users_week: 4 }, error: null } : err("boom", "XX000", 500);
      return err("unexpected " + name);
    },
  };
  Object.defineProperty(window, "waitForTitanSupabase", { configurable: true, get: () => async () => client, set() {} });
}
async function open(mode) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort("internetdisconnected"));
  const page = await context.newPage();
  await page.addInitScript(installFake, { mode });
  await page.goto(BASE + "/admin#dashboard", { waitUntil: "load" });
  return { page, context };
}
const card = (page, label) => page.locator(".stat-card", { hasText: label }).locator("strong");

test("dashboard: a real zero stays 0, a figure the server did not send is a dash", async () => {
  const { page, context } = await open("ok");
  try {
    await page.locator(".stat-card").first().waitFor();
    assert.equal(await card(page, "Utilisateurs total").innerText(), "12");
    assert.match(await page.locator(".stat-card", { hasText: "Utilisateurs total" }).innerText(), /Nouveaux aujourd hui: 0/, "a measured zero is still a zero");
    assert.equal(await card(page, "Concours").innerText(), "—", "not sent → unknown, not 0");
  } finally { await context.close(); }
});

test("dashboard: when the summary is unavailable, what cannot be known is a dash, never a zero, and failed trends say so", async () => {
  const { page, context } = await open("norpc");
  try {
    await page.locator(".stat-card").first().waitFor();
    const values = await page.locator(".stat-card strong").allInnerTexts();
    assert.ok(values.length >= 10);
    assert.ok(values.every((v) => v === "—"), `every figure is unknown here: ${values.join(",")}`);
    assert.match(await page.locator(".chart-panel").first().innerText(), /Indisponible/);
    assert.equal(await page.locator(".mini-bar").count(), 0, "no invented empty bars");
  } finally { await context.close(); }
});

test("session expired: told plainly with a way back, no zeros, nothing shown as data", async () => {
  const { page, context } = await open("expired");
  try {
    await page.waitForFunction(() => /Session expirée/.test(document.body.innerText), null, { timeout: 8000 });
    assert.equal(await page.locator(".stat-card").count(), 0);
  } finally { await context.close(); }
});
