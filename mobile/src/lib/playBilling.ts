/* Google Play Billing for TITAN+ and the Coach offers. The store sells; the SERVER decides. This module only
   (1) reads the offers and their real prices from Google Play (no price is written in the app), (2) opens the payment
   sheet with the signed-in account id attached to the purchase, (3) hands the purchase token to our server, which checks
   it with Google and grants access, and (4) completes the purchase in Play only after the server has answered.
   Off unless the build sets EXPO_PUBLIC_TITAN_BILLING=1 AND the server has billing switched on. */
import { SITE_URL } from "./config";

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
export type IapPurchase = { productId: string; purchaseToken?: string | null; purchaseState?: string };
export type IapProduct = { id: string; title?: string; displayName?: string | null; displayPrice: string; subscriptionOffers?: { id?: string; offerTokenAndroid?: string | null; basePlanIdAndroid?: string | null; displayPrice: string }[] | null };
export type IapLib = {
  initConnection(): Promise<boolean>;
  endConnection(): Promise<unknown>;
  fetchProducts(a: { skus: string[]; type: "subs" }): Promise<IapProduct[] | null | undefined>;
  requestPurchase(a: { request: { google: { skus: string[]; obfuscatedAccountId: string; subscriptionOffers: { sku: string; offerToken: string }[] } }; type: "subs" }): Promise<unknown>;
  getAvailablePurchases(): Promise<IapPurchase[]>;
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

/** The offers Google Play actually returns for this account, with Google's own formatted price. A product Play does not know is simply absent. */
export async function loadOffers(l: IapLib = iap()): Promise<Offer[]> {
  if (!(await l.initConnection())) throw new Error("STORE_UNAVAILABLE");
  const products = (await l.fetchProducts({ skus: PLANS.map((p) => p.id), type: "subs" })) ?? [];
  const out: Offer[] = [];
  for (const plan of PLANS) {
    const p = products.find((x) => x.id === plan.id);
    const offer = p?.subscriptionOffers?.find((o) => o.offerTokenAndroid);
    if (p && offer?.offerTokenAndroid) out.push({ id: plan.id, name: plan.name, tagline: plan.tagline, perks: plan.perks, price: offer.displayPrice || p.displayPrice, offerToken: offer.offerTokenAndroid });
  }
  return out;
}

export type Verdict = { active: boolean; status: string; ends_at: string | null; acknowledged: boolean };
export class BillingError extends Error {
  constructor(public code: "DISABLED" | "AUTH" | "ALREADY_USED" | "NOT_BOUND" | "NOT_FOUND" | "NETWORK" | "REFUSED") {
    super(code);
  }
}

/** Asks our server to check a purchase token with Google. The account is the one signed in on this phone. */
export async function verifyOnServer(token: string, productId: string, accessToken: string, fetcher: typeof fetch = fetch): Promise<Verdict> {
  let res: Response;
  try {
    res = await fetcher(`${SITE_URL}/functions/play-billing`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ purchase_token: token, product_id: productId }),
    });
  } catch {
    throw new BillingError("NETWORK");
  }
  if (res.ok) return (await res.json()) as Verdict;
  const error = ((await res.json().catch(() => ({}))) as { error?: string }).error;
  if (res.status === 503) throw new BillingError("DISABLED");
  if (res.status === 401) throw new BillingError("AUTH");
  if (res.status === 409) throw new BillingError(error === "purchase_not_bound" || error === "purchase_bound_to_other_account" ? "NOT_BOUND" : "ALREADY_USED");
  if (res.status === 422) throw new BillingError("NOT_FOUND");
  throw new BillingError("REFUSED");
}

export type Outcome = { kind: "active"; verdict: Verdict } | { kind: "pending" } | { kind: "cancelled" } | { kind: "error"; error: BillingError | Error };

/** Opens the payment sheet. Resolves once Play reports the purchase and the server has answered; the purchase is completed in Play only when the server says it recorded access. */
export function buy(offer: Offer, owner: string, getAccessToken: () => Promise<string | null>, l: IapLib = iap(), verify = verifyOnServer): Promise<Outcome> {
  return new Promise<Outcome>((resolve) => {
    let done = false;
    const finish = (o: Outcome) => {
      if (done) return;
      done = true;
      u.remove();
      e.remove();
      resolve(o);
    };
    const u = l.purchaseUpdatedListener(async (p) => {
      if (p.productId !== offer.id) return;
      if (p.purchaseState && p.purchaseState.toLowerCase() === "pending") return finish({ kind: "pending" });
      if (!p.purchaseToken) return finish({ kind: "error", error: new BillingError("REFUSED") });
      try {
        const access = await getAccessToken();
        if (!access) return finish({ kind: "error", error: new BillingError("AUTH") });
        const verdict = await verify(p.purchaseToken, p.productId, access);
        if (verdict.active) await l.finishTransaction({ purchase: p, isConsumable: false }).catch(() => {});
        finish({ kind: "active", verdict });
      } catch (err) {
        finish({ kind: "error", error: err as Error });
      }
    });
    const e = l.purchaseErrorListener((err) => finish(err.code === "user-cancelled" ? { kind: "cancelled" } : { kind: "error", error: new Error(err.message || "PURCHASE_ERROR") }));
    // The signed-in account id travels with the purchase: the server refuses a token made for anybody else.
    l.requestPurchase({ request: { google: { skus: [offer.id], obfuscatedAccountId: owner, subscriptionOffers: [{ sku: offer.id, offerToken: offer.offerToken }] } }, type: "subs" }).catch((err) =>
      finish(err?.code === "user-cancelled" ? { kind: "cancelled" } : { kind: "error", error: err as Error }),
    );
  });
}

/** Sends every active purchase Play knows for this Google account to the server (new phone, reinstall, a purchase whose answer was lost). */
export async function restore(getAccessToken: () => Promise<string | null>, l: IapLib = iap(), verify = verifyOnServer): Promise<{ checked: number; active: number; failed: number }> {
  if (!(await l.initConnection())) throw new Error("STORE_UNAVAILABLE");
  const purchases = (await l.getAvailablePurchases()) ?? [];
  let active = 0;
  let failed = 0;
  const access = await getAccessToken();
  if (!access) throw new BillingError("AUTH");
  for (const p of purchases) {
    if (!p.purchaseToken || !PLANS.some((x) => x.id === p.productId)) continue;
    try {
      const v = await verify(p.purchaseToken, p.productId, access);
      if (v.active) {
        active++;
        await l.finishTransaction({ purchase: p, isConsumable: false }).catch(() => {});
      }
    } catch (err) {
      // A token already used by another TITAN account, or made without this account's id, is not ours to attach.
      if (!(err instanceof BillingError) || err.code === "NETWORK" || err.code === "DISABLED") throw err;
      failed++;
    }
  }
  return { checked: purchases.length, active, failed };
}

/** Plan changes and cancellation are done in Google Play's own subscription centre (separate subscriptions, one bill each). */
export const manageInPlay = (productId?: PlanId, l: IapLib = iap()) => l.deepLinkToSubscriptions(productId ? { skuAndroid: productId } : {});

export const messageFor = (e: unknown): string => {
  const code = e instanceof BillingError ? e.code : "";
  return (
    {
      DISABLED: "Les abonnements ne sont pas encore ouverts. Rien n’a été débité.",
      AUTH: "Reconnecte-toi, puis réessaie.",
      ALREADY_USED: "Cet abonnement est déjà utilisé par un autre compte TITAN.",
      NOT_BOUND: "Cet achat n’a pas été fait depuis ce compte TITAN. Il n’est pas rattaché.",
      NOT_FOUND: "Google Play ne reconnaît pas cet achat.",
      NETWORK: "Pas de réseau : ton achat est gardé par Google Play, utilise « Restaurer mes achats » plus tard.",
      REFUSED: "L’achat n’a pas pu être confirmé. Il est gardé par Google Play : réessaie « Restaurer mes achats ».",
    } as Record<string, string>
  )[code] ?? "L’achat n’a pas abouti. Tu n’as rien perdu : réessaie.";
};
