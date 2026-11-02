import { useCallback, useEffect, useRef } from "react";
import { useOwner } from "../data/auth";
import { countSession, interstitialAllowed, recordShown, type AdState } from "./policy";
import { sessionInterstitial } from "./sdk";
import { loadAdState, saveAdState } from "./store";
import { useAdContext, useAdsStart } from "./useAds";

/** After-session advertising, from the result screen only.
    - counts the session once it is CONFIRMED by the server (never a queued or failed save);
    - preloads in the background when the policy could allow one;
    - at "Terminer", shows it only if it is already loaded and every ceiling allows it; otherwise the user simply leaves.
    The caller always navigates itself: this hook never blocks, delays or replaces the user's action. */
export function useSessionInterstitial(eventId: string, confirmed: boolean, countable: boolean) {
  const owner = useOwner();
  const c = useAdContext();
  useAdsStart(c);
  const state = useRef<AdState | null>(null);
  const ctx = useRef(c);
  ctx.current = { ...c, now: Date.now(), busy: !confirmed };

  useEffect(() => {
    if (!confirmed || !countable) return;
    let alive = true;
    (async () => {
      const s = countSession(await loadAdState(owner), eventId);
      state.current = s;
      await saveAdState(owner, s);
      if (alive && c.enabled && interstitialAllowed(s, { ...ctx.current, busy: false }, true).ok) sessionInterstitial.prepare();
    })().catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, eventId, confirmed, countable, c.enabled, c.sdkReady, c.consent, c.premium]);

  return useCallback(async () => {
    try {
      const s = state.current ?? (await loadAdState(owner));
      if (!ctx.current.enabled || !interstitialAllowed(s, ctx.current, sessionInterstitial.isReady()).ok) return false;
      const shown = await sessionInterstitial.show();
      if (shown) await saveAdState(owner, recordShown(s, Date.now()));
      return shown;
    } catch {
      return false;
    }
  }, [owner]);
}
