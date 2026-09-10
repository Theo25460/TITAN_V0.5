import crypto from 'node:crypto';

const MAX_BODY_BYTES = 128 * 1024;
const PADDLE_SIGNATURE_TOLERANCE_SECONDS = 300;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCESS_EVENTS = new Set([
    'subscription.created',
    'subscription.activated',
    'subscription.trialing',
    'subscription.updated',
    'subscription.resumed',
    'subscription.past_due',
    'transaction.completed'
]);
const REVOKE_EVENTS = new Set([
    'subscription.canceled',
    'subscription.paused'
]);

function getEnv(name) {
    return globalThis.Netlify?.env?.get(name) || '';
}

function supabaseHeaders(secretKey, { write = false } = {}) {
    const headers = {
        apikey: secretKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-client-info': 'titan-os-netlify-webhook/100.0'
    };

    // Legacy service-role keys are JWTs and need the bearer header. Modern
    // sb_secret_* keys are intentionally not JWTs and authenticate via apikey.
    if (!secretKey.startsWith('sb_secret_')) headers.Authorization = `Bearer ${secretKey}`;
    if (write) headers.Prefer = 'return=minimal';
    return headers;
}

async function parseSupabaseResponse(response) {
    const raw = await response.text();
    let body = null;
    if (raw) {
        try {
            body = JSON.parse(raw);
        } catch (_) {
            body = raw;
        }
    }

    if (response.ok) return { data: body, error: null };
    const details = body && typeof body === 'object' ? body : {};
    return {
        data: null,
        error: {
            code: String(details.code || response.status),
            message: String(details.message || body || response.statusText || 'Supabase request failed'),
            details: String(details.details || ''),
            hint: String(details.hint || '')
        }
    };
}

function createSupabaseAdminClient(url, secretKey) {
    const baseUrl = String(url || '').replace(/\/+$/, '');
    const request = (path, payload, write = false) => fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: supabaseHeaders(secretKey, { write }),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000)
    }).then(parseSupabaseResponse);

    return {
        from(table) {
            return {
                insert(payload) {
                    return request(`/rest/v1/${encodeURIComponent(table)}`, payload, true);
                }
            };
        },
        rpc(functionName, payload) {
            return request(`/rest/v1/rpc/${encodeURIComponent(functionName)}`, payload);
        }
    };
}

function csvEnv(name) {
    return String(getEnv(name) || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
}

function jsonResponse(status, body) {
    return new Response(body, { status });
}

function normalizeTimestamp(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parsePaddleSignature(headerValue) {
    const parsed = { timestamp: '', signatures: [] };

    for (const part of String(headerValue || '').split(';')) {
        const separatorIndex = part.indexOf('=');
        if (separatorIndex < 1) continue;

        const key = part.slice(0, separatorIndex).trim();
        const value = part.slice(separatorIndex + 1).trim();
        if (key === 'ts') parsed.timestamp = value;
        if (key === 'h1' && value) parsed.signatures.push(value);
    }

    return parsed;
}

function safeEqualHex(left, right) {
    if (!/^[0-9a-f]+$/i.test(left || '') || !/^[0-9a-f]+$/i.test(right || '')) return false;
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyPaddleSignature(rawBody, signatureHeader, secret) {
    const { timestamp, signatures } = parsePaddleSignature(signatureHeader);
    const timestampNumber = Number(timestamp);

    if (!timestamp || signatures.length === 0 || !Number.isFinite(timestampNumber)) return false;

    const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampNumber);
    if (ageSeconds > PADDLE_SIGNATURE_TOLERANCE_SECONDS) return false;

    const expected = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}:${rawBody}`)
        .digest('hex');

    return signatures.some(signature => safeEqualHex(signature, expected));
}

function firstPaddleItem(data) {
    return Array.isArray(data?.items) ? data.items.find(item => item?.price) || {} : {};
}

function extractBillingMeta(body) {
    const data = body.data || {};
    const item = firstPaddleItem(data);
    const price = item.price || {};
    const eventName = String(body.event_type || '');
    const isSubscriptionEvent = eventName.startsWith('subscription.');
    const fallbackEventId = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');

    return {
        eventId: String(body.event_id || body.notification_id || fallbackEventId),
        occurredAt: normalizeTimestamp(body.occurred_at) || new Date().toISOString(),
        productId: String(price.product_id || data.product_id || ''),
        priceId: String(price.id || item.price_id || ''),
        productName: String(price.name || price.description || data.name || ''),
        subscriptionId: String(data.subscription_id || (isSubscriptionEvent ? data.id : '') || ''),
        transactionId: String(eventName.startsWith('transaction.') ? data.id : data.transaction_id || ''),
        renewsAt: data.next_billed_at || data.current_billing_period?.ends_at || null,
        endsAt: data.scheduled_change?.effective_at || data.canceled_at || data.ends_at || null,
        trialEndsAt: data.trial_dates?.ends_at || null,
        refundedAt: data.refunded_at || null
    };
}

function extractUserId(body) {
    const data = body.data || {};
    const customData = data.custom_data || data.customData || {};
    return String(customData.user_id || customData.userId || '').trim();
}

function getPaddleStatus(body) {
    return String(body.data?.status || '').trim().toLowerCase();
}

function hasPaddleAccess(status) {
    return ['active', 'trialing', 'past_due'].includes(status);
}

function isEliteProduct(meta) {
    const allowedProductIds = csvEnv('PADDLE_ELITE_PRODUCT_IDS');
    const allowedPriceIds = csvEnv('PADDLE_ELITE_PRICE_IDS');

    if (allowedProductIds.length > 0 && meta.productId) return allowedProductIds.includes(meta.productId);
    if (allowedPriceIds.length > 0 && meta.priceId) return allowedPriceIds.includes(meta.priceId);

    // Fallback for first deployment only. Prefer Paddle IDs in Netlify.
    return /elite|titan/i.test(meta.productName || '');
}

function extractMissingColumn(error) {
    const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
    const patterns = [
        /'([^']+)' column/i,
        /column ['"]?([a-zA-Z0-9_]+)['"]?/i,
        /schema cache.*['"]([a-zA-Z0-9_]+)['"]/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) return match[1];
    }
    return null;
}

async function insertBillingEvent(supabase, payload) {
    const cleanPayload = { ...payload };

    for (let attempt = 0; attempt < 8; attempt++) {
        const result = await supabase.from('titan_billing_events').insert(cleanPayload);
        if (!result.error) return result;

        const missingColumn = extractMissingColumn(result.error);
        if (missingColumn && Object.prototype.hasOwnProperty.call(cleanPayload, missingColumn)) {
            console.warn(`[Billing] Missing titan_billing_events column ignored: ${missingColumn}`);
            delete cleanPayload[missingColumn];
            continue;
        }
        return result;
    }

    return { error: new Error('Billing event insert fallback exhausted') };
}

function buildEliteProfileUpdate({ isElite, status, eventName, billingMeta }) {
    return {
        p_is_elite: isElite,
        p_status: status || eventName,
        p_event_name: eventName || 'unknown',
        p_event_at: billingMeta.occurredAt,
        p_subscription_id: billingMeta.subscriptionId || null,
        p_order_id: billingMeta.transactionId || null,
        p_product_id: billingMeta.productId || null,
        p_variant_id: billingMeta.priceId || null,
        p_renews_at: normalizeTimestamp(billingMeta.renewsAt),
        p_ends_at: normalizeTimestamp(billingMeta.endsAt),
        p_trial_ends_at: normalizeTimestamp(billingMeta.trialEndsAt),
        p_refunded_at: normalizeTimestamp(billingMeta.refundedAt)
    };
}

async function applyEliteProfileUpdate(supabase, userId, payload) {
    return supabase.rpc('titan_apply_paddle_entitlement_v87', {
        p_user_id: userId,
        ...payload
    });
}

export default async req => {
    if (req.method !== 'POST') return jsonResponse(405, 'Method Not Allowed');

    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) return jsonResponse(413, 'Payload Too Large');

    try {
        const secret = getEnv('PADDLE_WEBHOOK_SECRET');
        const supabaseUrl = getEnv('SUPABASE_URL');
        // Prefer Supabase's rotatable secret keys. Keep the legacy variable as a
        // compatibility fallback until the production environment is rotated.
        const supabaseSecretKey = getEnv('SUPABASE_SECRET_KEY') || getEnv('SUPABASE_SERVICE_ROLE_KEY');

        if (!secret) {
            console.error('PADDLE_WEBHOOK_SECRET is missing.');
            return jsonResponse(500, 'Webhook secret not configured');
        }
        if (!supabaseUrl || !supabaseSecretKey) {
            console.error('Supabase admin configuration is missing.');
            return jsonResponse(500, 'Supabase admin not configured');
        }
        if (!verifyPaddleSignature(rawBody, req.headers.get('paddle-signature'), secret)) {
            return jsonResponse(401, 'Invalid signature');
        }

        const body = JSON.parse(rawBody);
        const eventName = String(body.event_type || '');
        const billingMeta = extractBillingMeta(body);
        const userId = extractUserId(body);

        if (!userId || !UUID_RE.test(userId)) {
            console.log(`[Ignore] Paddle event ${eventName || 'unknown'} received without a valid user ID.`);
            return jsonResponse(200, 'No User ID found, ignored.');
        }

        const supabase = createSupabaseAdminClient(supabaseUrl, supabaseSecretKey);
        const eventInsert = await insertBillingEvent(supabase, {
            event_id: billingMeta.eventId,
            event_name: eventName || 'unknown',
            user_id: userId,
            product_id: billingMeta.productId || null,
            variant_id: billingMeta.priceId || null,
            subscription_id: billingMeta.subscriptionId || null,
            order_id: billingMeta.transactionId || null,
            status: getPaddleStatus(body) || null,
            renews_at: normalizeTimestamp(billingMeta.renewsAt),
            ends_at: normalizeTimestamp(billingMeta.endsAt),
            trial_ends_at: normalizeTimestamp(billingMeta.trialEndsAt),
            refunded_at: normalizeTimestamp(billingMeta.refundedAt),
            occurred_at: billingMeta.occurredAt,
            payload: body
        });

        if (eventInsert.error) {
            if (eventInsert.error.code === '23505') {
                // The event row may have been committed before a transient RPC
                // failure. Re-run the ordered entitlement update so Paddle's
                // retry can reconcile that partial attempt safely.
                console.log(`[Idempotence] Paddle event already recorded, reconciling entitlement: ${billingMeta.eventId}`);
            } else {
                throw eventInsert.error;
            }
        }

        if (ACCESS_EVENTS.has(eventName)) {
            if (!isEliteProduct(billingMeta)) {
                console.log(`[Ignore] Non Elite Paddle item for ${userId}: ${billingMeta.productId || billingMeta.priceId || billingMeta.productName}`);
                return jsonResponse(200, 'Non elite product ignored');
            }

            const status = getPaddleStatus(body);
            const isTransactionGrant = eventName === 'transaction.completed' && status === 'completed';
            const isElite = isTransactionGrant || hasPaddleAccess(status);
            const { data: applied, error } = await applyEliteProfileUpdate(supabase, userId, buildEliteProfileUpdate({
                isElite,
                status: status || (isElite ? 'active' : eventName),
                eventName,
                billingMeta
            }));

            if (error) throw error;
            console.log(applied
                ? `[Elite] Paddle access for ${userId}: ${isElite ? 'active' : 'inactive'} (${status || eventName}).`
                : `[Idempotence] Stale Paddle event ignored for ${userId}: ${eventName}.`);
        }

        if (REVOKE_EVENTS.has(eventName)) {
            if (!isEliteProduct(billingMeta)) {
                console.log(`[Ignore] Non Elite Paddle revocation for ${userId}: ${billingMeta.productId || billingMeta.priceId || billingMeta.productName}`);
                return jsonResponse(200, 'Non elite product ignored');
            }

            const { data: applied, error } = await applyEliteProfileUpdate(supabase, userId, buildEliteProfileUpdate({
                isElite: false,
                status: getPaddleStatus(body) || eventName,
                eventName,
                billingMeta
            }));

            if (error) throw error;
            console.log(applied
                ? `[Elite] Paddle access revoked for ${userId} (${eventName}).`
                : `[Idempotence] Stale Paddle revocation ignored for ${userId}: ${eventName}.`);
        }

        return jsonResponse(200, 'Webhook processed');
    } catch (error) {
        console.error('Paddle webhook error:', error);
        return jsonResponse(500, 'Internal Server Error');
    }
};

export {
    extractBillingMeta,
    extractUserId,
    getPaddleStatus,
    hasPaddleAccess,
    verifyPaddleSignature
};
