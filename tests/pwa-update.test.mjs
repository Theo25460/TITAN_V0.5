// js/pwa.js: a service-worker update downloaded during an earlier page is applied when the next page starts, and never reloads a page in use.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/pwa.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness({ waiting = true, controller = true, submitting = false, lastAuto = null } = {}) {
  const listeners = { window: new Map(), document: new Map(), sw: new Map() };
  const on = map => (type, fn) => map.set(type, [...(map.get(type) || []), fn]);
  const fire = (map, type, event = {}) => (map.get(type) || []).forEach(fn => fn(event));
  const timers = [], posted = [], session = new Map(lastAuto === null ? [] : [['titan_sw_auto_update', String(lastAuto)]]);
  let reloads = 0;
  const elements = new Map();
  const worker = { postMessage: message => posted.push(message) };
  const registration = { waiting: waiting ? worker : null, addEventListener() {} };
  const w = {
    console: { warn() {} }, Date, Number, String, Promise,
    matchMedia: () => ({ matches: false }),
    navigator: { userAgent: 'test', serviceWorker: { controller: controller ? {} : null, addEventListener: on(listeners.sw), register: async () => registration, getRegistrations: async () => [] } },
    location: { hostname: 'titan-app.fr', reload: () => { reloads++; } },
    localStorage: { getItem: () => null },
    sessionStorage: { getItem: key => session.get(key) ?? null, setItem: (key, value) => session.set(key, String(value)) },
    document: {
      addEventListener: on(listeners.document), getElementById: id => elements.get(id) || null, querySelector: () => null,
      createElement: () => { const el = { style: {}, hidden: false, set id(value) { elements.set(value, el); } }; return el; },
      body: { appendChild() {} },
    },
    addEventListener: on(listeners.window),
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    titanSubmitting: submitting,
  };
  w.window = w;
  vm.createContext(w); vm.runInContext(source, w);
  return {
    w, posted, registration, timers,
    start: async () => { fire(listeners.document, 'DOMContentLoaded'); await tick(); await tick(); },
    touch: () => fire(listeners.window, 'pointerdown'),
    controllerChange: () => fire(listeners.sw, 'controllerchange'),
    reloads: () => reloads,
    button: () => elements.get('titan-update-button'),
    runTimers: () => timers.splice(0).forEach(t => t.fn()),
  };
}

test('a waiting update is applied when the page starts, then the page reloads once', async () => {
  const h = harness(); await h.start();
  assert.deepEqual(JSON.parse(JSON.stringify(h.posted)), [{ type: 'SKIP_WAITING' }]);
  assert.equal(h.button(), undefined, 'no button while the update applies itself');
  h.controllerChange(); h.controllerChange();
  assert.equal(h.reloads(), 1);
});

test('a page already in use is never reloaded by the automatic update', async () => {
  const h = harness(); await h.start();
  h.touch(); h.controllerChange();
  assert.equal(h.reloads(), 0);
});

test('no automatic update twice within a minute, during a submission, or without a controlling worker: the button is shown instead', async () => {
  for (const options of [{ lastAuto: Date.now() - 5000 }, { submitting: true }, { controller: false }]) {
    const h = harness(options); await h.start();
    assert.equal(h.posted.length, 0, JSON.stringify(options));
    assert.ok(h.button(), 'the update button is offered');
    h.controllerChange();
    assert.equal(h.reloads(), 0);
  }
});

test('the button remains the fallback when the new worker does not take over, and it reloads on demand', async () => {
  const h = harness(); await h.start();
  h.runTimers();
  const button = h.button();
  assert.ok(button, 'button shown after the grace delay');
  button.onclick();
  assert.equal(h.posted.length, 2);
  h.touch(); h.controllerChange();
  assert.equal(h.reloads(), 1, 'a requested update reloads even after a touch');
});

test('nothing happens without a waiting worker', async () => {
  const h = harness({ waiting: false }); await h.start();
  assert.equal(h.posted.length, 0); assert.equal(h.button(), undefined);
  h.controllerChange(); assert.equal(h.reloads(), 0);
});
