import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { useOwner } from "../data/auth";
import { useDrafts } from "../data/drafts";
import { adsSuppression } from "./suppression";
import { useProfile } from "../data/hooks";
import { recorder } from "../lib/gpsNative";
import type { Recording } from "../lib/gpsRecorder";
import { useOnline } from "../lib/network";
import { useServerFlag } from "../data/flags";
import { ADS_BUILD, ADS_FLAG, INTERSTITIAL_FLAG } from "./adIds";
import { adsManager } from "./sdk";
import { bannerAllowed, type Context, type Verdict } from "./policy";

/** True while a GPS recording is open (running or paused, not yet saved): no advertising may appear around an effort in progress. */
export function useEffortActive(): boolean {
  const owner = useOwner();
  // Unknown (not read yet) counts as "active": no advertising flashes before we know whether an effort is open.
  const [loaded, setLoaded] = useState<{ owner: string; rec: Recording | null } | null>(null);
  useEffect(() => {
    let alive = true;
    recorder.load(owner).then((rec) => alive && setLoaded({ owner, rec })).catch(() => {});
    const off = recorder.subscribe((rec) => {
      if (alive && (rec === null || rec.owner === owner)) setLoaded({ owner, rec });
    });
    return () => {
      alive = false;
      off();
    };
  }, [owner]);
  return !loaded || loaded.owner !== owner || (loaded.rec !== null && loaded.rec.status !== "ended");
}

/** The build switch AND the server switches. Nothing is read from the server in a build without ads. */
export function useAdsRemote(): { banners: boolean; interstitial: boolean } {
  const built = ADS_BUILD && Platform.OS === "android";
  const banners = useServerFlag(ADS_FLAG, built);
  const interstitial = useServerFlag(INTERSTITIAL_FLAG, built);
  return { banners: built && banners, interstitial: built && banners && interstitial };
}

/** What the advertising policy needs to know right now. Premium comes from the server-validated profile (is_elite also covers a seat included by a coach). */
export function useAdContext(): Context & { enabled: boolean; interstitial: boolean } {
  const owner = useOwner();
  const draft = useDrafts();
  const tutorial = useSyncExternalStore(adsSuppression.subscribe, () => adsSuppression.get(owner));
  const profile = useProfile().data;
  const online = useOnline();
  const effort = useEffortActive();
  const state = useSyncExternalStore(adsManager.subscribe, adsManager.get);
  const remote = useAdsRemote();
  const enabled = remote.banners;
  const interstitial = remote.interstitial;
  return useMemo(
    () => ({
      enabled,
      interstitial,
      now: Date.now(),
      premium: !!profile?.is_elite,
      profileKnown: profile !== undefined && profile !== null,
      consent: state.canRequestAds,
      sdkReady: state.phase === "ready",
      online,
      sessionActive: effort || tutorial || !draft.ready || draft.timer.started !== null || draft.timer.elapsed > 0,
      busy: false,
    }),
    [enabled, interstitial, profile, online, effort, state, tutorial, draft.ready, draft.timer.started, draft.timer.elapsed],
  );
}

/** Starts consent + SDK once a placement could be shown (free account, rights known, no effort). Never for Premium: they do not even see the consent form. */
export function useAdsStart(c: Context & { enabled: boolean }) {
  const wanted = c.enabled && c.profileKnown && !c.premium && !c.sessionActive;
  useEffect(() => {
    if (wanted) adsManager.start().catch(() => {});
  }, [wanted]);
}

export const verdictFor = (c: Context & { enabled: boolean }): Verdict => (c.enabled ? bannerAllowed(c) : { ok: false, why: "ads-off" });
