/* Google AdMob identifiers (owner-provided, final) and the switches that keep them silent until the environment is ready.
   Nothing here is a secret: ad unit ids are public by design. Three modes:
   - default (release builds today): the ads module is OFF, no request is ever made;
   - EXPO_PUBLIC_TITAN_ADS=1: ads ON with Google's TEST units only (safe to tap, no revenue, no policy risk);
   - EXPO_PUBLIC_TITAN_ADS=1 and EXPO_PUBLIC_TITAN_ADS_LIVE=1: the owner's real units (never in __DEV__). */
export const ADMOB_APP_ID = "ca-app-pub-8126986266950187~1902494129";

export const LIVE_UNITS = {
  hq: "ca-app-pub-8126986266950187/7318104775", // QG, banner
  journal: "ca-app-pub-8126986266950187/4447352676", // Journal, banner
  stats: "ca-app-pub-8126986266950187/3187288070", // Statistiques, banner
  sessionEnd: "ca-app-pub-8126986266950187/2101884223", // after a recorded session, interstitial
  nativeReserved: "ca-app-pub-8126986266950187/7536550445", // reserved for a later, validated placement: shown nowhere
} as const;

/** Google's documented test units (https://developers.google.com/admob/android/test-ads). */
export const TEST_UNITS = { banner: "ca-app-pub-3940256099942544/9214589741", interstitial: "ca-app-pub-3940256099942544/1033173712" } as const;

export type Placement = "hq" | "journal" | "stats";

export const ADS_BUILD = process.env.EXPO_PUBLIC_TITAN_ADS === "1";
export const ADS_LIVE = ADS_BUILD && process.env.EXPO_PUBLIC_TITAN_ADS_LIVE === "1" && !(typeof __DEV__ !== "undefined" && __DEV__);

export const bannerUnit = (p: Placement, live = ADS_LIVE) => (live ? LIVE_UNITS[p] : TEST_UNITS.banner);
export const interstitialUnit = (live = ADS_LIVE) => (live ? LIVE_UNITS.sessionEnd : TEST_UNITS.interstitial);
