/* Google Play Billing for TITAN+ and the Coach offers. The store sells; the SERVER decides. This module only
   (1) reads the offers and their real prices from Google Play (no price is written in the app), (2) opens the payment
   sheet with the signed-in account id attached to the purchase, (3) hands the purchase token to our server, which checks
   it with Google and grants access, and (4) completes the purchase in Play only after the server has answered.
   Off unless the build sets EXPO_PUBLIC_TITAN_BILLING=1 AND the server has billing switched on. */
import { IS_E2E, SITE_URL } from "./config";

export const BILLING_BUILD = process.env.EXPO_PUBLIC_TITAN_BILLING === "1";

/** The three subscriptions, by Google Play product id. Coach and Coach Ultra were created in Play Console as `titan02` and `titan03`
    (Play tags `titan-coach` / `coach-ultra` are labels, not product ids). The TITAN+ id is the one to confirm in Play Console: it can be
    set per build with EXPO_PUBLIC_TITAN_PLUS_SKU, and a product Google does not return is simply not offered (nothing is guessed).
    `plan` is the server's own key for the offer (private.titan_plan_products): it never changes, whatever the store calls the product.
    The perks are what the offer gives; the PRICE is never written here: it comes from Google Play. */
export const PLUS_SKU = process.env.EXPO_PUBLIC_TITAN_PLUS_SKU || "titan01";
export const PLANS = [
  { id: PLUS_SKU, plan: "titan_plus", kind: "plus", name: "TITAN+", tagline: "Pour toi, sans publicité", perks: ["Analyses plus poussées", "Davantage de confort de personnalisation", "Aucune publicité"] },
  { id: "titan02", plan: "coach", kind: "coach", name: "Coach", tagline: "Pour accompagner 5 sportifs", perks: ["5 sportifs suivis bénéficient de TITAN+", "TITAN+ pour toi, sans publicité", "Toute la suite Coach : calendrier, séances, messages, check-ins"] },
  { id: "titan03", plan: "coach_pro", kind: "coach", name: "Coach Ultra", tagline: "Pour accompagner 15 sportifs", perks: ["15 sportifs suivis bénéficient de TITAN+", "TITAN+ pour toi, sans publicité", "Exactement la même suite Coach : tu paies la capacité, pas des fonctions"] },
] as const;
export const FREE_PLAN = { name: "Gratuit", tagline: "L’essentiel pour progresser", perks: ["Journal, statistiques de base et records", "Progression, aventure et quêtes", "Enregistrement manuel et GPS", "Publicités rares et discrètes, jamais pendant l’effort"] } as const;
export type PlanId = string;

/* The subset of expo-iap used here; the real module is loaded lazily, tests inject a fake. */
export type IapPurchase = {
  productId: string;
  purchaseToken?: string | null;
  purchaseState?: string;
  obfuscatedAccountIdAndroid?: string | null;
  isSuspendedAndroid?: boolean | null;
  isAcknowledgedAndroid?: boolean | null;
  pendingPurchaseUpdateAndroid?: unknown;
};
export type IapPricingPhase = { billingPeriod?: string; formattedPrice?: string; priceAmountMicros?: string; recurrenceMode?: number };
export type IapOffer = { id?: string | null; offerTokenAndroid?: string | null; basePlanIdAndroid?: string | null; displayPrice: string; pricingPhasesAndroid?: { pricingPhaseList?: IapPricingPhase[] | null } | null };
export type IapProduct = { id: string; title?: string; displayName?: string | null; displayPrice: string; subscriptionOffers?: IapOffer[] | null };
type GoogleSubscriptionRequest = {
  skus: string[];
  obfuscatedAccountId: string;
  subscriptionOffers: { sku: string; offerToken: string }[];
  purchaseToken?: string;
  subscriptionProductReplacementParams?: { oldProductId: string; replacementMode: "charge-full-price" | "with-time-proration" };
};
export type IapLib = {
  initConnection(): Promise<boolean>;
  endConnection(): Promise<unknown>;
  fetchProducts(a: { skus: string[]; type: "subs" }): Promise<IapProduct[] | null | undefined>;
  requestPurchase(a: { request: { google: GoogleSubscriptionRequest }; type: "subs" }): Promise<unknown>;
  getAvailablePurchases(options?: { includeSuspendedAndroid: boolean }): Promise<IapPurchase[]>;
  finishTransaction(a: { purchase: IapPurchase; isConsumable: boolean }): Promise<unknown>;
  purchaseUpdatedListener(l: (p: IapPurchase) => void): { remove(): void };
  purchaseErrorListener(l: (e: { code?: string; message?: string }) => void): { remove(): void };
  deepLinkToSubscriptions(a: { skuAndroid?: string }): Promise<unknown>;
};

let lib: IapLib | null = null;
export function iap(): IapLib {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return lib ?? (lib = require("expo-iap") as IapLib);
}
export const _setIapForTests = (l: IapLib | null) => {
  lib = l;
};

export type Offer = { id: PlanId; name: string; tagline: string; perks: readonly string[]; price: string; offerToken: string };

const PERIODS: Record<string, string> = { P1W: "semaine", P4W: "4 semaines", P1M: "mois", P2M: "2 mois", P3M: "3 mois", P6M: "6 mois", P1Y: "an" };
const phasesOf = (o: IapOffer) => (o.pricingPhasesAndroid?.pricingPhaseList ?? []).filter((x) => !!x?.formattedPrice);
/** The phase that renews for as long as the subscription lives: Google lists it last. */
const recurringPhase = (o: IapOffer) => {
  const list = phasesOf(o);
  return list.find((x) => x.recurrenceMode === 1) ?? list[list.length - 1] ?? null;
};

/** What the card shows: Google's own formatted amounts, with the billed period and any introductory phase spelled out,
    so a free trial is never displayed as the price of the subscription. Without phase details, Google's display price is kept as is. */
export function offerPriceLabel(offer: IapOffer, fallback = ""): string {
  const regular = recurringPhase(offer);
  if (!regular?.formattedPrice) return offer.displayPrice || fallback;
  const period = PERIODS[regular.billingPeriod ?? ""];
  const recurring = period ? `${regular.formattedPrice} / ${period}` : regular.formattedPrice;
  const [first] = phasesOf(offer);
  if (!first || first === regular) return recurring;
  return /^0+$/.test(first.priceAmountMicros ?? "") ? `Essai gratuit, puis ${recurring}` : `${first.formattedPrice} au départ, puis ${recurring}`;
}

/** The offers Google Play actually returns for this account, with Google's own formatted price. A product Play does not know is simply absent.
    The server only opens checkout for a product with an active monthly base plan, so a monthly offer is preferred when Play lists several. */
export async function loadOffers(l: IapLib = iap()): Promise<Offer[]> {
  if (!(await l.initConnection())) throw new BillingError("STORE_UNAVAILABLE");
  const products = (await l.fetchProducts({ skus: PLANS.map((p) => p.id), type: "subs" })) ?? [];
  const out: Offer[] = [];
  for (const plan of PLANS) {
    const p = products.find((x) => x.id === plan.id);
    const sellable = p?.subscriptionOffers?.filter((o) => o.offerTokenAndroid) ?? [];
    const offer = sellable.find((o) => recurringPhase(o)?.billingPeriod === "P1M") ?? sellable[0];
    if (p && offer?.offerTokenAndroid) out.push({ id: plan.id, name: plan.name, tagline: plan.tagline, perks: plan.perks, price: offerPriceLabel(offer, p.displayPrice), offerToken: offer.offerTokenAndroid });
  }
  return out;
}

export type Verdict = { active: boolean; status: string; ends_at: string | null; acknowledged: boolean; access_kind?: "test" | "verified_purchase" };
export class BillingError extends Error {
  constructor(public code: "CHECKOUT_UNAVAILABLE" | "VERIFICATION_UNAVAILABLE" | "STORE_UNAVAILABLE" | "PLAN_UNCERTAIN" | "AUTH" | "ALREADY_USED" | "NOT_BOUND" | "NOT_FOUND" | "NETWORK" | "REFUSED" | "TEST_PURCHASE") {
    super(code);
  }
}

async function readCurrentPlayPurchase(owner: string, l: IapLib) {
  let purchases: IapPurchase[];
  try {
    purchases = await l.getAvailablePurchases({ includeSuspendedAndroid: true });
  } catch {
    throw new BillingError("STORE_UNAVAILABLE");
  }
  if (!Array.isArray(purchases)) throw new BillingError("STORE_UNAVAILABLE");
  const known = purchases.filter((p) => PLANS.some((plan) => plan.id === p.productId));
  if (known.length === 0) return null;
  const [purchase] = known;
  if (known.length !== 1 || purchase.obfuscatedAccountIdAndroid !== owner || !purchase.purchaseToken
    || purchase.purchaseState !== "purchased" || purchase.isSuspendedAndroid || purchase.pendingPurchaseUpdateAndroid) {
    throw new BillingError("PLAN_UNCERTAIN");
  }
  return { productId: purchase.productId, purchaseToken: purchase.purchaseToken };
}

/** UI hint from Play after initialization. The purchase token stays local to checkout. */
export async function loadCurrentPlayProduct(owner: string): Promise<string | null> {
  return (await readCurrentPlayPurchase(owner, iap()))?.productId ?? null;
}

function billingEndpoint(): string | null {
  if (!IS_E2E) return `${SITE_URL}/functions/play-billing`;
  // An isolated build must explicitly name its HTTPS preview and cannot fall through to the production site.
  try {
    const url = new URL(process.env.EXPO_PUBLIC_TITAN_E2E_BILLING_URL || "");
    if (url.protocol === "https:" && url.origin !== SITE_URL && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash) {
      return `${url.origin}/functions/play-billing`;
    }
  } catch { /* An invalid test endpoint disables billing for this build. */ }
  return null;
}

/** A server that never answers must not leave the payment screen spinning: the request is abandoned after `ms`. */
export const BILLING_TIMEOUT_MS = 20_000;
async function timed(fetcher: typeof fetch, url: string, init: RequestInit, ms = BILLING_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkCheckoutOnServer(productId: string, accessToken: string): Promise<void> {
  const endpoint = billingEndpoint();
  if (!endpoint) throw new BillingError("CHECKOUT_UNAVAILABLE");
  let res: Response;
  try {
    res = await timed(fetch, `${endpoint}?product_id=${encodeURIComponent(productId)}`, {
      method: "GET", headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new BillingError("CHECKOUT_UNAVAILABLE");
  }
  if (res.status === 401) throw new BillingError("AUTH");
  if (res.status !== 204) throw new BillingError("CHECKOUT_UNAVAILABLE");
}

/** Asks our server to check a purchase token with Google. The account is the one signed in on this phone. */
export async function verifyOnServer(token: string, productId: string, accessToken: string, fetcher: typeof fetch = fetch): Promise<Verdict> {
  const endpoint = billingEndpoint();
  if (!endpoint) throw new BillingError("VERIFICATION_UNAVAILABLE");
  let res: Response;
  try {
    res = await timed(fetcher, endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ purchase_token: token, product_id: productId }),
    });
  } catch {
    throw new BillingError("NETWORK");
  }
  if (res.ok) {
    const verdict = (await res.json().catch(() => null)) as Verdict | null;
    if (!verdict || typeof verdict.active !== "boolean" || typeof verdict.acknowledged !== "boolean"
      || typeof verdict.status !== "string" || (verdict.ends_at !== null && typeof verdict.ends_at !== "string")) {
      throw new BillingError("VERIFICATION_UNAVAILABLE");
    }
    return verdict;
  }
  if (res.status >= 500) throw new BillingError("VERIFICATION_UNAVAILABLE");
  if (res.status === 401) throw new BillingError("AUTH");
  const error = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
  if (res.status === 409) throw new BillingError(error === "purchase_not_bound" || error === "purchase_bound_to_other_account" ? "NOT_BOUND" : "ALREADY_USED");
  if (res.status === 422 && error === "purchase_not_found") throw new BillingError("NOT_FOUND");
  // Google marks purchases made by a licence tester. The public service refuses them on purpose; "Restore" can never attach one.
  if (res.status === 422 && error === "test_purchase_refused") throw new BillingError("TEST_PURCHASE");
  throw new BillingError("REFUSED");
}

export type Outcome = { kind: "active"; verdict: Verdict } | { kind: "pending" } | { kind: "cancelled" } | { kind: "error"; error: BillingError | Error };

function purchaseFailure(error?: { code?: string; message?: string }): Outcome {
  if (error?.code === "user-cancelled") return { kind: "cancelled" };
  if (["billing-unavailable", "feature-not-supported", "iap-not-available"].includes(error?.code || "")) {
    return { kind: "error", error: new BillingError("STORE_UNAVAILABLE") };
  }
  return { kind: "error", error: new Error(error?.message || "PURCHASE_ERROR") };
}

type CheckoutOptions = {
  currentProductId?: string | null;
  store?: IapLib;
  verify?: typeof verifyOnServer;
  check?: typeof checkCheckoutOnServer;
};

let checkouts = 0;
/** True while a payment sheet or a manual restoration is running: the background recovery stays out of its way. */
export const checkoutInFlight = () => checkouts > 0;

/** Verifies the current purchase before replacing it and completes the new purchase after server confirmation. */
export async function buy(offer: Offer, owner: string, getAccessToken: () => Promise<string | null>, options: CheckoutOptions = {}): Promise<Outcome> {
  checkouts++;
  try {
    return await checkout(offer, owner, getAccessToken, options);
  } finally {
    checkouts--;
  }
}

async function checkout(offer: Offer, owner: string, getAccessToken: () => Promise<string | null>, options: CheckoutOptions): Promise<Outcome> {
  const { currentProductId = null, store: l = iap(), verify = verifyOnServer, check = checkCheckoutOnServer } = options;
  const google: GoogleSubscriptionRequest = {
    skus: [offer.id],
    obfuscatedAccountId: owner,
    subscriptionOffers: [{ sku: offer.id, offerToken: offer.offerToken }],
  };
  try {
    const access = await getAccessToken();
    if (!access) return { kind: "error", error: new BillingError("AUTH") };
    await check(offer.id, access);
    const current = await readCurrentPlayPurchase(owner, l);
    if ((current?.productId ?? null) !== currentProductId || current?.productId === offer.id) throw new BillingError("PLAN_UNCERTAIN");
    const currentAccess = await getAccessToken();
    if (!currentAccess) throw new BillingError("AUTH");
    if (current) {
      const verdict = await verify(current.purchaseToken, current.productId, currentAccess);
      if (!verdict.active || !verdict.acknowledged) throw new BillingError("PLAN_UNCERTAIN");
      if (!(await getAccessToken())) throw new BillingError("AUTH");
      const currentRank = PLANS.findIndex((p) => p.id === current.productId);
      const targetRank = PLANS.findIndex((p) => p.id === offer.id);
      // Immediate changes avoid a second renewal. For a lower tier, Play credits unused value toward the next renewal.
      google.purchaseToken = current.purchaseToken;
      google.subscriptionProductReplacementParams = {
        oldProductId: current.productId,
        replacementMode: targetRank > currentRank ? "charge-full-price" : "with-time-proration",
      };
    }
  } catch (err) {
    return { kind: "error", error: err as Error };
  }
  return new Promise<Outcome>((resolve) => {
    let done = false;
    let verifying = false;
    const finish = (o: Outcome) => {
      if (done) return;
      done = true;
      u.remove();
      e.remove();
      resolve(o);
    };
    const u = l.purchaseUpdatedListener(async (p) => {
      if (done || verifying || p.productId !== offer.id || (google.purchaseToken && p.purchaseToken === google.purchaseToken)) return;
      if (p.purchaseState && p.purchaseState.toLowerCase() === "pending") return finish({ kind: "pending" });
      if (!p.purchaseToken) return finish({ kind: "error", error: new BillingError("REFUSED") });
      verifying = true;
      try {
        const access = await getAccessToken();
        if (!access) return finish({ kind: "error", error: new BillingError("AUTH") });
        const verdict = await verify(p.purchaseToken, p.productId, access);
        if (!(await getAccessToken())) return finish({ kind: "error", error: new BillingError("AUTH") });
        if (verdict.active) await l.finishTransaction({ purchase: p, isConsumable: false }).catch(() => {});
        finish({ kind: "active", verdict });
      } catch (err) {
        finish({ kind: "error", error: err as Error });
      }
    });
    const reportStoreError = (err: { code?: string; message?: string }) => { if (!verifying) finish(purchaseFailure(err)); };
    const e = l.purchaseErrorListener(reportStoreError);
    l.requestPurchase({ request: { google }, type: "subs" }).catch(reportStoreError);
  });
}

/** Sends every active purchase Play knows for this Google account to the server (new phone, reinstall, a purchase whose answer was lost). */
export async function restore(getAccessToken: () => Promise<string | null>, l: IapLib = iap(), verify = verifyOnServer): Promise<{ checked: number; active: number; failed: number; test: number }> {
  checkouts++;
  try {
    return await restoreAll(getAccessToken, l, verify);
  } finally {
    checkouts--;
  }
}

async function restoreAll(getAccessToken: () => Promise<string | null>, l: IapLib, verify: typeof verifyOnServer) {
  if (!(await getAccessToken())) throw new BillingError("AUTH");
  if (!(await l.initConnection())) throw new BillingError("STORE_UNAVAILABLE");
  const purchases = (await l.getAvailablePurchases()) ?? [];
  let active = 0;
  let failed = 0;
  let test = 0;
  for (const p of purchases) {
    if (!p.purchaseToken || !PLANS.some((x) => x.id === p.productId)) continue;
    const access = await getAccessToken();
    if (!access) throw new BillingError("AUTH");
    try {
      const v = await verify(p.purchaseToken, p.productId, access);
      if (!(await getAccessToken())) throw new BillingError("AUTH");
      if (v.active) {
        active++;
        await l.finishTransaction({ purchase: p, isConsumable: false }).catch(() => {});
      }
    } catch (err) {
      // A token already used by another TITAN account, or made without this account's id, is not ours to attach.
      if (!(err instanceof BillingError) || err.code === "NETWORK" || err.code === "VERIFICATION_UNAVAILABLE" || err.code === "AUTH") throw err;
      failed++;
      if (err.code === "TEST_PURCHASE") test++;
    }
  }
  return { checked: purchases.length, active, failed, test };
}

/** Silent safety net for a payment Google accepted but TITAN never confirmed: the app was closed during the bank's check, a pending
    payment cleared later, the network dropped, or the server answered too late. Called at sign-in and when the app returns to the
    foreground. It only looks at purchases Play attributes to THIS account and that are not settled yet (not acknowledged, or the profile
    still has no access), hands their token to the server, and completes them in Play once the server has granted access. It never opens
    a payment sheet, never throws, and stays out of the way of a running checkout. Returns how many purchases became active. */
export async function recoverPurchases(
  owner: string,
  getAccessToken: () => Promise<string | null>,
  options: { hasAccess?: boolean | null; store?: IapLib; verify?: typeof verifyOnServer } = {},
): Promise<number> {
  const { hasAccess = null, store: l = iap(), verify = verifyOnServer } = options;
  if (checkoutInFlight()) return 0;
  let recovered = 0;
  try {
    if (!(await getAccessToken()) || !(await l.initConnection())) return 0;
    const purchases = (await l.getAvailablePurchases()) ?? [];
    for (const p of purchases) {
      if (checkoutInFlight()) break;
      if (!p.purchaseToken || !PLANS.some((x) => x.id === p.productId) || p.obfuscatedAccountIdAndroid !== owner) continue;
      if (p.purchaseState && p.purchaseState.toLowerCase() !== "purchased") continue;
      if (p.isAcknowledgedAndroid === true && hasAccess === true) continue;
      const access = await getAccessToken();
      if (!access) break;
      try {
        const verdict = await verify(p.purchaseToken, p.productId, access);
        if (!(await getAccessToken())) break;
        if (verdict.active) {
          recovered++;
          await l.finishTransaction({ purchase: p, isConsumable: false }).catch(() => {});
        }
      } catch (err) {
        // The service is down or the session ended: the next foreground tries again. Any other refusal concerns this token only.
        if (!(err instanceof BillingError) || err.code === "NETWORK" || err.code === "VERIFICATION_UNAVAILABLE" || err.code === "AUTH") break;
      }
    }
  } catch { /* Play is unreachable on this device right now: nothing to recover, nothing to report. */ }
  return recovered;
}

/** Open the store's management and cancellation screen for an existing subscription. */
export const manageInPlay = (productId?: PlanId, l: IapLib = iap()) => l.deepLinkToSubscriptions(productId ? { skuAndroid: productId } : {});

export const messageFor = (e: unknown): string => {
  const code = e instanceof BillingError ? e.code : "";
  return (
    {
      CHECKOUT_UNAVAILABLE: "Le service d’abonnement TITAN est indisponible. Réessaie plus tard.",
      VERIFICATION_UNAVAILABLE: "TITAN ne peut pas vérifier ton achat pour le moment. Consulte Google Play, puis utilise « Restaurer mes achats ».",
      STORE_UNAVAILABLE: "La facturation Google Play est indisponible sur cet appareil ou ce compte. Vérifie le compte Play et la version installée.",
      PLAN_UNCERTAIN: "Vérifie ton abonnement dans Google Play ou utilise « Restaurer mes achats » avant de choisir une offre.",
      AUTH: "Reconnecte-toi, puis réessaie.",
      ALREADY_USED: "Cet abonnement est déjà utilisé par un autre compte TITAN.",
      NOT_BOUND: "Cet achat n’a pas été fait depuis ce compte TITAN. Il n’est pas rattaché.",
      NOT_FOUND: "Google Play ne reconnaît pas cet achat.",
      NETWORK: "Connexion indisponible. Consulte Google Play, puis utilise « Restaurer mes achats ».",
      REFUSED: "L’achat n’a pas pu être confirmé. Consulte Google Play, puis utilise « Restaurer mes achats ».",
      TEST_PURCHASE: "Google Play signale un achat de test (compte testeur de licence). Le service public TITAN n’ouvre aucun accès pour un achat de test, et « Restaurer mes achats » ne le rattachera pas. Un achat de test n’est pas un paiement réel.",
    } as Record<string, string>
  )[code] ?? "L’opération a échoué. Consulte tes abonnements dans Google Play, puis réessaie.";
};
