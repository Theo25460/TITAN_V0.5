// ADR-004 phase 3: Google Play purchase verification with a simulated Google and a throwaway key. No real credential.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import handler, { googleAccessToken, interpretSubscription, READINESS_PROBE_TOKEN } from '../functions/play-billing.mjs';

const USER = '00000000-0000-4000-8000-0000000000a1';
const TOKEN = 'synthetic-purchase-token-0123456789';
const OLD_TOKEN = 'synthetic-previous-token-0123456789';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SERVICE_ACCOUNT = JSON.stringify({ client_email: 'billing@example.test', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
const ENV = {
    PLAY_BILLING_ENABLED: 'true', PLAY_PRODUCT_IDS: 'titan_plus', PLAY_SERVICE_ACCOUNT_JSON: SERVICE_ACCOUNT,
    SUPABASE_URL: 'https://database.example.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fake', SUPABASE_SECRET_KEY: 'sb_secret_fake',
    PLAY_RTDN_TOKEN: 'synthetic-push-secret-0123456789'
};
const CATALOG_PATH = '/androidpublisher/v3/applications/fr.titanapp.app/subscriptions/titan_plus';
const PROBE_PATH = `/androidpublisher/v3/applications/fr.titanapp.app/purchases/subscriptionsv2/tokens/${READINESS_PROBE_TOKEN}`;
const future = () => new Date(Date.now() + 20 * 86400000).toISOString();
const past = () => new Date(Date.now() - 86400000).toISOString();
const subscription = (over = {}, line = {}) => ({
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING', latestOrderId: 'GPA.1234',
    startTime: past(), externalAccountIdentifiers: { obfuscatedExternalAccountId: USER }, lineItems: [{ productId: 'titan_plus', expiryTime: future(), autoRenewingPlan: { autoRenewEnabled: true }, ...line }], ...over
});

function request(body = { purchase_token: TOKEN, product_id: 'titan_plus' }, headers = {}) {
    return new Request('https://titan.example.test/functions/play-billing', {
        method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer fake-user-token-used-only-in-tests', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body)
    });
}
function readiness(product = 'titan_plus', authorization = 'Bearer fake-user-token-used-only-in-tests') {
    return new Request(`https://titan.example.test/functions/play-billing?product_id=${product}`, { headers: { authorization } });
}
async function run(callback, { env = {}, google = { status: 200, data: subscription() }, rpcError = null, rpcResult = true, authStatus = 200, checkoutDbReady = true, oauthStatus = 200, catalogStatus = 200, probeStatus = 404, ackFails = false, ackTransportFails = false } = {}) {
    const previousNetlify = globalThis.Netlify, previousFetch = globalThis.fetch;
    const calls = [];
    globalThis.Netlify = { env: { get: name => ({ ...ENV, ...env })[name] || '' } };
    globalThis.fetch = async (url, init = {}) => {
        const u = new URL(url), body = init.body && String(init.body).startsWith('{') ? JSON.parse(init.body) : init.body;
        calls.push({ host: u.host, path: u.pathname, method: init.method || 'GET', body });
        if (u.host === 'oauth2.googleapis.com') return Response.json(oauthStatus === 200 ? { access_token: 'google-access-token-synthetic' } : {}, { status: oauthStatus });
        if (u.host === 'androidpublisher.googleapis.com' && /\/subscriptions\/[^/]+$/.test(u.pathname)) {
            return Response.json({ productId: u.pathname.split('/').pop(), basePlans: [{ state: 'ACTIVE', autoRenewingBasePlanType: { billingPeriodDuration: 'P1M' } }] }, { status: catalogStatus });
        }
        if (u.pathname === '/auth/v1/user') return Response.json(authStatus === 200 ? { id: USER, is_anonymous: false } : {}, { status: authStatus });
        if (u.pathname.endsWith('/titan_play_checkout_ready_v1')) return Response.json(checkoutDbReady, { status: checkoutDbReady ? 200 : 404 });
        if (u.pathname === PROBE_PATH) return Response.json(probeStatus === 200 ? subscription() : {}, { status: probeStatus });
        if (u.pathname.includes('/purchases/subscriptionsv2/tokens/')) return Response.json(google.data || {}, { status: google.status });
        if (u.pathname.endsWith(':acknowledge')) {
            if (ackTransportFails) throw new Error(`request failed for ${url}`);
            return ackFails ? Response.json({}, { status: 500 }) : Response.json({});
        }
        if (u.pathname.startsWith('/rest/v1/rpc/')) {
            const error = typeof rpcError === 'function' ? rpcError(body) : rpcError;
            return error ? Response.json({ message: error }, { status: 400 }) : Response.json(rpcResult);
        }
        throw new Error(`unexpected request ${url}`);
    };
    try { return await callback(calls); } finally { globalThis.Netlify = previousNetlify; globalThis.fetch = previousFetch; }
}
const rpcs = calls => calls.filter(c => c.path.endsWith('/titan_apply_play_entitlement_v1'));

test('authenticated checkout readiness checks the requested product and the right to read purchases, without touching a real purchase', async () => {
    await run(async calls => {
        const response = await handler(readiness());
        assert.equal(response.status, 204);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.deepEqual(calls.map(c => c.path), ['/auth/v1/user', '/rest/v1/rpc/titan_play_checkout_ready_v1', '/token', CATALOG_PATH, PROBE_PATH]);
        assert.deepEqual(calls[1].body, { p_user_id: USER });
        assert.equal(rpcs(calls).length, 0);
        assert.equal(calls.some(c => c.path.endsWith(':acknowledge')), false);
    });
    await run(async calls => {
        assert.equal((await handler(readiness(undefined, ''))).status, 401);
        assert.equal((await handler(readiness('other_product'))).status, 422);
        assert.equal((await handler(readiness('bad/product'))).status, 400);
        assert.deepEqual(calls, []);
    });
    await run(async () => assert.equal((await handler(readiness())).status, 401), { authStatus: 401 });
    for (const env of [{ PLAY_BILLING_ENABLED: '' }, { SUPABASE_SECRET_KEY: '' }, { SUPABASE_PUBLISHABLE_KEY: '' },
        { PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'billing@example.test', private_key: 'not-a-key' }) }]) {
        await run(async calls => {
            assert.equal((await handler(readiness())).status, 503);
            assert.deepEqual(calls, []);
        }, { env });
    }
});

test('checkout refuses a missing schema, invalid Google credentials or unreadable products before money can move', async () => {
    const databasePaths = ['/auth/v1/user', '/rest/v1/rpc/titan_play_checkout_ready_v1'];
    for (const [options, stages] of [[{ checkoutDbReady: false }, databasePaths], [{ oauthStatus: 401 }, [...databasePaths, '/token']],
        [{ catalogStatus: 403 }, [...databasePaths, '/token', CATALOG_PATH]]]) {
        await run(async calls => {
            assert.equal((await handler(readiness())).status, 503);
            assert.deepEqual(calls.map(c => c.path), stages);
        }, options);
    }
});

test('checkout stays closed when the service account can list products but cannot read purchases', async () => {
    // Google answers "unknown purchase" (400, 404 or 410) to an account that may read purchases: only then is Play opened.
    for (const probeStatus of [400, 404, 410]) {
        await run(async () => assert.equal((await handler(readiness())).status, 204), { probeStatus });
    }
    // A refusal, an outage or an impossible success for a token that does not exist keeps the payment sheet closed.
    for (const probeStatus of [401, 403, 500, 503, 200]) {
        await run(async calls => {
            assert.equal((await handler(readiness())).status, 503);
            assert.equal(calls.at(-1).path, PROBE_PATH);
            // An existing purchase can still be verified or restored: the probe only gates new sales.
            assert.equal(rpcs(calls).length, 0);
        }, { probeStatus });
    }
});

test('checkout stays closed until Google can notify the server, while existing purchases remain verifiable', async () => {
    for (const env of [{ PLAY_RTDN_TOKEN: '' }, { PLAY_RTDN_TOKEN: 'too-short' }, { PLAY_RTDN_TOKEN: '', PLAY_RTDN_AUDIENCE: 'https://titan.example.test/functions/play-notifications' }]) {
        await run(async calls => {
            assert.equal((await handler(readiness())).status, 503);
            assert.deepEqual(calls, []);
            assert.equal((await handler(request())).status, 200);
        }, { env });
    }
    await run(async () => assert.equal((await handler(readiness())).status, 204),
        { env: { PLAY_RTDN_TOKEN: '', PLAY_RTDN_AUDIENCE: 'https://titan.example.test/functions/play-notifications', PLAY_RTDN_SERVICE_ACCOUNT: 'push@example.test' } });
});

test('pausing checkout leaves verification and restoration available', async () => {
    await run(async calls => {
        assert.equal((await handler(readiness())).status, 503);
        assert.deepEqual(calls, []);
        const restored = await handler(request());
        assert.equal(restored.status, 200);
        assert.equal((await restored.json()).active, true);
    }, { env: { PLAY_CHECKOUT_ENABLED: 'false' } });
});

test('configuration diagnostics list missing variable names without exposing values', async t => {
    const log = t.mock.method(console, 'warn', () => {});
    await run(async calls => {
        const response = await handler(request());
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { error: 'unavailable' });
        assert.deepEqual(calls, []);
    }, { env: { PLAY_BILLING_ENABLED: '', SUPABASE_SECRET_KEY: '', SUPABASE_PUBLISHABLE_KEY: '' } });
    const diagnostics = JSON.stringify(log.mock.calls.map(call => call.arguments));
    assert.match(diagnostics, /PLAY_BILLING_ENABLED/);
    assert.match(diagnostics, /SUPABASE_SECRET_KEY/);
    assert.match(diagnostics, /SUPABASE_PUBLISHABLE_KEY/);
    assert.doesNotMatch(diagnostics, /billing@example\.test|PRIVATE KEY|database\.example\.test|synthetic-purchase-token|fake-user-token/);
});

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

test('only string purchase tokens and product IDs are accepted', async () => {
    await run(async calls => {
        assert.equal((await handler(request({ purchase_token: [TOKEN], product_id: 'titan_plus' }))).status, 400);
        assert.equal((await handler(request({ purchase_token: TOKEN, product_id: ['titan_plus'] }))).status, 400);
        assert.deepEqual(calls, []);
    });
});

test('an oversized request is stopped before the rest of the stream is read', async () => {
    let reads = 0;
    let cancelled = false;
    const body = new ReadableStream({
        pull(controller) {
            if (++reads === 1) controller.enqueue(new Uint8Array(4097));
            else controller.close();
        },
        cancel() { cancelled = true; }
    }, { highWaterMark: 0 });
    const oversized = new Request(request().url, { method: 'POST', headers: request().headers, body, duplex: 'half' });
    await run(async calls => {
        assert.equal((await handler(oversized)).status, 413);
        assert.equal(reads, 1);
        assert.equal(cancelled, true);
        assert.deepEqual(calls, []);
    });
});

test('a Google purchase for a different allowed product is refused before saving or acknowledging', async () => {
    await run(async calls => {
        const response = await handler(request({ purchase_token: TOKEN, product_id: 'titan01' }));
        assert.equal(response.status, 422);
        assert.deepEqual(await response.json(), { error: 'purchase_product_mismatch' });
        assert.deepEqual(rpcs(calls), []);
        assert.ok(!calls.some(c => c.path.endsWith(':acknowledge')));
    }, { env: { PLAY_PRODUCT_IDS: 'titan01,titan02,titan03' }, google: { status: 200, data: subscription({}, { productId: 'titan02' }) } });
});

test('an active purchase grants access from Google\'s answer, keeps the token server-side and acknowledges after recording', async () => {
    await run(async calls => {
        const response = await handler(request());
        assert.equal(response.status, 200);
        const answer = await response.json();
        assert.equal(answer.active, true);
        assert.ok(!JSON.stringify(answer).includes(TOKEN), 'the token is never echoed');
        const [recorded] = rpcs(calls);
        assert.equal(recorded.path, '/rest/v1/rpc/titan_apply_play_entitlement_v1');
        assert.equal(recorded.body.p_user_id, USER, 'the account comes from the verified session, not the request');
        assert.equal(recorded.body.p_is_test, false);
        assert.equal(recorded.body.p_needs_ack, true);
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

test('a cancelled subscription keeps access until its paid period ends, and grace uses the expiry extended by Google', () => {
    const options = { allowedProducts: ['titan_plus'] };
    assert.equal(interpretSubscription(subscription({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED' }), options).active, true);
    assert.equal(interpretSubscription(subscription({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED' }, { expiryTime: past() }), options).active, false);
    assert.equal(interpretSubscription(subscription({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED', canceledStateContext: { replacementCancellation: {} } }), options).active, false);
    assert.equal(interpretSubscription(subscription({ subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' }), options).active, true);
    for (const expiryTime of [undefined, 'invalid', past()]) {
        assert.equal(interpretSubscription(subscription({ subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' }, { expiryTime }), options).active, false);
    }
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

test('a replacing purchase sends both tokens in one database transaction before acknowledgement', async () => {
    await run(async calls => {
        assert.equal((await handler(request())).status, 200);
        const writes = rpcs(calls);
        assert.equal(writes.length, 1);
        assert.equal(writes[0].body.p_external_id, TOKEN);
        assert.equal(writes[0].body.p_linked_token, OLD_TOKEN);
        assert.equal(writes[0].body.p_user_id, USER);
    }, { google: { status: 200, data: subscription({ linkedPurchaseToken: OLD_TOKEN }) } });
});

test('the database refusal of a foreign predecessor prevents acknowledgement', async () => {
    await run(async calls => {
        const response = await handler(request());
        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), { error: 'purchase_already_used' });
        assert.equal(rpcs(calls)[0].body.p_linked_token, OLD_TOKEN);
        assert.ok(!calls.some(c => c.path.endsWith(':acknowledge')));
    }, { google: { status: 200, data: subscription({ linkedPurchaseToken: OLD_TOKEN }) }, rpcError: 'ENTITLEMENT_OWNED_BY_OTHER' });
});

test('an unfinished replacement never revokes the previous paid token', async () => {
    for (const subscriptionState of ['SUBSCRIPTION_STATE_PENDING', 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED']) {
        await run(async calls => {
            const response = await handler(request());
            assert.equal(response.status, 200);
            assert.equal((await response.json()).active, false);
            assert.deepEqual(rpcs(calls).map(c => [c.body.p_external_id, c.body.p_linked_token]), [[TOKEN, null]]);
            assert.ok(!calls.some(c => c.path.endsWith(':acknowledge')));
        }, { google: { status: 200, data: subscription({ subscriptionState, linkedPurchaseToken: OLD_TOKEN, startTime: undefined }) } });
    }
});

test('a malformed replacement cannot overwrite its own entitlement', async () => {
    await run(async calls => {
        assert.equal((await handler(request())).status, 422);
        assert.deepEqual(rpcs(calls), []);
        assert.ok(!calls.some(c => c.path.endsWith(':acknowledge')));
    }, { google: { status: 200, data: subscription({ linkedPurchaseToken: TOKEN }) } });
});

test('a failed linked-token retirement is retryable and is never acknowledged as complete', async () => {
    await run(async calls => {
        const response = await handler(request());
        assert.equal(response.status, 503);
        assert.deepEqual(rpcs(calls).map(c => [c.body.p_external_id, c.body.p_linked_token]), [[TOKEN, OLD_TOKEN]]);
        assert.ok(!calls.some(c => c.path.endsWith(':acknowledge')));
    }, { google: { status: 200, data: subscription({ linkedPurchaseToken: OLD_TOKEN }) }, rpcError: 'PLAY_REPLACEMENT_STALE' });
});

test('an ignored stale entitlement write cannot trigger acknowledgement or report active access', async () => {
    await run(async calls => {
        const response = await handler(request());
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { error: 'unavailable' });
        assert.deepEqual(rpcs(calls).map(c => c.body.p_external_id), [TOKEN]);
        assert.ok(!calls.some(c => c.path.endsWith(':acknowledge')));
    }, { google: { status: 200, data: subscription({ linkedPurchaseToken: OLD_TOKEN }) }, rpcResult: false });
});

test('the entitlement order uses the line item order ID returned by the current Google API', async () => {
    await run(async calls => {
        assert.equal((await handler(request())).status, 200);
        assert.equal(rpcs(calls)[0].body.p_order_id, 'GPA.4567');
    }, { google: { status: 200, data: subscription({ latestOrderId: undefined }, { latestSuccessfulOrderId: 'GPA.4567' }) } });
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

test('a purchase made for another account, or without an account id, is refused before anything is recorded', async () => {
    for (const [identifiers, error] of [[{ obfuscatedExternalAccountId: '00000000-0000-4000-8000-0000000000b2' }, 'purchase_bound_to_other_account'], [undefined, 'purchase_not_bound'], [{}, 'purchase_not_bound']]) {
        await run(async calls => {
            const response = await handler(request());
            assert.equal(response.status, 409);
            assert.deepEqual(await response.json(), { error });
            assert.equal(rpcs(calls).length, 0, 'no right is granted');
            assert.equal(calls.some(c => c.path.endsWith(':acknowledge')), false, 'nothing is acknowledged');
        }, { google: { status: 200, data: subscription({ externalAccountIdentifiers: identifiers }) } });
    }
});

test('a failed acknowledgement is reported to the app, access stays recorded', async () => {
    for (const options of [{ ackFails: true }, { ackTransportFails: true },
        { google: { status: 200, data: subscription({ acknowledgementState: undefined }) } }]) {
        await run(async calls => {
            const response = await handler(request());
            assert.equal(response.status, 200);
            const body = await response.json();
            assert.equal(body.active, true);
            assert.equal(body.acknowledged, false);
            assert.equal(rpcs(calls).length, 1);
        }, options);
    }
    await run(async () => {
        const body = await (await handler(request())).json();
        assert.equal(body.acknowledged, true);
        assert.equal(body.product_id, 'titan_plus');
    });
});

test('purchase provenance comes from Google and does not assert a commercial amount was received', async () => {
    const google = { status: 200, data: subscription({ testPurchase: {} }) };
    await run(async calls => {
        assert.equal((await handler(request())).status, 422);
        assert.equal(rpcs(calls).length, 0);
    }, { google });
    await run(async calls => {
        const response = await handler(request());
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.access_kind, 'test');
        assert.equal(body.active, true);
        assert.equal('paid' in body, false);
        assert.equal(rpcs(calls)[0].body.p_is_test, true);
    }, { env: { PLAY_ALLOW_TEST_PURCHASES: 'true', PLAY_TEST_SUPABASE_URL: ENV.SUPABASE_URL }, google });
    const production = 'https://oubmftfufwwzwpgvrcag.supabase.co';
    await run(async calls => {
        assert.equal((await handler(request())).status, 422);
        assert.equal(rpcs(calls).length, 0);
    }, { env: { PLAY_ALLOW_TEST_PURCHASES: 'true', PLAY_TEST_SUPABASE_URL: production, SUPABASE_URL: production }, google });
    await run(async calls => {
        const body = await (await handler(request())).json();
        assert.equal(body.access_kind, 'verified_purchase');
        assert.equal(rpcs(calls)[0].body.p_is_test, false);
        assert.equal('paid' in body, false);
        assert.equal('amount_received' in body, false);
    }, { google: { status: 200, data: subscription({ latestOrderId: undefined }) } });
    await run(async calls => {
        const response = await handler(request({ purchase_token: TOKEN, product_id: 'titan_plus', access_kind: 'verified_purchase' }));
        assert.equal(response.status, 400);
        assert.equal(rpcs(calls).length, 0);
    });
});
