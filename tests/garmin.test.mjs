// V11-40: Garmin server side, with a simulated Garmin and a simulated database. No real key exists in this repository.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import handler, { openState, sealState } from '../functions/garmin.mjs';

const USER = '00000000-0000-4000-8000-0000000000b1';
const STATE_KEY = 'synthetic-state-key-0123456789abcdef0123456789';
const PUSH = 'synthetic-push-secret-0123456789abcdef';
const ENV = {
    GARMIN_ENABLED: 'true', GARMIN_CLIENT_ID: 'synthetic-client-id', GARMIN_CLIENT_SECRET: 'synthetic-client-secret-value',
    GARMIN_AUTH_URL: 'https://garmin.example.test/authorize', GARMIN_TOKEN_URL: 'https://garmin.example.test/token',
    GARMIN_USER_ID_URL: 'https://garmin.example.test/user/id', GARMIN_REDIRECT_URI: 'https://titan.example.test/.netlify/functions/garmin?action=callback',
    GARMIN_PUSH_TOKEN: PUSH, GARMIN_STATE_KEY: STATE_KEY,
    SUPABASE_URL: 'https://database.example.test', SUPABASE_SECRET_KEY: 'sb_secret_fake', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fake'
};
const at = (query, init = {}) => new Request(`https://titan.example.test/.netlify/functions/garmin?${query}`, init);
const push = (body, token = PUSH, raw = null) => at(`action=push&token=${token}`, { method: 'POST', body: raw ?? JSON.stringify(body) });
const activity = (id = '1001', user = 'garmin-user-1') => ({ userId: user, summaryId: id, activityType: 'RUNNING', startTimeInSeconds: 1790000000, durationInSeconds: 2400, distanceInMeters: 8000 });

async function run(callback, { env = {}, rpc = () => Response.json(true), garmin = {} } = {}) {
    const previousNetlify = globalThis.Netlify, previousFetch = globalThis.fetch, logs = [];
    const methods = ['log', 'info', 'warn', 'error'], previousConsole = methods.map(m => console[m]);
    for (const m of methods) console[m] = (...args) => logs.push(args.map(String).join(' '));
    globalThis.Netlify = { env: { get: name => ({ ...ENV, ...env })[name] || '' } };
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
        const u = new URL(url), body = init.body;
        calls.push({ host: u.host, path: u.pathname, body: typeof body === 'string' && body.startsWith('{') ? JSON.parse(body) : body, headers: init.headers });
        if (u.host === 'database.example.test' && u.pathname === '/auth/v1/user') return garmin.user ?? Response.json({ id: USER });
        if (u.host === 'database.example.test') return rpc(u.pathname.split('/').pop(), calls.at(-1).body);
        if (u.host === 'garmin.example.test' && u.pathname === '/token') return garmin.token ?? Response.json({ access_token: 'synthetic-garmin-access-token', refresh_token: 'synthetic-refresh' });
        if (u.host === 'garmin.example.test' && u.pathname === '/user/id') return garmin.who ?? Response.json({ userId: 'garmin-user-9' });
        throw new Error(`unexpected request ${url}`);
    };
    try { return await callback(calls, logs); } finally { globalThis.Netlify = previousNetlify; globalThis.fetch = previousFetch; methods.forEach((m, i) => { console[m] = previousConsole[i]; }); }
}
const rpcCalls = calls => calls.filter(c => c.host === 'database.example.test' && c.path.startsWith('/rest/v1/rpc/'));

test('disabled or incomplete configuration answers 503 on every action and touches nothing', async () => {
    for (const env of [{ GARMIN_ENABLED: 'false' }, { GARMIN_CLIENT_SECRET: '' }, { GARMIN_PUSH_TOKEN: 'short' }, { GARMIN_STATE_KEY: 'short' }, { GARMIN_TOKEN_URL: 'http://garmin.example.test/token' }, { SUPABASE_SECRET_KEY: '' }]) {
        await run(async calls => {
            for (const request of [push({ activities: [activity()] }), at('action=start', { method: 'POST', headers: { authorization: 'Bearer x'.padEnd(40, 'x') } }), at('action=callback&code=abcd&state=zz')])
                assert.equal((await handler(request)).status, 503, JSON.stringify(env));
            assert.equal(calls.length, 0);
        }, { env });
    }
});

test('the push needs its secret token and a POST, and rejects oversized, unreadable or unknown requests', async () => {
    await run(async calls => {
        assert.equal((await handler(push({ activities: [] }, 'wrong-token-0123456789abcdef-xx'))).status, 401);
        assert.equal((await handler(at(`action=push&token=${PUSH}`, { method: 'GET' }))).status, 405);
        assert.equal((await handler(push(null, PUSH, 'not json'))).status, 400);
        assert.equal((await handler(push(null, PUSH, ' '.repeat(600000)))).status, 413);
        assert.equal((await handler(push({ activities: Array.from({ length: 101 }, (_, i) => activity(String(i))) }))).status, 413);
        assert.equal((await handler(at('action=nothing'))).status, 404);
        assert.equal(calls.length, 0);
    });
});

test('a push is handed to the database activity by activity, deregistrations too, and acknowledged only when the database took them', async () => {
    await run(async calls => {
        const ok = await handler(push({ activities: [activity('1'), activity('2', 'garmin-user-2'), { userId: 'bad id!', summaryId: '3' }], deregistrations: [{ userId: 'garmin-user-3' }, { userId: '' }] }));
        assert.equal(ok.status, 200);
        const sent = rpcCalls(calls);
        assert.deepEqual(sent.map(c => c.path.split('/').pop()), ['titan_garmin_ingest_v1', 'titan_garmin_ingest_v1', 'titan_garmin_deregister_v1']);
        assert.equal(sent[0].body.p_garmin_user, 'garmin-user-1');
        assert.equal(sent[0].body.p_activity.summaryId, '1');
        assert.equal(sent[2].body.p_garmin_user, 'garmin-user-3');
        assert.equal(sent[0].headers.apikey, 'sb_secret_fake');
    });
    await run(async () => {
        assert.equal((await handler(push({ activities: [activity()] }))).status, 503, 'Garmin must retry when the database failed');
    }, { rpc: () => Response.json({}, { status: 500 }) });
});

test('start: a signed-in player gets the Garmin consent address with PKCE S256 and a sealed state; the secret never leaves the server', async () => {
    await run(async (calls, logs) => {
        assert.equal((await handler(at('action=start', { method: 'POST' }))).status, 401);
        assert.equal((await handler(at('action=start', { method: 'GET', headers: { authorization: 'Bearer ' + 'x'.repeat(40) } }))).status, 405);
        const response = await handler(at('action=start', { method: 'POST', headers: { authorization: 'Bearer ' + 'x'.repeat(40) } }));
        assert.equal(response.status, 200);
        const text = await response.text(), { url } = JSON.parse(text);
        const target = new URL(url);
        assert.equal(target.origin + target.pathname, 'https://garmin.example.test/authorize');
        assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
        assert.equal(target.searchParams.get('client_id'), 'synthetic-client-id');
        assert.equal(target.searchParams.get('redirect_uri'), ENV.GARMIN_REDIRECT_URI);
        const state = openState(target.searchParams.get('state'), STATE_KEY);
        assert.equal(state.u, USER);
        assert.equal(target.searchParams.get('code_challenge'), crypto.createHash('sha256').update(state.v).digest('base64url'), 'the challenge is the hash of the sealed verifier');
        assert.ok(!url.includes(state.v), 'the verifier is not readable in the address');
        assert.ok(!text.includes('synthetic-client-secret-value') && !logs.join('').includes('synthetic-client-secret-value'));
        assert.equal(openState(target.searchParams.get('state'), 'another-key-0123456789abcdef0123456789'), null, 'only the server key opens it');
    });
    await run(async () => {
        assert.equal((await handler(at('action=start', { method: 'POST', headers: { authorization: 'Bearer ' + 'x'.repeat(40) } }))).status, 401);
    }, { garmin: { user: Response.json({ error: 'no' }, { status: 401 }) } });
});

const location = response => response.headers.get('location');
test('callback: the code is exchanged with the sealed verifier, the account comes from the state and never from the address, nothing Garmin-secret is kept', async () => {
    await run(async (calls, logs) => {
        const state = sealState({ u: USER, v: 'verifier-0123456789' }, STATE_KEY);
        const response = await handler(at(`action=callback&code=synthetic-code-1&state=${state}&user=00000000-0000-4000-8000-0000000000ff`));
        assert.equal(response.status, 302);
        assert.equal(location(response), 'https://titan.example.test/profile?garmin=ok');
        const exchange = calls.find(c => c.path === '/token');
        const form = new URLSearchParams(exchange.body);
        assert.equal(form.get('code_verifier'), 'verifier-0123456789');
        assert.equal(form.get('grant_type'), 'authorization_code');
        const link = rpcCalls(calls).at(-1);
        assert.equal(link.path.split('/').pop(), 'titan_garmin_link_v1');
        assert.deepEqual(link.body, { p_user: USER, p_garmin_user: 'garmin-user-9' });
        assert.equal(rpcCalls(calls).length, 1, 'no token is written anywhere');
        assert.ok(!logs.join('').includes('synthetic-garmin-access-token'), 'nothing is logged');
        assert.ok(!JSON.stringify(rpcCalls(calls)).includes('synthetic-garmin-access-token') && !JSON.stringify(rpcCalls(calls)).includes('synthetic-refresh'));
    });
});

test('callback: a tampered, expired or foreign state, a missing code and Garmin failures all end on the profile with an error, linking nothing', async () => {
    const good = sealState({ u: USER, v: 'verifier-0123456789' }, STATE_KEY);
    const expired = sealState({ u: USER, v: 'verifier-0123456789' }, STATE_KEY, Date.now() - 3600000);
    const foreign = sealState({ u: USER, v: 'verifier-0123456789' }, 'another-key-0123456789abcdef0123456789');
    const flipped = good.slice(0, -2) + (good.endsWith('A') ? 'BB' : 'AA');
    await run(async calls => {
        for (const query of [`code=c0de1234&state=${flipped}`, `code=c0de1234&state=${expired}`, `code=c0de1234&state=${foreign}`, `state=${good}`, `code=c0de1234`, `code=%00%00%00%00&state=${good}`]) {
            const response = await handler(at(`action=callback&${query}`));
            assert.equal(location(response), 'https://titan.example.test/profile?garmin=error', query);
        }
        assert.equal(calls.length, 0, 'nothing was sent to Garmin or the database');
    });
    for (const garmin of [{ token: Response.json({}, { status: 400 }) }, { token: Response.json({ nope: 1 }) }, { who: Response.json({}, { status: 500 }) }, { who: Response.json({ userId: 'bad id!' }) }])
        await run(async calls => {
            assert.equal(location(await handler(at(`action=callback&code=c0de1234&state=${good}`))), 'https://titan.example.test/profile?garmin=error');
            assert.equal(rpcCalls(calls).length, 0);
        }, { garmin });
});

test('callback: the database refusals are told apart (already linked elsewhere, consent missing, anything else)', async () => {
    const state = sealState({ u: USER, v: 'verifier-0123456789' }, STATE_KEY);
    const outcome = async rpc => run(async () => location(await handler(at(`action=callback&code=c0de1234&state=${state}`))), { rpc: () => rpc });
    assert.equal(await outcome(Response.json({ code: '23505', message: 'GARMIN_ALREADY_LINKED' }, { status: 409 })), 'https://titan.example.test/profile?garmin=conflict');
    assert.equal(await outcome(Response.json({ code: '42501', message: 'CONSENT_REQUIRED' }, { status: 403 })), 'https://titan.example.test/profile?garmin=consent');
    assert.equal(await outcome(Response.json({ message: 'boom' }, { status: 500 })), 'https://titan.example.test/profile?garmin=error');
});

test('this repository holds no Garmin key: the only values are placeholders read from the environment', async () => {
    const { readFileSync } = await import('node:fs');
    for (const file of ['functions/garmin.mjs', 'tests/garmin.test.mjs', 'supabase/migrations/20261028110000_garmin_link.sql']) {
        const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
        assert.ok(!/GARMIN_[A-Z_]*\s*[:=]\s*['"][A-Za-z0-9]{24,}['"]/.test(text.replace(/synthetic[A-Za-z0-9-]*/g, '')), file);
    }
});
