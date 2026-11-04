// ADR-004 phase 3 bis: Google Play real-time developer notifications (Pub/Sub push) for TITAN+ subscriptions.
// A notification only says "something changed for this purchase token": the content is never trusted. The server
// re-reads the subscription from Google and records what Google answers, for the account the token is already
// linked to. Disabled unless PLAY_BILLING_ENABLED=true. Authentication, strongest first: a Pub/Sub OIDC token signed
// by Google for PLAY_RTDN_AUDIENCE and PLAY_RTDN_SERVICE_ACCOUNT; or the secret in the push URL (PLAY_RTDN_TOKEN).
import crypto from 'node:crypto';
import { googleAccessToken, interpretSubscription } from './play-billing.mjs';
import { verifyPubSubJwt } from './play-auth.mjs';

const TOKEN = /^[A-Za-z0-9._~-]{16,2048}$/;
const MAX_BODY = 16384;
const PUBLISHER = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const env = name => String(globalThis.Netlify?.env?.get(name) || '');
const reply = (status, body = '') => new Response(body, { status });

async function network(url, init) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    let data = null;
    try { data = await response.json(); } catch (_) { /* Upstream bodies are never reflected. */ }
    return { ok: response.ok, status: response.status, data };
}

function sameSecret(given, expected) {
    const a = crypto.createHash('sha256').update(String(given)).digest(), b = crypto.createHash('sha256').update(String(expected)).digest();
    return crypto.timingSafeEqual(a, b);
}

export default async function handler(request) {
    if (request.method !== 'POST') return reply(405);
    const url = env('SUPABASE_URL').replace(/\/+$/, '');
    const key = env('SUPABASE_SECRET_KEY');
    const packageName = env('PLAY_PACKAGE_NAME') || 'fr.titanapp.app';
    const allowedProducts = env('PLAY_PRODUCT_IDS').split(',').map(v => v.trim()).filter(Boolean);
    const pushToken = env('PLAY_RTDN_TOKEN');
    const audience = env('PLAY_RTDN_AUDIENCE'), pushAccount = env('PLAY_RTDN_SERVICE_ACCOUNT');
    const oidc = Boolean(audience && pushAccount);
    let account = null;
    try { account = JSON.parse(env('PLAY_SERVICE_ACCOUNT_JSON') || 'null'); } catch (_) { /* Fail closed below. */ }
    let validUrl = false;
    try { const parsed = new URL(url); validUrl = parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash; } catch (_) { /* Fail closed. */ }
    if (env('PLAY_BILLING_ENABLED') !== 'true' || !validUrl || !key || (!oidc && pushToken.length < 24) || allowedProducts.length === 0
        || typeof account?.client_email !== 'string' || typeof account?.private_key !== 'string') return reply(503);
    const authenticated = oidc
        ? await verifyPubSubJwt(request.headers.get('authorization'), { audience, email: pushAccount })
        : sameSecret(new URL(request.url).searchParams.get('token') || '', pushToken);
    if (!authenticated) return reply(401);

    let notification;
    try {
        const raw = await request.text();
        if (Buffer.byteLength(raw, 'utf8') > MAX_BODY) return reply(413);
        const envelope = JSON.parse(raw);
        notification = JSON.parse(Buffer.from(String(envelope?.message?.data || ''), 'base64').toString('utf8'));
    } catch (_) { return reply(400); }
    if (!notification || typeof notification !== 'object') return reply(400);
    // Anything that is not a subscription event for our package is acknowledged and ignored, so Pub/Sub stops retrying it.
    if (notification.packageName !== packageName) return reply(200);
    // A refund or revocation arrives either as a subscription notification (type 12) or as a voided-purchase notification
    // (productType 1 = subscription). Both only name the token: the state is re-read from Google below.
    const voided = notification.voidedPurchaseNotification && Number(notification.voidedPurchaseNotification.productType) === 1 ? notification.voidedPurchaseNotification : null;
    const purchaseToken = voided ? voided.purchaseToken : notification.subscriptionNotification?.purchaseToken;
    if ((!notification.subscriptionNotification && !voided) || !TOKEN.test(purchaseToken || '')) return reply(200);
    const eventName = voided ? 'rtdn:voided' : `rtdn:${notification.subscriptionNotification.notificationType ?? 'unknown'}`;

    const databaseHeaders = { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json' };
    if (!key.startsWith('sb_secret_')) databaseHeaders.Authorization = `Bearer ${key}`;
    const rpc = (name, payload) => network(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers: databaseHeaders, body: JSON.stringify(payload) });
    try {
        const owner = await rpc('titan_entitlement_owner_v1', { p_source: 'google_play', p_external_id: purchaseToken });
        if (!owner.ok) return reply(503);
        // Not linked to any account yet: the player's own verification call will record it; nothing to do here.
        if (typeof owner.data !== 'string') return reply(200);

        const accessToken = await googleAccessToken(account);
        // Capture before awaiting Google so an older delayed response cannot outrank a newer verification.
        const eventAt = new Date().toISOString();
        const lookup = await network(`${PUBLISHER}/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
        // Google no longer knows a token it once sold (refunded, or an expired subscription past its retention): the account keeps no access from it.
        if (lookup.status === 404 || lookup.status === 410) {
            const gone = await rpc('titan_apply_entitlement_v1', {
                p_user_id: owner.data, p_source: 'google_play', p_external_id: purchaseToken, p_is_active: false, p_status: 'gone',
                p_event_name: eventName, p_event_at: eventAt, p_order_id: null, p_product_id: null, p_variant_id: null,
                p_renews_at: null, p_ends_at: new Date().toISOString(), p_trial_ends_at: null, p_refunded_at: null
            });
            return gone.ok ? reply(200) : reply(503);
        }
        if (!lookup.ok) return reply(503);
        const subscription = interpretSubscription(lookup.data, { allowedProducts, allowTestPurchases: env('PLAY_ALLOW_TEST_PURCHASES') === 'true' });
        if (subscription.error) return reply(200);
        // Notification timestamps are untrusted; use the server-side Google request start captured above.
        const applied = await rpc('titan_apply_entitlement_v1', {
            p_user_id: owner.data, p_source: 'google_play', p_external_id: purchaseToken, p_is_active: subscription.active,
            p_status: subscription.status, p_event_name: eventName,
            p_event_at: eventAt, p_order_id: subscription.orderId, p_product_id: subscription.productId, p_variant_id: null,
            p_renews_at: subscription.renewsAt, p_ends_at: subscription.endsAt, p_trial_ends_at: null, p_refunded_at: null
        });
        return applied.ok ? reply(200) : reply(503);
    } catch (_) { return reply(503); }
}
