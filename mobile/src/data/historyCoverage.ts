/* V1.6.6 — what this phone holds of each account's history (src/core/web/history-window.js coverageOf), kept per owner so a coverage
   never crosses accounts; read by the journal and the records to never present a partial copy as a complete total. */
import { useSyncExternalStore } from "react";
import type { HistoryCoverage } from "../core";

const coverages = new Map<string, HistoryCoverage | null>();
const listeners = new Set<() => void>();

export function setCoverage(owner: string, coverage: HistoryCoverage | null) {
  coverages.set(owner, coverage);
  listeners.forEach((l) => l());
}
export const coverageOf = (owner: string) => coverages.get(owner) ?? null;
export function useCoverage(owner: string) {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => coverages.get(owner) ?? null,
  );
}
