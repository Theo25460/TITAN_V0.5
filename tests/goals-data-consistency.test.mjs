// Exercise the real data layer; only network completion and browser globals are controlled.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const source = readFileSync(new URL('../js/app/data.js', import.meta.url), 'utf8');
const A = 'account-a', B = 'account-b';
function fixture() {
  const storage = new Map(), jobs = [], events = new EventTarget();
  const window = Object.assign(events, {state: {user: {id: A}}, titanAccountTransition: {epoch: 0, active: false}});
  function client() {
    return {from(table) {
      assert.equal(table, 'sport_goals');
      let owner;
      const q = {select() {return q;}, eq(key, value) {assert.equal(key, 'user_id'); owner = value; return q;}, order() {return q;}, limit() {
        return new Promise((resolve, reject) => jobs.push({owner, resolve, reject}));
      }};
      return q;
    }};
  }
  window.titanClient = client();
  const navigator = {onLine: true};
  const localStorage = {getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,String(v))};
  vm.runInNewContext(source, {window, navigator, localStorage});
  const row = (title, user_id = A) => ({id: 'goal', user_id, title, revision: title === 'recent' ? 2 : 1});
  const titles = value => Array.from(value, r => r.title);
  const disk = (owner = A) => JSON.parse(storage.get(`titan_goals_v1:${owner}`) ?? '[]');
  const transition = id => {
    window.titanAccountTransition = {epoch: window.titanAccountTransition.epoch + 1, active: true};
    window.dispatchEvent(new Event('titan:account-changing'));
    window.state.user.id = id;
    window.titanAccountTransition.active = false;
    window.dispatchEvent(new Event('titan:account-changed'));
  };
  return {window, navigator, storage, jobs, client, row, titles, disk, transition, goals: options => window.TitanData.goals(options)};
}

test('goals: a late forced reload cannot replace the newer confirmed cache', async () => {
  const f = fixture(), old = f.goals({force:true}), recent = f.goals({force:true});
  f.jobs[1].resolve({data:[f.row('recent')]});
  assert.deepEqual(f.titles(await recent), ['recent']);
  f.jobs[0].resolve({data:[f.row('old')]});
  await old;
  assert.deepEqual(f.titles(f.disk()), ['recent'], 'durable cache keeps latest response');
  assert.deepEqual(f.titles(await f.goals()), ['recent'], 'memory cache keeps latest response');
});
for (const change of ['client', 'epoch', 'round-trip']) test(`goals: obsolete ${change} response cannot repopulate cache`, async () => {
  const f = fixture(), old = f.goals({force:true});
  if (change === 'client') f.window.titanClient = f.client();
  if (change === 'epoch') f.window.titanAccountTransition.epoch++;
  if (change === 'round-trip') {f.transition(B); f.transition(A);}
  const recent = f.goals({force:true});
  f.jobs[1].resolve({data:[f.row('recent')]}); await recent;
  f.jobs[0].resolve({data:[f.row('old')]});
  assert.deepEqual(f.titles(await old), [], 'obsolete caller receives no rows');
  assert.deepEqual(f.titles(f.disk()), ['recent']);
  assert.deepEqual(f.titles(await f.goals()), ['recent']);
});
for (const change of ['client', 'epoch', 'round-trip']) test(`goals: populated memory cache is scoped to ${change}`, async () => {
  const f = fixture(), first = f.goals();
  f.jobs[0].resolve({data:[f.row('old')]}); await first;
  if (change === 'client') f.window.titanClient = f.client();
  if (change === 'epoch') f.window.titanAccountTransition.epoch++;
  if (change === 'round-trip') {f.transition(B); f.transition(A);}
  const next = f.goals();
  assert.equal(f.jobs.length, 2, 'new session must read the server instead of reuse former memory');
  f.jobs[1].resolve({data:[f.row('recent')]});
  assert.deepEqual(f.titles(await next), ['recent']);
});
test('goals: transitioning session neither reads nor exposes the cache', async () => {
  const f = fixture(), first = f.goals();
  f.jobs[0].resolve({data:[f.row('old')]}); await first;
  f.window.titanAccountTransition.active = true;
  assert.deepEqual(f.titles(await f.goals()), []);
  assert.equal(f.jobs.length, 1);
});
test('goals: response after sign-out cannot recreate the cleared device cache', async () => {
  const f = fixture(), old = f.goals();
  f.transition(null); f.storage.clear();
  f.jobs[0].resolve({data:[f.row('old')]});
  assert.deepEqual(f.titles(await old), []);
  assert.equal(f.storage.size, 0);
  assert.deepEqual(f.titles(await f.goals()), []);
});
test('goals: newest network failure keeps the last confirmed local list', async () => {
  const f = fixture(), first = f.goals();
  f.jobs[0].resolve({data:[f.row('confirmed')]}); await first;
  const old = f.goals({force:true}), recent = f.goals({force:true});
  f.jobs[2].reject(Error('offline'));
  assert.deepEqual(f.titles(await recent), ['confirmed']);
  f.jobs[1].resolve({data:[f.row('old')]}); await old;
  assert.deepEqual(f.titles(f.disk()), ['confirmed']);
  assert.deepEqual(f.titles(await f.goals()), ['confirmed']);
});
test('goals: guest forced reload and offline account fallback retain existing behavior', async () => {
  const f = fixture();
  f.window.state.user.id = 'guest_device';
  f.storage.set('titan_goals_v1:guest_device', JSON.stringify([f.row('guest', 'guest_device')]));
  assert.deepEqual(f.titles(await f.goals()), ['guest']);
  f.storage.set('titan_goals_v1:guest_device', JSON.stringify([f.row('guest-edited', 'guest_device')]));
  assert.deepEqual(f.titles(await f.goals({force:true})), ['guest-edited']);
  f.transition(A); f.navigator.onLine = false;
  f.storage.set('titan_goals_v1:account-a', JSON.stringify([f.row('offline')]));
  assert.deepEqual(f.titles(await f.goals()), ['offline']);
  assert.equal(f.jobs.length, 0);
});
for (const finish of ['data', 'error', 'reject']) test(`goals: obsolete ${finish} during an active transition cannot restore a cleared cache`, async () => {
  const f = fixture(), old = f.goals();
  f.window.titanAccountTransition.active = true;
  f.storage.clear();
  if (finish === 'reject') f.jobs[0].reject(Error('network unavailable'));
  else f.jobs[0].resolve(finish === 'error' ? {error:{code:'503'}} : {data:[f.row('old')]});
  assert.deepEqual(f.titles(await old), []);
  assert.equal(f.storage.size, 0);
});
test('goals: silent owner change rejects the old account response', async () => {
  const f = fixture(), old = f.goals();
  f.window.state.user.id = B;
  f.jobs[0].resolve({data:[f.row('old')]});
  assert.deepEqual(f.titles(await old), []);
  assert.equal(f.storage.size, 0);
});
test('goals: older forced caller receives no stale result even after newer failure', async () => {
  const f = fixture(), old = f.goals({force:true}), recent = f.goals({force:true});
  f.jobs[1].resolve({error:{code:'503'}}); await recent;
  f.jobs[0].resolve({data:[f.row('old')]});
  assert.deepEqual(f.titles(await old), []);
  assert.equal(f.storage.size, 0);
});
