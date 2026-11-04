import { useCallback, useEffect, useRef } from "react";
import { useOwner } from "../data/auth";
import { countSession, interstitialAllowed, recordShown, type AdState } from "./policy";
import { sessionInterstitial } from "./sdk";
import { updateAdState } from "./store";
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
  const state = useRef<{ owner: string; eventId: string; value: AdState } | null>(null);
  const showing = useRef(false);
  const ctx = useRef(c);
  ctx.current = { ...c, now: Date.now(), busy: !confirmed || !countable };

  useEffect(() => {
    state.current = null;
    if (!confirmed || !countable || !eventId) return;
    let alive = true;
    (async () => {
      const s = await updateAdState(owner, (previous) => countSession(previous, eventId));
      if (!alive) return;
      state.current = { owner, eventId, value: s };
      if (alive && c.enabled && interstitialAllowed(s, { ...ctx.current, busy: false }, true).ok) sessionInterstitial.prepare();
    })().catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, eventId, confirmed, countable, c.enabled, c.sdkReady, c.consent, c.premium]);

  return useCallback(async () => {
    if (showing.current) return false;
    try {
      const current = state.current;
      // An unread/stale result is skipped immediately: never await storage and show after the transition.
      if (!confirmed || !countable || !current || current.owner !== owner || current.eventId !== eventId) return false;
      const s = current.value;
      if (!ctx.current.enabled || !interstitialAllowed(s, ctx.current, sessionInterstitial.isReady()).ok) return false;
      showing.current = true;
      const shown = await sessionInterstitial.show();
      if (shown) {
        state.current = { owner, eventId, value: recordShown(s, Date.now()) };
        await updateAdState(owner, (latest) => recordShown(latest, Date.now()));
      }
      return shown;
    } catch {
      return false;
    } finally {
      showing.current = false;
    }
  }, [owner, eventId, confirmed, countable]);
}
