// V11-40 (V11-05, GAR-01, GAR-02): Garmin Connect, server side. DISABLED unless GARMIN_ENABLED=true and every secret below is set.
// Nothing in this file contains a Garmin key; the keys live only in the server environment (secret manager) and are never logged,
// never returned and never written to the database. No Garmin token is kept: the push model only needs the Garmin user id.
//   POST ?action=push&token=…   Garmin's push (activity summaries, deregistrations). Acknowledged only when the database took them.
//   POST ?action=start          signed-in player (Bearer) -> { url } to the Garmin consent screen (OAuth 2.0 + PKCE S256).
//   GET  ?action=callback       Garmin brings the player back with a code: exchange, read the Garmin user id, link, redirect to /profile.
// Garmin endpoints and payload field names are TO CONFIRM against the documentation delivered with the access (hence environment variables,
// no built-in default URL). The player must allow the source in TITAN first (titan_set_source_consent_v1('garmin', true)).
import crypto from 'node:crypto';

const MAX_BODY = 524288;
const MAX_ACTIVITIES = 100;
const STATE_TTL_MS = 10 * 60 * 1000;
const GARMIN_USER = /^[A-Za-z0-9_-]{1,128}$/;
const env = name => String(globalThis.Netlify?.env?.get(name) || '');
const reply = (status, body = '', headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status, headers: { ...(typeof body === 'string' ? {} : { 'content-type': 'application/json' }), 'cache-control': 'no-store', ...headers }
});
const b64u = buffer => Buffer.from(buffer).toString('base64url');

function sameSecret(given, expected) {
    const a = crypto.createHash('sha256').update(String(given)).digest(), b = crypto.createHash('sha256').update(String(expected)).digest();
    return crypto.timingSafeEqual(a, b);
}

async function network(url, init) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    let data = null;
    try { data = await response.json(); } catch (_) { /* Upstream bodies are never reflected. */ }
    return { ok: response.ok, status: response.status, data };
}

// The state carries the account id and the PKCE verifier: encrypted and authenticated, so it can be neither read nor forged.
export function sealState(payload, secret, now = Date.now()) {
    const key = crypto.createHash('sha256').update(String(secret)).digest(), iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify({ ...payload, e: now + STATE_TTL_MS }), 'utf8'), cipher.final()]);
    return b64u(Buffer.concat([iv, cipher.getAuthTag(), body]));
}
export function openState(state, secret, now = Date.now()) {
    try {
        const raw = Buffer.from(String(state), 'base64url');
        if (raw.length < 12 + 16 + 2) return null;
        const decipher = crypto.createDecipheriv('aes-256-gcm', crypto.createHash('sha256').update(String(secret)).digest(), raw.subarray(0, 12));
        decipher.setAuthTag(raw.subarray(12, 28));
        const data = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
        if (!data || typeof data.u !== 'string' || typeof data.v !== 'string' || !(data.e > now)) return null;
        return data;
    } catch (_) { return null; }
}

function configuration() {
    const c = {
        enabled: env('GARMIN_ENABLED') === 'true',
        url: env('SUPABASE_URL').replace(/\/+$/, ''), key: env('SUPABASE_SECRET_KEY'), publishable: env('SUPABASE_PUBLISHABLE_KEY'),
        clientId: env('GARMIN_CLIENT_ID'), clientSecret: env('GARMIN_CLIENT_SECRET'),
        authUrl: env('GARMIN_AUTH_URL'), tokenUrl: env('GARMIN_TOKEN_URL'), userIdUrl: env('GARMIN_USER_ID_URL'),
        redirect: env('GARMIN_REDIRECT_URI'), pushToken: env('GARMIN_PUSH_TOKEN'), stateKey: env('GARMIN_STATE_KEY')
    };
    const https = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.hash; } catch (_) { return false; } };
    c.valid = c.enabled && https(c.url) && !!c.key && !!c.publishable && !!c.clientId && !!c.clientSecret && https(c.authUrl) && https(c.tokenUrl)
        && https(c.userIdUrl) && https(c.redirect) && c.pushToken.length >= 24 && c.stateKey.length >= 32;
    return c;
}

export default async function handler(request) {
    const c = configuration();
    if (!c.valid) return reply(503);
    const params = new URL(request.url).searchParams, action = params.get('action');
    const databaseHeaders = { apikey: c.key, 'Content-Type': 'application/json', Accept: 'application/json' };
    if (!c.key.startsWith('sb_secret_')) databaseHeaders.Authorization = `Bearer ${c.key}`;
    const rpc = (name, payload) => network(`${c.url}/rest/v1/rpc/${name}`, { method: 'POST', headers: databaseHeaders, body: JSON.stringify(payload) });
    const profile = status => reply(302, '', { location: new URL(`/profile?garmin=${status}`, c.redirect).toString() });

    if (action === 'push') {
        if (request.method !== 'POST') return reply(405);
        if (!sameSecret(params.get('token') || '', c.pushToken)) return reply(401);
        let body;
        try {
            const raw = await request.text();
            if (Buffer.byteLength(raw, 'utf8') > MAX_BODY) return reply(413);
            body = JSON.parse(raw);
        } catch (_) { return reply(400); }
        const activities = Array.isArray(body?.activities) ? body.activities : [], deregistrations = Array.isArray(body?.deregistrations) ? body.deregistrations : [];
        if (activities.length + deregistrations.length > MAX_ACTIVITIES) return reply(413);
        try {
            for (const activity of activities) {
                const user = String(activity?.userId ?? '');
                if (!GARMIN_USER.test(user)) continue;
                const result = await rpc('titan_garmin_ingest_v1', { p_garmin_user: user, p_activity: activity });
                if (!result.ok) return reply(503);
            }
            for (const entry of deregistrations) {
                const user = String(entry?.userId ?? '');
                if (!GARMIN_USER.test(user)) continue;
                const result = await rpc('titan_garmin_deregister_v1', { p_garmin_user: user });
                if (!result.ok) return reply(503);
            }
        } catch (_) { return reply(503); }
        return reply(200);
    }

    if (action === 'start') {
        if (request.method !== 'POST') return reply(405);
        const bearer = request.headers.get('authorization') || '';
        if (!/^Bearer [A-Za-z0-9._~-]{20,8192}$/.test(bearer)) return reply(401, { error: 'authentication_required' });
        let user;
        try {
            const auth = await network(`${c.url}/auth/v1/user`, { method: 'GET', headers: { apikey: c.publishable, Authorization: bearer, Accept: 'application/json' } });
            user = auth.ok && typeof auth.data?.id === 'string' ? auth.data.id : null;
        } catch (_) { return reply(503); }
        if (!user) return reply(401, { error: 'authentication_required' });
        const verifier = b64u(crypto.randomBytes(48));
        const challenge = b64u(crypto.createHash('sha256').update(verifier).digest());
        const target = new URL(c.authUrl);
        target.searchParams.set('response_type', 'code');
        target.searchParams.set('client_id', c.clientId);
        target.searchParams.set('code_challenge', challenge);
        target.searchParams.set('code_challenge_method', 'S256');
        target.searchParams.set('redirect_uri', c.redirect);
        target.searchParams.set('state', sealState({ u: user, v: verifier }, c.stateKey));
        return reply(200, { url: target.toString() });
    }

    if (action === 'callback') {
        if (request.method !== 'GET') return reply(405);
        const state = openState(params.get('state') || '', c.stateKey), code = params.get('code') || '';
        if (!state || !/^[A-Za-z0-9._~\-/+=]{4,2048}$/.test(code)) return profile('error');
        try {
            const token = await network(c.tokenUrl, {
                method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
                body: new URLSearchParams({ grant_type: 'authorization_code', client_id: c.clientId, client_secret: c.clientSecret, code, code_verifier: state.v, redirect_uri: c.redirect }).toString()
            });
            if (!token.ok || typeof token.data?.access_token !== 'string') return profile('error');
            const who = await network(c.userIdUrl, { method: 'GET', headers: { Authorization: `Bearer ${token.data.access_token}`, Accept: 'application/json' } });
            const garminUser = String(who.data?.userId ?? '');
            if (!who.ok || !GARMIN_USER.test(garminUser)) return profile('error');
            const linked = await rpc('titan_garmin_link_v1', { p_user: state.u, p_garmin_user: garminUser });
            if (linked.ok) return profile('ok');
            const code23505 = linked.data?.code === '23505' || /GARMIN_ALREADY_LINKED/.test(String(linked.data?.message || ''));
            if (code23505) return profile('conflict');
            if (/CONSENT_REQUIRED/.test(String(linked.data?.message || ''))) return profile('consent');
            return profile('error');
        } catch (_) { return profile('error'); }
    }

    return reply(404);
}
