import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import handler from '../functions/assistance.mjs';

const USER = '00000000-0000-4000-8000-000000000046';
const REQUEST = '00000000-0000-4000-8000-000000000001';
const REFERENCE = '00000000-0000-4000-8000-000000000002';
const MESSAGE = 'Une demande fictive avec <script> et une nouvelle ligne.\nMerci.';
const INPUT = { request_id: REQUEST, category: 'bug', message: MESSAGE, reply_allowed: false };
const ENV = {
    TITAN_SUPPORT_ENABLED: 'true', SUPABASE_URL: 'https://database.example.test',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fake', SUPABASE_SECRET_KEY: 'sb_secret_fake',
    RESEND_API_KEY: 're_fake', TITAN_SUPPORT_FROM: 'assistance@example.test'
};

function request(body = INPUT, headers = {}) {
    return new Request('https://titan.example.test/functions/assistance', {
        method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer fake-token-used-only-in-tests', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body)
    });
}
function json(body, status = 200) { return Response.json(body, { status }); }
async function runtime(callback, { env = {}, responses = {}, user = {}, reply = null } = {}) {
    const previousNetlify = globalThis.Netlify, previousFetch = globalThis.fetch;
    const calls = [];
    globalThis.Netlify = { env: { get: name => ({ ...ENV, ...env })[name] || '' } };
    globalThis.fetch = async (url, init) => {
        const path = new URL(url).pathname;
        const body = init.body ? JSON.parse(init.body) : null;
        calls.push({ url, path, init, body });
        if (Object.hasOwn(responses, path)) return typeof responses[path] === 'function' ? responses[path](body, init) : responses[path];
        if (path === '/auth/v1/user') return json({ id: USER, is_anonymous: false, email: 'verified@example.test', email_confirmed_at: '2026-10-11T12:00:00Z', ...user });
        if (path.endsWith('/titan_support_accept_v300')) return json({ reference: REFERENCE, notification: 'pending' });
        if (path.endsWith('/titan_support_claim_v300')) return json({ reference: REFERENCE, notification: 'claimed', category: INPUT.category, message: MESSAGE, reply_email: reply, from: 'frozen@example.test' });
        if (path === '/emails') return json({ id: 'email-fake-1' });
        if (path.endsWith('/titan_support_finish_v300')) return json(true);
        throw Error('Unexpected network call');
    };
    try { return await callback(calls); }
    finally { globalThis.fetch = previousFetch; if (previousNetlify === undefined) delete globalThis.Netlify; else globalThis.Netlify = previousNetlify; }
}

test('support: unsupported method and content type never make network calls', async () => runtime(async calls => {
    assert.equal((await handler(new Request('https://titan.example.test/functions/assistance'))).status, 405);
    assert.equal((await handler(request(INPUT, { 'content-type': 'text/plain' }))).status, 415);
    assert.equal(calls.length, 0);
}));
test('support: disabled or incomplete configuration fails closed without storing or sending', async () => {
    for (const env of [{ TITAN_SUPPORT_ENABLED: '' }, { RESEND_API_KEY: '' }, { SUPABASE_URL: 'http://unsafe.test' }, { TITAN_SUPPORT_FROM: 'x@example.test\nBcc: secret@example.test' }]) {
        await runtime(async calls => { const response = await handler(request()); assert.equal(response.status, 503); assert.equal(calls.length, 0); }, { env });
    }
});
test('support: oversized streamed bodies and malformed JSON are rejected before Auth', async () => runtime(async calls => {
    assert.equal((await handler(request('x'.repeat(24 * 1024 + 1)))).status, 413);
    assert.equal((await handler(request('{bad'))).status, 400);
    assert.equal(calls.length, 0);
}));
test('support: strict payload refuses identities, diagnostics, attachments, invalid categories and controls', async () => runtime(async calls => {
    const bad = [null, [], { ...INPUT, user_id: USER }, { ...INPUT, email: 'attacker@example.test' }, { ...INPUT, diagnostics: {} }, { ...INPUT, attachments: [] },
        { ...INPUT, category: 'unknown' }, { ...INPUT, reply_allowed: 'true' }, { ...INPUT, request_id: 'not-a-uuid' }, { ...INPUT, request_id: [REQUEST] }, { ...INPUT, message: 'short' },
        { ...INPUT, message: 'a'.repeat(4001) }, { ...INPUT, message: 'private\u0000value' }, { ...INPUT, message: 'private\rvalue' },
        { ...INPUT, message: 'private\u0085value' }, { ...INPUT, message: 'private\ud800value' }];
    for (const payload of bad) assert.equal((await handler(request(JSON.stringify(payload)))).status, 400, JSON.stringify(payload).slice(0, 80));
    assert.equal(calls.length, 0);
}));
test('support: missing bearer, cross-origin, anonymous, unconfirmed and malformed users are refused', async () => {
    await runtime(async calls => {
        assert.equal((await handler(request(INPUT, { Authorization: '' }))).status, 401);
        assert.equal((await handler(request(INPUT, { origin: 'https://attacker.test' }))).status, 403);
        assert.equal(calls.length, 0);
    });
    for (const user of [{ is_anonymous: true }, { id: 'bad' }, { id: [USER] }, { email_confirmed_at: null }, { email: null }]) {
        await runtime(async calls => { assert.equal((await handler(request())).status, 401); assert.deepEqual(calls.map(c => c.path), ['/auth/v1/user']); }, { user });
    }
});
test('support: Auth server verifies bearer; validated actor and consent reach the service-only RPC', async () => runtime(async calls => {
    const response = await handler(request()); assert.equal(response.status, 200);
    assert.equal(calls[0].url, `${ENV.SUPABASE_URL}/auth/v1/user`);
    assert.equal(calls[0].init.headers.apikey, ENV.SUPABASE_PUBLISHABLE_KEY);
    assert.equal(calls[0].init.headers.Authorization, 'Bearer fake-token-used-only-in-tests');
    assert.deepEqual(calls[1].body, { p_user_id: USER, p_request_id: REQUEST, p_category: 'bug', p_message: MESSAGE, p_reply_allowed: false });
    assert.equal(calls[1].init.headers.apikey, ENV.SUPABASE_SECRET_KEY);
    assert.equal(calls[1].init.headers.Authorization, undefined);
    assert.ok(calls.every(c => c.init.signal instanceof AbortSignal));
}));
test('support: team email uses a frozen sender, plain text and stable idempotency, without a reply-to by default', async () => runtime(async calls => {
    const response = await handler(request()); assert.deepEqual(await response.json(), { accepted: true, reference: REFERENCE, notification: 'sent', fallback: '/service#help-contact' });
    const email = calls.find(c => c.path === '/emails');
    assert.equal(email.url, 'https://api.resend.com/emails');
    assert.deepEqual(email.body.to, ['titanteam.app@gmail.com']);
    assert.equal(email.body.from, 'frozen@example.test');
    assert.equal(email.body.reply_to, undefined); assert.equal(email.body.html, undefined); assert.equal(email.body.attachments, undefined);
    assert.equal(email.init.headers['Idempotency-Key'], `titan-support/${REFERENCE}`);
    assert.equal(email.init.headers.Authorization, 'Bearer re_fake');
    assert.ok(email.body.text.includes(MESSAGE)); assert.ok(email.body.subject.includes(REFERENCE));
    assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('access-control-allow-origin'), null);
    const finish = calls.find(c => c.path.endsWith('/titan_support_finish_v300'));
    assert.equal(finish.body.p_sent, true); assert.equal(finish.body.p_provider_id, 'email-fake-1');
}));
test('support: consenting reply-to comes from the stored verified account, never form data', async () => runtime(async calls => {
    assert.equal((await handler(request({ ...INPUT, reply_allowed: true }))).status, 200);
    assert.equal(calls[1].body.p_reply_allowed, true);
    assert.equal(calls.find(c => c.path === '/emails').body.reply_to, 'verified@example.test');
}, { reply: 'verified@example.test' }));
test('support: legacy service-role key uses its bearer only for database calls', async () => runtime(async calls => {
    assert.equal((await handler(request())).status, 200);
    assert.equal(calls[1].init.headers.Authorization, 'Bearer legacy-secret-jwt');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer fake-token-used-only-in-tests');
}, { env: { SUPABASE_SECRET_KEY: 'legacy-secret-jwt' } }));
test('support: database quota, conflicts and blocked accounts return bounded errors with no mail', async () => {
    for (const [message, status] of [['SUPPORT_RATE_LIMIT', 429], ['SUPPORT_REQUEST_CONFLICT', 409], ['SUPPORT_ACCOUNT_UNAVAILABLE', 403]]) {
        await runtime(async calls => { const response = await handler(request()); assert.equal(response.status, status); assert.equal(calls.length, 2); assert.doesNotMatch(await response.text(), /secret|raw details/); },
            { responses: { '/rest/v1/rpc/titan_support_accept_v300': json({ message, details: 'raw details secret' }, 400) } });
    }
});
test('support: network or malformed receipt failures never invent a ticket reference', async () => {
    for (const responses of [
        { '/auth/v1/user': () => { throw Error('private upstream secret'); } },
        { '/rest/v1/rpc/titan_support_accept_v300': () => { throw Error('private upstream secret'); } },
        { '/rest/v1/rpc/titan_support_accept_v300': json({ reference: 'invalid', notification: 'sent', message: 'private' }) },
        { '/rest/v1/rpc/titan_support_accept_v300': json({ reference: [REFERENCE], notification: 'pending' }) }
    ]) await runtime(async calls => { const response = await handler(request()); assert.equal(response.status, 503); assert.equal((await response.json()).reference, undefined); assert.ok(!calls.some(c => c.path === '/emails')); }, { responses });
});
test('support: provider failure or malformed acknowledgement keeps the received ticket pending', async () => {
    for (const emailResponse of [json({ message: 'provider secret' }, 500), json({}), () => { throw Error('provider secret'); }]) {
        await runtime(async calls => { const response = await handler(request()); assert.equal(response.status, 202); assert.deepEqual(await response.json(), { accepted: true, reference: REFERENCE, notification: 'pending', fallback: '/service#help-contact' }); assert.equal(calls.find(c => c.path.endsWith('/titan_support_finish_v300')).body.p_sent, false); }, { responses: { '/emails': emailResponse } });
    }
});
test('support: claim unavailable, already sending or expired retry window never sends another email', async () => {
    for (const reply of [json({ notification: 'pending' }), json({ notification: 'sent' }), json({ message: 'secret' }, 500)]) {
        await runtime(async calls => { const response = await handler(request()); assert.ok([200, 202].includes(response.status)); assert.ok(!calls.some(c => c.path === '/emails')); }, { responses: { '/rest/v1/rpc/titan_support_claim_v300': reply } });
    }
});
test('support: notification needs durable matching lease completion before reporting sent', async () => {
    for (const response of [json(false), json({ message: 'secret' }, 500)]) {
        await runtime(async calls => { const result = await handler(request()); assert.equal(result.status, 202); assert.equal((await result.json()).notification, 'pending'); assert.equal(calls.filter(c => c.path === '/emails').length, 1); }, { responses: { '/rest/v1/rpc/titan_support_finish_v300': response } });
    }
});
test('support: retries use the same ticket key and provider key without reflecting private content', async () => runtime(async calls => {
    for (let n = 0; n < 2; n++) { const response = await handler(request()); const text = await response.text(); assert.equal(response.status, 200); assert.doesNotMatch(text, /script|fake-token|sb_secret|re_fake|verified@example/); }
    assert.ok(calls.filter(c => c.path.endsWith('/titan_support_accept_v300')).every(c => c.body.p_request_id === REQUEST));
    assert.ok(calls.filter(c => c.path === '/emails').every(c => c.init.headers['Idempotency-Key'] === `titan-support/${REFERENCE}`));
}));
test('support: the Netlify entry bundles a server module outside the public build', async () => {
    const entry = await readFile(new URL('../netlify/functions/assistance.mts', import.meta.url), 'utf8');
    assert.match(entry, /export \{ default \} from '\.\.\/\.\.\/functions\/assistance\.mjs'/);
});
test('support: unexpected upstream errors including prototype names stay unavailable', async () => {
    for (const message of ['constructor', 'toString', 'private upstream secret']) {
        await runtime(async calls => { const response = await handler(request()); assert.equal(response.status, 503); assert.equal(calls.length, 2); assert.doesNotMatch(await response.text(), /constructor|toString|private upstream secret/); },
            { responses: { '/rest/v1/rpc/titan_support_accept_v300': json({ message }, 500) } });
    }
});
