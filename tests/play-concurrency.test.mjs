// Delayed Google responses may arrive after a newer verification; use a synthetic ledger and no real account.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import billing from '../functions/play-billing.mjs';
import notifications from '../functions/play-notifications.mjs';
import reconcile from '../functions/play-reconcile.mjs';

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const TOKEN = 'synthetic-purchase-token-0123456789';
const PUSH = 'synthetic-push-secret-0123456789abcdef';
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const environment = {
  PLAY_BILLING_ENABLED: 'true', PLAY_PRODUCT_IDS: 'titan_plus', PLAY_RTDN_TOKEN: PUSH,
  SUPABASE_URL: 'https://database.example.test', SUPABASE_SECRET_KEY: 'sb_secret_fake', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fake',
  PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'billing@example.test', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }),
};
const request = () => new Request('https://titan.example.test/functions/play-billing', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer synthetic-session-access-token-0123456789' },
  body: JSON.stringify({ purchase_token: TOKEN, product_id: 'titan_plus' }),
});
const notice = () => new Request(`https://titan.example.test/functions/play-notifications?token=${PUSH}`, { method: 'POST', body: JSON.stringify({ message: { data: Buffer.from(JSON.stringify({ packageName: 'fr.titanapp.app', subscriptionNotification: { notificationType: 2, purchaseToken: TOKEN } })).toString('base64') } }) });

for (const reader of ['billing', 'notifications', 'reconcile']) {
  test(`${reader}: a delayed older Google read cannot regrant rights after a newer expiry`, async () => {
    const original = { Date: globalThis.Date, fetch: globalThis.fetch, Netlify: globalThis.Netlify };
    let clock = original.Date.parse('2026-11-02T10:00:00.000Z');
    globalThis.Date = class extends original.Date {
      constructor(...args) { super(...(args.length ? args : [clock])); }
      static now() { return clock; }
    };
    globalThis.Netlify = { env: { get: key => environment[key] ?? '' } };
    const resource = active => ({
      subscriptionState: active ? 'SUBSCRIPTION_STATE_ACTIVE' : 'SUBSCRIPTION_STATE_EXPIRED', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
      externalAccountIdentifiers: { obfuscatedExternalAccountId: OWNER },
      lineItems: [{ productId: 'titan_plus', expiryTime: active ? '2026-12-02T10:00:00Z' : '2026-11-01T10:00:00Z' }],
    });
    let releaseOld;
    let firstLookup;
    const capturedOldRead = new Promise(resolve => { firstLookup = resolve; });
    let lookups = 0;
    let ledger = { active: false, at: '' };
    const writes = [];
    globalThis.fetch = async (url, init = {}) => {
      const path = new URL(url).pathname;
      if (new URL(url).host === 'oauth2.googleapis.com') return Response.json({ access_token: 'synthetic-google-access' });
      if (path === '/auth/v1/user') return Response.json({ id: OWNER, is_anonymous: false });
      if (path.endsWith('/titan_entitlement_owner_v1')) return Response.json(OWNER);
      if (path.endsWith('/titan_play_entitlements_due_v1')) return Response.json([{ user_id: OWNER, external_id: TOKEN }]);
      if (path.includes('/purchases/subscriptionsv2/tokens/')) {
        if (++lookups === 1) {
          const delayed = new Promise(resolve => { releaseOld = () => resolve(Response.json(resource(true))); });
          firstLookup();
          return delayed;
        }
        return Response.json(resource(false));
      }
      if (path.endsWith('/titan_apply_entitlement_v1')) {
        const payload = JSON.parse(init.body);
        writes.push(payload);
        // Match titan_apply_entitlement_v1: older events are ignored, equal/newer events may update.
        const applied = payload.p_event_at >= ledger.at;
        if (applied) ledger = { active: payload.p_is_active, at: payload.p_event_at };
        return Response.json(applied);
      }
      throw new Error(`unexpected synthetic request ${path}`);
    };
    try {
      const old = reader === 'billing' ? billing(request()) : reader === 'notifications' ? notifications(notice()) : reconcile(new Request('https://titan.example.test/reconcile'));
      await capturedOldRead;
      clock += 1000;
      assert.equal((await billing(request())).status, 200);
      assert.equal(ledger.active, false);
      releaseOld();
      assert.equal((await old).status, reader === 'billing' ? 503 : 200);
      assert.equal(writes.length, 2);
      assert.equal(ledger.active, false, 'the newer expired subscription must remain authoritative');
    } finally {
      globalThis.Date = original.Date;
      globalThis.fetch = original.fetch;
      globalThis.Netlify = original.Netlify;
    }
  });
}
