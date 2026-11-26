/* V1.6.3 — the views of the account history, pure: server rows + this device's provisional entries, one entry per canonical id
   (src/core/web/history-ledger.js split, the same as the website), and the set totals and records count (TitanTraining.counted:
   a refused entry stays listed with its reason but is not a measure; a session still waiting to be sent counts, shown as pending). */
import { Ledger, Progress } from "../core";
import type { TrainingLog } from "../core/types";

export function historyViews(confirmed: TrainingLog[], pending: TrainingLog[], now: number = Date.now()) {
  const { logs, archived } = Ledger.split(confirmed, pending);
  const active = Progress.activeLogs(logs.filter((l) => (l as { syncStatus?: string }).syncStatus !== "error"), now);
  return { logs, active, archived };
}
