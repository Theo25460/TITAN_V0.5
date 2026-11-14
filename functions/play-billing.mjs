// ADR-004 phase 3: verify a Google Play subscription purchase on the server, then record it as an access source.
// The client sends the product ID and purchase token. Access comes from Google's Android Publisher API v3.
// PLAY_BILLING_ENABLED controls verification and the authenticated checkout readiness check.
// The tests simulate Google. A purchase with a license-tester account is the final proof.
import crypto from 'node:crypto';
import { readBoundedBytes } from './request-body.mjs';

export const PLAY_ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9._~-]{16,2048}$/;
const PRODUCT = /^[a-z0-9._-]{1,100}$/i;
const MAX_BODY = 4096;
const PUBLISHER = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
// Never a real purchase: only used to check that the service account may read purchases at all.
export const READINESS_PROBE_TOKEN = 'titan-checkout-readiness-probe-0000';
const ACCESS_STATES = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD']);

const env = name => String(globalThis.Netlify?.env?.get(name) || '');
export function allowsPlayTestPurchases(databaseUrl) {
    const isolatedUrl = env('PLAY_TEST_SUPABASE_URL').trim().replace(/\/+$/, '');
    return env('PLAY_ALLOW_TEST_PURCHASES') === 'true' && databaseUrl === isolatedUrl
        && new URL(databaseUrl).hostname !== 'oubmftfufwwzwpgvrcag.supabase.co';
}

export function playEntitlementPayload(subscription) {
    return {
        p_is_active: subscription.active,
        p_status: subscription.status,
        p_is_test: subscription.accessKind === 'test',
        p_needs_ack: subscription.active && subscription.needsAcknowledgement,
        p_linked_token: subscription.active ? subscription.linkedPurchaseToken : null,
        p_order_id: subscription.orderId,
        p_product_id: subscription.productId,
        p_renews_at: subscription.renewsAt,
        p_ends_at: subscription.endsAt
    };
}

const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
function unavailable(stage, details = {}) {
    // Only fixed labels, variable names and upstream HTTP statuses. Never log URLs, bodies or exceptions.
    console.warn('[play-billing] unavailable', { stage, ...details });
    return reply(503, { error: 'unavailable' });
}

export async function network(url, init) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    let data = null;
    try { data = await response.json(); } catch (_) { /* Upstream bodies are never reflected. */ }
    return { ok: response.ok, status: response.status, data };
}

export function acknowledgePlaySubscription(packageName, productId, purchaseToken, googleHeaders) {
    return network(`${PUBLISHER}/${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`, {
        method: 'POST', headers: { ...googleHeaders, 'Content-Type': 'application/json' }, body: '{}'
    });
}

const base64url = value => Buffer.from(value).toString('base64url');

// OAuth access token for the Android Publisher API from a service account key kept only as a Netlify secret.
export async function googleAccessToken(serviceAccount, now = Date.now()) {
    const issuedAt = Math.floor(now / 1000);
    const claims = { iss: serviceAccount.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: issuedAt, exp: issuedAt + 3000 };
    const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(JSON.stringify(claims))}`;
    const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(serviceAccount.private_key).toString('base64url');
    const result = await network('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }).toString()
    });
    if (!result.ok || typeof result.data?.access_token !== 'string') throw new Error('GOOGLE_AUTH_FAILED');
    return result.data.access_token;
}

// Decide from Google's answer alone. Anything unknown fails closed (no access).
export function interpretSubscription(resource, { allowedProducts, allowTestPurchases = false, now = Date.now() }) {
    const line = Array.isArray(resource?.lineItems) ? resource.lineItems[0] : null;
    if (!line || typeof line.productId !== 'string') return { error: 'SUBSCRIPTION_INVALID' };
    if (!allowedProducts.includes(line.productId)) return { error: 'PRODUCT_NOT_ALLOWED' };
    if (resource.testPurchase && !allowTestPurchases) return { error: 'TEST_PURCHASE_REFUSED' };
    const expiry = typeof line.expiryTime === 'string' ? Date.parse(line.expiryTime) : NaN;
    const endsAt = Number.isFinite(expiry) ? new Date(expiry).toISOString() : null;
    const state = String(resource.subscriptionState || '');
    // Google extends expiryTime during grace. A user cancellation keeps access through expiry, whereas a replaced purchase is invalidated.
    const cancelledWithAccess = state === 'SUBSCRIPTION_STATE_CANCELED' && !resource.canceledStateContext?.replacementCancellation;
    const active = expiry > now && (ACCESS_STATES.has(state) || cancelledWithAccess);
    const orderId = typeof line.latestSuccessfulOrderId === 'string' ? line.latestSuccessfulOrderId : resource.latestOrderId;
    return {
        active,
        // Provider provenance never proves money received: a real purchase may include a free trial.
        accessKind: resource.testPurchase ? 'test' : 'verified_purchase',
        status: state.replace('SUBSCRIPTION_STATE_', '').toLowerCase() || 'unknown',
        productId: line.productId,
        orderId: typeof orderId === 'string' ? orderId : null,
        endsAt,
        renewsAt: active && line.autoRenewingPlan?.autoRenewEnabled === true ? endsAt : null,
        linkedPurchaseToken: typeof resource.linkedPurchaseToken === 'string' && TOKEN.test(resource.linkedPurchaseToken) ? resource.linkedPurchaseToken : null,
        needsAcknowledgement: resource.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING',
        acknowledged: resource.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
        boundAccount: typeof resource.externalAccountIdentifiers?.obfuscatedExternalAccountId === 'string' ? resource.externalAccountIdentifiers.obfuscatedExternalAccountId : null,
        startedAt: Date.parse(resource.startTime || '') || now
    };
}

export default async function handler(request) {
    const readiness = request.method === 'GET';
    if (!readiness && request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    if (!readiness && !/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('content-type') || '')) return reply(415, { error: 'json_required' });
    const requestUrl = new URL(request.url);
    const origin = request.headers.get('origin');
    if (origin && origin !== requestUrl.origin) return reply(403, { error: 'origin_refused' });

    const url = env('SUPABASE_URL').trim().replace(/\/+$/, '');
    const key = env('SUPABASE_SECRET_KEY').trim(), publishable = env('SUPABASE_PUBLISHABLE_KEY').trim();
    const packageName = env('PLAY_PACKAGE_NAME') || 'fr.titanapp.app';
    const allowedProducts = env('PLAY_PRODUCT_IDS').split(',').map(v => v.trim()).filter(Boolean);
    let account = null, privateKey = null;
    try {
        account = JSON.parse(env('PLAY_SERVICE_ACCOUNT_JSON') || 'null');
        if (typeof account?.private_key === 'string') privateKey = crypto.createPrivateKey(account.private_key);
    } catch (_) { /* Fail closed below. */ }
    let validUrl = false;
    try { const parsed = new URL(url); validUrl = parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash; } catch (_) { /* Fail closed. */ }
    const invalid = [];
    if (env('PLAY_BILLING_ENABLED') !== 'true') invalid.push('PLAY_BILLING_ENABLED');
    if (!validUrl) invalid.push('SUPABASE_URL');
    if (!key) invalid.push('SUPABASE_SECRET_KEY');
    if (!publishable) invalid.push('SUPABASE_PUBLISHABLE_KEY');
    if (!allowedProducts.length || allowedProducts.some(product => !PRODUCT.test(product))) invalid.push('PLAY_PRODUCT_IDS');
    if (typeof account?.client_email !== 'string' || !/^[^@\s]+@[^@\s]+$/.test(account.client_email) || privateKey?.asymmetricKeyType !== 'rsa') invalid.push('PLAY_SERVICE_ACCOUNT_JSON');
    if (invalid.length) return unavailable('configuration', { variables: invalid });
    // A checkout pause keeps restoration, notifications and reconciliation available for existing purchases.
    if (readiness && env('PLAY_CHECKOUT_ENABLED') === 'false') return unavailable('checkout_paused');
    // A sale is only opened when Google can also reach the notification endpoint: it is what confirms a purchase made while the app
    // is closed, a renewal or a refund. Verification and restoration of existing purchases do not depend on it.
    if (readiness && !(env('PLAY_RTDN_AUDIENCE') && env('PLAY_RTDN_SERVICE_ACCOUNT')) && env('PLAY_RTDN_TOKEN').length < 24) {
        return unavailable('configuration', { variables: ['PLAY_RTDN'] });
    }

    const bearer = request.headers.get('authorization') || '';
    if (!/^Bearer [A-Za-z0-9._~-]{20,8192}$/.test(bearer)) return reply(401, { error: 'authentication_required' });
    let productId = requestUrl.searchParams.get('product_id'), purchaseToken;
    if (!readiness) {
        let body;
        try {
            const raw = await readBoundedBytes(request, MAX_BODY);
            if (raw === null) return reply(413, { error: 'body_too_large' });
            body = JSON.parse(raw.toString('utf8'));
        } catch (_) { return reply(400, { error: 'invalid_request' }); }
        if (typeof body?.purchase_token !== 'string' || !TOKEN.test(body.purchase_token)
            || Object.keys(body).some(k => !['purchase_token', 'product_id'].includes(k))) return reply(400, { error: 'invalid_request' });
        purchaseToken = body.purchase_token;
        productId = body.product_id;
    }
    if (typeof productId !== 'string' || !PRODUCT.test(productId)) return reply(400, { error: 'invalid_request' });
    if (!allowedProducts.includes(productId)) return reply(422, { error: 'product_not_allowed' });

    const databaseHeaders = { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json' };
    if (!key.startsWith('sb_secret_')) databaseHeaders.Authorization = `Bearer ${key}`;
    const rpc = (name, payload) => network(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers: databaseHeaders, body: JSON.stringify(payload) });
    let stage = 'supabase_auth';
    try {
        const auth = await network(`${url}/auth/v1/user`, { method: 'GET', headers: { apikey: publishable, Authorization: bearer, Accept: 'application/json' } });
        if (!auth.ok) return auth.status === 401 || auth.status === 403 ? reply(401, { error: 'authentication_required' }) : unavailable(stage, { status: auth.status });
        const owner = auth.data;
        if (!owner || typeof owner.id !== 'string' || !PLAY_ACCOUNT_ID.test(owner.id) || owner.is_anonymous !== false) return reply(401, { error: 'authentication_required' });
        if (readiness) {
            stage = 'supabase_checkout';
            const ready = await rpc('titan_play_checkout_ready_v1', { p_user_id: owner.id });
            if (!ready.ok || ready.data !== true) return unavailable(stage, { status: ready.status });
        }

        stage = 'google_oauth';
        const accessToken = await googleAccessToken({ client_email: account.client_email, private_key: privateKey });
        const googleHeaders = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
        if (readiness) {
            // Fail before opening Play if Google rejects the credential or the requested offer is unavailable.
            stage = 'google_catalog';
            const catalog = await network(`${PUBLISHER}/${encodeURIComponent(packageName)}/subscriptions/${encodeURIComponent(productId)}`, { method: 'GET', headers: googleHeaders });
            if (!catalog.ok) return unavailable(stage, { status: catalog.status });
            if (catalog.data?.productId !== productId || !catalog.data?.basePlans?.some(plan => plan.state === 'ACTIVE' && plan.autoRenewingBasePlanType?.billingPeriodDuration === 'P1M')) {
                return unavailable(stage);
            }
            // Reading the catalogue and reading a purchase are two different Play Console permissions. A service account that can only do
            // the first would let Google take the payment and then fail every verification, restoration and notification. Ask Google
            // for a purchase that cannot exist: "unknown purchase" proves the permission, a refusal or an outage closes the checkout.
            stage = 'google_purchases';
            const probe = await network(`${PUBLISHER}/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${READINESS_PROBE_TOKEN}`, { method: 'GET', headers: googleHeaders });
            if (probe.ok || probe.status === 401 || probe.status === 403 || probe.status >= 500) return unavailable(stage, { status: probe.status });
            return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
        }
        // Order by when the Google read starts: a delayed older response must not overwrite a newer read.
        const eventAt = new Date().toISOString();
        stage = 'google_lookup';
        const lookup = await network(`${PUBLISHER}/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`, { method: 'GET', headers: googleHeaders });
        if (lookup.status === 404 || lookup.status === 410 || lookup.status === 400) return reply(422, { error: 'purchase_not_found' });
        if (!lookup.ok) return unavailable(stage, { status: lookup.status });
        const subscription = interpretSubscription(lookup.data, { allowedProducts, allowTestPurchases: allowsPlayTestPurchases(url) });
        if (subscription.error) return reply(422, { error: subscription.error.toLowerCase() });
        if (subscription.productId !== productId) return reply(422, { error: 'purchase_product_mismatch' });
        if (subscription.linkedPurchaseToken === purchaseToken) return reply(422, { error: 'subscription_invalid' });
        // The app sets the signed-in account id as the obfuscated account id when it opens the payment sheet. A purchase
        // made for another account (or without one) is refused: a leaked token cannot be attached to a different player.
        if (subscription.boundAccount !== owner.id) return reply(409, { error: subscription.boundAccount ? 'purchase_bound_to_other_account' : 'purchase_not_bound' });

        stage = 'entitlement_write';
        const applied = await rpc('titan_apply_play_entitlement_v1', {
            p_user_id: owner.id, p_external_id: purchaseToken, p_event_name: 'verify', p_event_at: eventAt,
            ...playEntitlementPayload(subscription)
        });
        if (!applied.ok) return applied.data?.message === 'ENTITLEMENT_OWNED_BY_OTHER' ? reply(409, { error: 'purchase_already_used' }) : unavailable(stage, { status: applied.status });
        if (applied.data !== true) return unavailable(applied.data === false ? 'stale_entitlement_read' : stage);

        // Google refunds an unacknowledged purchase after three days: acknowledge only once access is recorded.
        let acknowledged = subscription.acknowledged;
        if (subscription.active && subscription.needsAcknowledgement) {
            try {
                const ack = await acknowledgePlaySubscription(packageName, subscription.productId, purchaseToken, googleHeaders);
                acknowledged = ack.ok;
                if (!ack.ok) console.warn('[play-billing] acknowledgement_pending', { status: ack.status });
            } catch (_) {
                // Access is already recorded. Report a pending acknowledgement so the player can restore and retry.
                console.warn('[play-billing] acknowledgement_pending');
            }
        }
        return reply(200, { active: subscription.active, status: subscription.status, ends_at: subscription.endsAt, product_id: subscription.productId, acknowledged, access_kind: subscription.accessKind });
    } catch (_) { return unavailable(stage); }
}
