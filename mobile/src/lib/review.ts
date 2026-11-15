/* AUD-13: ask for a Google Play rating at a proud moment, rarely. The Play In-App Review dialog is shown by Google (TITAN never
   sees the rating nor whether it was given); Google also applies its own quota, so the request may silently show nothing.
   Rules: never before the third confirmed session, never for a historical session, only after a new record or from the tenth
   confirmed session, and at most once every 90 days per account on this phone. Nothing is sent to TITAN's servers. */
import * as StoreReview from "expo-store-review";
import { ownerKey, readJSON, writeJSON } from "./storage";

export const REVIEW_MIN_SESSIONS = 3;
export const REVIEW_SESSIONS = 10;
export const REVIEW_COOLDOWN_DAYS = 90;
const DAY = 86_400_000;

export type ReviewContext = { confirmedSessions: number; newRecord: boolean; historical: boolean; lastAskedAt: number | null; now: number };

export function shouldAskForReview({ confirmedSessions, newRecord, historical, lastAskedAt, now }: ReviewContext): boolean {
  if (historical || confirmedSessions < REVIEW_MIN_SESSIONS) return false;
  if (!newRecord && confirmedSessions < REVIEW_SESSIONS) return false;
  return lastAskedAt == null || now - lastAskedAt >= REVIEW_COOLDOWN_DAYS * DAY;
}

/** Called at « Terminer » on the result screen, after the session is confirmed. Never throws, never blocks the navigation. */
export async function maybeAskForReview(owner: string, ctx: Omit<ReviewContext, "lastAskedAt" | "now">, now = Date.now()): Promise<boolean> {
  try {
    const key = ownerKey("review", owner);
    const state = await readJSON<{ lastAskedAt: number | null }>(key, { lastAskedAt: null });
    if (!shouldAskForReview({ ...ctx, lastAskedAt: state.lastAskedAt, now })) return false;
    if (!(await StoreReview.isAvailableAsync())) return false;
    // Written first: a crash or a second tap must not ask twice.
    await writeJSON(key, { lastAskedAt: now });
    await StoreReview.requestReview();
    return true;
  } catch {
    return false;
  }
}
