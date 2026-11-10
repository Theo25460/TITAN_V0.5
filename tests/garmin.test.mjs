// V11-40: Garmin server side, with a simulated Garmin and a simulated database. No real key exists in this repository.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import handler, { openSecret, openState, sealSecret, sealState } from '../functions/garmin.mjs';

const USER = '00000000-0000-4000-8000-0000000000b1';
const STATE_KEY = 'synthetic-state-key-0123456789abcdef0123456789';
const PUSH = 'synthetic-push-secret-0123456789abcdef';
const TOKEN_KEY = 'synthetic-token-key-0123456789abcdef0123456789';
const ENV = {
    GARMIN_ENABLED: 'true', GARMIN_CLIENT_ID: 'synthetic-client-id', GARMIN_CLIENT_SECRET: 'synthetic-client-secret-value',
    GARMIN_AUTH_URL: 'https://connect.garmin.com/authorize', GARMIN_TOKEN_URL: 'https://connect.garmin.com/token',
    GARMIN_USER_ID_URL: 'https://connect.garmin.com/user/id', GARMIN_REDIRECT_URI: 'https://titan.example.test/.netlify/functions/garmin?action=callback',
    GARMIN_PUSH_TOKEN: PUSH, GARMIN_STATE_KEY: STATE_KEY, GARMIN_TOKEN_KEY: TOKEN_KEY,
    GARMIN_PERMISSIONS_URL: 'https://connect.garmin.com/user/permissions', GARMIN_REGISTRATION_URL: 'https://connect.garmin.com/user/registration',
    SUPABASE_URL: 'https://database.example.test', SUPABASE_SECRET_KEY: 'sb_secret_fake', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fake'
};
const at = (query, init = {}) => new Request(`https://titan.example.test/.netlify/functions/garmin?${query}`, init);
const push = (body, token = PUSH, raw = null) => at(`action=push&token=${token}`, { method: 'POST', body: raw ?? JSON.stringify(body) });
const activity = (id = '1001', user = 'garmin-user-1') => ({ userId: user, summaryId: id, activityType: 'RUNNING', startTimeInSeconds: 1790000000, durationInSeconds: 2400, distanceInMeters: 8000 });
const BEARER = 'Bearer ' + 'x'.repeat(40);
const OTHER_BEARER = 'Bearer ' + 'y'.repeat(40);
const OTHER_USER = '00000000-0000-4000-8000-0000000000ff';

async function startOAuth({ android = false, bearer = BEARER, dailies = false } = {}) {
    const response = await handler(at(`action=start${android ? '&client=android&flow=handoff' : ''}${dailies ? '&dailies=1' : ''}`, { method: 'POST', headers: { authorization: bearer } }));
    assert.equal(response.status, 200);
    return {
        state: new URL((await response.json()).url).searchParams.get('state'),
        cookie: (response.headers.get('set-cookie') || '').split(';')[0]
    };
}

const returnOAuth = (state, cookie = '', code = 'valid-code', extra = '') => handler(at(`action=callback&code=${code}&state=${state}${extra}`, { headers: { cookie } }));
const completeOAuth = (handoff, bearer) => handler(at('action=complete', { method: 'POST', headers: { authorization: bearer, 'content-type': 'application/json' }, body: JSON.stringify({ handoff }) }));
const completeWeb = (cookie, bearer = BEARER) => handler(at('action=complete', { method: 'POST', headers: { authorization: bearer, cookie } }));
const cookieFrom = response => response.headers.get('set-cookie').split(';')[0];
async function webResult(callback) {
    const params = new URL(callback.headers.get('location')).searchParams;
    return params.get('garmin') === 'complete' ? (await completeWeb(cookieFrom(callback))).json() : Object.fromEntries(params);
}
const LINK_RPC = 'titan_garmin_oauth_link_v1';
const successRpc = name => Response.json(name === LINK_RPC ? { linked: true } : true);

async function run(callback, { env = {}, rpc = successRpc, garmin = {} } = {}) {
    const previousNetlify = globalThis.Netlify, previousFetch = globalThis.fetch, logs = [];
    const methods = ['log', 'info', 'warn', 'error'], previousConsole = methods.map(m => console[m]);
    for (const m of methods) console[m] = (...args) => logs.push(args.map(String).join(' '));
    globalThis.Netlify = { env: { get: name => ({ ...ENV, ...env })[name] || '' } };
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
        const u = new URL(url), body = init.body;
        calls.push({ host: u.host, path: u.pathname, method: init.method, body: typeof body === 'string' && body.startsWith('{') ? JSON.parse(body) : body, headers: init.headers });
        if (u.host === 'database.example.test' && u.pathname === '/auth/v1/user') return garmin.user ?? Response.json({ id: init.headers?.Authorization === OTHER_BEARER ? OTHER_USER : USER });
        if (u.host === 'database.example.test') return rpc(u.pathname.split('/').pop(), calls.at(-1).body);
        if (u.host === 'connect.garmin.com' && u.pathname === '/token') return (garmin.tokenFor?.(calls.at(-1).body)) ?? garmin.token ?? Response.json({ access_token: 'synthetic-garmin-access-token', refresh_token: 'synthetic-refresh', expires_in: 86400 });
        if (u.host === 'connect.garmin.com' && u.pathname === '/user/permissions') return garmin.permissions ?? Response.json(['ACTIVITY_EXPORT']);
        if (u.host === 'connect.garmin.com' && u.pathname === '/user/registration') return garmin.registration ?? new Response(null, { status: 204 });
        if (u.host === 'connect.garmin.com' && u.pathname === '/user/id') return garmin.who ?? Response.json({ userId: 'garmin-user-9' });
        throw new Error(`unexpected request ${url}`);
    };
    try { return await callback(calls, logs); } finally { globalThis.Netlify = previousNetlify; globalThis.fetch = previousFetch; methods.forEach((m, i) => { console[m] = previousConsole[i]; }); }
}
const rpcCalls = calls => calls.filter(c => c.host === 'database.example.test' && c.path.startsWith('/rest/v1/rpc/'));
const linkCalls = calls => rpcCalls(calls).filter(c => c.path.endsWith(`/${LINK_RPC}`));

test('disabled or incomplete configuration answers 503 on every action and touches nothing', async () => {
    for (const env of [{ GARMIN_ENABLED: 'false' }, { GARMIN_CLIENT_SECRET: '' }, { GARMIN_PUSH_TOKEN: 'short' }, { GARMIN_STATE_KEY: 'short' }, { GARMIN_TOKEN_KEY: 'short' }, { GARMIN_PERMISSIONS_URL: 'http://insecure.example.test/p' }, { GARMIN_TOKEN_URL: 'http://connect.garmin.com/token' }, { GARMIN_AUTH_URL: 'https://garmin.com.example.test/authorize' }, { SUPABASE_SECRET_KEY: '' }]) {
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
        assert.deepEqual(sent.map(c => c.path.split('/').pop()), ['titan_garmin_deregister_v1', 'titan_garmin_ingest_v1', 'titan_garmin_ingest_v1']);
        assert.equal(sent[0].body.p_garmin_user, 'garmin-user-3');
        assert.equal(sent[1].body.p_garmin_user, 'garmin-user-1');
        assert.equal(sent[1].body.p_activity.summaryId, '1');
        assert.equal(sent[0].headers.apikey, 'sb_secret_fake');
    });
    await run(async () => {
        assert.equal((await handler(push({ activities: [activity()] }))).status, 503, 'Garmin must retry when the database failed');
    }, { rpc: () => Response.json({}, { status: 500 }) });
});

test('a Garmin push applies consent withdrawals before ingesting and skips their activities in the same batch', async () => {
    const body = {
        activities: [activity('1', 'removed-user'), activity('2', 'permission-user'), activity('3', 'other-user')],
        deregistrations: [{ userId: 'removed-user' }],
        userPermissionsChange: [{ userId: 'permission-user', permissions: ['HEALTH_EXPORT'] }]
    };
    await run(async calls => {
        assert.equal((await handler(push(body))).status, 200);
        assert.deepEqual(rpcCalls(calls).map(c => [c.path.split('/').pop(), c.body.p_garmin_user]), [
            ['titan_garmin_deregister_v1', 'removed-user'], ['titan_garmin_deregister_v1', 'permission-user'], ['titan_garmin_ingest_v1', 'other-user']
        ]);
    });
    await run(async calls => {
        assert.equal((await handler(push(body))).status, 503);
        assert.deepEqual(rpcCalls(calls).map(c => c.path.split('/').pop()), ['titan_garmin_deregister_v1']);
    }, { rpc: () => Response.json({}, { status: 500 }) });
});

test('oversized Garmin pushes stop reading the stream when the limit is crossed', async () => {
    await run(async calls => {
        let pulls = 0, canceled = false;
        const body = new ReadableStream({
            pull(controller) {
                if (++pulls <= 2) controller.enqueue(new Uint8Array(300_000));
                else controller.close();
            },
            cancel() { canceled = true; }
        }, { highWaterMark: 0 });
        const response = await handler(at(`action=push&token=${PUSH}`, { method: 'POST', body, duplex: 'half' }));
        assert.equal(response.status, 413);
        assert.equal(pulls, 2);
        assert.equal(canceled, true);
        assert.equal(calls.length, 0);
    });
});

test('Garmin pushes strip unneeded fields from activity summaries before sending them to Supabase', async () => {
    await run(async calls => {
        const response = await handler(push({ activities: [{ ...activity(), latitude: 42, averageHeartRateInBeatsPerMinute: 80, userAccessToken: 'synthetic-provider-secret' }] }));
        assert.equal(response.status, 200);
        assert.deepEqual(rpcCalls(calls)[0].body.p_activity, {
            summaryId: '1001', activityType: 'RUNNING', startTimeInSeconds: 1790000000,
            durationInSeconds: 2400, distanceInMeters: 8000
        });
    });
});

const DAILIES_TOKEN = 'synthetic-dailies-secret-0123456789abcdef';
const DAILIES_ENV = { GARMIN_DAILIES_ENABLED: 'true', GARMIN_DAILIES_PUSH_TOKEN: DAILIES_TOKEN };
const DAILIES_LINK = 'titan_garmin_oauth_link_dailies_v1';
const dailiesPush = (body, token = DAILIES_TOKEN) => at(`action=dailies&token=${token}`, { method: 'POST', body: JSON.stringify(body) });
const daily = {
    userId: 'garmin-user-9', calendarDate: '2026-10-30', steps: 12400,
    startTimeInSeconds: 1793314800, startTimeOffsetInSeconds: 3600, durationInSeconds: 86400,
    summaryId: 'example-summary', restingHeartRateInBeatsPerMinute: 64, userAccessToken: 'synthetic-unused-token'
};

test('Garmin Dailies are independently enabled and authenticated and minimize the provider payload', async () => {
    await run(async calls => {
        assert.equal((await handler(dailiesPush({ dailies: [daily] }))).status, 503);
        assert.equal(rpcCalls(calls).length, 0);
    });
    await run(async calls => {
        assert.equal((await handler(dailiesPush({ dailies: [daily] }, PUSH))).status, 401);
        assert.equal((await handler(push({ dailies: [daily] }))).status, 200);
        assert.equal(rpcCalls(calls).length, 0, 'the Activity push token cannot attest daily steps');
        const response = await handler(dailiesPush({ dailies: [
            daily,
            { ...daily, userId: 'wrong user!' },
            { ...daily, steps: '12400' },
            { ...daily, calendarDate: '2026-10-31' },
            { ...daily, durationInSeconds: 999999 },
            { ...daily, source: 'FITBIT' }
        ], thirdPartyDailies: [daily] }));
        assert.equal(response.status, 200);
        assert.deepEqual(rpcCalls(calls).map(call => [call.path.split('/').pop(), call.body]), [['titan_garmin_ingest_dailies_v1', { p_dailies: [{
            provider_user: daily.userId, day: daily.calendarDate, steps: daily.steps,
            started_at: '2026-10-29T23:00:00.000Z', duration_seconds: daily.durationInSeconds,
        }] }]]);
    }, { env: DAILIES_ENV });
    await run(async () => {
        assert.equal((await handler(dailiesPush({ dailies: [daily] }))).status, 503);
    }, { env: DAILIES_ENV, rpc: () => Response.json({}, { status: 500 }) });
});

test('Garmin Dailies bind optional permission to an explicit and independently verified OAuth choice', async () => {
    for (const [requested, allowed, expectedLink] of [[false, true, LINK_RPC], [true, false, LINK_RPC], [true, true, DAILIES_LINK]]) {
        await run(async calls => {
            const { state, cookie } = await startOAuth({ dailies: requested });
            const callback = await returnOAuth(state, cookie);
            assert.equal((await completeWeb(cookieFrom(callback), OTHER_BEARER)).status, 403);
            assert.equal(calls.filter(call => call.path === '/token').length, 0);
            assert.deepEqual(await webResult(callback), { garmin: 'ok' });
            const writes = rpcCalls(calls).filter(call => call.path.includes('oauth_link'));
            assert.deepEqual(writes.map(call => [call.path.split('/').pop(), call.body.p_user]), [[expectedLink, USER]]);
            const bound = calls.findIndex(call => call.path.endsWith('/titan_garmin_oauth_bind_dailies_v1'));
            const permissions = calls.findIndex(call => call.path === '/user/permissions');
            assert.equal(bound !== -1, requested);
            if (requested) assert.ok(bound < permissions, 'bind the attempt before the permission read so withdrawal can invalidate it');
        }, { env: DAILIES_ENV, rpc(name) { return name === DAILIES_LINK ? Response.json({ linked: true }) : successRpc(name); },
            garmin: { permissions: Response.json(['ACTIVITY_EXPORT', ...(allowed ? ['HEALTH_EXPORT'] : [])]) } });
    }
});

test('withdrawal of Garmin health export stops Dailies without revoking activity export', async () => {
    await run(async calls => {
        const result = await handler(push({ userPermissionsChange: [{ userId: daily.userId, permissions: ['ACTIVITY_EXPORT'] }], activities: [activity('1', daily.userId)] }));
        assert.equal(result.status, 200);
        assert.deepEqual(rpcCalls(calls).map(call => call.path.split('/').pop()), ['titan_garmin_revoke_dailies_v1', 'titan_garmin_ingest_v1']);
    }, { env: DAILIES_ENV });
    await run(async calls => {
        const result = await handler(push({ deregistrations: [{ userId: daily.userId }], activities: [activity('1', daily.userId)] }));
        assert.equal(result.status, 200);
        assert.deepEqual(rpcCalls(calls).map(call => call.path.split('/').pop()), ['titan_garmin_revoke_dailies_v1', 'titan_garmin_deregister_v1']);
    }, { env: { ...DAILIES_ENV, GARMIN_DAILIES_ENABLED: 'false' } });
});

test('browser Garmin returns cannot link an account without its initiating browser cookie', async () => {
    await run(async calls => {
        const { state } = await startOAuth();
        const { cookie: otherCookie } = await startOAuth({ bearer: OTHER_BEARER });
        for (const cookie of ['', otherCookie]) {
            const response = await returnOAuth(state, cookie);
            assert.equal(new URL(response.headers.get('location')).searchParams.get('garmin_reason'), 'state');
        }
        assert.equal(calls.filter(call => call.path === '/token').length, 0);
    });
});

test('a Garmin callback in the same browser cannot complete under a replacement TITAN account', async () => {
    await run(async calls => {
        const { state, cookie } = await startOAuth();
        const callback = await returnOAuth(state, cookie);
        assert.equal(location(callback), 'https://titan.example.test/profile?garmin=complete');
        assert.equal(calls.filter(call => call.path === '/token').length, 0);
        const handoffCookie = cookieFrom(callback);
        assert.equal((await completeWeb(handoffCookie, OTHER_BEARER)).status, 403);
        assert.equal(calls.filter(call => call.path === '/token').length, 0);
        assert.equal((await completeWeb(handoffCookie)).status, 200);
        assert.equal(linkCalls(calls)[0].body.p_user, USER);
    });
});

test('a browser OAuth attempt is consumed before exchange and cannot be replayed', async () => {
    let consumed = false;
    await run(async calls => {
        const { state, cookie } = await startOAuth();
        assert.deepEqual(await webResult(await returnOAuth(state, cookie)), { garmin: 'ok' });
        assert.deepEqual(await webResult(await returnOAuth(state, cookie, 'another-valid-code')), { garmin: 'error', garmin_reason: 'state' });
        assert.equal(calls.filter(call => call.path === '/token').length, 1);
    }, { rpc(name) {
        if (name !== 'titan_garmin_oauth_consume_v1') return successRpc(name);
        const first = !consumed;
        consumed = true;
        return Response.json(first);
    } });
});

test('native Garmin returns defer exchange until the initiating TITAN account proves ownership', async () => {
    await run(async calls => {
        const { state } = await startOAuth({ android: true });
        const callback = await returnOAuth(state);
        const url = new URL(callback.headers.get('location'));
        assert.equal(url.origin, 'null');
        assert.equal(url.hostname, 'garmin');
        assert.equal(url.searchParams.get('garmin'), 'complete');
        assert.doesNotMatch(url.href, /valid-code/);
        const handoff = new URLSearchParams(url.hash.slice(1)).get('handoff');
        assert.ok(handoff);
        assert.equal(calls.filter(call => call.path === '/token').length, 0);
        assert.equal((await completeOAuth(handoff, OTHER_BEARER)).status, 403);
        assert.equal(calls.filter(call => call.path === '/token').length, 0);
        const result = await completeOAuth(handoff, BEARER);
        assert.deepEqual(await result.json(), { garmin: 'ok' });
        assert.equal(calls.filter(call => call.path === '/token').length, 1);
        const link = rpcCalls(calls).find(call => call.path.endsWith('/titan_garmin_oauth_link_v1'));
        assert.equal(link.body.p_user, USER);
    });
});

test('Garmin bearer endpoints reject a cross-origin browser request before using the bearer', async () => {
    await run(async calls => {
        const response = await handler(at('action=start', { method: 'POST', headers: { authorization: BEARER, origin: 'https://other.example.test' } }));
        assert.equal(response.status, 403);
        assert.equal(calls.length, 0);
    });
});

test('start: a signed-in player gets the Garmin consent address with PKCE S256 and a sealed state; the secret never leaves the server', async () => {
    await run(async (calls, logs) => {
        assert.equal((await handler(at('action=start', { method: 'POST' }))).status, 401);
        assert.equal((await handler(at('action=start', { method: 'GET', headers: { authorization: 'Bearer ' + 'x'.repeat(40) } }))).status, 405);
        const response = await handler(at('action=start', { method: 'POST', headers: { authorization: 'Bearer ' + 'x'.repeat(40) } }));
        assert.equal(response.status, 200);
        assert.match(response.headers.get('set-cookie'), /^__Host-titan-garmin-nonce=.{43}; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=600$/);
        assert.equal(response.headers.get('access-control-allow-origin'), null);
        const text = await response.text(), { url } = JSON.parse(text);
        const target = new URL(url);
        assert.equal(target.origin + target.pathname, 'https://connect.garmin.com/authorize');
        assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
        assert.equal(target.searchParams.get('client_id'), 'synthetic-client-id');
        assert.equal(target.searchParams.get('redirect_uri'), ENV.GARMIN_REDIRECT_URI);
        const state = openState(target.searchParams.get('state'), STATE_KEY);
        assert.equal(state.u, USER);
        assert.equal(rpcCalls(calls)[0].body.p_nonce_hash, crypto.createHash('sha256').update(state.n).digest('hex'));
        assert.equal(target.searchParams.get('code_challenge'), crypto.createHash('sha256').update(state.v).digest('base64url'), 'the challenge is the hash of the sealed verifier');
        assert.ok(!url.includes(state.v), 'the verifier is not readable in the address');
        assert.ok(!text.includes('synthetic-client-secret-value') && !logs.join('').includes('synthetic-client-secret-value'));
        assert.equal(openState(target.searchParams.get('state'), 'another-key-0123456789abcdef0123456789'), null, 'only the server key opens it');
    });
    await run(async () => {
        assert.equal((await handler(at('action=start', { method: 'POST', headers: { authorization: 'Bearer ' + 'x'.repeat(40) } }))).status, 401);
    }, { garmin: { user: Response.json({ error: 'no' }, { status: 401 }) } });
});

const location = response => {
    const url = new URL(response.headers.get('location'));
    url.searchParams.delete('garmin_reason');
    return url.toString();
};
test('callback: the code is exchanged with the sealed verifier, the account comes from the state and never from the address, nothing Garmin-secret is kept', async () => {
    await run(async (calls, logs) => {
        const { state, cookie } = await startOAuth();
        const callback = await returnOAuth(state, cookie, 'synthetic-code-1', `&user=${OTHER_USER}`);
        assert.equal(callback.status, 302);
        assert.equal(location(callback), 'https://titan.example.test/profile?garmin=complete');
        assert.equal(callback.headers.get('referrer-policy'), 'no-referrer');
        assert.match(callback.headers.get('set-cookie'), /; Secure; HttpOnly; SameSite=Lax; Max-Age=120$/);
        const response = await completeWeb(cookieFrom(callback));
        assert.deepEqual(await response.json(), { garmin: 'ok' });
        assert.match(response.headers.get('set-cookie'), /Max-Age=0$/);
        const exchange = calls.find(c => c.path === '/token');
        const form = new URLSearchParams(exchange.body);
        assert.equal(form.get('code_verifier'), openState(state, STATE_KEY).v);
        assert.equal(form.get('grant_type'), 'authorization_code');
        const stored = linkCalls(calls)[0];
        assert.equal(stored.body.p_user, USER);
        assert.equal(stored.body.p_garmin_user, 'garmin-user-9');
        assert.equal(stored.body.p_nonce_hash, rpcCalls(calls)[0].body.p_nonce_hash);
        assert.equal(linkCalls(calls).length, 1, 'the link and sealed tokens are sent together');
        assert.ok(!logs.join('').includes('synthetic-garmin-access-token'), 'nothing is logged');
        assert.ok(!JSON.stringify(rpcCalls(calls)).includes('synthetic-garmin-access-token') && !JSON.stringify(rpcCalls(calls)).includes('synthetic-refresh'), 'no token in clear reaches the database');
        assert.equal(openSecret(stored.body.p_access_enc, TOKEN_KEY, USER), 'synthetic-garmin-access-token');
        assert.equal(openSecret(stored.body.p_refresh_enc, TOKEN_KEY, USER), 'synthetic-refresh');
        assert.equal(openSecret(stored.body.p_access_enc, TOKEN_KEY, '00000000-0000-4000-8000-0000000000ff'), null, 'sealed for this account only');
        assert.equal(openSecret(stored.body.p_access_enc, 'another-token-key-0123456789abcdef012345', USER), null, 'and for this key only');
        assert.ok(Date.parse(stored.body.p_expires_at) > Date.now());
    });
});

test('callback: a tampered, expired or foreign state, a missing code and Garmin failures all end on the profile with an error, linking nothing', async () => {
    await run(async calls => {
        const { state: good, cookie } = await startOAuth();
        const payload = openState(good, STATE_KEY);
        const expired = sealState(payload, STATE_KEY, Date.now() - 3600000);
        const foreign = sealState(payload, 'another-key-0123456789abcdef0123456789');
        // Change a character inside the authentication tag instead of in the base64 padding bits.
        const flipped = good.slice(0, 20) + (good[20] === 'A' ? 'B' : 'A') + good.slice(21);
        for (const query of [`code=c0de1234&state=${flipped}`, `code=c0de1234&state=${expired}`, `code=c0de1234&state=${foreign}`, `state=${good}`, `code=c0de1234`, `code=%00%00%00%00&state=${good}`]) {
            const response = await handler(at(`action=callback&${query}`, { headers: { cookie } }));
            assert.equal(location(response), 'https://titan.example.test/profile?garmin=error', query);
        }
        assert.equal(linkCalls(calls).length, 0);
        assert.equal(calls.filter(c => c.path === '/token').length, 0);
    });
    for (const garmin of [{ token: Response.json({}, { status: 400 }) }, { token: Response.json({ nope: 1 }) }, { who: Response.json({}, { status: 500 }) }, { who: Response.json({ userId: 'bad id!' }) }])
        await run(async calls => {
            const { state, cookie } = await startOAuth();
            assert.equal((await webResult(await returnOAuth(state, cookie))).garmin, 'error');
            assert.equal(linkCalls(calls).length, 0);
        }, { garmin });
});

test('callback: the database refusals are told apart (already linked elsewhere, consent missing, anything else)', async () => {
    const outcome = async failure => run(async () => {
        const { state, cookie } = await startOAuth();
        return (await webResult(await returnOAuth(state, cookie))).garmin;
    }, { rpc: name => name === LINK_RPC ? failure : successRpc(name) });
    assert.equal(await outcome(Response.json({ code: '23505', message: 'GARMIN_ALREADY_LINKED' }, { status: 409 })), 'conflict');
    assert.equal(await outcome(Response.json({ code: '42501', message: 'CONSENT_REQUIRED' }, { status: 403 })), 'consent');
    assert.equal(await outcome(Response.json({ message: 'boom' }, { status: 500 })), 'error');
});

test('this repository holds no Garmin key: the only values are placeholders read from the environment', async () => {
    const { readFileSync } = await import('node:fs');
    for (const file of ['functions/garmin.mjs', 'tests/garmin.test.mjs', 'supabase/migrations/20261028110000_garmin_link.sql']) {
        const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
        assert.ok(!/GARMIN_[A-Z_]*\s*[:=]\s*['"][A-Za-z0-9]{24,}['"]/.test(text.replace(/synthetic[A-Za-z0-9-]*/g, '')), file);
    }
});

test('callback: the player refusing on the Garmin screen, or lacking the activity permission, ends on the profile without linking', async () => {
    await run(async calls => {
        const { state, cookie } = await startOAuth();
        assert.equal(location(await handler(at(`action=callback&error=access_denied&state=${state}`, { headers: { cookie } }))), 'https://titan.example.test/profile?garmin=refused');
        assert.equal(location(await handler(at('action=callback&error=access_denied&state=forged'))), 'https://titan.example.test/profile?garmin=error', 'a refusal with a forged state is just an error');
        assert.equal(linkCalls(calls).length, 0);
        assert.equal(calls.filter(c => c.path === '/token').length, 0);
    });
    for (const [permissions, status, reason] of [
        [Response.json(['HEALTH_EXPORT']), 'permission', null],
        [Response.json(['INACTIVITY_EXPORT']), 'permission', null],
        [Response.json({ whatever: true }), 'error', 'permissions'],
        [Response.json({}, { status: 503 }), 'error', 'permissions'],
        [Response.json({ permissions: ['ACTIVITY_EXPORT', 'HEALTH_EXPORT'] }), 'ok', null]
    ]) {
        await run(async calls => {
            const { state, cookie } = await startOAuth();
            const result = await webResult(await returnOAuth(state, cookie));
            assert.equal(result.garmin, status);
            assert.equal(result.garmin_reason ?? null, reason);
            assert.equal(linkCalls(calls).length, status === 'ok' ? 1 : 0);
        }, { garmin: { permissions } });
    }
});

test('callback: a failed link transaction does not disconnect the existing Garmin account', async () => {
    await run(async calls => {
        const { state, cookie } = await startOAuth();
        assert.equal((await webResult(await returnOAuth(state, cookie))).garmin, 'error');
        assert.deepEqual(rpcCalls(calls).map(c => c.path.split('/').pop()), ['titan_garmin_oauth_start_v1', 'titan_garmin_oauth_consume_v1', LINK_RPC]);
    }, { rpc: name => name === LINK_RPC ? Response.json({}, { status: 500 }) : successRpc(name) });
});

test('the registered return address works as the callback whatever the rewrite did to the query', async () => {
    await run(async () => {
        const { state, cookie } = await startOAuth();
        const response = await handler(new Request(`https://titan.example.test/auth/garmin/callback?code=c0de1234&state=${state}&action=disconnect`, { headers: { cookie } }));
        assert.deepEqual(await webResult(response), { garmin: 'ok' });
        const foreign = await handler(new Request(`https://other.example.test/auth/garmin/callback?code=c0de1234&state=${state}`, { headers: { cookie } }));
        assert.equal(foreign.status, 403);
    });
    const toml = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
    const block = /\[\[redirects\]\]\nfrom = "\/auth\/garmin\/callback"\nto = "\/\.netlify\/functions\/garmin\?action=callback"\nstatus = 200\nforce = true/.exec(toml);
    assert.ok(block, 'netlify.toml rewrites the exact registered path to the function with status 200');
    assert.ok(block.index < toml.indexOf('from = "/*"\n'), 'and before the catch-all');
    assert.match(toml, /for = "\/auth\/garmin\/callback"\n\[headers\.values\]\nX-Robots-Tag = "noindex, nofollow"\nCache-Control = "no-store"/);
});

test('push: activities and the ones edited on Garmin are taken, other streams are acknowledged and not collected, permission changes end the link only when no activity access remains', async () => {
    await run(async calls => {
        const response = await handler(push({
            activities: [activity('1')], manuallyUpdatedActivities: [activity('2')],
            activityDetails: [{ userId: 'garmin-user-1', summaryId: '1', samples: [{ latitude: 1 }] }], activityFiles: [{ userId: 'garmin-user-1' }], moveIQActivities: [{ userId: 'garmin-user-1' }],
            dailies: [{ userId: 'garmin-user-1', steps: 9000 }], sleeps: [{ userId: 'garmin-user-1' }], stressDetails: [{ userId: 'garmin-user-1' }],
            userPermissionsChange: [{ userId: 'garmin-user-4', permissions: ['HEALTH_EXPORT'] }, { userId: 'garmin-user-5', permissions: ['ACTIVITY_EXPORT'] }, { userId: 'garmin-user-6' }]
        }));
        assert.equal(response.status, 200);
        assert.deepEqual(rpcCalls(calls).map(c => [c.path.split('/').pop(), c.body.p_garmin_user]), [
            ['titan_garmin_deregister_v1', 'garmin-user-4'], ['titan_garmin_ingest_v1', 'garmin-user-1'], ['titan_garmin_ingest_v1', 'garmin-user-1']
        ]);
        assert.ok(!JSON.stringify(calls).includes('"latitude"') && !JSON.stringify(calls).includes('"steps"'), 'no GPS point, no health value is collected');
    });
});

test('disconnect: TITAN is withdrawn at Garmin with the player\'s own token, then the link ends whatever Garmin answers', async () => {
    const bearer = { authorization: 'Bearer ' + 'x'.repeat(40) };
    const row = (expires, refresh = true) => ({ access_enc: sealSecret('stored-access-token', TOKEN_KEY, USER), refresh_enc: refresh ? sealSecret('stored-refresh-token', TOKEN_KEY, USER) : null, access_expires_at: expires });
    const tokenRpc = value => name => name === 'titan_garmin_tokens_get_v1' ? Response.json(value) : Response.json(true);
    await run(async (calls, logs) => {
        assert.equal((await handler(at('action=disconnect', { method: 'POST' }))).status, 401);
        assert.equal((await handler(at('action=disconnect', { method: 'GET', headers: bearer }))).status, 405);
        const response = await handler(at('action=disconnect', { method: 'POST', headers: bearer }));
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { linked: false, provider: 'withdrawn' });
        const removal = calls.find(c => c.path === '/user/registration');
        assert.equal(removal.method, 'DELETE');
        assert.equal(removal.headers.Authorization, 'Bearer stored-access-token');
        assert.equal(rpcCalls(calls).at(-1).path.split('/').pop(), 'titan_garmin_unlink_for_v1');
        assert.deepEqual(rpcCalls(calls).at(-1).body, { p_user: USER });
        assert.ok(!logs.join('').includes('stored-access-token'));
    }, { rpc: tokenRpc(row(new Date(Date.now() + 3600_000).toISOString())) });
    // An expired access token is renewed with the stored refresh token first.
    await run(async calls => {
        const response = await handler(at('action=disconnect', { method: 'POST', headers: bearer }));
        assert.equal((await response.json()).provider, 'withdrawn');
        const renewal = new URLSearchParams(calls.find(c => c.path === '/token').body);
        assert.equal(renewal.get('grant_type'), 'refresh_token');
        assert.equal(renewal.get('refresh_token'), 'stored-refresh-token');
        assert.equal(calls.find(c => c.path === '/user/registration').headers.Authorization, 'Bearer renewed-access-token');
    }, { rpc: tokenRpc(row(new Date(Date.now() - 3600_000).toISOString())), garmin: { tokenFor: body => String(body).includes('refresh_token') ? Response.json({ access_token: 'renewed-access-token' }) : null } });
    // Garmin refusing, unreachable, or no token to use: the link still ends.
    for (const [garmin, value, expected] of [[{ registration: new Response('no', { status: 403 }) }, row(new Date(Date.now() + 3600_000).toISOString()), 'refused'], [{}, null, 'unavailable'], [{ token: Response.json({}, { status: 400 }) }, row(new Date(Date.now() - 1000).toISOString()), 'unavailable']])
        await run(async calls => {
            const response = await handler(at('action=disconnect', { method: 'POST', headers: bearer }));
            assert.equal(response.status, 200);
            assert.equal((await response.json()).provider, expected);
            assert.equal(rpcCalls(calls).at(-1).path.split('/').pop(), 'titan_garmin_unlink_for_v1', 'the player always leaves');
        }, { rpc: tokenRpc(value), garmin });
    // Without a registration address configured, nothing is asked of Garmin and the link ends anyway.
    await run(async calls => {
        const response = await handler(at('action=disconnect', { method: 'POST', headers: bearer }));
        assert.equal((await response.json()).provider, 'skipped');
        assert.ok(!calls.some(c => c.host === 'connect.garmin.com'));
    }, { env: { GARMIN_REGISTRATION_URL: '' } });
    // The database failing to end the link is reported, never hidden.
    await run(async () => {
        assert.equal((await handler(at('action=disconnect', { method: 'POST', headers: bearer }))).status, 503);
    }, { rpc: name => name === 'titan_garmin_unlink_for_v1' ? Response.json({}, { status: 500 }) : Response.json(null) });
});

test('native return is fixed and bound to authenticated sealed state, never a callback redirect parameter', async () => {
    await run(async calls => {
        const unsupported = await handler(at('action=start&client=android', { method: 'POST', headers: { authorization: BEARER } }));
        assert.equal(unsupported.status, 426);
        assert.deepEqual(await unsupported.json(), { error: 'GARMIN_APP_UPDATE_REQUIRED' });
        assert.equal(rpcCalls(calls).length, 0);
        const start = await handler(at('action=start&client=android&flow=handoff&return_to=https://evil.test', {
            method: 'POST', headers: { authorization: 'Bearer ' + 'x'.repeat(40) }
        }));
        const state = new URL((await start.json()).url).searchParams.get('state');
        assert.equal(openState(state, STATE_KEY).r, 'android');
        const callback = await handler(at(`action=callback&code=valid-code&state=${state}&return_to=https://evil.test`));
        assert.match(callback.headers.get('location'), /^titan:\/\/garmin\?garmin=complete#handoff=[A-Za-z0-9_-]+$/);
        const bad = await handler(at('action=callback&code=valid-code&state=bad&client=android'));
        assert.equal(new URL(bad.headers.get('location')).protocol, 'https:');
    });
});

test('native completion exposes only safe stages when a provider or transaction fails', async () => {
    for (const stage of ['token', 'link', 'link-throw']) {
        await run(async (calls, logs) => {
            const { state } = await startOAuth({ android: true });
            const url = new URL((await returnOAuth(state)).headers.get('location'));
            const response = await completeOAuth(new URLSearchParams(url.hash.slice(1)).get('handoff'), BEARER);
            assert.deepEqual(await response.json(), { garmin: 'error', garmin_reason: stage === 'token' ? 'token' : 'link' });
            assert.ok(!logs.join('').includes('upstream-secret'));
            assert.ok(!rpcCalls(calls).some(c => c.path.endsWith('/titan_garmin_unlink_for_v1')));
        }, {
            garmin: stage === 'token' ? { token: Response.json({ message: 'upstream-secret' }, { status: 401 }) } : {},
            rpc: name => {
                if (name !== LINK_RPC) return successRpc(name);
                if (stage === 'link-throw') throw Error('upstream-secret');
                return Response.json({ message: 'upstream-secret' }, { status: 500 });
            }
        });
    }
});
