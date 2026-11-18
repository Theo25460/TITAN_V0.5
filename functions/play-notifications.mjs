// ADR-004 phase 3 bis: Google Play real-time developer notifications (Pub/Sub push) for TITAN+ subscriptions.
// A notification only says "something changed for this purchase token": the content is never trusted. The server
// re-reads the subscription from Google for the existing owner or the account bound by Google to a new purchase.
//
// Incident of 18 November 2026: Pub/Sub re-sends every message that is not answered with a 2xx. This function used to answer 503 whenever
// billing was switched off (PLAY_BILLING_ENABLED absent on Netlify), so every notification was re-sent for days (~40 000 failed calls a day,
// all 503, billed by Netlify). Now each notification is first KEPT in a private inbox (titan_record_play_notification_v1, deduplicated by the
// Pub/Sub messageId) and acknowledged; it is processed at once when billing is ready, otherwise by the hourly play-reconcile job once it is.
// A 5xx is only returned when the notification could not be kept (database unreachable or not configured): that retry is useful.
// Authentication, strongest first: a Pub/Sub OIDC token signed by Google for PLAY_RTDN_AUDIENCE and PLAY_RTDN_SERVICE_ACCOUNT; or the secret in
// the push URL (PLAY_RTDN_TOKEN). When neither is configured the notification is kept as unauthenticated (bounded) and never processed inline.
import crypto from 'node:crypto';
import { acknowledgePlaySubscription, googleAccessToken, interpretSubscription, network, PLAY_ACCOUNT_ID, playEntitlementPayload } from './play-billing.mjs';
import { verifyPubSubJwt } from './play-auth.mjs';
import { readBoundedBytes } from './request-body.mjs';

const TOKEN = /^[A-Za-z0-9._~-]{16,2048}$/;
const MESSAGE_ID = /^[A-Za-z0-9._:-]{1,200}$/;
const MAX_BODY = 16384;
const PUBLISHER = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const env = name => String(globalThis.Netlify?.env?.get(name) || '');
const reply = (status, body = '') => new Response(body, { status, headers: { 'Cache-Control': 'no-store' } });
// One short line per notification that reaches the inbox: enough to count outcomes in the Netlify log, never a token or an account.
const trace = fields => { try { console.log(JSON.stringify({ fn: 'play-notifications', ...fields })); } catch (_) { /* never fail on logging */ } };

function sameSecret(given, expected) {
    const a = crypto.createHash('sha256').update(String(given)).digest(), b = crypto.createHash('sha256').update(String(expected)).digest();
    return crypto.timingSafeEqual(a, b);
}

// Reads the configuration shared with play-reconcile. `store` = the inbox can be written; `ready` = notifications can be processed now.
export function playNotificationConfig() {
    const url = env('SUPABASE_URL').replace(/\/+$/, '');
    const key = env('SUPABASE_SECRET_KEY');
    let validUrl = false;
    try { const parsed = new URL(url); validUrl = parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash; } catch (_) { /* Fail closed. */ }
    let account = null;
    try { account = JSON.parse(env('PLAY_SERVICE_ACCOUNT_JSON') || 'null'); } catch (_) { /* Fail closed below. */ }
    const allowedProducts = env('PLAY_PRODUCT_IDS').split(',').map(v => v.trim()).filter(Boolean);
    const store = validUrl && Boolean(key);
    const ready = store && env('PLAY_BILLING_ENABLED') === 'true' && allowedProducts.length > 0
        && typeof account?.client_email === 'string' && typeof account?.private_key === 'string';
    const databaseHeaders = { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json' };
    if (key && !key.startsWith('sb_secret_')) databaseHeaders.Authorization = `Bearer ${key}`;
    const rpc = (name, payload) => network(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers: databaseHeaders, body: JSON.stringify(payload) });
    return { url, store, ready, account, allowedProducts, packageName: env('PLAY_PACKAGE_NAME') || 'fr.titanapp.app', rpc };
}

// Processes one kept notification. Returns { outcome, final }: final = false means a transient failure worth retrying later.
// `googleHeaders` is a lazy getter so a batch shares one access token.
export async function processPlayNotification(item, config, googleHeaders) {
    const { rpc, packageName, allowedProducts } = config;
    const { purchaseToken, kind, notificationType } = item;
    const eventName = kind === 'voided' ? 'rtdn:voided' : `rtdn:${notificationType ?? 'unknown'}`;
    const owner = await rpc('titan_entitlement_owner_v1', { p_source: 'google_play', p_external_id: purchaseToken });
    if (!owner.ok) return { outcome: 'database-unavailable', final: false };
    const firstPurchase = owner.data === null;
    if (!firstPurchase && (typeof owner.data !== 'string' || !PLAY_ACCOUNT_ID.test(owner.data))) return { outcome: 'owner-unreadable', final: false };
    // A token we have never recorded is only worth a Google read when the event means "this subscription is paid now": the purchase
    // itself (4), and also a renewal (2), a recovery (1) or a restart (7), so that a purchase whose first notification was lost is not
    // forgotten until the player reopens the app (PR #154). Google's answer and its bound account still decide.
    if (firstPurchase && !(kind === 'subscription' && [1, 2, 4, 7].includes(notificationType))) return { outcome: 'unknown-token-ignored', final: true };

    const headers = await googleHeaders();
    // Capture before awaiting Google so an older delayed response cannot outrank a newer verification.
    const eventAt = new Date().toISOString();
    const lookup = await network(`${PUBLISHER}/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`, { method: 'GET', headers });
    // Google no longer knows a token it once sold (refunded, or an expired subscription past its retention): the account keeps no access from it.
    if (lookup.status === 404 || lookup.status === 410) {
        if (firstPurchase) return { outcome: 'unknown-at-google', final: true };
        const gone = await rpc('titan_apply_play_entitlement_v1', {
            p_user_id: owner.data, p_external_id: purchaseToken, p_is_active: false, p_status: 'gone',
            p_event_name: eventName, p_event_at: eventAt, p_is_test: null, p_ends_at: eventAt
        });
        return gone.ok ? { outcome: 'gone', final: true } : { outcome: 'database-unavailable', final: false };
    }
    if (!lookup.ok) return { outcome: `google-${lookup.status}`, final: false };
    const subscription = interpretSubscription(lookup.data, { allowedProducts });
    if (subscription.error || subscription.linkedPurchaseToken === purchaseToken) return { outcome: 'not-applicable', final: true };
    const userId = firstPurchase ? subscription.boundAccount : owner.data;
    // A first purchase whose account Google does not name is granted when the player's app sends it (play-billing) or on restore.
    if (typeof userId !== 'string' || !PLAY_ACCOUNT_ID.test(userId)) return { outcome: 'unbound', final: true };
    if (firstPurchase && !subscription.active) return { outcome: 'inactive-first-purchase', final: true };
    if (subscription.boundAccount && subscription.boundAccount !== userId) return { outcome: 'account-mismatch', final: true };
    // Notification timestamps are untrusted; use the server-side Google request start captured above.
    const applied = await rpc('titan_apply_play_entitlement_v1', {
        p_user_id: userId, p_external_id: purchaseToken, p_event_name: eventName, p_event_at: eventAt,
        ...playEntitlementPayload(subscription)
    });
    if (!applied.ok) {
        const rejected = ['ENTITLEMENT_OWNED_BY_OTHER', 'PROFILE_NOT_FOUND', 'PLAY_REPLACEMENT_INVALID'].includes(applied.data?.message);
        return rejected ? { outcome: `rejected:${applied.data.message}`, final: true } : { outcome: 'database-unavailable', final: false };
    }
    if (applied.data !== true) return applied.data === false ? { outcome: 'older-than-recorded', final: true } : { outcome: 'database-unreadable', final: false };
    if (subscription.active && subscription.needsAcknowledgement) {
        const ack = await acknowledgePlaySubscription(packageName, subscription.productId, purchaseToken, headers);
        if (!ack.ok) return { outcome: 'acknowledge-failed', final: false };
    }
    return { outcome: subscription.active ? 'applied-active' : 'applied-inactive', final: true };
}

export function lazyGoogleHeaders(account) {
    let pending = null;
    return () => (pending ??= googleAccessToken(account).then(token => ({ Authorization: `Bearer ${token}`, Accept: 'application/json' })));
}

export default async function handler(request) {
    if (request.method !== 'POST') return reply(405);
    const config = playNotificationConfig();
    const pushToken = env('PLAY_RTDN_TOKEN');
    const audience = env('PLAY_RTDN_AUDIENCE'), pushAccount = env('PLAY_RTDN_SERVICE_ACCOUNT');
    const oidc = Boolean(audience && pushAccount);
    const authConfigured = oidc || pushToken.length >= 24;
    // When push authentication is configured, a request that fails it is refused (Google's own pushes always pass it).
    let authenticated = false;
    if (authConfigured) {
        authenticated = oidc
            ? await verifyPubSubJwt(request.headers.get('authorization'), { audience, email: pushAccount })
            : sameSecret(new URL(request.url).searchParams.get('token') || '', pushToken);
        if (!authenticated) return reply(401);
    }

    let notification, messageId;
    try {
        const raw = await readBoundedBytes(request, MAX_BODY);
        if (raw === null) return reply(413);
        const envelope = JSON.parse(raw.toString('utf8'));
        messageId = String(envelope?.message?.messageId || envelope?.message?.message_id || '');
        notification = JSON.parse(Buffer.from(String(envelope?.message?.data || ''), 'base64').toString('utf8'));
    } catch (_) { return reply(400); }
    if (!notification || typeof notification !== 'object') return reply(400);
    // Anything that is not a subscription event for our package is acknowledged and ignored, so Pub/Sub stops re-sending it.
    if (notification.packageName !== config.packageName) return reply(200);
    // A refund or revocation arrives either as a subscription notification (type 12) or as a voided-purchase notification
    // (productType 1 = subscription). Both only name the token: the state is re-read from Google.
    const voided = notification.voidedPurchaseNotification && Number(notification.voidedPurchaseNotification.productType) === 1 ? notification.voidedPurchaseNotification : null;
    const purchaseToken = voided ? voided.purchaseToken : notification.subscriptionNotification?.purchaseToken;
    if ((!notification.subscriptionNotification && !voided) || !TOKEN.test(purchaseToken || '')) return reply(200);
    const kind = voided ? 'voided' : 'subscription';
    const rawType = Number(notification.subscriptionNotification?.notificationType);
    const notificationType = voided ? null : (Number.isInteger(rawType) && rawType >= 0 && rawType <= 100 ? rawType : null);
    // Pub/Sub always sends a messageId; a synthetic one keeps one row per (token, type, event time) if it were ever missing.
    if (!MESSAGE_ID.test(messageId)) {
        messageId = 'sha256:' + crypto.createHash('sha256').update(`${purchaseToken}|${kind}|${notificationType}|${notification.eventTimeMillis || ''}`).digest('hex').slice(0, 48);
    }

    // Nothing can be kept: the database itself is not configured. This is a real misconfiguration and the only 503 left besides a database outage.
    if (!config.store) { trace({ outcome: 'not-configured', kind, type: notificationType }); return reply(503); }
    let kept;
    try {
        kept = await config.rpc('titan_record_play_notification_v1', {
            p_message_id: messageId, p_purchase_token: purchaseToken, p_kind: kind, p_notification_type: notificationType, p_authenticated: authenticated
        });
    } catch (_) { kept = { ok: false }; }
    // Inbox function missing (function deployed before migration 20261122090000): process inline as before the inbox existed, so a
    // fully configured setup still confirms purchases; without billing there is nothing to do but let Pub/Sub retry.
    const inboxMissing = !kept.ok && (kept.status === 404 || kept.data?.code === 'PGRST202');
    if (inboxMissing && config.ready && authenticated) {
        let inline;
        try { inline = await processPlayNotification({ purchaseToken, kind, notificationType }, config, lazyGoogleHeaders(config.account)); }
        catch (_) { inline = { outcome: 'exception', final: false }; }
        trace({ outcome: inline.outcome, final: inline.final, kind, type: notificationType, inbox: 'missing' });
        return reply(inline.final ? 200 : 503);
    }
    if (!kept.ok || typeof kept.data !== 'string') { trace({ outcome: inboxMissing ? 'inbox-missing' : 'inbox-unavailable', kind, type: notificationType }); return reply(503); }
    if (kept.data === 'full') { trace({ outcome: 'inbox-full', kind, type: notificationType }); return reply(503); }
    if (kept.data === 'done') return reply(200, 'duplicate');
    // Kept. Without billing ready or without authentication, the hourly job processes it later: Google can stop re-sending now.
    if (!config.ready || !authenticated) { trace({ outcome: config.ready ? 'kept-unauthenticated' : 'kept-billing-off', kind, type: notificationType, dup: kept.data === 'duplicate' }); return reply(202, 'kept'); }

    let result;
    try { result = await processPlayNotification({ purchaseToken, kind, notificationType }, config, lazyGoogleHeaders(config.account)); }
    catch (_) { result = { outcome: 'exception', final: false }; }
    try { await config.rpc('titan_finish_play_notification_v1', { p_message_id: messageId, p_outcome: result.outcome, p_final: result.final }); }
    catch (_) { /* the row stays pending: play-reconcile retries it */ }
    trace({ outcome: result.outcome, final: result.final, kind, type: notificationType, dup: kept.data === 'duplicate' });
    // A transient failure is retried by play-reconcile from the inbox (bounded back-off), not by a Pub/Sub storm.
    return reply(result.final ? 200 : 202, result.final ? '' : 'kept');
}
