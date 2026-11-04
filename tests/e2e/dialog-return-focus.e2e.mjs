// Real shell dialogs and confirmations; local discovery, synthetic action receipts only.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
let server, browser, BASE;
before(async () => {
  const port = await new Promise(resolve => {
    const probe = createServer();
    probe.listen(0, () => { const port = probe.address().port; probe.close(() => resolve(port)); });
  });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await fetch(BASE + "/")).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, "local shell server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage(width = 360, timezoneId = "Europe/Paris") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  return { context, page };
}

const EVENTS = ["titan:history-updated", "titan:adventure-updated", "titan:pending-changed", "online", "offline"];
async function shellPage(width = 360, path = "/stats") {
  const fixture = await newPage(width), { page } = fixture;
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(BASE + path);
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.locator("[data-shell-more]").waitFor({ state: "attached" });
  return { ...fixture, errors };
}
async function refresh(page, event = "titan:history-updated") {
  const old = await page.locator(".asc-topbar [data-shell-more]").elementHandle();
  await page.evaluate(event => { window.fixtureEvent = event; window.dispatchEvent(new Event(event)); }, event);
  await page.waitForFunction(el => !el.isConnected, old);
  await old.dispose();
}
async function active(locator) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await locator.evaluate(el => ({ connected: el.isConnected, same: document.activeElement === el, actual: document.activeElement.outerHTML.slice(0, 240) }));
    // A queued render may replace the resolved locator before this callback runs.
    if (!result.connected) continue;
    assert.equal(result.same, true, result.actual);
    return;
  }
  assert.fail("Focus target kept being replaced during the assertion");
}

async function openMenu(page) {
  await page.locator("[data-shell-more]").focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("dialog", { name: "Plus", exact: true });
  await menu.waitFor();
  return menu;
}
async function untilRemoved(dialog, action) {
  const node = await dialog.elementHandle();
  await action();
  await dialog.page().waitForFunction(el => !el.isConnected, node);
  await node.dispose();
}
async function closeButton(menu) {
  await untilRemoved(menu, () => menu.locator("[data-close]").click());
}
async function confirmPage(page, pending = false) {
  await page.locator("[data-shell-more]").focus();
  await page.evaluate(pending => {
    window.dialogCalls = 0; window.dialogResult = null;
    window.titanShell.confirm({ title: "Action de test", action: async () => {
      window.dialogCalls++;
      if (pending) return new Promise(resolve => { window.releaseDialogAction = resolve; });
      if (window.dialogCalls === 1) throw Error("Réponse de test indisponible");
    } }).then(result => { window.dialogResult = result; });
  }, pending);
  const dialog = page.getByRole("dialog", { name: "Action de test", exact: true });
  await dialog.waitFor();
  return dialog;
}

test("dialog return: Close restores mobile More after each shell event", async () => {
  for (const width of [360]) {
    const { page, context, errors } = await shellPage(width);
    try {
      for (const event of EVENTS) {
        const menu = await openMenu(page);
        await refresh(page, event);
        await closeButton(menu);
        await active(page.locator("[data-shell-more]"));
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("dialog return: Escape and backdrop dismissal restore the replaced opener", async () => {
  for (const method of ["escape", "backdrop"]) {
    const { page, context, errors } = await shellPage();
    try {
      const menu = await openMenu(page); await refresh(page);
      await untilRemoved(menu, async () => {
        if (method === "escape") await page.keyboard.press("Escape");
        else await menu.evaluate(dialog => dialog.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      });
      await active(page.locator("[data-shell-more]"));
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("dialog return: native restoration without a shell refresh is preserved", async () => {
  const { page, context, errors } = await shellPage();
  try {
    const menu = await openMenu(page); await closeButton(menu);
    await active(page.locator("[data-shell-more]"));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("dialog return: confirmation failure retains retry and success returns to replaced More", async () => {
  const { page, context, errors } = await shellPage();
  try {
    const dialog = await confirmPage(page);
    await dialog.locator("[data-ok]").click();
    assert.match(await dialog.locator("[data-error]").textContent(), /indisponible/);
    await active(dialog.locator("[data-ok]"));
    assert.equal(await page.evaluate(() => window.dialogResult), null);
    await refresh(page);
    await active(dialog.locator("[data-ok]"));
    assert.match(await dialog.locator("[data-error]").textContent(), /indisponible/);
    await untilRemoved(dialog, () => dialog.locator("[data-ok]").click());
    assert.equal(await page.evaluate(() => window.dialogResult), true);
    assert.equal(await page.evaluate(() => window.dialogCalls), 2);
    await active(page.locator("[data-shell-more]"));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("dialog return: pending confirmation still blocks double action and user cancellation", async () => {
  const { page, context, errors } = await shellPage();
  try {
    const dialog = await confirmPage(page, true);
    await dialog.locator("[data-ok]").click();
    await refresh(page, "titan:pending-changed");
    assert.equal(await dialog.getAttribute("aria-busy"), "true");
    await dialog.evaluate(el => {
      el.querySelector("[data-ok]").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      el.querySelector("[data-cancel]").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.keyboard.press("Escape");
    assert.equal(await dialog.isVisible(), true);
    assert.equal(await page.evaluate(() => window.dialogCalls), 1);
    assert.equal(await page.evaluate(() => window.dialogResult), null);
    await untilRemoved(dialog, () => page.evaluate(() => window.releaseDialogAction()));
    assert.equal(await page.evaluate(() => window.dialogResult), true);
    await active(page.locator("[data-shell-more]"));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("dialog return: onClose can deliberately focus another field", async () => {
  const { page, context, errors } = await shellPage();
  try {
    await page.locator("[data-shell-more]").focus();
    await page.evaluate(() => {
      const input = document.createElement("input"); input.id = "fixture-after-close"; document.body.append(input);
      window.titanShell.sheet({ title: "Retour de test", onClose: () => input.focus() });
    });
    const dialog = page.getByRole("dialog", { name: "Retour de test", exact: true });
    await refresh(page); await closeButton(dialog);
    await active(page.locator("#fixture-after-close"));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("dialog return: an onClose callback opening a new dialog keeps its new focus", async () => {
  const { page, context, errors } = await shellPage();
  try {
    await page.locator("[data-shell-more]").focus();
    await page.evaluate(() => {
      window.titanShell.sheet({ title: "Premier test", onClose: () => {
        const input = document.createElement("input"); input.id = "fixture-next-dialog";
        window.titanShell.sheet({ title: "Deuxième test", body: input }); input.focus();
      } });
    });
    const dialog = page.getByRole("dialog", { name: "Premier test", exact: true });
    await refresh(page); await closeButton(dialog);
    await active(page.locator("#fixture-next-dialog"));
    assert.equal(await page.getByRole("dialog", { name: "Deuxième test", exact: true }).isVisible(), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("dialog return: a removed logical opener does not send focus elsewhere", async () => {
  const { page, context, errors } = await shellPage();
  try {
    const menu = await openMenu(page); await refresh(page);
    await page.evaluate(() => { document.body.dataset.shell = "none"; document.querySelector("[data-shell-more]").remove(); });
    await closeButton(menu);
    assert.equal(await page.evaluate(() => document.activeElement === document.body), true, await page.evaluate(() => document.activeElement.outerHTML.slice(0, 240)));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("dialog return: a stable non-navigation opener keeps native focus restoration", async () => {
  const { page, context, errors } = await shellPage();
  try {
    await page.evaluate(() => {
      const button = document.createElement("button"); button.id = "fixture-stable-opener"; button.textContent = "Ouvrir";
      document.body.append(button); button.focus(); window.titanShell.sheet({ title: "Sans navigation" });
    });
    const dialog = page.getByRole("dialog", { name: "Sans navigation", exact: true });
    await refresh(page); await closeButton(dialog);
    await active(page.locator("#fixture-stable-opener"));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("dialog return: the desktop navigation opener is restored after a sheet API close", async () => {
  const { page, context, errors } = await shellPage(1280);
  try {
    const link = page.locator('[data-subnav] a[href="/records"]');
    await link.focus();
    await page.evaluate(() => window.titanShell.sheet({ title: "Retour desktop" }));
    const dialog = page.getByRole("dialog", { name: "Retour desktop", exact: true });
    await refresh(page); await closeButton(dialog);
    await active(link);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
