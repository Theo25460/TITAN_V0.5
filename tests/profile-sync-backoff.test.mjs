import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/state.js', import.meta.url), 'utf8');
const start = source.indexOf('let titanProfilePush = null;');
const end = source.indexOf('async function pushProfileStateToCloudOnce() {', start);
assert.ok(start >= 0 && end > start, 'profile push module found');
const code = source.slice(start, end);

function harness(sender) {
    let now = 100000;
    let calls = 0;
    const statuses = [];
    const state = { user: { id: 'athlete-a' } };
    const window = {
        state,
        cloudSyncTimer: null,
        titanSetSyncStatus: (status, message) => statuses.push({ status, message })
    };
    class FakeDate extends Date {
        static now() { return now; }
    }
    const sandbox = {
        window, Promise, Date: FakeDate, clearTimeout,
        pushProfileStateToCloudOnce: () => {
            calls += 1;
            return sender(calls);
        }
    };
    vm.runInNewContext(code + '\nthis.push = pushProfileStateToCloud;', sandbox);
    return {
        push: sandbox.push,
        window,
        statuses,
        calls: () => calls,
        advance: ms => { now += ms; }
    };
}

test('40001 conflict blocks all automatic retries and preserves local state', async () => {
    const h = harness(async () => ({ code: '40001', message: 'PROFILE_VERSION_CONFLICT' }));
    const first = h.push();
    const concurrent = h.push();
    await Promise.all([first, concurrent]);
    await h.push();
    await h.push();
    assert.equal(h.calls(), 1);
    assert.equal(h.window.state.user.id, 'athlete-a');
    assert.ok(h.statuses.some(x => x.status === 'error' && /recharge TITAN/.test(x.message)));
});

test('network errors back off exponentially rather than hammering Supabase', async () => {
    const h = harness(async n => n <= 2 ? ({ code: 'FETCH_FAILED' }) : null);
    await h.push();
    await h.push();
    assert.equal(h.calls(), 1);
    h.advance(30000);
    await h.push();
    assert.equal(h.calls(), 2);
    h.advance(30000);
    await h.push();
    assert.equal(h.calls(), 2);
    h.advance(30000);
    await h.push();
    assert.equal(h.calls(), 3);
    await h.push();
    assert.equal(h.calls(), 4);
});

test('one queued save runs after a successful in-flight save', async () => {
    let resolveFirst;
    const firstPending = new Promise(resolve => { resolveFirst = resolve; });
    const h = harness(n => n === 1 ? firstPending : Promise.resolve(null));
    const first = h.push();
    const concurrent = h.push();
    await Promise.resolve();
    assert.equal(h.calls(), 1);
    resolveFirst(null);
    await Promise.all([first, concurrent]);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.calls(), 2);
});

test('conflict lock never blocks another signed-in account', async () => {
    const h = harness(async n => n === 1 ? ({ code: '40001' }) : null);
    await h.push();
    h.window.state.user.id = 'athlete-b';
    await h.push();
    assert.equal(h.calls(), 2);
});

test('full cloud reload is the only path that clears a conflict lock', () => {
    assert.match(source, /if \(titanProfileBlockedOwner === expectedOwner\) titanProfileBlockedOwner = null/);
    assert.match(source, /profileVersion:profile\.state_version,historyTotal:historyResult\.total/);
});
