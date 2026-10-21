// ADR-004 phase 3 bis: Google Play server notifications, with a simulated Google and database.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import handler from '../functions/play-notifications.mjs';

const USER = '00000000-0000-4000-8000-0000000000a1';
const TOKEN = 'synthetic-purchase-token-0123456789';
const PUSH = 'synthetic-push-secret-0123456789abcdef';
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const ENV = {
    PLAY_BILLING_ENABLED: 'true', PLAY_PRODUCT_IDS: 'titan_plus', PLAY_RTDN_TOKEN: PUSH,
    PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'billing@example.test', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }),
    SUPABASE_URL: 'https://database.example.test', SUPABASE_SECRET_KEY: 'sb_secret_fake'
};
const future = () => new Date(Date.now() + 20 * 86400000).toISOString();
const subscription = (state = 'SUBSCRIPTION_STATE_ACTIVE', expiry = future()) => ({ subscriptionState: state, latestOrderId: 'GPA.9', lineItems: [{ productId: 'titan_plus', expiryTime: expiry }] });
const push = (notification, token = PUSH) => new Request(`https://titan.example.test/functions/play-notifications?token=${token}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: { data: Buffer.from(JSON.stringify(notification)).toString('base64'), messageId: '1' }, subscription: 'projects/x/subscriptions/y' })
});
const event = (type = 2, extra = {}) => ({ version: '1.0', packageName: 'fr.titanapp.app', eventTimeMillis: String(Date.now()), subscriptionNotification: { version: '1.0', notificationType: type, purchaseToken: TOKEN, subscriptionId: 'titan_plus' }, ...extra });

async function run(callback, { env = {}, owner = USER, google = { status: 200, data: subscription() }, dbOk = true } = {}) {
    const previousNetlify = globalThis.Netlify, previousFetch = globalThis.fetch;
    const calls = [];
    globalThis.Netlify = { env: { get: name => ({ ...ENV, ...env })[name] || '' } };
    globalThis.fetch = async (url, init = {}) => {
        const u = new URL(url), body = init.body && String(init.body).startsWith('{') ? JSON.parse(init.body) : init.body;
        calls.push({ host: u.host, path: u.pathname, body });
        if (u.host === 'oauth2.googleapis.com') return Response.json({ access_token: 'google-access-token-synthetic' });
        if (u.pathname.includes('/purchases/subscriptionsv2/tokens/')) return Response.json(google.data, { status: google.status });
        if (u.pathname.endsWith('/titan_entitlement_owner_v1')) return dbOk ? Response.json(owner) : Response.json({}, { status: 500 });
        if (u.pathname.endsWith('/titan_apply_entitlement_v1')) return dbOk ? Response.json(true) : Response.json({}, { status: 500 });
        throw new Error(`unexpected request ${url}`);
    };
    try { return await callback(calls); } finally { globalThis.Netlify = previousNetlify; globalThis.fetch = previousFetch; }
}
const applied = calls => calls.filter(c => c.path.endsWith('/titan_apply_entitlement_v1'));

test('a wrong or missing push secret, a disabled service and bad payloads do nothing', async () => {
    await run(async calls => {
        assert.equal((await handler(push(event(), 'wrong-secret-wrong-secret-wrong'))).status, 401);
        assert.equal((await handler(push(event(), ''))).status, 401);
        assert.equal((await handler(new Request('https://titan.example.test/x?token=' + PUSH, { method: 'GET' }))).status, 405);
        assert.equal((await handler(new Request('https://titan.example.test/x?token=' + PUSH, { method: 'POST', body: 'not json' }))).status, 400);
        assert.deepEqual(calls, [], 'no database or Google call for a refused request');
    });
    await run(async calls => { assert.equal((await handler(push(event()))).status, 503); assert.deepEqual(calls, []); }, { env: { PLAY_BILLING_ENABLED: 'false' } });
    await run(async () => assert.equal((await handler(push(event()))).status, 503), { env: { PLAY_RTDN_TOKEN: 'short' } });
});

test('a renewal re-reads Google and records the answer for the linked account', async () => {
    await run(async calls => {
        assert.equal((await handler(push(event(2)))).status, 200);
        const [recorded] = applied(calls);
        assert.equal(recorded.body.p_user_id, USER);
        assert.equal(recorded.body.p_external_id, TOKEN);
        assert.equal(recorded.body.p_is_active, true);
        assert.match(recorded.body.p_event_name, /^rtdn:2$/);
    });
});

test('what the notification claims is never trusted: Google decides (an expiry notice over an active purchase stays active, and the reverse)', async () => {
    await run(async calls => { await handler(push(event(13))); assert.equal(applied(calls)[0].body.p_is_active, true, 'type "expired" but Google says active'); });
    await run(async calls => { await handler(push(event(4))); assert.equal(applied(calls)[0].body.p_is_active, false, 'type "purchased" but Google says expired'); },
        { google: { status: 200, data: subscription('SUBSCRIPTION_STATE_EXPIRED', new Date(Date.now() - 1000).toISOString()) } });
});

test('tests, other packages, other event kinds and unlinked tokens are acknowledged without writing', async () => {
    await run(async calls => { assert.equal((await handler(push({ version: '1.0', packageName: 'fr.titanapp.app', eventTimeMillis: '1', testNotification: { version: '1.0' } }))).status, 200); assert.deepEqual(calls, []); });
    await run(async calls => { assert.equal((await handler(push(event(2, { packageName: 'com.other.app' })))).status, 200); assert.deepEqual(calls, []); });
    await run(async calls => { assert.equal((await handler(push(event(2, { subscriptionNotification: { purchaseToken: 'x' } })))).status, 200); assert.deepEqual(calls, []); });
    await run(async calls => { assert.equal((await handler(push(event()))).status, 200); assert.equal(applied(calls).length, 0, 'not linked yet: the player\'s own call will record it'); assert.ok(!calls.some(c => c.host.includes('google')), 'Google is not asked for an unlinked token'); }, { owner: null });
});

test('an outage makes Pub/Sub retry (5xx) and never changes access', async () => {
    await run(async calls => { assert.equal((await handler(push(event()))).status, 503); assert.equal(applied(calls).length, 0); }, { google: { status: 500, data: {} } });
    await run(async () => assert.equal((await handler(push(event()))).status, 503), { dbOk: false });
    await run(async calls => { assert.equal((await handler(push(event()))).status, 200, 'a purchase Google no longer knows is acknowledged'); assert.equal(applied(calls).length, 0); }, { google: { status: 404, data: {} } });
});
