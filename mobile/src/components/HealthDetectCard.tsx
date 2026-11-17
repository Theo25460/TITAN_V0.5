/* AUD-27: sessions already recorded by the watch or the phone (Health Connect) are offered on the QG instead of being buried in
   Profil › Sources. Read only when the permission is already granted (never asked from here), last 48 hours, and only those that
   have no session of the same sport within 45 minutes in the journal. The import itself stays on the Santé Connect screen, where the
   server links duplicates and applies the usual rules. */
import { useNavigation } from "@react-navigation/native";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { Format, SportContracts, Sports } from "../core";
import * as api from "../data/api";
import { useOwner } from "../data/auth";
import type { TrainingLog } from "../core/types";
import { healthConnect, type SessionCandidate } from "../lib/healthConnect";
import { Card } from "./Card";
import { T } from "./Text";

const WINDOW_MS = 48 * 3600_000;
const MATCH_MS = 45 * 60_000;

/** Candidates of the last 48 hours that the journal does not already hold (same sport, start within 45 minutes). */
export function newHealthSessions(candidates: SessionCandidate[], logs: TrainingLog[], now = Date.now()): SessionCandidate[] {
  return candidates.filter((c) => {
    const t = Date.parse(c.startedAt);
    if (!Number.isFinite(t) || now - t > WINDOW_MS || t > now) return false;
    // Same sport within 45 minutes, or the same effort under a neighbouring id (a treadmill session typed as running).
    if (logs.some((l) => l.sport === c.sport && Math.abs(Date.parse(l.date) - t) <= MATCH_MS)) return false;
    return !SportContracts.findDuplicate({ sport: c.sport, date: c.startedAt, minutes: c.minutes }, logs);
  });
}

export function HealthDetectCard({ logs }: { logs: TrainingLog[] }) {
  const navigation = useNavigation();
  const owner = useOwner();
  const [found, setFound] = useState<SessionCandidate[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && setTick((n) => n + 1));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const hc = healthConnect();
        if ((await hc.availability()) !== "ready" || !(await hc.granted()).exercise) return;
        // The Android permission alone is not TITAN's consent: after « Arrêter » the permission may survive until the app restarts,
        // and nothing may be read in the meantime (same double check as the steps refresh).
        const sources = owner ? await api.sourcesStatus(owner) : null;
        if (!alive || !Array.isArray(sources) || !sources.some((s) => s.source === "health_connect" && s.granted)) return;
        const list = await hc.readSessions();
        if (alive) setFound(newHealthSessions(list, logs));
      } catch {
        // Health Connect absent or refused: the card simply stays hidden.
      }
    })();
    return () => {
      alive = false;
    };
  }, [logs, tick, owner]);
  if (!found.length) return null;
  const first = found[0];
  return (
    <Card tone="accent" onPress={() => navigation.navigate("HealthConnect")} accessibilityLabel={`${found.length} séance${found.length > 1 ? "s" : ""} détectée${found.length > 1 ? "s" : ""} dans Santé Connect. Les ajouter à mon journal.`} testID="qg-health-detect">
      <T variant="eyebrow" tone="accent">Séance{found.length > 1 ? "s" : ""} détectée{found.length > 1 ? "s" : ""}</T>
      <T variant="bodyStrong">
        {found.length > 1 ? `${found.length} séances de ta montre ou de ton téléphone` : `${Sports.label(first.sport)} · ${Format.duration(first.minutes)} · ${Format.relativeDay(first.startedAt)}`}
      </T>
      <T variant="small">Ajoute-les à ton journal en un geste : elles comptent comme les autres, une seule fois.</T>
    </Card>
  );
}
