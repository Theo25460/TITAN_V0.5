// Recours page (CHEAT19 / CHEAT14): the player's view of excluded sessions, suspension and appeals, with a fake API client.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
let server, browser, BASE;
before(async () => {
  const port = await new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, () => { const p = probe.address().port; probe.close(() => resolve(p)); });
  });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + "/")).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

const USER = "00000000-0000-4000-8000-0000000000c1";
const evil = '<img src=x onerror="window.pwned=1">';

async function open({ signedIn = true, mode = "ok" } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + "/recours");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready");
  if (signedIn) {
    await page.evaluate(({ USER, evil, mode }) => {
      const db = {
        sessions: [
          { id: "s1", sport: "running", date: "2026-10-10T08:00:00Z", value: 12, unit: "km", hasOpenAppeal: false },
          { id: "s2", sport: "cycling", date: "2026-10-09T08:00:00Z", value: 40, unit: "km", hasOpenAppeal: true },
        ],
        appeals: [
          { id: 1, kind: "session", sessionId: "s2", status: "open", createdAt: "2026-10-11T08:00:00Z", decisionNote: null },
          { id: 2, kind: "session", sessionId: "s0", status: "declined", createdAt: "2026-10-01T08:00:00Z", decisionNote: `Chevauchement avéré ${evil}` },
        ],
        suspended: mode === "suspended",
        verifications: mode === "verify"
          ? [{ id: 7, message: `Peux-tu confirmer ta séance de dimanche ? ${evil}`, status: "open", createdAt: "2026-10-19T08:00:00Z", answer: null },
             { id: 6, message: "Ancienne demande déjà traitée.", status: "closed", createdAt: "2026-09-01T08:00:00Z", answer: "Oui, c’était bien moi." }]
          : [],
      };
      const calls = [];
      window.__recours = { calls, db };
      const fail = (message, code) => ({ data: null, error: { message, code } });
      window.titanClient = {
        rpc: async (name, params = {}) => {
          calls.push({ name, params });
          if (mode === "old") return fail("Could not find the function public." + name, "PGRST202");
          if (name === "titan_my_review_state_v1") return { data: { version: 1, account: { suspended: db.suspended, banned: false }, excludedSessions: db.sessions }, error: null };
          if (name === "titan_my_appeals_v1") return { data: { version: 1, appeals: db.appeals }, error: null };
          if (name === "titan_my_verification_requests_v1") {
            if (mode === "verify") return { data: { version: 1, open: db.verifications.filter((v) => v.status === "open").length, requests: db.verifications }, error: null };
            return { data: { version: 1, open: 0, requests: [] }, error: null };
          }
          if (name === "titan_verification_answer_v1") {
            if (mode === "verify" && params.p_answer.includes("déjà")) return fail("REQUEST_NOT_OPEN", "23514");
            const row = db.verifications.find((v) => v.id === params.p_id);
            row.status = "answered"; row.answer = params.p_answer;
            return { data: { version: 1, id: row.id, status: "answered" }, error: null };
          }
          if (name === "titan_appeal_submit_v1") {
            if (mode === "cooldown") return fail("APPEAL_COOLDOWN", "23514");
            if (params.p_kind === "session") db.sessions.find((s) => s.id === params.p_session).hasOpenAppeal = true;
            db.appeals.unshift({ id: 9, kind: params.p_kind, sessionId: params.p_session, status: "open", createdAt: "2026-10-20T08:00:00Z", decisionNote: null });
            return { data: { version: 1, id: 9, status: "open" }, error: null };
          }
          return fail("unexpected rpc " + name);
        },
      };
      window.state.user.id = USER;
      window.dispatchEvent(new Event("titan:account-changed"));
    }, { USER, evil, mode });
  }
  return { page, context, errors };
}
const calls = (page) => page.evaluate(() => window.__recours.calls.map((c) => c.name));

test("a guest is asked to sign in and nothing is requested", async () => {
  const { page, context, errors } = await open({ signedIn: false });
  await page.locator("#recours").getByText(/Connecte-toi/).waitFor();
  assert.equal(await page.locator("[data-appeal-open]").count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("excluded sessions, appeals and the team's answer are shown, escaped", async () => {
  const { page, context, errors } = await open();
  await page.locator("#recours").getByText("Séances exclues").waitFor();
  assert.equal(await page.locator('[data-appeal-open="session"]').count(), 1, "only the session without an open appeal can be contested");
  const text = await page.locator("#recours").innerText();
  assert.match(text, /running/);
  assert.match(text, /Recours en cours/);
  assert.match(text, /Refusé/);
  assert.match(text, /Réponse de l’équipe : Chevauchement avéré/);
  assert.match(text, /Ton compte n’est pas suspendu/);
  assert.equal(await page.locator("#recours img").count(), 0, "the team's note is escaped");
  assert.equal(await page.evaluate(() => window.pwned), undefined);
  assert.deepEqual(errors, []);
  await context.close();
});

test("a recours needs a real message, is sent once and then listed", async () => {
  const { page, context, errors } = await open();
  await page.locator('[data-appeal-open="session"]').click();
  const form = page.locator("[data-appeal-send]");
  await form.locator("textarea").fill("court");
  await form.locator('[type="submit"]').click();
  await form.locator("[data-appeal-error]").getByText(/10 et 500/).waitFor();
  assert.ok(!(await calls(page)).includes("titan_appeal_submit_v1"), "an empty or short message sends nothing");
  await form.locator("textarea").fill("Course faite avec ma montre, voici le contexte de cette séance.");
  await form.locator('[type="submit"]').click();
  await page.locator("#recours").getByText(/Recours envoyé/).waitFor();
  const sent = await page.evaluate(() => window.__recours.calls.filter((c) => c.name === "titan_appeal_submit_v1"));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].params.p_kind, "session");
  assert.equal(sent[0].params.p_session, "s1");
  assert.match(sent[0].params.p_message, /Course faite avec ma montre/);
  assert.equal(await page.locator('[data-appeal-open="session"]').count(), 0, "the contested session now shows an open appeal");
  assert.deepEqual(errors, []);
  await context.close();
});

test("a refused filing is explained in French and the text is kept", async () => {
  const { page, context } = await open({ mode: "cooldown" });
  await page.locator('[data-appeal-open="session"]').click();
  const form = page.locator("[data-appeal-send]");
  await form.locator("textarea").fill("Je conteste, voici mon explication complète.");
  await form.locator('[type="submit"]').click();
  await form.locator("[data-appeal-error]").getByText(/7 jours/).waitFor();
  assert.equal(await form.locator("textarea").inputValue(), "Je conteste, voici mon explication complète.");
  assert.equal(await form.locator('[type="submit"]').isDisabled(), false, "the player can try again");
  await context.close();
});

test("a suspended account can be contested, and an old server is explained", async () => {
  let r = await open({ mode: "suspended" });
  await r.page.locator('[data-appeal-open="account"]').click();
  await r.page.locator("[data-appeal-send]").locator("textarea").fill("Ma suspension me semble injustifiée, merci de relire.");
  await r.page.locator("[data-appeal-send] [type=submit]").click();
  await r.page.locator("#recours").getByText(/Recours envoyé/).waitFor();
  const sent = await r.page.evaluate(() => window.__recours.calls.find((c) => c.name === "titan_appeal_submit_v1").params);
  assert.equal(sent.p_kind, "account");
  assert.equal(sent.p_session, null);
  await r.context.close();
  r = await open({ mode: "old" });
  await r.page.locator("#recours").getByText(/pas encore disponible/).waitFor();
  await r.context.close();
});

test("a verification request from the team is shown, escaped, and answered once", async () => {
  const { page, context, errors } = await open({ mode: "verify" });
  await page.locator("#verification").waitFor();
  const text = await page.locator("#verification").innerText();
  assert.match(text, /Peux-tu confirmer ta séance de dimanche/);
  assert.match(text, /À traiter/);
  assert.match(text, /Ta réponse : Oui, c’était bien moi/);
  assert.match(text, /aucune sanction/);
  assert.equal(await page.locator("#verification img").count(), 0, "the administrator's text is escaped");
  assert.equal(await page.evaluate(() => window.pwned), undefined);
  assert.equal(await page.locator("[data-verify-send]").count(), 1, "only the open request can be answered");
  const form = page.locator("[data-verify-send]");
  await form.locator("textarea").fill("ok");
  await form.locator('[type="submit"]').click();
  await form.locator("[data-verify-error]").getByText(/3 et 500/).waitFor();
  assert.ok(!(await calls(page)).includes("titan_verification_answer_v1"), "a too short answer sends nothing");
  await form.locator("textarea").fill("Oui, séance faite avec ma montre dimanche matin.");
  await form.locator('[type="submit"]').click();
  await page.locator("#recours").getByText(/Réponse envoyée\. Merci/).waitFor();
  const sent = await page.evaluate(() => window.__recours.calls.filter((c) => c.name === "titan_verification_answer_v1"));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].params.p_id, 7);
  assert.match(sent[0].params.p_answer, /séance faite avec ma montre/);
  assert.equal(await page.locator("[data-verify-send]").count(), 0, "answered once, the form is gone");
  assert.match(await page.locator("#verification").innerText(), /Ta réponse : Oui, séance faite/);
  assert.deepEqual(errors, []);
  await context.close();
});

test("without any request the page has no verification section, and an old server changes nothing", async () => {
  let r = await open();
  await r.page.locator("#recours").getByText("Séances exclues").waitFor();
  assert.equal(await r.page.locator("#verification").count(), 0);
  await r.context.close();
  r = await open({ mode: "ok" });
  await r.page.locator("#recours").getByText("Ton compte").first().waitFor();
  await r.context.close();
});
