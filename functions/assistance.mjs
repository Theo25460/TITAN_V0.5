import { randomUUID } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>,;():"\x00-\x1f\x7f]+@[^\s@<>,;():"\x00-\x1f\x7f]+\.[^\s@<>,;():"\x00-\x1f\x7f]+$/;
const CATEGORIES = new Set(['bug', 'compte', 'titanplus', 'donnees', 'communaute', 'autre']);
const MAX_BODY = 24 * 1024;
const env = name => globalThis.Netlify?.env?.get(name) || '';
const validEmail = value => typeof value === 'string' && value.length <= 320 && EMAIL.test(value);
const reply = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const unavailable = () => reply(503, { error: 'unavailable', uncertain: true, fallback: '/service#help-contact' });
const receipt = (reference, sent = false) => reply(sent ? 200 : 202, { accepted: true, reference, notification: sent ? 'sent' : 'pending', fallback: '/service#help-contact' });

function validInput(body) {
    return body !== null && typeof body === 'object' && !Array.isArray(body)
        && Object.keys(body).length === 4 && ['request_id', 'category', 'message', 'reply_allowed'].every(key => Object.hasOwn(body, key))
        && typeof body.request_id === 'string' && UUID.test(body.request_id) && CATEGORIES.has(body.category) && typeof body.reply_allowed === 'boolean'
        && typeof body.message === 'string' && Array.from(body.message.trim()).length >= 10 && Array.from(body.message).length <= 4000
        && body.message.isWellFormed() && Buffer.byteLength(body.message, 'utf8') <= 16 * 1024 && !/[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(body.message);
}

async function boundedBody(request) {
    const reader = request.body?.getReader();
    if (!reader) return '';
    let length = 0; const chunks = [];
    try {
        for (;;) {
            const { done, value } = await reader.read(); if (done) break;
            length += value.byteLength;
            if (length > MAX_BODY) { await reader.cancel(); return null; }
            chunks.push(value);
        }
        return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    } finally { reader.releaseLock(); }
}

async function network(url, init) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(8_000) });
    let data = null; try { data = await response.json(); } catch (_) { /* Do not reflect upstream bodies. */ }
    return { ok: response.ok, status: response.status, data };
}

export default async function handler(request) {
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('content-type') || '')) return reply(415, { error: 'json_required' });
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return reply(403, { error: 'origin_refused' });
    const url = env('SUPABASE_URL').replace(/\/+$/, '');
    const key = env('SUPABASE_SECRET_KEY'), publishable = env('SUPABASE_PUBLISHABLE_KEY');
    const providerKey = env('RESEND_API_KEY'), sender = env('TITAN_SUPPORT_FROM');
    let validUrl = false;
    try { const parsed = new URL(url); validUrl = parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash; } catch (_) { /* Fail closed. */ }
    if (env('TITAN_SUPPORT_ENABLED') !== 'true' || !validUrl || !key || !publishable || !providerKey || !validEmail(sender)) return unavailable();
    const bearer = request.headers.get('authorization') || '';
    if (!/^Bearer [A-Za-z0-9._~-]{20,8192}$/.test(bearer)) return reply(401, { error: 'authentication_required' });
    let body;
    try {
        const raw = await boundedBody(request);
        if (raw === null) return reply(413, { error: 'body_too_large' });
        body = JSON.parse(raw);
        if (!validInput(body)) return reply(400, { error: 'invalid_request' });
    } catch (_) { return reply(400, { error: 'invalid_request' }); }

    const databaseHeaders = { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json' };
    if (!key.startsWith('sb_secret_')) databaseHeaders.Authorization = `Bearer ${key}`;
    const rpc = (name, payload) => network(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers: databaseHeaders, body: JSON.stringify(payload) });
    let owner, accepted;
    try {
        const auth = await network(`${url}/auth/v1/user`, { method: 'GET', headers: { apikey: publishable, Authorization: bearer, Accept: 'application/json' } });
        if (!auth.ok) return auth.status === 401 || auth.status === 403 ? reply(401, { error: 'authentication_required' }) : unavailable();
        owner = auth.data;
        if (!owner || typeof owner.id !== 'string' || !UUID.test(owner.id) || owner.is_anonymous !== false || !owner.email_confirmed_at || !validEmail(owner.email)) return reply(401, { error: 'authentication_required' });
        accepted = await rpc('titan_support_accept_v300', { p_user_id: owner.id, p_request_id: body.request_id, p_category: body.category, p_message: body.message, p_reply_allowed: body.reply_allowed });
        if (!accepted.ok) {
            const errors = { SUPPORT_RATE_LIMIT: [429, 'rate_limit'], SUPPORT_REQUEST_CONFLICT: [409, 'request_conflict'], SUPPORT_ACCOUNT_UNAVAILABLE: [403, 'account_unavailable'] };
            const mapped = Object.hasOwn(errors, accepted.data?.message) ? errors[accepted.data.message] : null;
            return mapped ? reply(mapped[0], { error: mapped[1], fallback: '/service#help-contact' }) : unavailable();
        }
        if (typeof accepted.data?.reference !== 'string' || !UUID.test(accepted.data.reference) || !['pending', 'sent'].includes(accepted.data?.notification)) return unavailable();
    } catch (_) { return unavailable(); }

    const reference = accepted.data.reference;
    if (accepted.data.notification === 'sent') return receipt(reference, true);
    // Once received, every later failure retains a real reference and never claims rejection.
    const lease = randomUUID();
    try {
        const claimed = await rpc('titan_support_claim_v300', { p_user_id: owner.id, p_request_id: body.request_id, p_lease_id: lease, p_from: sender });
        if (!claimed.ok) return receipt(reference);
        if (claimed.data?.notification === 'sent') return receipt(reference, true);
        const ticket = claimed.data;
        if (ticket?.notification !== 'claimed' || ticket.reference !== reference || ticket.category !== body.category || ticket.message !== body.message
            || !validEmail(ticket.from) || (ticket.reply_email !== null && (!body.reply_allowed || !validEmail(ticket.reply_email)))) return receipt(reference);
        const payload = { from: ticket.from, to: ['titanteam.app@gmail.com'], subject: `TITAN — Assistance — ${ticket.category} — ${reference}`,
            text: `Demande reçue : ${reference}\nCatégorie : ${ticket.category}\n\n${ticket.message}` };
        if (ticket.reply_email !== null) payload.reply_to = ticket.reply_email;
        let sent = false, providerId = null;
        try {
            const result = await network('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${providerKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `titan-support/${reference}` }, body: JSON.stringify(payload) });
            if (result.ok && typeof result.data?.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(result.data.id)) { sent = true; providerId = result.data.id; }
        } catch (_) { /* A timeout is uncertain; retry keeps the same provider key and payload. */ }
        const finished = await rpc('titan_support_finish_v300', { p_user_id: owner.id, p_request_id: body.request_id, p_lease_id: lease, p_sent: sent, p_provider_id: providerId });
        return receipt(reference, sent && finished.ok && finished.data === true);
    } catch (_) { return receipt(reference); }
}
