import { memo, useEffect, useState } from "react";
import { LayoutAnimation, View } from "react-native";
import { bannerUnit, type Placement } from "../ads/adIds";
import { bannerParts } from "../ads/sdk";
import { useAdContext, useAdsStart, verdictFor } from "../ads/useAds";
import { colors, radius, space } from "../theme/tokens";
import { T } from "./Text";

/** A discreet, clearly labelled, inline adaptive banner. Nothing is rendered unless the whole policy allows it (free account,
    consent given, SDK ready, online, no effort in progress). Space is reserved only while the ad is loading (6 s at most) and
    collapses at once if there is no ad, so the screen never keeps a hole. Premium accounts never see this component's output. */
export const AdBanner = memo(function AdBanner({ placement }: { placement: Placement }) {
  const c = useAdContext();
  useAdsStart(c);
  const ok = verdictFor(c).ok;
  const [state, setState] = useState<"loading" | "shown" | "none">("loading");
  const [h, setH] = useState(60);
  useEffect(() => {
    if (!ok) return;
    setState("loading");
    const t = setTimeout(() => setState((s) => (s === "loading" ? "none" : s)), 6000);
    return () => clearTimeout(t);
  }, [ok, placement]);
  if (!ok || state === "none") return null;
  const { BannerAd, size } = bannerParts();
  const collapse = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setState("none");
  };
  return (
    <View
      accessible
      accessibilityLabel="Publicité"
      importantForAccessibility="yes"
      style={{ minHeight: state === "loading" ? 60 : h + 22, borderRadius: radius.r3, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, paddingHorizontal: space.s2, paddingBottom: space.s2, overflow: "hidden", alignItems: "center" }}
      testID={`ad-${placement}`}
    >
      <T variant="caption" tone="faint" style={{ alignSelf: "flex-start", paddingVertical: 2 }}>
        Publicité
      </T>
      <BannerAd
        unitId={bannerUnit(placement)}
        size={size}
        maxHeight={90}
        requestOptions={{ requestNonPersonalizedAdsOnly: false }}
        onAdLoaded={(d?: { height?: number }) => {
          if (d?.height) setH(Math.min(90, Math.max(50, d.height)));
          setState("shown");
        }}
        onSizeChange={(d) => d?.height && setH(Math.min(90, Math.max(50, d.height)))}
        onAdFailedToLoad={collapse}
      />
    </View>
  );
});
