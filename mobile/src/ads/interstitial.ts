/* One interstitial, pre-loaded in the background and shown ONLY at a natural transition when it is already ready.
   `show()` never waits: no ad ready means no ad. Errors close the controller quietly. */
export type FullscreenAd = {
  load(): void;
  show(): Promise<void>;
  onLoaded(l: () => void): () => void;
  onClosed(l: () => void): () => void;
  onError(l: () => void): () => void;
};
/** Google keeps a loaded interstitial valid for one hour: an older one is dropped, never shown. */
export const INTERSTITIAL_MAX_AGE_MS = 55 * 60_000;
export function createInterstitial(make: () => FullscreenAd, now: () => number = Date.now) {
  let ad: FullscreenAd | null = null;
  let ready = false;
  let loadedAt = 0;
  let showing = false;
  let offs: (() => void)[] = [];
  const reset = () => {
    offs.forEach((o) => o());
    offs = [];
    ad = null;
    ready = false;
    loadedAt = 0;
  };
  const stale = () => ready && now() - loadedAt > INTERSTITIAL_MAX_AGE_MS;
  return {
    isReady: () => ready && !showing && !stale(),
    /** Starts loading (once). Safe to call on every render of the result screen. */
    prepare() {
      if (showing) return;
      if (ad && stale()) reset();
      if (ad) return;
      try {
        ad = make();
        offs.push(
          ad.onLoaded(() => {
            ready = true;
            loadedAt = now();
          }),
          ad.onError(() => reset()),
          ad.onClosed(() => {
            showing = false;
            reset();
          }),
        );
        ad.load();
      } catch {
        reset();
      }
    },
    /** True when the ad was handed to the system. The caller has already checked the frequency policy. */
    async show(): Promise<boolean> {
      if (stale()) reset();
      if (!ad || !ready || showing) return false;
      showing = true;
      try {
        await ad.show();
        return true;
      } catch {
        showing = false;
        reset();
        return false;
      }
    },
    dispose: reset,
  };
}
export type InterstitialController = ReturnType<typeof createInterstitial>;
