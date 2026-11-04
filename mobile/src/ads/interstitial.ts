/* One interstitial, pre-loaded in the background and shown ONLY at a natural transition when it is already ready.
   `show()` never waits: no ad ready means no ad. Errors close the controller quietly. */
export type FullscreenAd = {
  load(): void;
  show(): Promise<void>;
  onLoaded(l: () => void): () => void;
  onClosed(l: () => void): () => void;
  onError(l: () => void): () => void;
};
export function createInterstitial(make: () => FullscreenAd) {
  let ad: FullscreenAd | null = null;
  let ready = false;
  let showing = false;
  let offs: (() => void)[] = [];
  const reset = () => {
    offs.forEach((o) => o());
    offs = [];
    ad = null;
    ready = false;
  };
  return {
    isReady: () => ready && !showing,
    /** Starts loading (once). Safe to call on every render of the result screen. */
    prepare() {
      if (ad || showing) return;
      try {
        ad = make();
        offs.push(
          ad.onLoaded(() => (ready = true)),
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
