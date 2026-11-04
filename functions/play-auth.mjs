// Pub/Sub "authenticated push": Google signs a JWT (RS256) with the push subscription's service account.
// Verified here against Google's published keys, with audience and service-account e-mail pinned by configuration.
import crypto from 'node:crypto';

const CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
let cache = { at: 0, keys: null };

async function googleKeys(now) {
    if (cache.keys && now - cache.at < 3_600_000) return cache.keys;
    const response = await fetch(CERTS, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error('JWKS_UNAVAILABLE');
    const body = await response.json();
    if (!Array.isArray(body?.keys)) throw new Error('JWKS_INVALID');
    cache = { at: now, keys: body.keys };
    return cache.keys;
}
export const _resetKeysForTests = () => { cache = { at: 0, keys: null }; };

const decode = part => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

/** True only for a currently valid Google-signed token issued for this audience to this service account. */
export async function verifyPubSubJwt(authorization, { audience, email, now = Date.now() }) {
    const match = /^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(authorization || '');
    if (!match || !audience || !email) return false;
    try {
        const [, h, p, sig] = match;
        const header = decode(h), claims = decode(p);
        if (header.alg !== 'RS256' || typeof header.kid !== 'string') return false;
        const jwk = (await googleKeys(now)).find(k => k.kid === header.kid && k.kty === 'RSA');
        if (!jwk) return false;
        const ok = crypto.createVerify('RSA-SHA256').update(`${h}.${p}`).verify(crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(sig, 'base64url'));
        if (!ok) return false;
        const seconds = Math.floor(now / 1000);
        return ['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) && claims.aud === audience
            && claims.email === email && claims.email_verified === true && Number(claims.exp) > seconds - 60 && Number(claims.iat) < seconds + 300;
    } catch (_) { return false; }
}
