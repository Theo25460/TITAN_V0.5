/* AUD-38: « Ce jour-là » on the QG — a session from exactly a month or a year ago, one tap to see it again. */
import { useNavigation } from "@react-navigation/native";
import { useMemo } from "react";
import { Sports } from "../core";
import type { TrainingLog } from "../core/types";
import { memoryOfTheDay, selfVsLastYear } from "../lib/memories";
import { Card } from "./Card";
import { sessionHeadline } from "./SessionRow";
import { T } from "./Text";

export function MemoryCard({ logs }: { logs: TrainingLog[] }) {
  const navigation = useNavigation();
  const memory = useMemo(() => memoryOfTheDay(logs), [logs]);
  if (!memory) return null;
  const { log } = memory;
  return (
    <Card onPress={() => navigation.navigate("SessionDetail", { id: log.id })} accessibilityLabel={`${memory.label} : ${Sports.label(log.sport)}, ${sessionHeadline(log)}. Revoir la séance.`} testID="qg-memory">
      <T variant="eyebrow" tone="amber">{memory.label}</T>
      <T variant="bodyStrong">{Sports.label(log.sport)} · {sessionHeadline(log)}</T>
      <T variant="small">{memory.yearsAgo ? "Ton historique se souvient de tout ce que tu as construit." : "Un mois de plus sur ton chemin."}</T>
    </Card>
  );
}

/** AUD-39: « Toi contre toi » — the last 30 days against the same 30 days a year earlier. */
export function SelfComparisonCard({ logs }: { logs: TrainingLog[] }) {
  const c = useMemo(() => selfVsLastYear(logs), [logs]);
  if (!c) return null;
  const pct = Math.round(c.ratio * 100);
  const line = Math.abs(pct) < 3 ? "Aussi régulier que l’an dernier." : pct > 0 ? `+${pct} % d’effort par rapport à l’an dernier.` : `${pct} % d’effort par rapport à l’an dernier : chaque saison a son rythme.`;
  return (
    <Card tone="ruled" style={{ gap: 6 }} testID="self-vs-last-year">
      <T variant="title">Toi contre toi · 30 derniers jours</T>
      <T variant="bodyStrong">{line}</T>
      <T variant="small">
        {c.sessions[0]} séance{c.sessions[0] > 1 ? "s" : ""} contre {c.sessions[1]} · {c.activeDays[0]} jour{c.activeDays[0] > 1 ? "s" : ""} actif{c.activeDays[0] > 1 ? "s" : ""} contre {c.activeDays[1]} · {Math.round(c.minutes[0] / 60)} h contre {Math.round(c.minutes[1] / 60)} h
      </T>
    </Card>
  );
}
