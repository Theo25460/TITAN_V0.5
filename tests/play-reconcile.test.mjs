// ADR-004 phase 3 ter: the hourly Google Play sweep, with a simulated Google and database.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import handler from '../functions/play-reconcile.mjs';

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const ENV = {
    PLAY_BILLING_ENABLED: 'true', PLAY_PRODUCT_IDS: 'titan_plus,coach', SUPABASE_URL: 'https://database.example.test', SUPABASE_SECRET_KEY: 'sb_secret_fake',
    PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'billing@example.test', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) })
};
const future = () => new Date(Date.now() + 20 * 86400000).toISOString();
const sub = (state, expiry, product = 'titan_plus') => ({ subscriptionState: state, latestOrderId: 'GPA.1', lineItems: [{ productId: product, expiryTime: expiry }] });
const due = [{ user_id: '00000000-0000-4000-8000-0000000000a1', external_id: 'tok-active-0123456789ab' }, { user_id: '00000000-0000-4000-8000-0000000000a2', external_id: 'tok-ended-0123456789abc' },
    { user_id: '00000000-0000-4000-8000-0000000000a3', external_id: 'tok-gone-0123456789abcd' }, { user_id: '00000000-0000-4000-8000-0000000000a4', external_id: 'tok-down-0123456789abcd' },
    { user_id: '00000000-0000-4000-8000-0000000000a5', external_id: 'tok-other-0123456789abc' }];
const answers = {
    'tok-active-0123456789ab': { status: 200, data: sub('SUBSCRIPTION_STATE_ACTIVE', future()) },
    'tok-ended-0123456789abc': { status: 200, data: sub('SUBSCRIPTION_STATE_EXPIRED', new Date(Date.now() - 1000).toISOString()) },
    'tok-gone-0123456789abcd': { status: 410, data: {} },
    'tok-down-0123456789abcd': { status: 503, data: {} },
    'tok-other-0123456789abc': { status: 200, data: sub('SUBSCRIPTION_STATE_ACTIVE', future(), 'unlisted_product') },
};
async function run(callback, { env = {}, rows = due } = {}) {
    const pn = globalThis.Netlify, pf = globalThis.fetch;
    const calls = [];
    globalThis.Netlify = { env: { get: name => ({ ...ENV, ...env })[name] || '' } };
    globalThis.fetch = async (url, init = {}) => {
        const u = new URL(url), body = init.body && String(init.body).startsWith('{') ? JSON.parse(init.body) : init.body;
        calls.push({ host: u.host, path: u.pathname, body });
        if (u.host === 'oauth2.googleapis.com') return Response.json({ access_token: 'google-access-token-synthetic' });
        if (u.pathname.endsWith('/titan_play_entitlements_due_v1')) return Response.json(rows);
        if (u.pathname.includes('/purchases/subscriptionsv2/tokens/')) { const a = answers[decodeURIComponent(u.pathname.split('/').pop())]; return Response.json(a.data, { status: a.status }); }
        if (u.pathname.endsWith('/titan_apply_play_entitlement_v1')) return Response.json(true);
        throw new Error(`unexpected request ${url}`);
    };
    try { return await callback(calls); } finally { globalThis.Netlify = pn; globalThis.fetch = pf; }
}
const applied = calls => calls.filter(c => c.path.endsWith('/titan_apply_play_entitlement_v1')).map(c => c.body);

test('disabled or misconfigured: nothing is read or written', async () => {
    // Off on purpose: 200 "disabled", no call at all (no hourly 503 in the logs while billing is closed).
    await run(async calls => { const r = await handler(new Request('https://x.test')); assert.equal(r.status, 200); assert.equal((await r.json()).disabled, true); assert.deepEqual(calls, []); }, { env: { PLAY_BILLING_ENABLED: 'false' } });
    await run(async calls => { const r = await handler(new Request('https://x.test')); assert.equal(r.status, 200); assert.equal((await r.json()).disabled, true); assert.deepEqual(calls, []); }, { env: { PLAY_BILLING_ENABLED: '' } });
    // Switched on but misconfigured: still a real 503.
    await run(async calls => { assert.equal((await handler(new Request('https://x.test'))).status, 503); assert.deepEqual(calls, []); }, { env: { PLAY_BILLING_ENABLED: 'true', PLAY_SERVICE_ACCOUNT_JSON: '' } });
    await run(async calls => { assert.equal((await handler(new Request('https://x.test'))).status, 503); assert.deepEqual(calls, []); }, { env: { PLAY_PRODUCT_IDS: '' } });
});

test('every due token is re-read from Google and only Google\'s answer is recorded', async () => {
    await run(async calls => {
        const response = await handler(new Request('https://x.test'));
        assert.deepEqual(await response.json(), { checked: 5, updated: 4, failed: 1 });
        const byToken = Object.fromEntries(applied(calls).map(b => [b.p_external_id, b]));
        assert.equal(byToken['tok-active-0123456789ab'].p_is_active, true);
        assert.equal(byToken['tok-ended-0123456789abc'].p_is_active, false);
        assert.equal(byToken['tok-gone-0123456789abcd'].p_is_active, false);
        assert.equal(byToken['tok-gone-0123456789abcd'].p_status, 'gone');
        assert.equal(byToken['tok-down-0123456789abcd'], undefined, 'Google unavailable: access is left as it was');
        assert.equal(byToken['tok-other-0123456789abc'].p_is_active, false, 'a product the team does not allow never extends access');
        assert.ok(applied(calls).every(b => b.p_event_name === 'reconcile'));
        assert.equal(applied(calls).find(b => b.p_external_id === 'tok-active-0123456789ab').p_user_id, due[0].user_id);
    });
});

test('nothing due means no Google call; the time budget stops a long run cleanly', async () => {
    await run(async calls => { assert.deepEqual(await (await handler(new Request('https://x.test'))).json(), { checked: 0, updated: 0, failed: 0 }); assert.equal(calls.some(c => c.host.includes('googleapis')), false); }, { rows: [] });
    let t = 0;
    await run(async () => {
        const body = await (await handler(new Request('https://x.test'), { budgetMs: 1000, now: () => (t += 600) })).json();
        assert.ok(body.checked < 5);
    });
});
