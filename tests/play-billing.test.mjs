// ADR-004 phase 3: Google Play purchase verification with a simulated Google and a throwaway key. No real credential.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import handler, { googleAccessToken, interpretSubscription } from '../functions/play-billing.mjs';

const USER = '00000000-0000-4000-8000-0000000000a1';
const TOKEN = 'synthetic-purchase-token-0123456789';
const OLD_TOKEN = 'synthetic-previous-token-0123456789';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SERVICE_ACCOUNT = JSON.stringify({ client_email: 'billing@example.test', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
const ENV = {
    PLAY_BILLING_ENABLED: 'true', PLAY_PRODUCT_IDS: 'titan_plus', PLAY_SERVICE_ACCOUNT_JSON: SERVICE_ACCOUNT,
    SUPABASE_URL: 'https://database.example.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fake', SUPABASE_SECRET_KEY: 'sb_secret_fake'
};
const future = () => new Date(Date.now() + 20 * 86400000).toISOString();
const past = () => new Date(Date.now() - 86400000).toISOString();
const subscription = (over = {}, line = {}) => ({
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING', latestOrderId: 'GPA.1234',
    startTime: past(), lineItems: [{ productId: 'titan_plus', expiryTime: future(), autoRenewingPlan: { autoRenewEnabled: true }, ...line }], ...over
});

function request(body = { purchase_token: TOKEN, product_id: 'titan_plus' }, headers = {}) {
    return new Request('https://titan.example.test/functions/play-billing', {
        method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer fake-user-token-used-only-in-tests', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body)
    });
}
async function run(callback, { env = {}, google = { status: 200, data: subscription() }, rpcError = null, authStatus = 200 } = {}) {
    const previousNetlify = globalThis.Netlify, previousFetch = globalThis.fetch;
    const calls = [];
    globalThis.Netlify = { env: { get: name => ({ ...ENV, ...env })[name] || '' } };
    globalThis.fetch = async (url, init = {}) => {
        const u = new URL(url), body = init.body && String(init.body).startsWith('{') ? JSON.parse(init.body) : init.body;
        calls.push({ host: u.host, path: u.pathname, method: init.method || 'GET', body });
        if (u.host === 'oauth2.googleapis.com') return Response.json({ access_token: 'google-access-token-synthetic' });
        if (u.pathname === '/auth/v1/user') return Response.json(authStatus === 200 ? { id: USER, is_anonymous: false } : {}, { status: authStatus });
        if (u.pathname.includes('/purchases/subscriptionsv2/tokens/')) return Response.json(google.data || {}, { status: google.status });
        if (u.pathname.endsWith(':acknowledge')) return Response.json({});
        if (u.pathname.startsWith('/rest/v1/rpc/')) return rpcError ? Response.json({ message: rpcError }, { status: 400 }) : Response.json(true);
        throw new Error(`unexpected request ${url}`);
    };
    try { return await callback(calls); } finally { globalThis.Netlify = previousNetlify; globalThis.fetch = previousFetch; }
}
const rpcs = calls => calls.filter(c => c.path.startsWith('/rest/v1/rpc/'));

test('disabled, unauthenticated and malformed requests do nothing', async () => {
    await run(async calls => {
        assert.equal((await handler(request())).status, 503, 'off by default');
        assert.deepEqual(calls, []);
    }, { env: { PLAY_BILLING_ENABLED: 'false' } });
    await run(async calls => {
        assert.equal((await handler(request(undefined, { Authorization: '' }))).status, 401);
        assert.equal((await handler(request({ purchase_token: 'short', product_id: 'titan_plus' }))).status, 400);
        assert.equal((await handler(request({ purchase_token: TOKEN, product_id: 'titan_plus', user_id: USER }))).status, 400, 'no extra field such as a user id');
        assert.equal((await handler(request('not json'))).status, 400);
        assert.equal((await handler(request(undefined, { 'content-type': 'text/plain' }))).status, 415);
        assert.equal((await handler(request(undefined, { origin: 'https://evil.example' }))).status, 403);
        assert.equal(calls.filter(c => c.host.includes('google')).length, 0, 'Google is never called for a bad request');
    });
    await run(async () => assert.equal((await handler(request())).status, 401), { authStatus: 401 });
    await run(async () => assert.equal((await handler(request())).status, 503), { env: { PLAY_SERVICE_ACCOUNT_JSON: '{}' } });
});

test('an active purchase grants access from Google\'s answer, keeps the token server-side and acknowledges after recording', async () => {
    await run(async calls => {
        const response = await handler(request());
        assert.equal(response.status, 200);
        const answer = await response.json();
        assert.equal(answer.active, true);
        assert.ok(!JSON.stringify(answer).includes(TOKEN), 'the token is never echoed');
        const [recorded] = rpcs(calls);
        assert.equal(recorded.path, '/rest/v1/rpc/titan_apply_entitlement_v1');
        assert.equal(recorded.body.p_user_id, USER, 'the account comes from the verified session, not the request');
        assert.equal(recorded.body.p_source, 'google_play');
        assert.equal(recorded.body.p_external_id, TOKEN);
        assert.equal(recorded.body.p_is_active, true);
        const order = calls.map(c => c.path.endsWith(':acknowledge') ? 'ack' : c.path.startsWith('/rest/v1/rpc/') ? 'record' : '');
        assert.ok(order.indexOf('record') > -1 && order.indexOf('ack') > order.indexOf('record'), 'acknowledged only after access is recorded');
    });
});

test('expired, held, paused, unknown and mismatched purchases give no access', async () => {
    for (const data of [subscription({ subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' }, { expiryTime: past() }), subscription({ subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD' }),
        subscription({ subscriptionState: 'SUBSCRIPTION_STATE_PAUSED' }), subscription({ subscriptionState: 'SOMETHING_NEW' }), subscription({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' }, { expiryTime: past() })]) {
        await run(async calls => {
            const response = await handler(request());
            assert.equal(response.status, 200);
            assert.equal((await response.json()).active, false, data.subscriptionState);
            assert.equal(rpcs(calls)[0].body.p_is_active, false);
            assert.ok(!calls.some(c => c.path.endsWith(':acknowledge')), 'nothing is acknowledged without access');
        }, { google: { status: 200, data } });
    }
    await run(async calls => { assert.equal((await handler(request())).status, 422); assert.equal(rpcs(calls).length, 0); }, { google: { status: 200, data: subscription({}, { productId: 'other_product' }) } });
});

test('a cancelled subscription keeps access until its paid period ends, and grace keeps access', () => {
    const options = { allowedProducts: ['titan_plus'] };
    assert.equal(interpretSubscription(subscription({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED' }), options).active, true);
    assert.equal(interpretSubscription(subscription({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED' }, { expiryTime: past() }), options).active, false);
    assert.equal(interpretSubscription(subscription({ subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' }, { expiryTime: past() }), options).active, true);
    assert.deepEqual(interpretSubscription({}, options), { error: 'SUBSCRIPTION_INVALID' });
    assert.deepEqual(interpretSubscription(subscription({ testPurchase: {} }), options), { error: 'TEST_PURCHASE_REFUSED' });
    assert.equal(interpretSubscription(subscription({ testPurchase: {} }), { ...options, allowTestPurchases: true }).active, true);
});

test('a token already used by another account, an unknown token and a Google outage are all handled', async () => {
    await run(async () => assert.equal((await handler(request())).status, 409), { rpcError: 'ENTITLEMENT_OWNED_BY_OTHER' });
    await run(async calls => { assert.equal((await handler(request())).status, 422); assert.equal(rpcs(calls).length, 0); }, { google: { status: 404, data: {} } });
    await run(async calls => { assert.equal((await handler(request())).status, 503); assert.equal(rpcs(calls).length, 0, 'an outage never grants or revokes'); }, { google: { status: 500, data: {} } });
    await run(async () => assert.equal((await handler(request())).status, 503), { rpcError: 'something unexpected' });
});

test('a replacing purchase retires the previous token of the same account', async () => {
    await run(async calls => {
        assert.equal((await handler(request())).status, 200);
        const [first, second] = rpcs(calls);
        assert.equal(first.body.p_external_id, TOKEN);
        assert.equal(second.body.p_external_id, OLD_TOKEN);
        assert.equal(second.body.p_is_active, false);
        assert.equal(second.body.p_user_id, USER);
    }, { google: { status: 200, data: subscription({ linkedPurchaseToken: OLD_TOKEN }) } });
});

test('the Google access token is a correctly signed service-account assertion', async () => {
    await run(async calls => {
        const token = await googleAccessToken(JSON.parse(SERVICE_ACCOUNT));
        assert.equal(token, 'google-access-token-synthetic');
        const assertion = new URLSearchParams(calls[0].body).get('assertion');
        const [header, claims, signature] = assertion.split('.');
        assert.equal(JSON.parse(Buffer.from(header, 'base64url')).alg, 'RS256');
        const payload = JSON.parse(Buffer.from(claims, 'base64url'));
        assert.equal(payload.iss, 'billing@example.test');
        assert.equal(payload.scope, 'https://www.googleapis.com/auth/androidpublisher');
        assert.ok(crypto.createVerify('RSA-SHA256').update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature, 'base64url')), 'signature verifies with the public key');
    });
});
