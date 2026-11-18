// Hourly safety net for Google Play subscriptions: a lost real-time notification must not leave an ended subscription
// with Premium access. Re-reads, from Google, the few subscriptions the database names as due and records the answer.
// Second job (incident of 18 November 2026): processes the real-time notifications kept in the private inbox while billing was off or while a
// try failed (titan_play_notifications_due_v1 schedules each retry with a bounded back-off). A new token is only granted to the account Google binds.
// Disabled unless PLAY_BILLING_ENABLED=true. Never trusts anything but Google's answer.
import { acknowledgePlaySubscription, allowsPlayTestPurchases, googleAccessToken, interpretSubscription, network, playEntitlementPayload } from './play-billing.mjs';
import { lazyGoogleHeaders, playNotificationConfig, processPlayNotification } from './play-notifications.mjs';

const PUBLISHER = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const env = name => String(globalThis.Netlify?.env?.get(name) || '');

export default async function handler(_request, { budgetMs = 20_000, now = () => Date.now() } = {}) {
    const url = env('SUPABASE_URL').replace(/\/+$/, '');
    const key = env('SUPABASE_SECRET_KEY');
    const packageName = env('PLAY_PACKAGE_NAME') || 'fr.titanapp.app';
    const allowedProducts = env('PLAY_PRODUCT_IDS').split(',').map(v => v.trim()).filter(Boolean);
    let account = null;
    try { account = JSON.parse(env('PLAY_SERVICE_ACCOUNT_JSON') || 'null'); } catch (_) { /* Fail closed below. */ }
    let validUrl = false;
    try { const parsed = new URL(url); validUrl = parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash; } catch (_) { /* Fail closed. */ }
    const summary = (status, extra = {}) => new Response(JSON.stringify({ checked: 0, updated: 0, failed: 0, ...extra }), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    // Switched off on purpose (billing not opened yet): the hourly run reports "disabled" with 200, so Netlify's error log is not polluted by an expected state.
    // Switched ON but misconfigured (missing secret, bad product list) stays a 503: that one is a real alert.
    if (env('PLAY_BILLING_ENABLED') !== 'true') return summary(200, { disabled: true });
    if (!validUrl || !key || allowedProducts.length === 0
        || typeof account?.client_email !== 'string' || typeof account?.private_key !== 'string') return summary(503);

    const databaseHeaders = { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json' };
    if (!key.startsWith('sb_secret_')) databaseHeaders.Authorization = `Bearer ${key}`;
    const rpc = (name, payload) => network(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers: databaseHeaders, body: JSON.stringify(payload) });
    const started = now();
    let checked = 0, updated = 0, failed = 0;
    // Kept notifications first (half the budget at most): a purchase waiting there is a player who already paid.
    async function processInbox(begin) {
        const config = playNotificationConfig();
        const headers = lazyGoogleHeaders(account);
        const counts = { notifications: 0, notificationsFailed: 0 };
        // One row is claimed at a time, so a row is only charged an attempt (and pushed back) when it is really processed.
        for (let i = 0; i < 25 && now() - begin <= budgetMs / 2; i++) {
            const rows = await rpc('titan_play_notifications_due_v1', { p_limit: 1 });
            // Inbox missing (migration not applied yet), unreachable or empty: the entitlement sweep below still runs.
            if (!rows.ok || !Array.isArray(rows.data) || rows.data.length === 0) break;
            const row = rows.data[0];
            counts.notifications++;
            let result;
            try {
                result = await processPlayNotification({ purchaseToken: row.purchase_token, kind: row.kind, notificationType: row.notification_type }, config, headers);
            } catch (_) { result = { outcome: 'exception', final: false }; }
            if (!result.final) counts.notificationsFailed++;
            try { await rpc('titan_finish_play_notification_v1', { p_message_id: row.message_id, p_outcome: result.outcome, p_final: result.final }); }
            catch (_) { counts.notificationsFailed++; }
        }
        return counts.notifications ? counts : {};
    }
    try {
        const due = await rpc('titan_play_entitlements_due_v1', { p_limit: 50 });
        if (!due.ok || !Array.isArray(due.data)) return summary(503);
        const inbox = await processInbox(started);
        if (due.data.length === 0) return summary(200, inbox);
        const accessToken = await googleAccessToken(account);
        const googleHeaders = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
        for (const row of due.data) {
            if (now() - started > budgetMs) break; // the rest is picked up by the next run
            checked++;
            try {
                const eventAt = new Date().toISOString();
                const lookup = await network(`${PUBLISHER}/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(row.external_id)}`, { method: 'GET', headers: googleHeaders });
                let payload;
                let subscription;
                if (lookup.status === 404 || lookup.status === 410) {
                    payload = { p_is_active: false, p_status: 'gone', p_is_test: null, p_ends_at: eventAt };
                } else if (lookup.ok) {
                    subscription = interpretSubscription(lookup.data, { allowedProducts, allowTestPurchases: allowsPlayTestPurchases(url) });
                    const invalid = subscription.error || subscription.linkedPurchaseToken === row.external_id
                        || (subscription.boundAccount && subscription.boundAccount !== row.user_id);
                    payload = invalid
                        ? { p_is_active: false, p_status: 'invalid', p_is_test: null, p_ends_at: eventAt }
                        : playEntitlementPayload(subscription);
                } else { failed++; continue; } // Google unavailable: change nothing, try again next hour
                const applied = await rpc('titan_apply_play_entitlement_v1', {
                    p_user_id: row.user_id, p_external_id: row.external_id, p_event_name: 'reconcile', p_event_at: eventAt, ...payload
                });
                if (!applied.ok) { failed++; continue; }
                if (applied.data !== true) continue;
                if (payload.p_is_active && subscription.needsAcknowledgement) {
                    const ack = await acknowledgePlaySubscription(packageName, subscription.productId, row.external_id, googleHeaders);
                    if (!ack.ok) { failed++; continue; }
                }
                updated++;
            } catch (_) { failed++; }
        }
        return summary(200, { checked, updated, failed, ...inbox });
    } catch (_) { return summary(503, { checked, updated, failed }); }
}
