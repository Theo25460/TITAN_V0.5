import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { healthConnect } from "../lib/healthConnect";
import { ownerKey, readJSON, writeJSON } from "../lib/storage";
import { localDay, shouldAutoSync, summarize, validGoal, type StepsView } from "../lib/steps";
import { ledgerRows, mergeDays, partialFirstDay } from "../lib/stepLedger";
import * as api from "./api";
import { useOwner } from "./auth";
import { usePedometer } from "./pedometer";

const key = (o: string) => ["steps", o] as const;

/** Where today's number comes from, said plainly. */
export type StepsSource = "titan" | "health_connect" | null;

/** Today's steps for the QG. TITAN's own counter (the phone's step sensor, on the phone) and Santé Connect (read, then kept by the server)
    are merged day by day WITHOUT adding them: the larger number of the day wins and names its source. The server holds one number per day; this hook only reads it, keeps the personal goal on the phone, and —
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

  const ped = usePedometer();
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

  const rows = useMemo(() => mergeDays(ledgerRows(ped.ledger), q.data ?? []), [ped.ledger, q.data]);
  const today = localDay(new Date());
  const view: StepsView = summarize(rows, today, goal);
  const todayRow = rows.find((r) => r.day === today);
  const source: StepsSource = todayRow ? (todayRow.sources?.includes("titan") ? "titan" : todayRow.sources?.includes("health_connect") ? "health_connect" : null) : null;
  const ownActive = ped.enabled && ped.permission === "granted";
  return {
    view,
    source,
    goal,
    setGoal,
    refresh,
    syncing,
    error,
    connected,
    loading: !ped.ready || (q.isLoading && rows.length === 0),
    hasAny: rows.length > 0,
    // The server function being absent only hides the Santé Connect part: TITAN's own counter never needs the server.
    failed: !!q.error && !q.data && !ownActive && ped.supported === false,
    own: {
      supported: ped.supported,
      enabled: ped.enabled,
      permission: ped.permission,
      /** The counter is listening right now (app in front): the number moves as the person walks. */
      live: ped.enabled && ped.liveAt !== null,
      startedAt: ped.ledger.firstAt,
      partialFirstDay: partialFirstDay(ped.ledger, Date.now()),
      estimatedToday: ped.ledger.est[today] ?? 0,
      enable: ped.enable,
      disable: ped.disable,
      clear: ped.clear,
    },
  };
}
