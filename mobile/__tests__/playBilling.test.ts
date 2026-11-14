import { BILLING_TIMEOUT_MS, BillingError, buy, checkoutInFlight, loadOffers, messageFor, offerPriceLabel, PLANS, recoverPurchases, restore, verifyOnServer, type IapLib, type IapPurchase } from "../src/lib/playBilling";

type Listener<T> = (v: T) => void;
function fakeStore(over: Partial<IapLib> = {}, products = PLANS.map((p) => ({ id: p.id, displayPrice: `${p.id} price`, subscriptionOffers: [{ offerTokenAndroid: `offer-${p.id}`, displayPrice: `${p.id} price` }] }))) {
  const updated: Listener<IapPurchase>[] = [];
  const errored: Listener<{ code?: string; message?: string }>[] = [];
  const finished: IapPurchase[] = [];
  const requests: unknown[] = [];
  let markRequested!: () => void;
  const requested = new Promise<void>((resolve) => { markRequested = resolve; });
  let available: IapPurchase[] = [];
  const lib: IapLib = {
    initConnection: async () => true,
    endConnection: async () => undefined,
    fetchProducts: async () => products,
    requestPurchase: async (a) => { requests.push(a); markRequested(); },
    getAvailablePurchases: async () => available,
    finishTransaction: async ({ purchase }) => void finished.push(purchase),
    purchaseUpdatedListener: (l) => (updated.push(l), { remove: () => void updated.splice(updated.indexOf(l), 1) }),
    purchaseErrorListener: (l) => (errored.push(l), { remove: () => void errored.splice(errored.indexOf(l), 1) }),
    deepLinkToSubscriptions: async () => undefined,
    ...over,
  };
  return { lib, updated, errored, finished, requests, requested, setAvailable: (p: IapPurchase[]) => (available = p) };
}
const token = async () => "user-access-token";
const active = { active: true, status: "active", ends_at: null, acknowledged: true };
const ready = async () => {};

test("offers come from Google Play with its own price; a product Play does not return is absent", async () => {
  const s = fakeStore({}, [{ id: "titan01", displayPrice: "x €", subscriptionOffers: [{ offerTokenAndroid: "tok", displayPrice: "4,99 € / mois" }] }, { id: "titan02", displayPrice: "y", subscriptionOffers: [] }]);
  const offers = await loadOffers(s.lib);
  expect(offers).toHaveLength(1);
  expect(offers[0]).toMatchObject({ id: "titan01", price: "4,99 € / mois", offerToken: "tok" });
});

test("no price or amount is written in the app", () => {
  const src = require("fs").readFileSync(require.resolve("../src/lib/playBilling"), "utf8") as string;
  expect(src).not.toMatch(/\d+\s?(€|EUR|euros?)/i);
});

test("a purchase carries the signed-in account id, is verified by the server, and is completed in Play only after", async () => {
  const s = fakeStore();
  const verify = jest.fn(async () => active);
  const offer = (await loadOffers(s.lib))[1];
  const promise = buy(offer, "owner-1", token, { store: s.lib, verify, check: ready });
  await s.requested;
  expect(s.requests[0]).toMatchObject({ type: "subs", request: { google: { skus: ["titan02"], obfuscatedAccountId: "owner-1", subscriptionOffers: [{ sku: "titan02", offerToken: "offer-titan02" }] } } });
  expect(s.finished).toHaveLength(0);
  s.updated[0]({ productId: "titan02", purchaseToken: "play-token-0123456789", purchaseState: "purchased" });
  const out = await promise;
  expect(out).toMatchObject({ kind: "active" });
  expect(verify).toHaveBeenCalledWith("play-token-0123456789", "titan02", "user-access-token");
  expect(s.finished).toHaveLength(1);
  expect(s.updated).toHaveLength(0); // listeners removed
});

test("user cancellation, a pending payment and a server refusal never complete the purchase", async () => {
  let s = fakeStore();
  let p = buy((await loadOffers(s.lib))[0], "o", token, { store: s.lib, verify: jest.fn(), check: ready });
  await s.requested;
  s.errored[0]({ code: "user-cancelled" });
  expect(await p).toEqual({ kind: "cancelled" });

  s = fakeStore();
  p = buy((await loadOffers(s.lib))[0], "o", token, { store: s.lib, verify: jest.fn(), check: ready });
  await s.requested;
  s.updated[0]({ productId: "titan01", purchaseToken: "play-token-0123456789", purchaseState: "pending" });
  expect(await p).toEqual({ kind: "pending" });
  expect(s.finished).toHaveLength(0);

  s = fakeStore();
  p = buy((await loadOffers(s.lib))[0], "o", token, { store: s.lib, verify: async () => { throw new BillingError("NOT_BOUND"); }, check: ready });
  await s.requested;
  s.updated[0]({ productId: "titan01", purchaseToken: "play-token-0123456789" });
  const out = await p;
  expect(out.kind).toBe("error");
  expect(s.finished).toHaveLength(0);

  s = fakeStore();
  p = buy((await loadOffers(s.lib))[0], "o", token, { store: s.lib, verify: async () => ({ ...active, active: false, status: "expired" }), check: ready });
  await s.requested;
  s.updated[0]({ productId: "titan01", purchaseToken: "play-token-0123456789" });
  await p;
  expect(s.finished).toHaveLength(0); // an inactive verdict is not completed
});

test("checkout stops before launching Google Play if the authenticated readiness check fails", async () => {
  const s = fakeStore();
  const verify = jest.fn(async () => active);
  const check = jest.fn(async () => { throw new BillingError("CHECKOUT_UNAVAILABLE"); });
  const result = buy((await loadOffers(s.lib))[1], "owner-1", token, { store: s.lib, verify, check });
  s.errored[0]?.({ code: "user-cancelled" });
  expect(await result).toMatchObject({ kind: "error", error: { code: "CHECKOUT_UNAVAILABLE" } });
  expect(check).toHaveBeenCalledWith("titan02", "user-access-token");
  expect(s.requests).toHaveLength(0);
  expect(s.finished).toHaveLength(0);
});

test("the default checkout check sends the session and product to the billing endpoint", async () => {
  const s = fakeStore();
  const fetcher = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 503 }));
  try {
    const result = buy((await loadOffers(s.lib))[1], "o", token, { store: s.lib });
    s.errored[0]?.({ code: "user-cancelled" });
    expect(await result).toMatchObject({ kind: "error", error: { code: "CHECKOUT_UNAVAILABLE" } });
    expect(fetcher).toHaveBeenCalledWith("https://titan-app.fr/functions/play-billing?product_id=titan02", expect.objectContaining({
      method: "GET", headers: { Authorization: "Bearer user-access-token" },
    }));
    expect(s.requests).toHaveLength(0);
  } finally { fetcher.mockRestore(); }
});

test("checkout rechecks the account after readiness, before opening Play", async () => {
  const s = fakeStore();
  const launch = s.lib.requestPurchase;
  s.lib.requestPurchase = async (input) => { await launch(input); s.errored[0]({ code: "user-cancelled" }); };
  const getToken = jest.fn().mockResolvedValueOnce("first-owner-token").mockResolvedValue(null);
  const result = await buy((await loadOffers(s.lib))[0], "first-owner", getToken, { store: s.lib, verify: jest.fn(), check: ready });
  expect(result).toMatchObject({ kind: "error", error: { code: "AUTH" } });
  expect(s.requests).toHaveLength(0);
});

const oldCoachUltra: IapPurchase = {
  productId: "titan03", purchaseToken: "old-play-token-1234", purchaseState: "purchased", obfuscatedAccountIdAndroid: "owner-1",
};

test("downgrading Coach Ultra replaces its Google Play token and preserves unused value as time", async () => {
  const s = fakeStore();
  s.setAvailable([oldCoachUltra]);
  const verify = jest.fn(async () => active);
  const result = buy((await loadOffers(s.lib))[1], "owner-1", token, { store: s.lib, verify, check: ready, currentProductId: "titan03" });
  await s.requested;
  expect(s.requests[0]).toMatchObject({ request: { google: {
    skus: ["titan02"], purchaseToken: "old-play-token-1234", subscriptionProductReplacementParams: { oldProductId: "titan03", replacementMode: "with-time-proration" },
  } } });
  expect(verify).toHaveBeenCalledTimes(1);
  expect(verify).toHaveBeenCalledWith("old-play-token-1234", "titan03", "user-access-token");
  s.errored[0]({ code: "user-cancelled" });
  expect(await result).toEqual({ kind: "cancelled" });
});

test.each([
  [[oldCoachUltra], null],
  [[], "titan03"],
  [[{ ...oldCoachUltra, purchaseState: "pending" }], "titan03"],
  [[{ ...oldCoachUltra, pendingPurchaseUpdateAndroid: { products: ["titan02"] } }], "titan03"],
  [[{ ...oldCoachUltra, isSuspendedAndroid: true }], "titan03"],
  [[{ ...oldCoachUltra, obfuscatedAccountIdAndroid: "owner-2" }], "titan03"],
  [[oldCoachUltra, { ...oldCoachUltra, productId: "titan01" }], "titan03"],
])("an uncertain Play inventory never opens a fresh or replacement checkout: %j", async (purchases, currentProductId) => {
  const s = fakeStore();
  s.setAvailable(purchases);
  const verify = jest.fn(async () => active);
  const result = await buy((await loadOffers(s.lib))[1], "owner-1", token, { store: s.lib, verify, check: ready, currentProductId });
  expect(result).toMatchObject({ kind: "error", error: { code: "PLAN_UNCERTAIN" } });
  expect(verify).not.toHaveBeenCalled();
  expect(s.requests).toHaveLength(0);
});

test("a Play replacement requires an acknowledged current purchase and a still-active TITAN session", async () => {
  const s = fakeStore();
  s.setAvailable([oldCoachUltra]);
  const offer = (await loadOffers(s.lib))[1];
  const options = { store: s.lib, check: ready, currentProductId: "titan03" };
  const unacknowledged = await buy(offer, "owner-1", token, { ...options, verify: async () => ({ ...active, acknowledged: false }) });
  expect(unacknowledged).toMatchObject({ kind: "error", error: { code: "PLAN_UNCERTAIN" } });
  let switched = false;
  const changedAccount = await buy(offer, "owner-1", async () => switched ? null : "user-access-token", {
    ...options, verify: async () => { switched = true; return active; },
  });
  expect(changedAccount).toMatchObject({ kind: "error", error: { code: "AUTH" } });
  expect(s.requests).toHaveLength(0);
});

test("a Play sandbox that cannot bill is distinct from a TITAN readiness failure", async () => {
  const s = fakeStore();
  const result = buy((await loadOffers(s.lib))[0], "o", token, { store: s.lib, verify: jest.fn(), check: ready });
  await s.requested;
  s.errored[0]({ code: "billing-unavailable" });
  const outcome = await result;
  expect(outcome).toMatchObject({ kind: "error", error: { code: "STORE_UNAVAILABLE" } });
  if (outcome.kind !== "error") throw new Error("Expected Play Billing to refuse checkout");
  expect(messageFor(outcome.error)).toContain("Google Play");
  expect(s.finished).toHaveLength(0);
});

test("a 503 after Play reports a purchase leaves it restorable and makes no claim about a debit", async () => {
  const s = fakeStore();
  const fetcher = jest.fn(async () => new Response('{"error":"unavailable"}', { status: 503 })) as unknown as typeof fetch;
  const verify = (purchase: string, product: string, access: string) => verifyOnServer(purchase, product, access, fetcher);
  const result = buy((await loadOffers(s.lib))[0], "o", token, { store: s.lib, verify, check: ready });
  await s.requested;
  s.updated[0]({ productId: "titan01", purchaseToken: "play-token-0123456789", purchaseState: "purchased" });
  const outcome = await result;
  expect(outcome).toMatchObject({ kind: "error", error: { code: "VERIFICATION_UNAVAILABLE" } });
  if (outcome.kind !== "error") throw new Error("Expected a verification failure");
  expect(messageFor(outcome.error)).toContain("Restaurer mes achats");
  expect(messageFor(outcome.error)).not.toMatch(/rien.*débité|rien.*perdu/i);
  expect(s.finished).toHaveLength(0);
});

test("restore sends each known purchase, skips foreign products, and stops if verification is unavailable", async () => {
  const s = fakeStore();
  s.setAvailable([{ productId: "titan01", purchaseToken: "t1-0123456789abcdef" }, { productId: "other", purchaseToken: "t2-0123456789abcdef" }, { productId: "titan02", purchaseToken: "t3-0123456789abcdef" }]);
  const verify = jest.fn(async (t: string) => (t.startsWith("t3") ? Promise.reject(new BillingError("ALREADY_USED")) : active));
  expect(await restore(token, s.lib, verify)).toEqual({ checked: 3, active: 1, failed: 1, test: 0 });
  expect(verify).toHaveBeenCalledTimes(2);
  expect(s.finished).toHaveLength(1);
  await expect(restore(token, s.lib, async () => { throw new BillingError("VERIFICATION_UNAVAILABLE"); })).rejects.toMatchObject({ code: "VERIFICATION_UNAVAILABLE" });
  await expect(restore(async () => null, s.lib, verify)).rejects.toMatchObject({ code: "AUTH" });
});

test("restore stops before acknowledging a purchase or verifying another token after a TITAN account switch", async () => {
  const s = fakeStore();
  s.setAvailable([oldCoachUltra, { productId: "titan02", purchaseToken: "second-play-token-1234" }]);
  let switched = false;
  const verify = jest.fn(async () => { switched = true; return active; });
  await expect(restore(async () => switched ? null : "user-access-token", s.lib, verify)).rejects.toMatchObject({ code: "AUTH" });
  expect(verify).toHaveBeenCalledTimes(1);
  expect(s.finished).toHaveLength(0);
});

test("the server call maps every answer to a clear cause and sends only the token and product", async () => {
  const f = (status: number, body: unknown) => jest.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  expect(await verifyOnServer("t", "titan02", "a", f(200, active))).toEqual(active);
  const code = async (status: number, body: unknown) => verifyOnServer("t", "titan02", "a", f(status, body)).catch((e) => e.code);
  expect(await code(503, { error: "unavailable" })).toBe("VERIFICATION_UNAVAILABLE");
  expect(await code(401, {})).toBe("AUTH");
  expect(await code(409, { error: "purchase_already_used" })).toBe("ALREADY_USED");
  expect(await code(409, { error: "purchase_bound_to_other_account" })).toBe("NOT_BOUND");
  expect(await code(409, { error: "purchase_not_bound" })).toBe("NOT_BOUND");
  expect(await code(422, { error: "purchase_not_found" })).toBe("NOT_FOUND");
  expect(await code(422, { error: "purchase_product_mismatch" })).toBe("REFUSED");
  expect(await code(422, { error: "test_purchase_refused" })).toBe("TEST_PURCHASE");
  expect(await code(500, {})).toBe("VERIFICATION_UNAVAILABLE");
  expect(await code(200, { ...active, active: "true" })).toBe("VERIFICATION_UNAVAILABLE");
  expect(await verifyOnServer("t", "titan02", "a", jest.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch).catch((e) => e.code)).toBe("NETWORK");
  const spy = f(200, active);
  await verifyOnServer("tok", "titan02", "access", spy);
  const [url, init] = (spy as unknown as jest.Mock).mock.calls[0];
  expect(url).toBe("https://titan-app.fr/functions/play-billing");
  expect(JSON.parse((init as RequestInit).body as string)).toEqual({ purchase_token: "tok", product_id: "titan02" });
});

test("only isolated E2E builds can send verification to an explicit HTTPS preview endpoint", async () => {
  const oldBackend = process.env.EXPO_PUBLIC_TITAN_E2E_SUPABASE_URL;
  const oldBilling = process.env.EXPO_PUBLIC_TITAN_E2E_BILLING_URL;
  const fetcher = jest.fn<Promise<Response>, Parameters<typeof globalThis.fetch>>(async () => new Response(JSON.stringify(active), { status: 200 }));
  const isolatedAdapter = () => {
    let billing!: typeof import("../src/lib/playBilling");
    jest.isolateModules(() => { billing = require("../src/lib/playBilling"); });
    return billing.verifyOnServer;
  };
  try {
    process.env.EXPO_PUBLIC_TITAN_E2E_SUPABASE_URL = "https://isolated-db.example.test";
    process.env.EXPO_PUBLIC_TITAN_E2E_BILLING_URL = "https://titan-qa.example.test/";
    await isolatedAdapter()("purchase", "titan01", "session", fetcher);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://titan-qa.example.test/functions/play-billing");

    delete process.env.EXPO_PUBLIC_TITAN_E2E_BILLING_URL;
    await expect(isolatedAdapter()("purchase", "titan01", "session", fetcher)).rejects.toMatchObject({ code: "VERIFICATION_UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(1);

    delete process.env.EXPO_PUBLIC_TITAN_E2E_SUPABASE_URL;
    process.env.EXPO_PUBLIC_TITAN_E2E_BILLING_URL = "https://titan-qa.example.test/";
    await isolatedAdapter()("purchase", "titan01", "session", fetcher);
    expect(fetcher.mock.calls[1]?.[0]).toBe("https://titan-app.fr/functions/play-billing");
  } finally {
    if (oldBackend === undefined) delete process.env.EXPO_PUBLIC_TITAN_E2E_SUPABASE_URL;
    else process.env.EXPO_PUBLIC_TITAN_E2E_SUPABASE_URL = oldBackend;
    if (oldBilling === undefined) delete process.env.EXPO_PUBLIC_TITAN_E2E_BILLING_URL;
    else process.env.EXPO_PUBLIC_TITAN_E2E_BILLING_URL = oldBilling;
  }
});

test("messages are in plain French and never show a raw code", () => {
  for (const c of ["CHECKOUT_UNAVAILABLE", "VERIFICATION_UNAVAILABLE", "AUTH", "ALREADY_USED", "NOT_BOUND", "NOT_FOUND", "NETWORK", "REFUSED", "TEST_PURCHASE"] as const) expect(messageFor(new BillingError(c))).toMatch(/[a-zé]/);
  expect(messageFor(new Error("boom"))).toContain("réessaie");
});

test("the three Play products are the ones created in Play Console, named for what is sold, and never carry a price", () => {
  const { PLANS } = require("../src/lib/playBilling");
  expect(PLANS.map((p: { id: string }) => p.id).slice(1)).toEqual(["titan02", "titan03"]);
  expect(PLANS.map((p: { name: string }) => p.name)).toEqual(["TITAN+", "Coach", "Coach Ultra"]);
  // The server keeps its own stable plan keys (private.titan_plan_products), whatever the store calls the product.
  expect(PLANS.map((p: { plan: string }) => p.plan)).toEqual(["titan_plus", "coach", "coach_pro"]);
  expect(JSON.stringify(PLANS)).not.toMatch(/\d\s?€|\d,\d{2}/);
  expect(JSON.stringify(PLANS)).not.toMatch(/Coach Pro/);
});


test("server provenance survives the client adapter without guessing payment from active status", async () => {
  for (const access_kind of ["test", "verified_purchase"] as const) {
    const verdict = { ...active, access_kind };
    const fetcher = jest.fn(async () => new Response(JSON.stringify(verdict), { status: 200 })) as unknown as typeof fetch;
    expect(await verifyOnServer("t", "titan01", "a", fetcher)).toEqual(verdict);
  }
  const fetcher = jest.fn(async () => new Response(JSON.stringify(active), { status: 200 })) as unknown as typeof fetch;
  expect((await verifyOnServer("t", "titan01", "a", fetcher)).access_kind).toBeUndefined();
});

/* V1.3.1 finalisation: a payment Google accepted must not stay without access. */

test("a licence-tester purchase is named for what it is and never sends the player to a restoration that cannot work", async () => {
  const message = messageFor(new BillingError("TEST_PURCHASE"));
  expect(message).toMatch(/achat de test/i);
  expect(message).toMatch(/ne le rattachera pas/);
  const s = fakeStore();
  s.setAvailable([{ productId: "titan01", purchaseToken: "t1-0123456789abcdef" }]);
  const verify = jest.fn(async () => { throw new BillingError("TEST_PURCHASE"); });
  expect(await restore(token, s.lib, verify)).toEqual({ checked: 1, active: 0, failed: 1, test: 1 });
  expect(s.finished).toHaveLength(0);
});

test("the card shows the recurring price with its period, and a free trial is never shown as the price", () => {
  const monthly = { billingPeriod: "P1M", formattedPrice: "4,99 €", priceAmountMicros: "4990000", recurrenceMode: 1 };
  expect(offerPriceLabel({ displayPrice: "4,99 €", pricingPhasesAndroid: { pricingPhaseList: [monthly] } })).toBe("4,99 € / mois");
  const trial = { billingPeriod: "P1W", formattedPrice: "Gratuit", priceAmountMicros: "0", recurrenceMode: 2 };
  expect(offerPriceLabel({ displayPrice: "Gratuit", pricingPhasesAndroid: { pricingPhaseList: [trial, monthly] } })).toBe("Essai gratuit, puis 4,99 € / mois");
  const intro = { billingPeriod: "P1M", formattedPrice: "1,99 €", priceAmountMicros: "1990000", recurrenceMode: 2 };
  expect(offerPriceLabel({ displayPrice: "1,99 €", pricingPhasesAndroid: { pricingPhaseList: [intro, monthly] } })).toBe("1,99 € au départ, puis 4,99 € / mois");
  // Without phase details, Google's own string is kept untouched.
  expect(offerPriceLabel({ displayPrice: "4,99 € / mois" })).toBe("4,99 € / mois");
  expect(offerPriceLabel({ displayPrice: "" }, "x")).toBe("x");
});

test("when Play lists several offers, the monthly one the server checks is the one sold", async () => {
  const phase = (billingPeriod: string, formattedPrice: string) => ({ pricingPhasesAndroid: { pricingPhaseList: [{ billingPeriod, formattedPrice, priceAmountMicros: "1", recurrenceMode: 1 }] } });
  const s = fakeStore({}, [{ id: "titan01", displayPrice: "x", subscriptionOffers: [
    { offerTokenAndroid: "yearly", displayPrice: "49,99 €", ...phase("P1Y", "49,99 €") },
    { offerTokenAndroid: "monthly", displayPrice: "4,99 €", ...phase("P1M", "4,99 €") },
  ] }]);
  expect(await loadOffers(s.lib)).toMatchObject([{ id: "titan01", offerToken: "monthly", price: "4,99 € / mois" }]);
});

test("a server that never answers is abandoned after the timeout and reported as a network failure", async () => {
  jest.useFakeTimers();
  try {
    const hanging = jest.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    })) as unknown as typeof fetch;
    const pending = verifyOnServer("t", "titan01", "a", hanging).catch((e) => e.code);
    await jest.advanceTimersByTimeAsync(BILLING_TIMEOUT_MS + 1);
    expect(await pending).toBe("NETWORK");
  } finally {
    jest.useRealTimers();
  }
});

describe("automatic recovery of a payment that was never confirmed", () => {
  const mine = (over: Partial<IapPurchase> = {}): IapPurchase => ({ productId: "titan01", purchaseToken: "t1-0123456789abcdef", purchaseState: "purchased", obfuscatedAccountIdAndroid: "owner-1", isAcknowledgedAndroid: false, ...over });

  test("an unacknowledged purchase of this account is verified, completed in Play and counted", async () => {
    const s = fakeStore();
    s.setAvailable([mine()]);
    const verify = jest.fn(async () => active);
    expect(await recoverPurchases("owner-1", token, { hasAccess: false, store: s.lib, verify })).toBe(1);
    expect(verify).toHaveBeenCalledWith("t1-0123456789abcdef", "titan01", "user-access-token");
    expect(s.finished).toHaveLength(1);
  });

  test("an acknowledged purchase is sent again while the profile still has no access, and left alone once it has", async () => {
    const s = fakeStore();
    s.setAvailable([mine({ isAcknowledgedAndroid: true })]);
    const verify = jest.fn(async () => active);
    expect(await recoverPurchases("owner-1", token, { hasAccess: true, store: s.lib, verify })).toBe(0);
    expect(verify).not.toHaveBeenCalled();
    expect(await recoverPurchases("owner-1", token, { hasAccess: false, store: s.lib, verify })).toBe(1);
    expect(await recoverPurchases("owner-1", token, { hasAccess: null, store: s.lib, verify })).toBe(1);
  });

  test("purchases of another TITAN account, pending payments and foreign products are never sent", async () => {
    const s = fakeStore();
    s.setAvailable([mine({ obfuscatedAccountIdAndroid: "owner-2" }), mine({ obfuscatedAccountIdAndroid: null }), mine({ purchaseState: "pending" }), mine({ productId: "other" }), mine({ purchaseToken: null })]);
    const verify = jest.fn(async () => active);
    expect(await recoverPurchases("owner-1", token, { hasAccess: false, store: s.lib, verify })).toBe(0);
    expect(verify).not.toHaveBeenCalled();
    expect(s.finished).toHaveLength(0);
  });

  test("it never throws: an unreachable store, a server outage, a refusal or a signed-out session end quietly without completing anything", async () => {
    const down = fakeStore({ initConnection: async () => false });
    expect(await recoverPurchases("owner-1", token, { store: down.lib, verify: jest.fn() })).toBe(0);
    const broken = fakeStore({ getAvailablePurchases: async () => { throw new Error("billing"); } });
    expect(await recoverPurchases("owner-1", token, { store: broken.lib, verify: jest.fn() })).toBe(0);
    for (const code of ["VERIFICATION_UNAVAILABLE", "NETWORK", "TEST_PURCHASE", "ALREADY_USED"] as const) {
      const s = fakeStore();
      s.setAvailable([mine()]);
      expect(await recoverPurchases("owner-1", token, { store: s.lib, verify: jest.fn(async () => { throw new BillingError(code); }) })).toBe(0);
      expect(s.finished).toHaveLength(0);
    }
    const s = fakeStore();
    s.setAvailable([mine()]);
    const verify = jest.fn(async () => active);
    expect(await recoverPurchases("owner-1", async () => null, { store: s.lib, verify })).toBe(0);
    expect(verify).not.toHaveBeenCalled();
  });

  test("an inactive verdict is not completed in Play, and an account switch during verification stops before completion", async () => {
    let s = fakeStore();
    s.setAvailable([mine()]);
    expect(await recoverPurchases("owner-1", token, { store: s.lib, verify: jest.fn(async () => ({ ...active, active: false, status: "expired" })) })).toBe(0);
    expect(s.finished).toHaveLength(0);
    s = fakeStore();
    s.setAvailable([mine()]);
    let calls = 0;
    const switching = async () => (++calls <= 2 ? "user-access-token" : null);
    expect(await recoverPurchases("owner-1", switching, { store: s.lib, verify: jest.fn(async () => active) })).toBe(0);
    expect(s.finished).toHaveLength(0);
  });

  test("it stays out of the way while a payment sheet is open", async () => {
    const s = fakeStore();
    s.setAvailable([]);
    const purchase = buy((await loadOffers(s.lib))[0], "owner-1", token, { store: s.lib, verify: jest.fn(async () => active), check: ready });
    await s.requested;
    expect(checkoutInFlight()).toBe(true);
    s.setAvailable([mine()]);
    const verify = jest.fn(async () => active);
    expect(await recoverPurchases("owner-1", token, { hasAccess: false, store: s.lib, verify })).toBe(0);
    expect(verify).not.toHaveBeenCalled();
    s.errored[0]({ code: "user-cancelled" });
    await purchase;
    expect(checkoutInFlight()).toBe(false);
  });
});
