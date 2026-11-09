import { _setIapForTests, BillingError, buy, loadOffers, messageFor, PLANS, restore, verifyOnServer, type IapLib, type IapPurchase } from "../src/lib/playBilling";

type Listener<T> = (v: T) => void;
function fakeStore(over: Partial<IapLib> = {}, products = PLANS.map((p) => ({ id: p.id, displayPrice: `${p.id} price`, subscriptionOffers: [{ offerTokenAndroid: `offer-${p.id}`, displayPrice: `${p.id} price` }] }))) {
  const updated: Listener<IapPurchase>[] = [];
  const errored: Listener<{ code?: string; message?: string }>[] = [];
  const finished: IapPurchase[] = [];
  const requests: unknown[] = [];
  let available: IapPurchase[] = [];
  const lib: IapLib = {
    initConnection: async () => true,
    endConnection: async () => undefined,
    fetchProducts: async () => products,
    requestPurchase: async (a) => void requests.push(a),
    getAvailablePurchases: async () => available,
    finishTransaction: async ({ purchase }) => void finished.push(purchase),
    purchaseUpdatedListener: (l) => (updated.push(l), { remove: () => void updated.splice(updated.indexOf(l), 1) }),
    purchaseErrorListener: (l) => (errored.push(l), { remove: () => void errored.splice(errored.indexOf(l), 1) }),
    deepLinkToSubscriptions: async () => undefined,
    ...over,
  };
  return { lib, updated, errored, finished, requests, setAvailable: (p: IapPurchase[]) => (available = p) };
}
const token = async () => "user-access-token";
const active = { active: true, status: "active", ends_at: null, acknowledged: true };

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
  const promise = buy(offer, "owner-1", token, s.lib, verify);
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
  let p = buy((await loadOffers(s.lib))[0], "o", token, s.lib, jest.fn());
  s.errored[0]({ code: "user-cancelled" });
  expect(await p).toEqual({ kind: "cancelled" });

  s = fakeStore();
  p = buy((await loadOffers(s.lib))[0], "o", token, s.lib, jest.fn());
  s.updated[0]({ productId: "titan01", purchaseToken: "play-token-0123456789", purchaseState: "pending" });
  expect(await p).toEqual({ kind: "pending" });
  expect(s.finished).toHaveLength(0);

  s = fakeStore();
  p = buy((await loadOffers(s.lib))[0], "o", token, s.lib, async () => { throw new BillingError("NOT_BOUND"); });
  s.updated[0]({ productId: "titan01", purchaseToken: "play-token-0123456789" });
  const out = await p;
  expect(out.kind).toBe("error");
  expect(s.finished).toHaveLength(0);

  s = fakeStore();
  p = buy((await loadOffers(s.lib))[0], "o", token, s.lib, async () => ({ ...active, active: false, status: "expired" }));
  s.updated[0]({ productId: "titan01", purchaseToken: "play-token-0123456789" });
  await p;
  expect(s.finished).toHaveLength(0); // an inactive verdict is not completed
});

test("restore sends each known purchase, skips foreign products, and stops on a network or disabled error", async () => {
  const s = fakeStore();
  s.setAvailable([{ productId: "titan01", purchaseToken: "t1-0123456789abcdef" }, { productId: "other", purchaseToken: "t2-0123456789abcdef" }, { productId: "titan02", purchaseToken: "t3-0123456789abcdef" }]);
  const verify = jest.fn(async (t: string) => (t.startsWith("t3") ? Promise.reject(new BillingError("ALREADY_USED")) : active));
  expect(await restore(token, s.lib, verify)).toEqual({ checked: 3, active: 1, failed: 1 });
  expect(verify).toHaveBeenCalledTimes(2);
  expect(s.finished).toHaveLength(1);
  await expect(restore(token, s.lib, async () => { throw new BillingError("DISABLED"); })).rejects.toMatchObject({ code: "DISABLED" });
  await expect(restore(async () => null, s.lib, verify)).rejects.toMatchObject({ code: "AUTH" });
});

test("the server call maps every answer to a clear cause and sends only the token and product", async () => {
  const f = (status: number, body: unknown) => jest.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  expect(await verifyOnServer("t", "titan02", "a", f(200, active))).toEqual(active);
  const code = async (status: number, body: unknown) => verifyOnServer("t", "titan02", "a", f(status, body)).catch((e) => e.code);
  expect(await code(503, { error: "unavailable" })).toBe("DISABLED");
  expect(await code(401, {})).toBe("AUTH");
  expect(await code(409, { error: "purchase_already_used" })).toBe("ALREADY_USED");
  expect(await code(409, { error: "purchase_bound_to_other_account" })).toBe("NOT_BOUND");
  expect(await code(409, { error: "purchase_not_bound" })).toBe("NOT_BOUND");
  expect(await code(422, { error: "purchase_not_found" })).toBe("NOT_FOUND");
  expect(await code(500, {})).toBe("REFUSED");
  expect(await verifyOnServer("t", "titan02", "a", jest.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch).catch((e) => e.code)).toBe("NETWORK");
  const spy = f(200, active);
  await verifyOnServer("tok", "titan02", "access", spy);
  const [url, init] = (spy as unknown as jest.Mock).mock.calls[0];
  expect(url).toBe("https://titan-app.fr/functions/play-billing");
  expect(JSON.parse((init as RequestInit).body as string)).toEqual({ purchase_token: "tok", product_id: "titan02" });
});

test("messages are in plain French and never show a raw code", () => {
  for (const c of ["DISABLED", "AUTH", "ALREADY_USED", "NOT_BOUND", "NOT_FOUND", "NETWORK", "REFUSED"] as const) expect(messageFor(new BillingError(c))).toMatch(/[a-zé]/);
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
