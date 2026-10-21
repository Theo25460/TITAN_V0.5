// ADR-004 phase 3: verify a Google Play subscription purchase on the server, then record it as an access source.
// The client only ever sends a purchase token; access is granted solely from Google's own answer. Disabled unless
// PLAY_BILLING_ENABLED=true. Google endpoint paths and field names below follow the Android Publisher API as
// remembered when this was written and MUST be re-read against Google's current documentation (ADR-004, phase 1)
// before the first real purchase; the tests use a simulated Google.
import crypto from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9._~-]{16,2048}$/;
const PRODUCT = /^[a-z0-9._-]{1,100}$/i;
const MAX_BODY = 4096;
const PUBLISHER = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const ACCESS_STATES = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD']);

const env = name => String(globalThis.Netlify?.env?.get(name) || '');
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const unavailable = () => reply(503, { error: 'unavailable' });

async function network(url, init) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    let data = null;
    try { data = await response.json(); } catch (_) { /* Upstream bodies are never reflected. */ }
    return { ok: response.ok, status: response.status, data };
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
    const expiry = Date.parse(line.expiryTime || '');
    const state = String(resource.subscriptionState || '');
    const stillPaid = Number.isFinite(expiry) && expiry > now;
    // A cancelled subscription keeps access until its paid period ends; an expired, held, paused or pending one does not.
    const active = (ACCESS_STATES.has(state) && (state === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' || stillPaid)) || (state === 'SUBSCRIPTION_STATE_CANCELED' && stillPaid);
    return {
        active,
        status: state.replace('SUBSCRIPTION_STATE_', '').toLowerCase() || 'unknown',
        productId: line.productId,
        orderId: typeof resource.latestOrderId === 'string' ? resource.latestOrderId : null,
        endsAt: Number.isFinite(expiry) ? new Date(expiry).toISOString() : null,
        renewsAt: active && line.autoRenewingPlan?.autoRenewEnabled && Number.isFinite(expiry) ? new Date(expiry).toISOString() : null,
        linkedPurchaseToken: typeof resource.linkedPurchaseToken === 'string' && TOKEN.test(resource.linkedPurchaseToken) ? resource.linkedPurchaseToken : null,
        needsAcknowledgement: resource.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING',
        startedAt: Date.parse(resource.startTime || '') || now
    };
}

async function boundedBody(request) {
    const text = await request.text();
    return Buffer.byteLength(text, 'utf8') > MAX_BODY ? null : text;
}

export default async function handler(request) {
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('content-type') || '')) return reply(415, { error: 'json_required' });
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return reply(403, { error: 'origin_refused' });

    const url = env('SUPABASE_URL').replace(/\/+$/, '');
    const key = env('SUPABASE_SECRET_KEY'), publishable = env('SUPABASE_PUBLISHABLE_KEY');
    const packageName = env('PLAY_PACKAGE_NAME') || 'fr.titanapp.app';
    const allowedProducts = env('PLAY_PRODUCT_IDS').split(',').map(v => v.trim()).filter(Boolean);
    let account = null;
    try { account = JSON.parse(env('PLAY_SERVICE_ACCOUNT_JSON') || 'null'); } catch (_) { /* Fail closed below. */ }
    let validUrl = false;
    try { const parsed = new URL(url); validUrl = parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash; } catch (_) { /* Fail closed. */ }
    if (env('PLAY_BILLING_ENABLED') !== 'true' || !validUrl || !key || !publishable || allowedProducts.length === 0
        || typeof account?.client_email !== 'string' || typeof account?.private_key !== 'string') return unavailable();

    const bearer = request.headers.get('authorization') || '';
    if (!/^Bearer [A-Za-z0-9._~-]{20,8192}$/.test(bearer)) return reply(401, { error: 'authentication_required' });
    let body;
    try {
        const raw = await boundedBody(request);
        if (raw === null) return reply(413, { error: 'body_too_large' });
        body = JSON.parse(raw);
    } catch (_) { return reply(400, { error: 'invalid_request' }); }
    if (!body || typeof body !== 'object' || !TOKEN.test(body.purchase_token || '') || !PRODUCT.test(body.product_id || '')
        || Object.keys(body).some(k => !['purchase_token', 'product_id'].includes(k))) return reply(400, { error: 'invalid_request' });

    const databaseHeaders = { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json' };
    if (!key.startsWith('sb_secret_')) databaseHeaders.Authorization = `Bearer ${key}`;
    const rpc = (name, payload) => network(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers: databaseHeaders, body: JSON.stringify(payload) });
    try {
        const auth = await network(`${url}/auth/v1/user`, { method: 'GET', headers: { apikey: publishable, Authorization: bearer, Accept: 'application/json' } });
        if (!auth.ok) return auth.status === 401 || auth.status === 403 ? reply(401, { error: 'authentication_required' }) : unavailable();
        const owner = auth.data;
        if (!owner || typeof owner.id !== 'string' || !UUID.test(owner.id) || owner.is_anonymous !== false) return reply(401, { error: 'authentication_required' });

        const accessToken = await googleAccessToken(account);
        const googleHeaders = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
        const lookup = await network(`${PUBLISHER}/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(body.purchase_token)}`, { method: 'GET', headers: googleHeaders });
        if (lookup.status === 404 || lookup.status === 410 || lookup.status === 400) return reply(422, { error: 'purchase_not_found' });
        if (!lookup.ok) return unavailable();
        const subscription = interpretSubscription(lookup.data, { allowedProducts, allowTestPurchases: env('PLAY_ALLOW_TEST_PURCHASES') === 'true' });
        if (subscription.error) return reply(422, { error: subscription.error.toLowerCase() });

        const applied = await rpc('titan_apply_entitlement_v1', {
            p_user_id: owner.id, p_source: 'google_play', p_external_id: body.purchase_token, p_is_active: subscription.active,
            p_status: subscription.status, p_event_name: 'verify', p_event_at: new Date().toISOString(), p_order_id: subscription.orderId,
            p_product_id: subscription.productId, p_variant_id: null, p_renews_at: subscription.renewsAt, p_ends_at: subscription.endsAt,
            p_trial_ends_at: null, p_refunded_at: null
        });
        if (!applied.ok) return applied.data?.message === 'ENTITLEMENT_OWNED_BY_OTHER' ? reply(409, { error: 'purchase_already_used' }) : unavailable();

        // A purchase replacing an earlier one (upgrade, resubscribe) retires the old token for the same account.
        if (subscription.linkedPurchaseToken) {
            await rpc('titan_apply_entitlement_v1', {
                p_user_id: owner.id, p_source: 'google_play', p_external_id: subscription.linkedPurchaseToken, p_is_active: false,
                p_status: 'replaced', p_event_name: 'replaced', p_event_at: new Date().toISOString(), p_order_id: null,
                p_product_id: subscription.productId, p_variant_id: null, p_renews_at: null, p_ends_at: new Date().toISOString(),
                p_trial_ends_at: null, p_refunded_at: null
            });
        }
        // Google refunds an unacknowledged purchase after three days: acknowledge only once access is recorded.
        if (subscription.active && subscription.needsAcknowledgement) {
            await network(`${PUBLISHER}/${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(subscription.productId)}/tokens/${encodeURIComponent(body.purchase_token)}:acknowledge`, { method: 'POST', headers: { ...googleHeaders, 'Content-Type': 'application/json' }, body: '{}' });
        }
        return reply(200, { active: subscription.active, status: subscription.status, ends_at: subscription.endsAt });
    } catch (_) { return unavailable(); }
}
