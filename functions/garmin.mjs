// V11-40 (V11-05, GAR-01, GAR-02): Garmin Connect, server side. DISABLED unless GARMIN_ENABLED=true and every secret below is set.
// Nothing in this file contains a Garmin key; the keys live only in the server environment (secret manager) and are never logged,
// never returned and never written to the database. The player's Garmin tokens are kept only as ciphertext (AES-256-GCM, key GARMIN_TOKEN_KEY,
// bound to the account), solely to renew the access and to withdraw TITAN at Garmin when the player disconnects.
//   POST ?action=push&token=…   Garmin's push (activities, deregistrations, permission changes). Acknowledged only when the database took them.
//   POST ?action=start          signed-in player (Bearer) -> { url } to the Garmin consent screen (OAuth 2.0 + PKCE S256).
//   GET  /auth/garmin/callback  (rewritten to ?action=callback in netlify.toml; the registered return address is kept exactly) Garmin brings
//                               the player back with a code or an error. The browser proves it initiated the attempt with a cookie.
//   POST ?action=complete       Both clients prove the initiating TITAN account before exchange. Web uses an HttpOnly handoff.
//   POST ?action=disconnect     signed-in player (Bearer): withdraw TITAN at Garmin (best effort), then end the link and erase the tokens.
// Garmin endpoints and payload field names are TO CONFIRM against the documentation delivered with the access (hence environment variables,
// no built-in default URL). The player must allow the source in TITAN first (titan_set_source_consent_v1('garmin', true)).
import crypto from 'node:crypto';
import { readBoundedBytes } from './request-body.mjs';

const MAX_BODY = 524288;
const MAX_ACTIVITIES = 100;
const STATE_TTL_MS = 10 * 60 * 1000;
const HANDOFF_TTL_MS = 2 * 60 * 1000;
const STATE_COOKIE = '__Host-titan-garmin-nonce';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GARMIN_USER = /^[A-Za-z0-9_-]{1,128}$/;
const CODE = /^[A-Za-z0-9._~\-/+=]{4,2048}$/;
const ACTIVITY_PERMISSION = 'ACTIVITY_EXPORT';
const ACTIVITY_FIELDS = ['summaryId', 'activityType', 'startTimeInSeconds', 'durationInSeconds', 'distanceInMeters'];
const env = name => String(globalThis.Netlify?.env?.get(name) || '');
const reply = (status, body = '', headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status, headers: { ...(typeof body === 'string' ? {} : { 'content-type': 'application/json' }), 'cache-control': 'no-store',
        'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', ...headers }
});
const b64u = buffer => Buffer.from(buffer).toString('base64url');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const oauthAttempt = state => ({ p_user: state.u, p_nonce_hash: digest(state.n) });
const stateCookie = (value, age) => `${STATE_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
const getStateCookie = request => (request.headers.get('cookie') || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(`${STATE_COOKIE}=`))?.slice(STATE_COOKIE.length + 1);
const outcome = (garmin, reason) => ({ garmin, ...(reason ? { garmin_reason: reason } : {}) });

function sameSecret(given, expected) {
    const a = crypto.createHash('sha256').update(String(given)).digest(), b = crypto.createHash('sha256').update(String(expected)).digest();
    return crypto.timingSafeEqual(a, b);
}

async function network(url, init) {
    const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10_000) });
    let data = null;
    try { data = await response.json(); } catch (_) { /* Upstream bodies are never reflected. */ }
    return { ok: response.ok, status: response.status, data };
}

// The state carries the account id and the PKCE verifier: encrypted and authenticated, so it can be neither read nor forged.
export function sealState(payload, secret, now = Date.now(), expiresAt = now + STATE_TTL_MS) {
    const key = crypto.createHash('sha256').update(String(secret)).digest(), iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify({ ...payload, e: expiresAt }), 'utf8'), cipher.final()]);
    return b64u(Buffer.concat([iv, cipher.getAuthTag(), body]));
}
export function openState(state, secret, now = Date.now()) {
    if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{32,4096}$/.test(state)) return null;
    try {
        const raw = Buffer.from(state, 'base64url');
        if (raw.length < 12 + 16 + 2) return null;
        const decipher = crypto.createDecipheriv('aes-256-gcm', crypto.createHash('sha256').update(String(secret)).digest(), raw.subarray(0, 12));
        decipher.setAuthTag(raw.subarray(12, 28));
        const data = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
        if (!data || typeof data.u !== 'string' || typeof data.v !== 'string' || !(data.e > now)) return null;
        return data;
    } catch (_) { return null; }
}

function validAttempt(state) {
    return state && UUID.test(state.u) && /^[A-Za-z0-9_-]{43}$/.test(state.n)
        && /^[A-Za-z0-9._~-]{43,128}$/.test(state.v) && (state.r === undefined || state.r === 'android');
}

// A token is sealed before it reaches the database, bound to the account (a ciphertext copied to another account does not open).
export function sealSecret(plain, secret, account) {
    const key = crypto.createHash('sha256').update(`token:${secret}`).digest(), iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(String(account)));
    const body = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    return b64u(Buffer.concat([iv, cipher.getAuthTag(), body]));
}
export function openSecret(sealed, secret, account) {
    try {
        const raw = Buffer.from(String(sealed), 'base64url');
        const decipher = crypto.createDecipheriv('aes-256-gcm', crypto.createHash('sha256').update(`token:${secret}`).digest(), raw.subarray(0, 12));
        decipher.setAAD(Buffer.from(String(account)));
        decipher.setAuthTag(raw.subarray(12, 28));
        return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    } catch (_) { return null; }
}

function configuration() {
    const c = {
        enabled: env('GARMIN_ENABLED') === 'true',
        url: env('SUPABASE_URL').replace(/\/+$/, ''), key: env('SUPABASE_SECRET_KEY'), publishable: env('SUPABASE_PUBLISHABLE_KEY'),
        clientId: env('GARMIN_CLIENT_ID'), clientSecret: env('GARMIN_CLIENT_SECRET'),
        authUrl: env('GARMIN_AUTH_URL'), tokenUrl: env('GARMIN_TOKEN_URL'), userIdUrl: env('GARMIN_USER_ID_URL'),
        redirect: env('GARMIN_REDIRECT_URI'), pushToken: env('GARMIN_PUSH_TOKEN'), stateKey: env('GARMIN_STATE_KEY'), tokenKey: env('GARMIN_TOKEN_KEY'),
        permissionsUrl: env('GARMIN_PERMISSIONS_URL'), registrationUrl: env('GARMIN_REGISTRATION_URL')
    };
    const https = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.hash; } catch (_) { return false; } };
    const providerUrl = value => {
        if (!https(value)) return false;
        const { hostname, port } = new URL(value);
        return !port && (hostname === 'garmin.com' || hostname.endsWith('.garmin.com'));
    };
    c.valid = c.enabled && https(c.url) && !!c.key && !!c.publishable && !!c.clientId && !!c.clientSecret && providerUrl(c.authUrl) && providerUrl(c.tokenUrl)
        && providerUrl(c.userIdUrl) && https(c.redirect) && c.pushToken.length >= 24 && c.stateKey.length >= 32 && c.tokenKey.length >= 32
        && (!c.permissionsUrl || providerUrl(c.permissionsUrl)) && (!c.registrationUrl || providerUrl(c.registrationUrl));
    return c;
}

export default async function handler(request) {
    const c = configuration();
    if (!c.valid) return reply(503, { error: 'GARMIN_CONFIGURATION' });
    const requestUrl = new URL(request.url), params = requestUrl.searchParams;
    // The registered return address is /auth/garmin/callback: it is a callback whatever the rewrite did to the query.
    const action = requestUrl.pathname === '/auth/garmin/callback' ? 'callback' : params.get('action');
    const siteOrigin = new URL(c.redirect).origin;
    const databaseHeaders = { apikey: c.key, 'Content-Type': 'application/json', Accept: 'application/json' };
    if (!c.key.startsWith('sb_secret_')) databaseHeaders.Authorization = `Bearer ${c.key}`;
    const rpc = (name, payload) => network(`${c.url}/rest/v1/rpc/${name}`, { method: 'POST', headers: databaseHeaders, body: JSON.stringify(payload) });
    const profile = (result, { android = false, handoff, cookie } = {}) => {
        const target = android ? new URL('titan://garmin') : new URL('/profile', siteOrigin);
        target.search = new URLSearchParams(result).toString();
        if (handoff) target.hash = new URLSearchParams({ handoff }).toString();
        return reply(302, '', { location: target.toString(), ...(cookie ? { 'set-cookie': cookie } : {}) });
    };

    if (action === 'push') {
        if (request.method !== 'POST') return reply(405);
        if (!sameSecret(params.get('token') || '', c.pushToken)) return reply(401);
        let body;
        try {
            const raw = await readBoundedBytes(request, MAX_BODY);
            if (raw === null) return reply(413);
            body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
            if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400);
        } catch (_) { return reply(400); }
        // Summaries only (priority 1): activities, and the ones the player edited on Garmin (same shape, replays are ignored). Details, files, MoveIQ
        // and every health stream are acknowledged and not collected (GAR-13).
        const list = key => Array.isArray(body?.[key]) ? body[key] : [];
        const activities = [...list('activities'), ...list('manuallyUpdatedActivities')], deregistrations = list('deregistrations'), permissionChanges = list('userPermissionsChange');
        if (activities.length + deregistrations.length + permissionChanges.length > MAX_ACTIVITIES) return reply(413);
        try {
            // A withdrawal in this envelope takes precedence over every summary for that Garmin identity.
            const ended = new Set([...deregistrations.map(entry => String(entry?.userId ?? '')),
                ...permissionChanges.filter(entry => Array.isArray(entry?.permissions) && entry.permissions.every(p => typeof p === 'string')
                    && !entry.permissions.includes(ACTIVITY_PERMISSION)).map(entry => String(entry?.userId ?? ''))]);
            for (const user of ended) {
                if (!GARMIN_USER.test(user)) continue;
                const result = await rpc('titan_garmin_deregister_v1', { p_garmin_user: user });
                if (!result.ok) return reply(503);
            }
            for (const activity of activities) {
                const user = String(activity?.userId ?? '');
                if (!GARMIN_USER.test(user) || ended.has(user)) continue;
                const summary = Object.fromEntries(ACTIVITY_FIELDS.map(key => [key, activity[key]])
                    .filter(([, value]) => (typeof value === 'string' && value.length <= 128) || Number.isFinite(value)));
                const result = await rpc('titan_garmin_ingest_v1', { p_garmin_user: user, p_activity: summary });
                if (!result.ok) return reply(503);
            }
        } catch (_) { return reply(503); }
        return reply(200);
    }

    let user;
    if (action === 'start' || action === 'complete' || action === 'disconnect') {
        if (request.method !== 'POST') return reply(405);
        const origin = request.headers.get('origin');
        if (requestUrl.origin !== siteOrigin || (origin && origin !== siteOrigin)) return reply(403, { error: 'origin_refused' });
        const bearer = request.headers.get('authorization') || '';
        if (!/^Bearer [A-Za-z0-9._~-]{20,8192}$/.test(bearer)) return reply(401, { error: 'authentication_required' });
        try {
            const auth = await network(`${c.url}/auth/v1/user`, { method: 'GET', headers: { apikey: c.publishable, Authorization: bearer, Accept: 'application/json' } });
            if (!auth.ok && auth.status !== 401 && auth.status !== 403) return reply(503);
            user = auth.ok && typeof auth.data?.id === 'string' && UUID.test(auth.data.id) && auth.data.is_anonymous !== true ? auth.data.id : null;
        } catch (_) { return reply(503); }
        if (!user) return reply(401, { error: 'authentication_required' });
    }

    if (action === 'start') {
        if (!c.permissionsUrl) return reply(503, { error: 'GARMIN_CONFIGURATION' });
        const android = params.get('client') === 'android';
        if (android && params.get('flow') !== 'handoff') return reply(426, { error: 'GARMIN_APP_UPDATE_REQUIRED' });
        const verifier = b64u(crypto.randomBytes(48));
        const challenge = b64u(crypto.createHash('sha256').update(verifier).digest());
        const nonce = b64u(crypto.randomBytes(32));
        const state = { u: user, v: verifier, n: nonce, ...(android ? { r: 'android' } : {}) };
        try {
            const started = await rpc('titan_garmin_oauth_start_v1', oauthAttempt(state));
            if (started.status === 429) return reply(429, { error: 'rate_limited' });
            if (started.data?.message === 'CONSENT_REQUIRED') return reply(403, { error: 'consent_required' });
            if (!started.ok || started.data !== true) return reply(503);
        } catch (_) { return reply(503); }
        const target = new URL(c.authUrl);
        target.searchParams.set('response_type', 'code');
        target.searchParams.set('client_id', c.clientId);
        target.searchParams.set('code_challenge', challenge);
        target.searchParams.set('code_challenge_method', 'S256');
        target.searchParams.set('redirect_uri', c.redirect);
        target.searchParams.set('state', sealState(state, c.stateKey));
        return reply(200, { url: target.toString() }, android ? {} : { 'set-cookie': stateCookie(nonce, STATE_TTL_MS / 1000) });
    }

    const redeem = async (state, code) => {
        let stage = 'state';
        try {
            const consumed = await rpc('titan_garmin_oauth_consume_v1', oauthAttempt(state));
            if (!consumed.ok || consumed.data !== true) return outcome('error', stage);
            if (code === null) return outcome('refused');
            if (!CODE.test(code)) return outcome('error', 'code');
            stage = 'token';
            const token = await network(c.tokenUrl, {
                method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
                body: new URLSearchParams({ grant_type: 'authorization_code', client_id: c.clientId, client_secret: c.clientSecret, code, code_verifier: state.v, redirect_uri: c.redirect }).toString()
            });
            if (!token.ok || typeof token.data?.access_token !== 'string' || !token.data.access_token || token.data.access_token.length > 6000) return outcome('error', stage);
            const bearerHeaders = { Authorization: `Bearer ${token.data.access_token}`, Accept: 'application/json' };
            stage = 'identity';
            const who = await network(c.userIdUrl, { method: 'GET', headers: bearerHeaders });
            const garminUser = String(who.data?.userId ?? '');
            if (!who.ok || !GARMIN_USER.test(garminUser)) return outcome('error', stage);
            // Permissions actually granted (GAR-12). A list that does not include any activity access means the player unticked it on Garmin.
            stage = 'permissions';
            if (!c.permissionsUrl) return outcome('error', stage);
            const granted = await network(c.permissionsUrl, { method: 'GET', headers: bearerHeaders });
            const names = Array.isArray(granted.data) ? granted.data : granted.data?.permissions;
            if (!granted.ok || !Array.isArray(names) || !names.every(name => typeof name === 'string')) return outcome('error', stage);
            if (!names.includes(ACTIVITY_PERMISSION)) return outcome('permission');
            stage = 'link';
            const lifetime = Number(token.data.expires_in), refresh = token.data.refresh_token;
            const expiresAt = Number.isFinite(lifetime) && lifetime > 0 && lifetime <= 31_536_000 ? new Date(Date.now() + lifetime * 1000).toISOString() : null;
            const linked = await rpc('titan_garmin_oauth_link_v1', {
                ...oauthAttempt(state), p_garmin_user: garminUser, p_access_enc: sealSecret(token.data.access_token, c.tokenKey, state.u),
                p_refresh_enc: typeof refresh === 'string' && refresh && refresh.length <= 6000 ? sealSecret(refresh, c.tokenKey, state.u) : null, p_expires_at: expiresAt
            });
            if (!linked.ok) {
                if (linked.data?.code === '23505' || linked.data?.message === 'GARMIN_ALREADY_LINKED') return outcome('conflict');
                if (linked.data?.message === 'CONSENT_REQUIRED') return outcome('consent');
                if (linked.data?.message === 'GARMIN_STATE_INVALID') return outcome('error', 'state');
                return outcome('error', stage);
            }
            return linked.data?.linked === true ? outcome('ok') : outcome('error', stage);
        } catch (_) { return outcome('error', stage); }
    };

    if (action === 'callback') {
        if (request.method !== 'GET') return reply(405);
        if (requestUrl.origin !== siteOrigin) return reply(403);
        const state = openState(params.get('state'), c.stateKey);
        if (!validAttempt(state) || state.code !== undefined) return profile(outcome('error', 'state'));
        const android = state.r === 'android';
        const cookie = getStateCookie(request);
        if (!android && (!cookie || !sameSecret(cookie, state.n))) return profile(outcome('error', 'state'));
        const code = params.get('error') ? null : params.get('code') || '';
        const cleared = android ? { android } : { cookie: stateCookie('', 0) };
        if (code === null) return profile(android ? outcome('refused') : await redeem(state, code), cleared);
        if (!CODE.test(code)) return profile(outcome('error', 'code'), cleared);
        const now = Date.now();
        const handoff = sealState({ ...state, code }, c.stateKey, now, Math.min(state.e, now + HANDOFF_TTL_MS));
        return profile(outcome('complete'), android ? { android, handoff } : { cookie: stateCookie(handoff, HANDOFF_TTL_MS / 1000) });
    }

    if (action === 'complete') {
        const contentType = request.headers.get('content-type');
        const android = /^application\/json(?:\s*;.*)?$/i.test(contentType || '');
        if (contentType && !android) return reply(415);
        let handoff = getStateCookie(request);
        if (android) {
            try {
                const raw = await readBoundedBytes(request, 8 * 1024);
                if (raw === null) return reply(413);
                handoff = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw))?.handoff;
            } catch (_) { return reply(400); }
        }
        const headers = android ? {} : { 'set-cookie': stateCookie('', 0) };
        const state = openState(handoff, c.stateKey);
        if (!validAttempt(state) || (state.r === 'android') !== android || typeof state.code !== 'string') return reply(400, outcome('error', 'state'), headers);
        if (state.u !== user) return reply(403, outcome('error', 'state'), headers);
        return reply(200, await redeem(state, state.code), headers);
    }

    if (action === 'disconnect') {
        // Withdraw TITAN at Garmin first, on a best-effort basis: whatever Garmin answers, the local link and tokens end (the player's right to leave).
        let provider = 'skipped';
        try {
            if (c.registrationUrl) {
                const stored = await rpc('titan_garmin_tokens_get_v1', { p_user: user });
                const row = stored.ok ? stored.data : null;
                let access = row?.access_enc ? openSecret(row.access_enc, c.tokenKey, user) : null;
                const expired = row?.access_expires_at && Date.parse(row.access_expires_at) < Date.now() + 60_000;
                const refresh = row?.refresh_enc ? openSecret(row.refresh_enc, c.tokenKey, user) : null;
                if ((expired || !access) && refresh) {
                    const renewed = await network(c.tokenUrl, {
                        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
                        body: new URLSearchParams({ grant_type: 'refresh_token', client_id: c.clientId, client_secret: c.clientSecret, refresh_token: refresh }).toString()
                    });
                    access = renewed.ok && typeof renewed.data?.access_token === 'string' ? renewed.data.access_token : null;
                }
                if (access) {
                    const removed = await network(c.registrationUrl, { method: 'DELETE', headers: { Authorization: `Bearer ${access}`, Accept: 'application/json' } });
                    provider = removed.ok || removed.status === 204 ? 'withdrawn' : 'refused';
                } else provider = 'unavailable';
            }
        } catch (_) { provider = 'unavailable'; }
        try {
            const ended = await rpc('titan_garmin_unlink_for_v1', { p_user: user });
            if (!ended.ok) return reply(503);
        } catch (_) { return reply(503); }
        return reply(200, { linked: false, provider });
    }

    return reply(404);
}
