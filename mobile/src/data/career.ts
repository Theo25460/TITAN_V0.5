import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { CareerRules, EffortRules, type Career, type CareerRange } from "../core";
import { localDay } from "../lib/steps";
import { ledgerRows, mergeDays } from "../lib/stepLedger";
import * as api from "./api";
import { useOwner } from "./auth";
import { useAdventure, useLogs, useProfile } from "./hooks";
import { usePedometer } from "./pedometer";

/** The server keeps one number per day and answers at most 400 days at a time. One request when the page opens, cached, never at startup. */
const STEP_DAYS = 399;

/** "Ma carrière sportive": computed from the journal the app already holds (no extra request for sessions), plus ONE step-history request while the
    page is open. Steps are merged day by day without adding sources (the larger wins), exactly like the QG counter. */
export function useCareer(range: CareerRange): { career: Career; loading: boolean; stepsLoading: boolean; error: unknown } {
  const owner = useOwner();
  const logsQ = useLogs();
  const profile = useProfile();
  const adventure = useAdventure();
  const ped = usePedometer();
  const steps = useQuery({
    queryKey: ["career-steps", owner],
    queryFn: () => {
      const to = new Date();
      const from = new Date(to.getTime() - STEP_DAYS * 86400000);
      return api.dailyActivity(owner, localDay(from), localDay(to));
    },
    staleTime: 10 * 60_000,
    retry: false,
  });
  const days = useMemo(() => (steps.isError && !ped.ledger ? null : mergeDays(ledgerRows(ped.ledger), steps.data ?? []).map((d) => ({ day: d.day, steps: d.steps }))), [ped.ledger, steps.data, steps.isError]);
  const level = adventure.data?.level ?? profile.data?.level ?? null;
  const xp = adventure.data ? adventure.data.xp : profile.data?.xp ?? null;
  const career = useMemo(
    () => CareerRules.build(logsQ.active, { range, stepDays: days && days.length ? days : null, rank: level ? EffortRules.rank(level) : null, xp: typeof xp === "number" ? xp : null }),
    [logsQ.active, range, days, level, xp],
  );
  return { career, loading: logsQ.isLoading && !logsQ.data, stepsLoading: steps.isLoading, error: logsQ.error };
}
