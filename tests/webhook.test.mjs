import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import handler, {
    extractBillingMeta,
    extractUserId,
    getPaddleStatus,
    hasPaddleAccess,
    verifyPaddleSignature
} from '../functions/webhook.mjs';

const WEBHOOK_TEST_SECRET = 'test_secret';
const WEBHOOK_TEST_USER_ID = '00000000-0000-4000-8000-000000000001';

function signedWebhookRequest(payload) {
    const body = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = crypto
        .createHmac('sha256', WEBHOOK_TEST_SECRET)
        .update(`${timestamp}:${body}`)
        .digest('hex');

    return new Request('https://example.test/webhook', {
        method: 'POST',
        headers: { 'paddle-signature': `ts=${timestamp};h1=${signature}` },
        body
    });
}

async function withWebhookRuntime(fetchImpl, callback, envOverrides = {}) {
    const hadNetlify = Object.prototype.hasOwnProperty.call(globalThis, 'Netlify');
    const previousNetlify = globalThis.Netlify;
    const previousFetch = globalThis.fetch;
    const env = {
        PADDLE_WEBHOOK_SECRET: WEBHOOK_TEST_SECRET,
        PADDLE_ELITE_PRODUCT_IDS: 'pro_elite',
        SUPABASE_SECRET_KEY: 'sb_secret_test',
        SUPABASE_URL: 'https://database.example.test',
        ...envOverrides
    };

    globalThis.Netlify = { env: { get: name => env[name] || '' } };
    globalThis.fetch = fetchImpl;

    try {
        return await callback();
    } finally {
        globalThis.fetch = previousFetch;
        if (hadNetlify) globalThis.Netlify = previousNetlify;
        else delete globalThis.Netlify;
    }
}

test('Paddle signature validation accepts the current valid signature', () => {
    const secret = 'test_secret';
    const body = '{"event_type":"subscription.updated"}';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}:${body}`)
        .digest('hex');

    assert.equal(verifyPaddleSignature(body, `ts=${timestamp};h1=${signature}`, secret), true);
    assert.equal(verifyPaddleSignature(`${body} `, `ts=${timestamp};h1=${signature}`, secret), false);
});

test('Paddle signature validation rejects stale or malformed signatures', () => {
    const timestamp = String(Math.floor(Date.now() / 1000) - 301);
    assert.equal(verifyPaddleSignature('{}', `ts=${timestamp};h1=deadbeef`, 'secret'), false);
    assert.equal(verifyPaddleSignature('{}', 'invalid', 'secret'), false);
});

test('billing metadata normalizes identifiers, timestamps and user custom data', () => {
    const body = {
        event_id: 'evt_1',
        event_type: 'subscription.updated',
        occurred_at: '2026-07-30T18:00:00Z',
        data: {
            id: 'sub_1',
            status: 'ACTIVE',
            custom_data: { user_id: '00000000-0000-4000-8000-000000000001' },
            items: [{ price: { id: 'pri_1', product_id: 'pro_1', name: 'TITAN Elite' } }]
        }
    };

    const meta = extractBillingMeta(body);
    assert.equal(meta.eventId, 'evt_1');
    assert.equal(meta.subscriptionId, 'sub_1');
    assert.equal(meta.priceId, 'pri_1');
    assert.equal(meta.productId, 'pro_1');
    assert.equal(meta.occurredAt, '2026-07-30T18:00:00.000Z');
    assert.equal(extractUserId(body), '00000000-0000-4000-8000-000000000001');
    assert.equal(getPaddleStatus(body), 'active');
});

test('access statuses only include the intended subscription states', () => {
    assert.equal(hasPaddleAccess('active'), true);
    assert.equal(hasPaddleAccess('trialing'), true);
    assert.equal(hasPaddleAccess('past_due'), true);
    assert.equal(hasPaddleAccess('paused'), false);
    assert.equal(hasPaddleAccess('canceled'), false);
});

test('webhook rejects unsupported methods and oversized bodies before configuration', async () => {
    const methodResponse = await handler(new Request('https://example.test/webhook'));
    assert.equal(methodResponse.status, 405);

    const oversizedResponse = await handler(new Request('https://example.test/webhook', {
        method: 'POST',
        body: 'x'.repeat((128 * 1024) + 1)
    }));
    assert.equal(oversizedResponse.status, 413);
});

test('non-Elite subscription cancellation is audited without revoking Elite access', async () => {
    const requests = [];
    const response = await withWebhookRuntime(async (url, init) => {
        requests.push({ path: new URL(url).pathname, payload: JSON.parse(init.body) });
        return new Response('', { status: 201 });
    }, () => handler(signedWebhookRequest({
        event_id: 'evt_non_elite_cancel',
        event_type: 'subscription.canceled',
        occurred_at: '2026-07-30T18:00:00Z',
        data: {
            id: 'sub_other',
            status: 'canceled',
            custom_data: { user_id: WEBHOOK_TEST_USER_ID },
            items: [{ price: { id: 'pri_other', product_id: 'pro_other', name: 'Other product' } }]
        }
    })));

    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'Non elite product ignored');
    assert.deepEqual(requests.map(request => request.path), ['/rest/v1/titan_billing_events']);
});

test('duplicate billing event still reconciles the ordered Elite entitlement', async () => {
    const requests = [];
    const response = await withWebhookRuntime(async (url, init) => {
        const request = { path: new URL(url).pathname, payload: JSON.parse(init.body) };
        requests.push(request);

        if (request.path === '/rest/v1/titan_billing_events') {
            return new Response(JSON.stringify({ code: '23505', message: 'duplicate key value' }), {
                status: 409,
                headers: { 'content-type': 'application/json' }
            });
        }

        return new Response('true', {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });
    }, () => handler(signedWebhookRequest({
        event_id: 'evt_retry',
        event_type: 'subscription.updated',
        occurred_at: '2026-07-30T18:00:00Z',
        data: {
            id: 'sub_elite',
            status: 'active',
            custom_data: { user_id: WEBHOOK_TEST_USER_ID },
            items: [{ price: { id: 'pri_elite', product_id: 'pro_elite', name: 'TITAN Elite' } }]
        }
    })));

    assert.equal(response.status, 200);
    assert.deepEqual(requests.map(request => request.path), [
        '/rest/v1/titan_billing_events',
        '/rest/v1/rpc/titan_apply_paddle_entitlement_v87'
    ]);
    assert.equal(requests[1].payload.p_is_elite, true);
    assert.equal(requests[1].payload.p_event_at, '2026-07-30T18:00:00.000Z');
});

test('Netlify bundles a portable webhook entry without runtime package imports', async () => {
    const source = await readFile(new URL('../functions/webhook.mjs', import.meta.url), 'utf8');
    const entry = await readFile(new URL('../netlify/functions/webhook.mts', import.meta.url), 'utf8');
    const config = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');

    assert.doesNotMatch(source, /from ['"]@supabase\/supabase-js['"]/);
    assert.match(entry, /export \{ default \} from '\.\.\/\.\.\/functions\/webhook\.mjs'/);
    assert.match(config, /directory = "netlify\/functions"/);
    assert.match(config, /node_bundler = "esbuild"/);
});
