// V11-09: the sport's own measures are shown first, optional details after, dependent fields follow their condition.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const ACTIVE_SPORTS = JSON.parse(readFileSync(new URL('../../tools/data/sport-metrics-baseline.json', import.meta.url)));
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
  assert.ok(ready, "local athlete server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage(width = 360) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  return { context, page, errors };
}


const GOLF = [
  { id: 'holes', type: 'number', label: 'Trous joués', min: 0, max: 36, step: 1, priority: 1 },
  { id: 'strokes', type: 'number', label: 'Coups', min: 0, max: 200, step: 1, priority: 2 },
  { id: 'putts', type: 'number', label: 'Putts', min: 0, max: 100, step: 1, priority: 3 },
  { id: 'on_course', type: 'checkbox', label: 'Sur parcours', priority: 4 },
  { id: 'quality_score', type: 'number', label: 'Qualité exécution', min: 0, max: 10, step: 1, priority: 5 },
];
const SOCCER = [
  { id: 'position', type: 'select', label: 'Poste', options: ['Gardien', 'Défenseur', 'Milieu', 'Attaquant'], priority: 1 },
  { id: 'goals', type: 'number', label: 'Buts', min: 0, max: 20, step: 1, priority: 2, visibleWhen: { in: ['Milieu', 'Attaquant'], field: 'position' } },
  { id: 'saves', type: 'number', label: 'Arrêts', min: 0, max: 40, step: 1, priority: 3, visibleWhen: { field: 'position', equals: 'Gardien' } },
  { id: 'duels_won', type: 'number', label: 'Duels gagnés', min: 0, max: 80, step: 1, priority: 4 },
];
async function openWith(page, query, sport, fields) {
  await page.goto(BASE + '/training', { waitUntil: 'load' });
  await page.evaluate(([sport, fields]) => { window.SPORTS_CONFIG[sport].extraFields = fields; }, [sport, fields]);
  await page.locator('#sport-q').fill(query);
  await page.locator(`#sport-results [data-sport="${sport}"]`).click();
}
const lastLog = (page) => page.evaluate(() => { const h = window.state?.history || []; return h[h.length - 1] || null; });

test('offline catalog exposes yoga measures without injected fixtures and saves absent values as absent', async () => {
  const { page, context, errors } = await newPage(360);
  try {
    await page.goto(BASE + '/training?sport=yoga', { waitUntil: 'load' });
    await page.locator('[data-k="extras.style"]').selectOption('Yin');
    await page.locator('[data-k="extras.poses"]').fill('8');
    await page.locator('[data-k="durM"]').fill('25');
    await page.locator('[data-act="save"]').click();
    await page.locator('dialog.asc-sheet[open]').waitFor();
    const log = await lastLog(page);
    assert.equal(log.details.extras.style, 'Yin');
    assert.equal(Number(log.details.extras.poses), 8);
    assert.ok(!('breath_minutes' in log.details.extras));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('strength form saves optional rest measures alongside structured sets', async () => {
  const { page, context } = await newPage(360);
  try {
    await page.goto(BASE + '/training?sport=muscu_gym', { waitUntil: 'load' });
    await page.locator('[data-k="extras.rest_seconds"]').fill('90');
    await page.locator('[data-k="durM"]').fill('40');
    await page.locator('[data-act="save"]').click();
    await page.locator('dialog.asc-sheet[open]').waitFor();
    assert.equal(Number((await lastLog(page)).details.extras.rest_seconds), 90);
  } finally { await context.close(); }
});

test('journal corrects sport metrics, clears an optional value and retains unrecognised historic data', async () => {
  const { page, context } = await newPage(360);
  try {
    await page.goto(BASE + '/journal', { waitUntil: 'load' });
    await page.evaluate(() => {
      window.state.history = [{ id: 'fixture-yoga-metrics', user_id: window.state.user.id, sport: 'yoga', val: 25, unit: 'min', date: new Date().toISOString(), details: { duration: 25, extras: { style: 'Yin', poses: 8, old_private_metric: 'kept' } } }];
      window.dispatchEvent(new Event('titan:history-updated'));
    });
    await page.locator('[data-open="fixture-yoga-metrics"]').click();
    await page.locator('dialog[open] [data-edit]').click();
    const edit = page.locator('dialog[open] form.jr-edit');
    await edit.locator('details.seance-more summary').click();
    await edit.locator('[name="metric.style"]').selectOption('Hatha');
    await edit.locator('[name="metric.poses"]').fill('');
    await edit.locator('[type="submit"]').click();
    await page.waitForFunction(() => window.state.history[0]?.details.extras.style === 'Hatha');
    const extras = await page.evaluate(() => window.state.history[0].details.extras);
    assert.equal(extras.poses, null);
    assert.equal(extras.old_private_metric, 'kept');
    assert.ok(!('breath_minutes' in extras), 'untouched missing fields remain missing');
  } finally { await context.close(); }
});

test('more than eleven optional measures remain reachable and checkbox false is not lost', async () => {
  const { page, context } = await newPage(360);
  try {
    const fields = Array.from({length: 15}, (_, i) => ({ id: `m${i}`, label: `Mesure ${i}`, type: 'number', priority: i + 1, min: 0, max: 100, step: 1 }));
    fields.push({ id: 'on_course', label: 'Sur parcours', type: 'checkbox', priority: 20 });
    await openWith(page, 'golf', 'golf', fields);
    const details = page.locator('details.seance-more');
    await details.locator('summary').click();
    await page.locator('[data-k="extras.m14"]').fill('12');
    await page.locator('[data-k="extras.on_course"]').check();
    await page.locator('[data-k="extras.on_course"]').uncheck();
    await page.locator('[data-k="durM"]').fill('45');
    await page.locator('[data-act="save"]').click();
    await page.locator('dialog.asc-sheet[open]').waitFor();
    const log = await lastLog(page);
    assert.equal(Number(log.details.extras.m14), 12);
    assert.equal(log.details.extras.on_course, false);
  } finally { await context.close(); }
});

test('golf shows its three main measures at once and keeps the rest in an optional section', async () => {
  const { page, context, errors } = await newPage(390);
  try {
    await openWith(page, 'golf', 'golf', GOLF);
    const primary = page.locator('[data-primary-measures]');
    assert.equal(await primary.locator('[data-k^="extras."]').count(), 3);
    assert.deepEqual(await primary.locator('label > span').allInnerTexts(), ['Trous joués', 'Coups', 'Putts']);
    const more = page.locator('details.seance-more');
    assert.equal(await more.locator('[data-k^="extras."]').count(), 2, 'the other measures stay optional');
    assert.equal(await more.evaluate((el) => el.open), false);
    await primary.locator('[data-k="extras.holes"]').fill('18');
    await primary.locator('[data-k="extras.strokes"]').fill('84');
    await primary.locator('[data-k="extras.putts"]').fill('31');
    await page.locator('[data-k="durH"]').fill('4');
    await page.locator('[data-act="save"]').click();
    await page.locator('dialog.asc-sheet[open]').waitFor();
    const log = await lastLog(page);
    assert.equal(Number(log.details.extras.holes), 18);
    assert.equal(Number(log.details.extras.strokes), 84);
    assert.equal(Number(log.details.extras.putts), 31);
    assert.ok(!('quality_score' in log.details.extras), 'an untouched optional measure is not recorded');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('a measure that depends on another follows it and never leaves stale data', async () => {
  const { page, context, errors } = await newPage(390);
  try {
    await openWith(page, 'football', 'football', SOCCER);
    assert.equal(await page.locator('[data-k="extras.goals"]').count(), 0, 'no goals before a position is chosen');
    await page.locator('[data-k="extras.position"]').selectOption('Attaquant');
    await page.locator('[data-k="extras.goals"]').waitFor();
    assert.equal(await page.locator('[data-k="extras.saves"]').count(), 0);
    await page.locator('[data-k="extras.goals"]').fill('2');
    await page.locator('[data-k="extras.position"]').selectOption('Gardien');
    await page.locator('[data-k="extras.saves"]').waitFor();
    assert.equal(await page.locator('[data-k="extras.goals"]').count(), 0);
    await page.locator('[data-k="extras.saves"]').fill('7');
    await page.locator('[data-k="durM"]').fill('90');
    await page.locator('[data-act="save"]').click();
    await page.locator('dialog.asc-sheet[open]').waitFor();
    const log = await lastLog(page);
    assert.equal(log.details.extras.position, 'Gardien');
    assert.equal(Number(log.details.extras.saves), 7);
    assert.ok(!('goals' in log.details.extras), 'the goals typed for another position are dropped');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('all 260 real catalog forms render on a narrow phone without page overflow', async () => {
  const { page, context, errors } = await newPage(360);
  try {
    for (const sport of ACTIVE_SPORTS) {
      await page.goto(BASE + '/training?sport=' + encodeURIComponent(sport.id), { waitUntil: 'load' });
      await page.locator('[data-act="save"]').waitFor();
      const result = await page.evaluate(() => {
        const inputs = [...document.querySelectorAll('[data-k^="extras."]')];
        const primary = [...document.querySelectorAll('[data-primary-measures] [data-k]')];
        const id = new URLSearchParams(location.search).get('sport');
        const expected = window.TITAN_SPORTS_SNAPSHOT.find(r => r[0] === id)[7];
        const actual = window.SPORTS_CONFIG[id].extraFields;
        return { schemaReady: expected.every(f => actual.some(a => a.id === f.id)), extras: inputs.length, primary: primary.length, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      assert.ok(result.extras >= 1, sport.id + ': sport details reachable');
      assert.ok(result.schemaReady, sport.id + ': complete reviewed schema, including pre-existing fallback sports');
      assert.ok(result.primary <= 3, sport.id + ': progressive disclosure');
      assert.equal(result.overflow, false, sport.id + ': 360px viewport');
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
