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
    GARMIN_AUTH_URL: 'https://garmin.example.test/authorize', GARMIN_TOKEN_URL: 'https://garmin.example.test/token',
    GARMIN_USER_ID_URL: 'https://garmin.example.test/user/id', GARMIN_REDIRECT_URI: 'https://titan.example.test/.netlify/functions/garmin?action=callback',
    GARMIN_PUSH_TOKEN: PUSH, GARMIN_STATE_KEY: STATE_KEY, GARMIN_TOKEN_KEY: TOKEN_KEY,
    GARMIN_PERMISSIONS_URL: 'https://garmin.example.test/user/permissions', GARMIN_REGISTRATION_URL: 'https://garmin.example.test/user/registration',
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
        calls.push({ host: u.host, path: u.pathname, method: init.method, body: typeof body === 'string' && body.startsWith('{') ? JSON.parse(body) : body, headers: init.headers });
        if (u.host === 'database.example.test' && u.pathname === '/auth/v1/user') return garmin.user ?? Response.json({ id: USER });
        if (u.host === 'database.example.test') return rpc(u.pathname.split('/').pop(), calls.at(-1).body);
        if (u.host === 'garmin.example.test' && u.pathname === '/token') return (garmin.tokenFor?.(calls.at(-1).body)) ?? garmin.token ?? Response.json({ access_token: 'synthetic-garmin-access-token', refresh_token: 'synthetic-refresh', expires_in: 86400 });
        if (u.host === 'garmin.example.test' && u.pathname === '/user/permissions') return garmin.permissions ?? Response.json(['ACTIVITY_EXPORT']);
        if (u.host === 'garmin.example.test' && u.pathname === '/user/registration') return garmin.registration ?? new Response(null, { status: 204 });
        if (u.host === 'garmin.example.test' && u.pathname === '/user/id') return garmin.who ?? Response.json({ userId: 'garmin-user-9' });
        throw new Error(`unexpected request ${url}`);
    };
    try { return await callback(calls, logs); } finally { globalThis.Netlify = previousNetlify; globalThis.fetch = previousFetch; methods.forEach((m, i) => { console[m] = previousConsole[i]; }); }
}
const rpcCalls = calls => calls.filter(c => c.host === 'database.example.test' && c.path.startsWith('/rest/v1/rpc/'));

test('disabled or incomplete configuration answers 503 on every action and touches nothing', async () => {
    for (const env of [{ GARMIN_ENABLED: 'false' }, { GARMIN_CLIENT_SECRET: '' }, { GARMIN_PUSH_TOKEN: 'short' }, { GARMIN_STATE_KEY: 'short' }, { GARMIN_TOKEN_KEY: 'short' }, { GARMIN_PERMISSIONS_URL: 'http://insecure.example.test/p' }, { GARMIN_TOKEN_URL: 'http://garmin.example.test/token' }, { SUPABASE_SECRET_KEY: '' }]) {
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
        const link = rpcCalls(calls)[0];
        assert.equal(link.path.split('/').pop(), 'titan_garmin_link_v1');
        assert.deepEqual(link.body, { p_user: USER, p_garmin_user: 'garmin-user-9' });
        assert.equal(rpcCalls(calls).length, 2, 'the link, then the sealed tokens');
        assert.ok(!logs.join('').includes('synthetic-garmin-access-token'), 'nothing is logged');
        const stored = rpcCalls(calls)[1];
        assert.equal(stored.path.split('/').pop(), 'titan_garmin_tokens_set_v1');
        assert.ok(!JSON.stringify(rpcCalls(calls)).includes('synthetic-garmin-access-token') && !JSON.stringify(rpcCalls(calls)).includes('synthetic-refresh'), 'no token in clear reaches the database');
        assert.equal(openSecret(stored.body.p_access_enc, TOKEN_KEY, USER), 'synthetic-garmin-access-token');
        assert.equal(openSecret(stored.body.p_refresh_enc, TOKEN_KEY, USER), 'synthetic-refresh');
        assert.equal(openSecret(stored.body.p_access_enc, TOKEN_KEY, '00000000-0000-4000-8000-0000000000ff'), null, 'sealed for this account only');
        assert.equal(openSecret(stored.body.p_access_enc, 'another-token-key-0123456789abcdef012345', USER), null, 'and for this key only');
        assert.ok(Date.parse(stored.body.p_expires_at) > Date.now());
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

test('callback: the player refusing on the Garmin screen, or lacking the activity permission, ends on the profile without linking', async () => {
    const state = sealState({ u: USER, v: 'verifier-0123456789' }, STATE_KEY);
    await run(async calls => {
        assert.equal(location(await handler(at(`action=callback&error=access_denied&state=${state}`))), 'https://titan.example.test/profile?garmin=refused');
        assert.equal(location(await handler(at('action=callback&error=access_denied&state=forged'))), 'https://titan.example.test/profile?garmin=error', 'a refusal with a forged state is just an error');
        assert.equal(calls.length, 0, 'nothing exchanged, nothing written');
    });
    await run(async calls => {
        assert.equal(location(await handler(at(`action=callback&code=c0de1234&state=${state}`))), 'https://titan.example.test/profile?garmin=permission');
        assert.equal(rpcCalls(calls).length, 0, 'not linked without the activity permission');
    }, { garmin: { permissions: Response.json(['HEALTH_EXPORT']) } });
    await run(async calls => {
        assert.equal(location(await handler(at(`action=callback&code=c0de1234&state=${state}`))), 'https://titan.example.test/profile?garmin=ok', 'an unknown permissions format does not block');
    }, { garmin: { permissions: Response.json({ whatever: true }) } });
    await run(async calls => {
        assert.equal(location(await handler(at(`action=callback&code=c0de1234&state=${state}`))), 'https://titan.example.test/profile?garmin=ok');
    }, { garmin: { permissions: Response.json({ permissions: ['ACTIVITY_EXPORT', 'HEALTH_EXPORT'] }) } });
});

test('callback: an error while storing the tokens undoes the link', async () => {
    const state = sealState({ u: USER, v: 'verifier-0123456789' }, STATE_KEY);
    await run(async calls => {
        assert.equal(location(await handler(at(`action=callback&code=c0de1234&state=${state}`))), 'https://titan.example.test/profile?garmin=error');
        assert.deepEqual(rpcCalls(calls).map(c => c.path.split('/').pop()), ['titan_garmin_link_v1', 'titan_garmin_tokens_set_v1', 'titan_garmin_unlink_for_v1']);
    }, { rpc: name => name === 'titan_garmin_tokens_set_v1' ? Response.json({}, { status: 500 }) : Response.json(true) });
});

test('the registered return address works as the callback whatever the rewrite did to the query', async () => {
    const state = sealState({ u: USER, v: 'verifier-0123456789' }, STATE_KEY);
    await run(async () => {
        const response = await handler(new Request(`https://titan-app.fr/auth/garmin/callback?code=c0de1234&state=${state}`));
        assert.equal(location(response), 'https://titan.example.test/profile?garmin=ok');
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
            ['titan_garmin_ingest_v1', 'garmin-user-1'], ['titan_garmin_ingest_v1', 'garmin-user-1'], ['titan_garmin_deregister_v1', 'garmin-user-4']
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
        assert.ok(!calls.some(c => c.host === 'garmin.example.test'));
    }, { env: { GARMIN_REGISTRATION_URL: '' } });
    // The database failing to end the link is reported, never hidden.
    await run(async () => {
        assert.equal((await handler(at('action=disconnect', { method: 'POST', headers: bearer }))).status, 503);
    }, { rpc: name => name === 'titan_garmin_unlink_for_v1' ? Response.json({}, { status: 500 }) : Response.json(null) });
});
