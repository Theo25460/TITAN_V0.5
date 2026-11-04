import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { healthConnect } from "../lib/healthConnect";
import { ownerKey, readJSON, writeJSON } from "../lib/storage";
import { localDay, shouldAutoSync, summarize, validGoal, type StepsView } from "../lib/steps";
import * as api from "./api";
import { useOwner } from "./auth";

const key = (o: string) => ["steps", o] as const;

/** Today's steps for the QG. The server holds one number per day; this hook only reads it, keeps the personal goal on the phone, and —
    when the server consent AND the Android permission both exist — refreshes from Health Connect at most every 30 minutes. */
export function useSteps() {
  const owner = useOwner();
  const qc = useQueryClient();
  const hc = healthConnect();
  const [goal, setGoalState] = useState<number | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const q = useQuery({
    queryKey: key(owner),
    queryFn: () => {
      const to = new Date();
      const from = new Date(to.getTime() - 40 * 86400000);
      return api.dailyActivity(localDay(from), localDay(to));
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    let live = true;
    readJSON<number | null>(ownerKey("steps-goal", owner), null).then((g) => live && setGoalState(validGoal(g)));
    return () => {
      live = false;
    };
  }, [owner]);

  const setGoal = useCallback(
    async (g: number | null) => {
      const v = g === null ? null : validGoal(g);
      setGoalState(v);
      await writeJSON(ownerKey("steps-goal", owner), v).catch(() => {});
    },
    [owner],
  );

  const allowed = useCallback(async () => {
    try {
      const [access, sources] = await Promise.all([hc.granted(), api.sourcesStatus() as Promise<{ source: string; granted: boolean }[]>]);
      const consent = Array.isArray(sources) && sources.some((s) => s.source === "health_connect" && s.granted);
      const ok = consent && access.steps;
      if (alive.current) setConnected(ok);
      return ok;
    } catch {
      if (alive.current) setConnected(false);
      return false;
    }
  }, [hc]);

  /** Manual refresh (button) or automatic (QG opening). Same code path, same limits; nothing is invented. */
  const refresh = useCallback(
    async (auto = false) => {
      if (syncing) return;
      const lastKey = ownerKey("steps-sync", owner);
      const last = await readJSON<number | null>(lastKey, null);
      const ok = await allowed();
      if (auto && !shouldAutoSync(last, Date.now(), ok)) return;
      if (!ok) {
        if (!auto && alive.current) setError("Connecte Santé Connect pour recevoir tes pas.");
        return;
      }
      if (alive.current) {
        setSyncing(true);
        setError(null);
      }
      try {
        const days = await hc.readSteps();
        for (const d of days) await api.importDailySteps(d.day, d.steps);
        await writeJSON(lastKey, Date.now()).catch(() => {});
        await qc.invalidateQueries({ queryKey: key(owner) });
      } catch {
        if (alive.current && !auto) setError("Actualisation impossible pour le moment. Les pas déjà reçus restent affichés.");
      } finally {
        if (alive.current) setSyncing(false);
      }
    },
    [allowed, hc, owner, qc, syncing],
  );

  useEffect(() => {
    refresh(true).catch(() => {});
    // once per QG opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner]);

  // Coming back to TITAN after a walk: read again (same 30-minute guard and same consent checks as the opening refresh).
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") refreshRef.current(true).catch(() => {});
    });
    return () => sub.remove();
  }, []);

  const view: StepsView = summarize(q.data ?? [], localDay(new Date()), goal);
  return { view, goal, setGoal, refresh, syncing, error, connected, loading: q.isLoading, hasAny: (q.data?.length ?? 0) > 0, failed: !!q.error && !q.data };
}
