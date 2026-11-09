import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
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
const idle = { connected: null, syncing: false, error: null };
type SyncState = { connected: boolean | null; syncing: boolean; error: string | null };

/** A receipt changes these three readings of the same account's steps. */
export function invalidateAfterSteps(qc: QueryClient, owner: string) {
  for (const queryKey of [key(owner), ["career-steps", owner], ["journey", owner]]) {
    void qc.invalidateQueries({ queryKey, exact: true });
  }
}

/** Where today's number comes from, said plainly. */
export type StepsSource = "titan" | "health_connect" | null;

/** Today's steps for the QG. TITAN's own counter (the phone's step sensor, on the phone) and Santé Connect (read, then kept by the server)
    are merged day by day WITHOUT adding them: the larger number of the day wins and names its source. The server holds one number per day; this hook only reads it, keeps the personal goal on the phone, and —
    when the server consent AND the Android permission both exist — refreshes from Health Connect at most every 30 minutes. */
export function useSteps() {
  const owner = useOwner();
  const qc = useQueryClient();
  const hc = healthConnect();
  const scope = useMemo(() => ({ active: true, flight: null as { manual: boolean } | null }), [owner]);
  const latest = useRef(scope);
  latest.current = scope;
  const isCurrent = useCallback(() => latest.current === scope && scope.active, [scope]);
  useEffect(() => {
    scope.active = true;
    return () => { scope.active = false; scope.flight = null; };
  }, [scope]);
  const [storedGoal, setGoalState] = useState<{ scope: typeof scope; value: number | null } | null>(null);
  const goal = storedGoal?.scope === scope ? storedGoal.value : null;
  const [status, setStatus] = useState<{ scope: typeof scope; value: SyncState } | null>(null);
  const { connected, syncing, error } = status?.scope === scope ? status.value : idle;
  const update = useCallback((patch: Partial<SyncState>) => {
    setStatus(previous => ({ scope, value: { ...(previous?.scope === scope ? previous.value : idle), ...patch } }));
  }, [scope]);

  const ped = usePedometer();
  const q = useQuery({
    queryKey: key(owner),
    queryFn: () => {
      const to = new Date();
      const from = new Date(to.getTime() - 40 * 86400000);
      return api.dailyActivity(owner, localDay(from), localDay(to));
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    let live = true;
    void readJSON<number | null>(ownerKey("steps-goal", owner), null).then(g => {
      if (live && isCurrent()) setGoalState({ scope, value: validGoal(g) });
    });
    return () => { live = false; };
  }, [owner, scope, isCurrent]);

  const setGoal = useCallback(async (g: number | null) => {
    if (!isCurrent()) return;
    const value = g === null ? null : validGoal(g);
    setGoalState({ scope, value });
    await writeJSON(ownerKey("steps-goal", owner), value).catch(() => {});
  }, [owner, scope, isCurrent]);

  /** A single flight covers permission checks, device reading and the whole batch. */
  const refresh = useCallback(async (auto = false) => {
    if (!isCurrent()) return;
    if (scope.flight) {
      if (!auto) scope.flight.manual = true;
      return;
    }
    const flight = { manual: !auto };
    scope.flight = flight;
    const current = () => isCurrent() && scope.flight === flight;
    let confirmed = false;
    try {
      const lastKey = ownerKey("steps-sync", owner);
      const last = await readJSON<number | null>(lastKey, null);
      if (!current()) return;
      const [access, sources] = await Promise.all([hc.granted(), api.sourcesStatus(owner)]).catch(() => [null, null] as const);
      if (!current()) return;
      const ok = access?.steps === true && Array.isArray(sources) && sources.some(s => s.source === "health_connect" && s.granted);
      update({ connected: ok });
      if (!flight.manual && !shouldAutoSync(last, Date.now(), ok)) return;
      if (!ok) {
        if (flight.manual) update({ error: "Connecte Santé Connect pour recevoir tes pas." });
        return;
      }
      update({ syncing: true, error: null });
      await api.assertOwner(owner);
      if (!current()) return;
      const days = await hc.readSteps();
      for (const d of days) {
        if (!current()) return;
        await api.importDailySteps(owner, d.day, d.steps, current);
        confirmed = true;
      }
      if (current()) {
        await api.assertOwner(owner);
        if (current()) await writeJSON(lastKey, Date.now()).catch(() => {});
      }
    } catch {
      if (current() && flight.manual) update({ error: "Actualisation impossible pour le moment. Les pas déjà reçus restent affichés." });
    } finally {
      if (confirmed) invalidateAfterSteps(qc, owner);
      if (current()) {
        scope.flight = null;
        update({ syncing: false });
      }
    }
  }, [owner, qc, hc, scope, isCurrent, update]);

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
