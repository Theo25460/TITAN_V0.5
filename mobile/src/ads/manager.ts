/* Consent + SDK start, as a small state machine with injected dependencies (so it is tested without any native code).
   The SDK is initialised ONLY after Google's consent framework (UMP) says ads may be requested. A refusal, an error or a
   missing network leaves the app exactly as it is without ads: nothing throws, nothing waits. */
export type ConsentInfo = { status?: string; canRequestAds: boolean; privacyOptionsRequirementStatus?: string };
export type ConsentApi = {
  requestInfoUpdate(o?: { tagForUnderAgeOfConsent?: boolean }): Promise<ConsentInfo | void>;
  loadAndShowConsentFormIfRequired(): Promise<ConsentInfo>;
  showPrivacyOptionsForm(): Promise<ConsentInfo | void>;
  getConsentInfo(): Promise<ConsentInfo>;
};
export type AdsSdk = {
  consent: ConsentApi;
  configure(): Promise<void>; // request configuration (content rating, no child-directed treatment) then initialize()
};
export type Phase = "idle" | "starting" | "ready" | "denied" | "error";
export type AdsState = { phase: Phase; canRequestAds: boolean; privacyOptions: boolean };

export function createAdsManager(load: () => AdsSdk, now: () => number = Date.now) {
  let state: AdsState = { phase: "idle", canRequestAds: false, privacyOptions: false };
  let starting: Promise<AdsState> | null = null;
  let failedAt = 0;
  const listeners = new Set<() => void>();
  const set = (next: AdsState) => {
    state = next;
    listeners.forEach((l) => l());
  };
  const fromInfo = (i: ConsentInfo | void | undefined, phase: Phase): AdsState => ({ phase, canRequestAds: !!i?.canRequestAds, privacyOptions: i?.privacyOptionsRequirementStatus === "REQUIRED" });

  async function run(): Promise<AdsState> {
    set({ ...state, phase: "starting" });
    try {
      const sdk = load();
      await sdk.consent.requestInfoUpdate({ tagForUnderAgeOfConsent: false });
      const info = await sdk.consent.loadAndShowConsentFormIfRequired();
      if (!info.canRequestAds) {
        set(fromInfo(info, "denied"));
        return state;
      }
      await sdk.configure();
      set(fromInfo(info, "ready"));
    } catch {
      failedAt = now();
      set({ ...state, phase: "error", canRequestAds: false });
    }
    return state;
  }

  return {
    get: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    /** Idempotent. After an error, tries again at most once a minute. A refusal is not retried: the user can change it in the privacy settings. */
    start(): Promise<AdsState> {
      if (state.phase === "ready" || state.phase === "denied") return Promise.resolve(state);
      if (state.phase === "error" && now() - failedAt < 60_000) return Promise.resolve(state);
      return (starting ??= run().finally(() => {
        starting = null;
      }));
    },
    /** Opens Google's privacy-options form; if the choice now allows ads, starts the SDK. */
    async openPrivacyOptions(): Promise<AdsState> {
      try {
        const sdk = load();
        await sdk.consent.showPrivacyOptionsForm();
        const info = await sdk.consent.getConsentInfo();
        if (info.canRequestAds && state.phase !== "ready") {
          await sdk.configure();
          set(fromInfo(info, "ready"));
        } else set(fromInfo(info, info.canRequestAds ? "ready" : "denied"));
      } catch {
        /* the form could not be shown: nothing changes */
      }
      return state;
    },
    _resetForTests() {
      state = { phase: "idle", canRequestAds: false, privacyOptions: false };
      starting = null;
      failedAt = 0;
    },
  };
}
export type AdsManager = ReturnType<typeof createAdsManager>;
