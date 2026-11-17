/* Safety net for subscriptions: a payment Google Play accepted must end up as access in TITAN even when the app was closed, offline or
   too slow at the moment of purchase. At sign-in, when the app returns to the foreground and when the connection comes back, purchases
   Play attributes to this account and that are not settled yet are handed to the server again (see recoverPurchases). Silent by design:
   the payment screen keeps its own messages. Only present in builds that sell through Google Play. */
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState } from "react-native";
import { BILLING_BUILD, recoverPurchases } from "../lib/playBilling";
import { isOnline, onReconnect } from "../lib/network";
import { supabase } from "../lib/supabase";
import { type Profile } from "../core/types";
import { useAuth } from "./auth";
import { keys } from "./hooks";

/** A foreground return right after a check does not ask Play and the server again. */
export const RECOVERY_MIN_INTERVAL_MS = 5 * 60_000;

export function BillingRecovery({ enabled = BILLING_BUILD, recover = recoverPurchases }: { enabled?: boolean; recover?: typeof recoverPurchases }) {
  const { owner } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled || !owner) return;
    let alive = true;
    let running = false;
    let last = 0;
    const accessToken = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      return alive && session?.user.id === owner ? session.access_token : null;
    };
    const run = async () => {
      if (running || !isOnline() || Date.now() - last < RECOVERY_MIN_INTERVAL_MS) return;
      running = true;
      last = Date.now();
      try {
        const profile = qc.getQueryData<Profile | null>(keys.profile(owner));
        const recovered = await recover(owner, accessToken, { hasAccess: profile ? profile.is_elite === true : null });
        if (alive && recovered > 0) await qc.invalidateQueries({ queryKey: keys.profile(owner) });
      } catch { /* recoverPurchases never throws; an injected one must not break the app either. */ } finally {
        running = false;
      }
    };
    void run();
    const off = onReconnect(() => void run());
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void run();
    });
    return () => {
      alive = false;
      off();
      sub.remove();
    };
  }, [enabled, owner, qc, recover]);
  return null;
}
