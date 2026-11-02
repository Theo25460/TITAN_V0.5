/* The ONLY file that touches the native Google Mobile Ads module. Loaded lazily, never in release builds without the ads switch. */
import { createAdsManager, type AdsSdk } from "./manager";
import { createInterstitial, type FullscreenAd } from "./interstitial";
import { interstitialUnit } from "./adIds";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const lib = () => require("react-native-google-mobile-ads") as typeof import("react-native-google-mobile-ads");

const real = (): AdsSdk => {
  const g = lib();
  return {
    consent: g.AdsConsent as unknown as AdsSdk["consent"],
    async configure() {
      const ads = g.default();
      // Rated for teens and above, never child-directed; the app is for 13+.
      await ads.setRequestConfiguration({ maxAdContentRating: g.MaxAdContentRating.PG, tagForChildDirectedTreatment: false, tagForUnderAgeOfConsent: false });
      await ads.initialize();
    },
  };
};

export const adsManager = createAdsManager(real);

export const sessionInterstitial = createInterstitial((): FullscreenAd => {
  const g = lib();
  const ad = g.InterstitialAd.createForAdRequest(interstitialUnit(), { requestNonPersonalizedAdsOnly: false });
  return {
    load: () => ad.load(),
    show: () => ad.show(),
    onLoaded: (l) => ad.addAdEventListener(g.AdEventType.LOADED, l),
    onClosed: (l) => ad.addAdEventListener(g.AdEventType.CLOSED, l),
    onError: (l) => ad.addAdEventListener(g.AdEventType.ERROR, l),
  };
});

export const bannerParts = () => {
  const g = lib();
  return { BannerAd: g.BannerAd, size: g.BannerAdSize.INLINE_ADAPTIVE_BANNER };
};
