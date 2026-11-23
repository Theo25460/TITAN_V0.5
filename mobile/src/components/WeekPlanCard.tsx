/* V1.7.2 — Planifié et réalisé on Android: the week as planned on its Monday, the changes and the result, each occurrence with its
   state and the session tied to it (its real measures, read from the journal; it opens its own sheet), the sessions outside the plan,
   and the athlete's explicit decisions: tie a session, « none of these », move, replace, skip, cancel. Rules and words: the shared
   module (src/core/web/week-plan.js), the same as Séance › Prévoir and Progrès › Semaine on the website. */
import { useState } from "react";
import { View } from "react-native";
import { Format, Progress, Sports, WeekPlan, type WeekDecision, type WeekOccurrence, type WeekPlanView } from "../core";
import type { TrainingLog } from "../core/types";
import { space } from "../theme/tokens";
import { Button } from "./Button";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { Tap } from "./Pressable";
import { Section } from "./Section";
import { Sheet } from "./Sheet";
import { T } from "./Text";

const label = (s: string) => Sports.label(s);
const at = (k: string) => new Date(`${k}T12:00:00`);
const dayShort = (k: string) => at(k).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
const dayLong = (k: string) => at(k).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

/** The session's own measures (the journal's values, never the plan's). */
export function measures(log: TrainingLog | undefined): string {
  if (!log) return "";
  const parts: string[] = [];
  const m = Progress.minutesOf(log);
  if (m?.minutes && !m.estimated) parts.push(Format.duration(m.minutes));
  if (log.unit === "km" && Number(log.val) > 0) parts.push(Format.distance(Number(log.val)));
  const d = (log.details ?? {}) as Record<string, unknown>;
  const elev = Number(d.elevation ?? d.elevationGain);
  if (elev > 0) parts.push(`D+ ${Math.round(elev)} m`);
  if (log.syncStatus === "pending") parts.push("en attente d’envoi");
  return parts.join(" · ");
}

export function WeekPlanCard({ view, logs, onDecide, onOpen, busy = false, title = "Prévu et réalisé" }: {
  view: WeekPlanView;
  logs: TrainingLog[];
  onDecide: (occurrence: string, decision: WeekDecision, done: string) => Promise<boolean> | boolean;
  onOpen: (log: TrainingLog) => void;
  busy?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState<WeekOccurrence | null>(null);
  const byId = (id: string) => logs.find((l) => WeekPlan.sessionId(l) === id);
  const line = (id: string) => {
    const l = byId(id);
    if (!l) return "";
    const m = measures(l);
    return `${label(l.sport)} · ${dayShort(WeekPlan.sessionDay(l) ?? "")}${m ? ` · ${m}` : ""}`;
  };
  const b = WeekPlan.summarize(view);
  if (!view.summary.planned && !view.extra.length) return null;
  const extra = view.extra.filter((e) => !e.ask);

  const decide = async (decision: WeekDecision, done: string) => {
    if (!open) return;
    const ok = await onDecide(open.id, decision, done);
    if (ok) setOpen(null);
  };
  const days = Array.from({ length: 7 }, (_, i) => WeekPlan.addDays(view.week, i));
  const recent = open ? [...new Set([open.planned.sport, ...logs.slice(0, 60).map((l) => l.sport), ...Sports.POPULAR])].filter((s) => Sports.conf(s)).slice(0, 10) : [];
  const free = open ? view.extra.map((e) => e.id).filter((x) => !open.candidates.includes(x)) : [];
  const w = open ? WeekPlan.describe(open, { label }) : null;

  return (
    <Section title={title}>
      <Card tone="flat" style={{ gap: space.s2 }} testID={`week-plan-${view.week}`}>
        <T variant="small" testID="week-plan-start">{b.start}</T>
        {b.changes ? <T variant="small" testID="week-plan-changes">{b.changes}</T> : null}
        <T variant="bodyStrong" testID="week-plan-result">{b.result}</T>
        {view.occurrences.map((o) => {
          const d = WeekPlan.describe(o, { label });
          const planned = `${label(o.planned.sport)} · ${dayShort(o.planned.day)}${o.planned.minutes ? ` · ${Format.duration(o.planned.minutes)}` : ""}`;
          const tied = o.link ? byId(o.link.session) : undefined;
          return (
            <View key={o.id} style={{ gap: 2, paddingVertical: space.s2 }} testID={`occurrence-${o.id}`} accessibilityLabel={`${planned}. ${d.status}`}>
              <T variant="bodyStrong">{planned}</T>
              <T variant="small" tone={o.status === "ask" || o.notice ? "warn" : "muted"} testID={`occurrence-status-${o.id}`}>{d.status}</T>
              {tied ? (
                <Tap onPress={() => onOpen(tied)} accessibilityRole="link" accessibilityLabel={`Ouvrir la séance : ${line(o.link!.session)}`} style={{ minHeight: 44, justifyContent: "center" }} testID={`occurrence-session-${o.id}`}>
                  <T variant="small" tone="default">{line(o.link!.session)}</T>
                </Tap>
              ) : null}
              {d.notice ? <T variant="caption" tone="warn">{d.notice}</T> : null}
              <Button small kind={o.status === "ask" ? "primary" : "ghost"} label={o.status === "ask" ? "Choisir" : "Ajuster"} disabled={busy} onPress={() => setOpen(o)} testID={`occurrence-act-${o.id}`} accessibilityHint={planned} />
            </View>
          );
        })}
        {extra.length ? <T variant="eyebrow">Hors programme</T> : null}
        {extra.map((e) => {
          const l = byId(e.id);
          return l ? (
            <Tap key={e.id} onPress={() => onOpen(l)} accessibilityRole="link" style={{ minHeight: 44, justifyContent: "center" }} testID={`extra-${e.id}`}>
              <T variant="small" tone="default">{line(e.id)}</T>
            </Tap>
          ) : null;
        })}
        <T variant="caption" tone="faint">
          {view.reference.source === "reconstructed" ? "Programme de départ reconstitué : cette semaine est antérieure au suivi des semaines." : `Programme de départ : ta semaine type en vigueur le ${dayLong(view.week)}.`} {WeekPlan.RULES.gap} Les mesures affichées sont celles du journal.
        </T>
      </Card>
      <Sheet visible={!!open} onClose={() => setOpen(null)} title={w?.plan}>
        {open && w ? (
          <View style={{ gap: space.s3 }} testID="week-plan-sheet">
            <T variant="small">{w.status}</T>
            {w.notice ? <T variant="small" tone="warn">{w.notice}</T> : null}
            {open.candidates.length ? <T variant="bodyStrong">Quelle séance correspond à {w.plan} ?</T> : null}
            {open.candidates.map((c) => (
              <Button key={c} kind="secondary" label={`C’est celle-ci · ${line(c)}`} disabled={busy} onPress={() => decide({ kind: "link", session: c }, "Séance reliée")} testID={`link-${c}`} />
            ))}
            {open.candidates.length ? <Button kind="ghost" label="Aucune de ces séances" disabled={busy} onPress={() => decide({ kind: "none" }, "Noté : aucune de ces séances")} testID="link-none" /> : null}
            {free.length ? <T variant="eyebrow">Relier une autre séance de la semaine</T> : null}
            {free.map((c) => (
              <Button key={c} kind="ghost" small label={line(c)} disabled={busy} onPress={() => decide({ kind: "link", session: c }, "Séance reliée")} testID={`link-${c}`} />
            ))}
            <T variant="eyebrow">Déplacer à un autre jour</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {days.map((d) => <Chip key={d} label={dayShort(d)} selected={d === open.effective.day} onPress={busy ? undefined : () => decide({ kind: "move", day: d }, `Déplacée ${dayLong(d)}`)} testID={`move-${d}`} />)}
            </View>
            <T variant="eyebrow">Remplacer par un autre sport</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {recent.map((s) => <Chip key={s} label={label(s)} selected={s === open.effective.sport} onPress={busy ? undefined : () => decide({ kind: "replace", sport: s, day: open.effective.day }, `Remplacée par ${label(s)}`)} testID={`replace-${s}`} />)}
            </View>
            {open.decision?.kind !== "skip" ? <Button kind="secondary" label="Écarter cette séance" disabled={busy} onPress={() => decide({ kind: "skip" }, "Séance écartée")} testID="skip" /> : null}
            {open.decision ? <Button kind="ghost" label="Annuler ma décision" disabled={busy} onPress={() => decide({ kind: "reset" }, "Décision annulée")} testID="reset" /> : null}
          </View>
        ) : null}
      </Sheet>
    </Section>
  );
}
