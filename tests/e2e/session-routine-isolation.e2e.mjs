import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
const A = "00000000-0000-4000-8000-000000000a41";
const B = "00000000-0000-4000-8000-000000000b41";
let base, server, browser;

before(async () => {
  const port = await new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, () => { const port = probe.address().port; probe.close(() => resolve(port)); });
  });
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  let ready = false;
  for (let attempt = 0; attempt < 50 && !ready; attempt++) {
    try { ready = (await fetch(base)).ok; } catch {}
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready);
  browser = await chromium.launch();
});

after(async () => { await browser?.close(); server?.kill(); });

for (const [mode, title, action] of [["load", "Charger une routine", "[data-r]"], ["save", "Mémoriser la routine", "#routine-save"]]) {
  test(`session routine ${mode}: account change closes the sheet and rejects its old handler`, async () => {
    const context = await browser.newContext({ serviceWorkers: "block" });
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("internetdisconnected"));
    const page = await context.newPage();
    try {
      await page.goto(`${base}/training?sport=muscu_gym`);
      await page.locator('[data-act="save"]').waitFor();
      await page.evaluate(({ a, b, mode }) => {
        window.routineSwitch = (id, routines = []) => {
          window.titanInvalidateAccountSession(id);
          window.state.user = { ...window.state.user, id, gymRoutines: routines };
          window.state.history = [];
          window.titanAccountTransition = { ...window.titanAccountTransition, active: false, owner: id };
          window.dispatchEvent(new Event("titan:account-changed"));
        };
        const fixture = (name) => ({ name, kind: "weighted", sets: [{ weight: "40", reps: "8" }] });
        const ownerDraft = (name) => ({ sport: "muscu_gym", exercises: [fixture(name)], updatedAt: Date.now() });
        localStorage.setItem(`titan_seance_draft_v3:${a}`, JSON.stringify(ownerDraft("Exercice du compte A")));
        localStorage.setItem(`titan_seance_draft_v3:${b}`, JSON.stringify(ownerDraft("Exercice du compte B")));
        window.routineSwitch(a, [{ id: "a-routine", label: "Routine du compte A", exercises: [fixture("Exercice du compte A")] }]);
        document.querySelector(`[data-act="${mode}-routine"]`).click();
      }, { a: A, b: B, mode });
      const dialog = page.getByRole("dialog", { name: title });
      await dialog.waitFor();
      if (mode === "load") assert.match(await dialog.innerText(), /Routine du compte A/);
      else await dialog.locator("#routine-name").fill("Brouillon de routine du compte A");
      await page.evaluate(({ b, action }) => {
        window.oldRoutineAction = document.querySelector(`dialog[open] ${action}`);
        window.routineSwitch(b);
      }, { b: B, action });
      assert.equal(await dialog.count(), 0, "the previous account's routine sheet closes on switch");
      await page.evaluate(() => window.oldRoutineAction.click());
      const actual = await page.evaluate((owner) => ({
        exercises: JSON.parse(localStorage.getItem(`titan_seance_draft_v3:${owner}`)).exercises.map((exercise) => exercise.name),
        routines: window.state.user.gymRoutines,
      }), B);
      assert.deepEqual(actual, { exercises: ["Exercice du compte B"], routines: [] });
    } finally {
      await context.close();
    }
  });
}
