import { useEffect, useState } from "react";
import { readJSON, writeJSON } from "./storage";

/* The guided visit shown before sign-up, the first time TITAN is opened on a phone. Its state belongs to the phone, not to an
   account: there is no account yet. It holds two things only, whether the visit is behind us (finished, skipped, or the phone
   already had an account) and, when it was interrupted, the step to resume at. Nothing here talks to the server. */
export const FIRST_VISIT_KEY = "titan.first-visit.v1";
export const FIRST_VISIT_STEPS = 4;
export type FirstVisit = { seen: boolean; step: number };

const clampStep = (n: unknown) => (Number.isInteger(n) && (n as number) >= 0 && (n as number) < FIRST_VISIT_STEPS ? (n as number) : 0);

export async function loadFirstVisit(): Promise<FirstVisit> {
  const raw = await readJSON<Partial<FirstVisit> | null>(FIRST_VISIT_KEY, null);
  return { seen: raw?.seen === true, step: clampStep(raw?.step) };
}

/** Remembers where an unfinished visit stands, so closing the app in the middle resumes it instead of restarting or losing it. */
export function saveFirstVisitStep(step: number) {
  return writeJSON(FIRST_VISIT_KEY, { seen: false, step: clampStep(step) }).catch(() => {});
}

/** Finished, skipped, or not needed: the visit never opens by itself again on this phone. */
export function closeFirstVisit() {
  return writeJSON(FIRST_VISIT_KEY, { seen: true, step: 0 }).catch(() => {});
}

/** `undefined` while the phone's storage is being read: the navigator waits instead of flashing the wrong first screen.
    A phone that is, or has been, signed in never gets the visit by itself: an existing user is not walked through after an update. */
export function useFirstVisit(signedIn: boolean): FirstVisit | undefined {
  const [state, setState] = useState<FirstVisit | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    loadFirstVisit().then((v) => {
      if (!alive) return;
      if (signedIn && !v.seen) {
        closeFirstVisit();
        setState({ seen: true, step: 0 });
      } else setState(v);
    });
    return () => {
      alive = false;
    };
  }, [signedIn]);
  return state;
}
