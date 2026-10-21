/* Server receipts of the sessions sent during this app run, so the result screen can show the XP actually granted. */
import { useSyncExternalStore } from "react";
import type { SubmitReceipt } from "./api";

let receipts: Record<string, SubmitReceipt> = {};
const listeners = new Set<() => void>();

export function rememberReceipt(eventId: string, receipt: SubmitReceipt) {
  receipts = { ...receipts, [eventId]: receipt };
  listeners.forEach((l) => l());
}

export function useReceipt(eventId: string | null | undefined) {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (eventId ? receipts[eventId] : undefined),
  );
}
