/* Lot D (sport excellence): two answers built on js/core/progression.js, shared with the website's stats page.
   « Ces 4 semaines par rapport aux 4 précédentes » — sessions, active days and declared minutes per discipline (estimates apart);
   « Quelles disciplines progressent ? » — each discipline on the figure it progresses on, with the sessions behind each value.
   Plain cards and text: the final visual treatment belongs to the UX pass (docs/SPORT_EXCELLENCE.md § interface). */
import { useMemo } from "react";
import { View } from "react-native";
import { Format, Progression } from "../core";
import type { TrainingLog } from "../core/types";
import { space } from "../theme/tokens";
import { Card } from "./Card";
import { T } from "./Text";

export function PeriodsCard({ logs, now = new Date() }: { logs: TrainingLog[]; now?: Date }) {
  const p = useMemo(() => Progression.periods(logs, { now, days: 28 }), [logs]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p.current.sessions) return null;
  const fmt = (x: { sessions: number; minutes: number; distanceKm: number } | null) => (x ? `${x.sessions} · ${x.minutes ? Format.duration(x.minutes) : "durée non saisie"}${x.distanceKm ? ` · ${Format.distance(x.distanceKm)}` : ""}` : "—");
  return <Card style={{ gap: space.s2 }} testID="progression-periods">
    <T variant="bodyStrong">Ces 4 semaines par rapport aux 4 précédentes</T>
    <T variant="small">{p.delta
      ? `${p.current.activeDays} jour${p.current.activeDays > 1 ? "s" : ""} actif${p.current.activeDays > 1 ? "s" : ""} contre ${p.previous.activeDays}, ${Format.duration(p.current.minutes)} déclarées contre ${Format.duration(p.previous.minutes)}.`
      : `${p.current.sessions} séance${p.current.sessions > 1 ? "s" : ""} en 4 semaines. Ton journal est plus récent que la période d’avant : pas de comparaison.`}</T>
    {p.sports.slice(0, 6).map((x) => <View key={x.sport} style={{ gap: 2 }}>
      <T variant="caption" tone="muted">{x.label}</T>
      <T variant="small">{fmt(x.current)} · avant {fmt(x.previous)}</T>
    </View>)}
    <T variant="caption" tone="faint">Durées déclarées.{p.current.unmeasuredSessions ? ` ${p.current.unmeasuredSessions} séance${p.current.unmeasuredSessions > 1 ? "s" : ""} sans durée saisie (estimation TITAN ${Format.duration(p.current.estimatedMinutes)}, comptée à part).` : ""}</T>
  </Card>;
}

export function DisciplinesCard({ logs, now = new Date() }: { logs: TrainingLog[]; now?: Date }) {
  const rows = useMemo(() => Progression.disciplines(logs, { now, weeks: 12 }).filter((r) => r.trend), [logs]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows.length) return null;
  const value = (t: NonNullable<(typeof rows)[number]["trend"]>, which: "before" | "after") => Progression.formatValue({ unit: t.unit, current: t[which], currentDisplay: t[`${which}Display`] });
  const better = rows.filter((r) => r.trend?.enough && r.trend.direction === "better");
  return <Card style={{ gap: space.s2 }} testID="progression-disciplines">
    <T variant="bodyStrong">Quelles disciplines progressent ?</T>
    <T variant="small">{!rows.some((r) => r.trend?.enough) ? "Il faut deux séances mesurées dans chaque moitié des 12 semaines pour une discipline." : better.length ? `${better.map((r) => r.label).join(", ")} ${better.length > 1 ? "progressent" : "progresse"} sur 12 semaines.` : "Stable : aucune discipline ne change au-delà de son seuil sur 12 semaines."}</T>
    {rows.slice(0, 6).map((r) => <View key={r.sport} style={{ gap: 2 }}>
      <T variant="caption" tone="muted">{r.label} · {r.trend!.label}</T>
      <T variant="small">{r.trend!.enough ? `${value(r.trend!, "before")} → ${value(r.trend!, "after")} · ${Progression.DIRECTION_TEXT[r.trend!.direction!] || ""}` : `${r.trend!.sessions} séance${(r.trend!.sessions || 0) > 1 ? "s" : ""} mesurée${(r.trend!.sessions || 0) > 1 ? "s" : ""}`}</T>
    </View>)}
    <T variant="caption" tone="faint">6 premières semaines contre les 6 dernières, valeurs mesurées seulement. Stable : écart sous 2 % pour une allure, 2,5 % pour une charge.</T>
  </Card>;
}
