/* V1.7.4 — Objectifs et blocs d’entraînement on Android (Progrès › Ma semaine): the block of the week shown (its week of the block, its
   goal, its milestones and the source and effect of the changes that reach that week), and the actions on the planning: create a block
   from a model, shift it, copy a week, remove it, declare an action done. Every change goes through a preview; nothing is written until
   « Confirmer »; « Annuler » writes nothing. Rules and words: the shared module (src/core/web/training-block.js), the same as Séance ›
   Prévoir and Progrès › Semaine on the website. A session is never changed here. */
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Sports, TrainingBlock, WeekPlan, type BlockContext, type BlockInput, type BlockPreview, type BlockView, type Schedule } from "../core";
import type { TrainingLog } from "../core/types";
import { space } from "../theme/tokens";
import { Button } from "./Button";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { Field } from "./Field";
import { Tap } from "./Pressable";
import { Section } from "./Section";
import { Sheet } from "./Sheet";
import { T } from "./Text";

const label = (s: string) => Sports.label(s);
const at = (k: string) => new Date(`${k}T12:00:00`);
const dayShort = (k: string) => (k ? at(k).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
const dayLong = (k: string) => (k ? at(k).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "");
const words = { label, dayLong };
const SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const ERRORS: Record<string, string> = {
  TRAINING_BLOCK_OVERLAP: "Un autre bloc occupe déjà ces semaines.",
  TRAINING_BLOCK_WEEK_STARTED: "Cette semaine a déjà commencé : elle garde son programme.",
  TRAINING_BLOCK_TITLE_REQUIRED: "Donne un nom à ton bloc.",
  TRAINING_BLOCK_BAD_GOAL: "L’objectif est incomplet : une échéance après le début du bloc et une valeur.",
};
const daysText = (days: (string | null)[], minutes: (number | null)[]) =>
  days.map((s, i) => (s ? `${SHORT[i]} ${label(s)}${minutes[i] ? ` ${TrainingBlock.unitText("duration", minutes[i]!)}` : ""}` : null)).filter(Boolean).join(" · ") || "Rien de prévu";

type Action =
  | { kind: "create"; template: string; sport: string; start: string; weeks: number; title: string; goal: string; km: string; date: string; picked: boolean[] | null }
  | { kind: "shift"; from: number; weeks: number }
  | { kind: "copy"; from: number; to: number }
  | { kind: "remove" };

export function TrainingBlockCard({ blocks, context, schedule, logs, today, zone, pauses, onSave, onOpen, busy = false, shownWeek }: {
  blocks: BlockView[];
  context: BlockContext | null;
  schedule: Schedule;
  logs: TrainingLog[];
  today: string;
  zone: string | null;
  pauses: string[];
  onSave: (schedule: Schedule, ok: string, message?: string) => Promise<boolean> | boolean;
  onOpen: (log: TrainingLog) => void;
  busy?: boolean;
  shownWeek: string;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const live = blocks.filter((v) => v.state === "active" || v.state === "upcoming");
  const v = (context && blocks.find((b) => b.id === context.id)) || (shownWeek >= WeekPlan.weekOf(today) ? live[0] : null) || null;
  const byId = (id: string) => logs.find((l) => WeekPlan.sessionId(l) === id);
  const opts = { today, zone, pauses, logs, at: new Date().toISOString() };
  const type = WeekPlan.typeDays(schedule);
  const sports = useMemo(() => [...new Set([...type.filter(Boolean).map((d) => d!.sport), ...(v?.sports || []), ...Sports.POPULAR])].filter((s) => Sports.conf(s)).slice(0, 10), [schedule, v?.id]);

  // The result of the action being previewed (nothing is written).
  let result: { schedule: Schedule; preview: BlockPreview } | null = null;
  let error = "";
  let suggestions: NonNullable<BlockInput["milestones"]> = [];
  if (action) {
    try {
      if (action.kind === "create") {
        const weeks = TrainingBlock.draft(action.template, { type, sport: action.sport, weeks: action.weeks, peak: 180 });
        const km = Number(action.km.replace(",", "."));
        const goal = action.goal ? { title: action.goal, date: action.date || null, ...(km > 0 ? { kind: "measure" as const, metric: "distance" as const, target: km, sport: action.sport } : { kind: "declared" as const }) } : null;
        suggestions = TrainingBlock.suggest(action.template, { weeks: weeks.length, sport: action.sport, goal, type });
        const picked = action.picked || suggestions.map((_, i) => i < 2);
        result = TrainingBlock.create(schedule, { title: action.title, template: action.template, sports: [action.sport], start: action.start, weeks, goal, milestones: suggestions.filter((_, i) => picked[i]) }, opts);
      } else if (v && action.kind === "shift") result = TrainingBlock.shift(schedule, v.id, { from: action.from, weeks: action.weeks }, opts);
      else if (v && action.kind === "copy") result = TrainingBlock.duplicateWeek(schedule, v.id, { from: action.from, to: action.to }, opts);
      else if (v && action.kind === "remove") result = TrainingBlock.remove(schedule, v.id, opts);
    } catch (e) {
      error = ERRORS[(e as Error).message] || "Ce changement n’est pas possible pour ce bloc.";
    }
  }
  const preview = result ? TrainingBlock.describePreview(result.preview, words) : null;
  const confirm = async () => {
    if (!result || !action) return;
    const ok = await onSave(result.schedule, { create: "Bloc créé", shift: "Bloc décalé", copy: "Semaine copiée", remove: "Bloc retiré" }[action.kind], action.kind === "remove" ? "Tes séances restent au journal. Les semaines à venir reprennent ta semaine type." : `S’applique à partir du ${dayLong(result.preview.from)}.`);
    if (ok) setAction(null);
  };
  const declare = async (milestone: string, done: boolean) => {
    if (!v) return;
    let r;
    try { r = TrainingBlock.declare(schedule, v.id, { milestone, done }, opts); } catch { return; }
    await onSave(r.schedule, done ? "Noté : c’est fait" : "Déclaration retirée", done ? `Jalon atteint le ${dayLong(today)}.` : undefined);
  };

  const firstOpen = TrainingBlock.firstOpen(schedule, today);
  const openWeeks = v ? v.weeks.filter((w) => w.week >= v.open) : [];
  const goal = v?.goal ? TrainingBlock.describeGoal(v.goal, words) : null;
  const where = v ? (v.state === "active" && v.currentIndex >= 0 ? `${v.weeks[v.currentIndex].label} · ${v.currentIndex + 1}ᵉ semaine sur ${v.weeks.length}` : v.state === "upcoming" ? `Commence le ${dayLong(v.start)}` : v.state === "finished" ? "Terminé" : "Retiré") : "";
  const editable = !!v && (v.state === "active" || v.state === "upcoming");
  const ctxWeek = context && context.label ? (context.before ? `Cette semaine fait partie du bloc mais lui est antérieure : elle a gardé son programme d’origine.` : `Cette semaine est « ${context.label} » (${(context.index ?? 0) + 1}ᵉ sur ${context.count}).`) : null;
  const changes = context ? context.changes.filter((x) => x.kind !== "create" || context.changes.length === 1) : [];
  const chipRow = { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6 };

  return (
    <Section title="Bloc d’entraînement">
      {v ? (
        <Card tone="flat" style={{ gap: space.s2 }} testID={`block-${v.id}`}>
          <T variant="caption" tone="muted" testID="block-where">{where} · du {dayShort(v.start)} au {dayShort(v.end)}</T>
          <T variant="h3">{v.title}</T>
          {v.intent ? <T variant="small">{v.intent}</T> : null}
          {goal ? (
            <View style={{ gap: 2 }} testID="block-goal">
              <T variant="bodyStrong">Objectif : {goal.title}</T>
              <T variant="small">{goal.what} · {goal.date}</T>
              <T variant="small" testID="block-goal-state">{goal.state}</T>
            </View>
          ) : null}
          {v.conflict ? <T variant="small" tone="warn">Ce bloc a été modifié sur deux appareils en même temps : vérifie son programme.</T> : null}
          {ctxWeek ? <T variant="small" testID="block-context">{ctxWeek}</T> : null}
          {changes.map((c) => {
            const w = TrainingBlock.describeChange(c, words);
            return (
              <View key={`${c.at}${c.kind}`} style={{ gap: 2 }} testID={`block-change-${c.kind}`}>
                <T variant="small" tone="muted">{w.source}</T>
                {w.effect ? <T variant="small">{w.effect}</T> : null}
              </View>
            );
          })}
          <T variant="eyebrow">Semaines</T>
          {v.weeks.map((w) => (
            <View key={w.week} style={{ gap: 1 }} testID={`block-week-${w.index}`}>
              <T variant="small" tone={w.state === "current" ? "default" : "muted"}>
                {w.label} · {dayShort(w.week)}{w.state === "current" ? " · en cours" : ""}{w.paused ? " · en pause" : ""}{w.before ? " · avant l’activation" : ""}
              </T>
              <T variant="caption" tone="faint">{daysText(w.days, w.minutes)}{w.summary ? ` · ${w.summary.done}/${w.summary.planned} faite${w.summary.done > 1 ? "s" : ""}, ${w.summary.gaps} écart${w.summary.gaps > 1 ? "s" : ""}` : ""}</T>
            </View>
          ))}
          <T variant="eyebrow">Jalons</T>
          {v.milestones.map((m) => {
            const w = TrainingBlock.describeMilestone(m, words);
            const s = m.session ? byId(m.session) : null;
            return (
              <View key={m.id} style={{ gap: 2 }} testID={`block-milestone-${m.id}`}>
                <T variant="bodyStrong">{w.title}</T>
                <T variant="small" tone="muted">{w.what} · {w.when}</T>
                <T variant="small" testID={`block-milestone-state-${m.id}`}>{w.state}</T>
                {s ? (
                  <Tap onPress={() => onOpen(s)} accessibilityRole="link" style={{ minHeight: 44, justifyContent: "center" }} testID={`block-milestone-session-${m.id}`}>
                    <T variant="small">{label(s.sport)} · {dayShort(WeekPlan.sessionDay(s) ?? "")}</T>
                  </Tap>
                ) : null}
                {editable && m.kind === "declared" ? <Button small kind={m.declared?.at ? "ghost" : "secondary"} label={m.declared?.at ? "Retirer la déclaration" : "C’est fait"} disabled={busy} onPress={() => declare(m.id, !m.declared?.at)} testID={`block-declare-${m.id}`} /> : null}
              </View>
            );
          })}
          {!v.milestones.length ? <T variant="small" tone="muted">Aucun jalon pour l’instant.</T> : null}
          {editable ? (
            <View style={{ gap: space.s2 }}>
              {openWeeks.length ? <Button kind="secondary" label="Décaler le bloc" disabled={busy} onPress={() => setAction({ kind: "shift", from: openWeeks[0].index, weeks: 1 })} testID="block-shift" /> : null}
              {openWeeks.length ? <Button kind="secondary" label="Dupliquer une semaine" disabled={busy} onPress={() => setAction({ kind: "copy", from: Math.max(0, openWeeks[0].index - 1), to: openWeeks[0].index === 0 && openWeeks[1] ? openWeeks[1].index : openWeeks[0].index })} testID="block-copy" /> : null}
              <Button kind="ghost" label="Retirer le bloc" disabled={busy} onPress={() => setAction({ kind: "remove" })} testID="block-remove" />
            </View>
          ) : null}
          <T variant="caption" tone="faint">{TrainingBlock.RULES.start} {TrainingBlock.RULES.event}</T>
        </Card>
      ) : null}
      {!live.length && shownWeek >= WeekPlan.weekOf(today) ? (
        <Card tone="flat" style={{ gap: space.s2 }}>
          <T variant="bodyStrong">Relie un objectif à plusieurs semaines</T>
          <T variant="small">Choisis un modèle, ton échéance et tes jalons : chaque semaine du bloc devient ton programme, ici et sur le site.</T>
          <Button label="Créer un bloc" disabled={busy} onPress={() => setAction({ kind: "create", template: "endurance", sport: sports[0] || "running", start: firstOpen, weeks: 6, title: "", goal: "", km: "", date: "", picked: null })} testID="block-create" />
        </Card>
      ) : null}
      <Sheet visible={!!action} onClose={() => setAction(null)} title={action?.kind === "create" ? "Créer un bloc" : action?.kind === "shift" ? "Décaler le bloc" : action?.kind === "copy" ? "Dupliquer une semaine" : "Retirer le bloc"}>
        {action ? (
          <View style={{ gap: space.s3 }} testID="block-sheet">
            {action.kind === "create" ? (
              <>
                <T variant="eyebrow">Modèle</T>
                <View style={chipRow}>{TrainingBlock.TEMPLATES.map((t) => <Chip key={t.id} label={t.title} selected={t.id === action.template} onPress={() => setAction({ ...action, template: t.id, weeks: t.weeks, picked: null })} testID={`block-tpl-${t.id}`} />)}</View>
                <Field label="Nom du bloc" value={action.title} onChangeText={(x) => setAction({ ...action, title: x })} testID="block-title" />
                <T variant="eyebrow">Discipline principale</T>
                <View style={chipRow}>{sports.map((s) => <Chip key={s} label={label(s)} selected={s === action.sport} onPress={() => setAction({ ...action, sport: s, picked: null })} testID={`block-sport-${s}`} />)}</View>
                <T variant="eyebrow">Début</T>
                <View style={chipRow}>{[0, 7, 14].map((n) => { const k = WeekPlan.addDays(firstOpen, n); return <Chip key={k} label={`Lundi ${dayShort(k)}`} selected={k === action.start} onPress={() => setAction({ ...action, start: k })} testID={`block-start-${k}`} />; })}</View>
                <T variant="eyebrow">Durée</T>
                <View style={chipRow}>{[4, 6, 8].map((n) => <Chip key={n} label={`${n} semaines`} selected={n === action.weeks} onPress={() => setAction({ ...action, weeks: n, picked: null })} testID={`block-weeks-${n}`} />)}</View>
                <Field label="Objectif (facultatif)" value={action.goal} onChangeText={(x) => setAction({ ...action, goal: x, picked: null })} testID="block-goal-title" />
                <Field label="Distance de l’objectif en km (facultatif)" value={action.km} onChangeText={(x) => setAction({ ...action, km: x, picked: null })} keyboardType="decimal-pad" testID="block-goal-km" />
                <Field label="Échéance (AAAA-MM-JJ, facultatif)" value={action.date} onChangeText={(x) => setAction({ ...action, date: x })} testID="block-goal-date" />
                {suggestions.length ? <T variant="eyebrow">Jalons proposés · garde ceux que tu veux</T> : null}
                <View style={chipRow}>
                  {suggestions.map((m, i) => {
                    const picked = action.picked || suggestions.map((_, j) => j < 2);
                    return <Chip key={`${m.title}${i}`} label={`${m.title} · S${m.week + 1}`} selected={!!picked[i]} onPress={() => setAction({ ...action, picked: picked.map((p, j) => (j === i ? !p : p)) })} testID={`block-pick-${i}`} />;
                  })}
                </View>
              </>
            ) : null}
            {v && action.kind === "shift" ? (
              <>
                <T variant="eyebrow">Décaler à partir de</T>
                <View style={chipRow}>{openWeeks.map((w) => <Chip key={w.index} label={`${w.label} · ${dayShort(w.week)}`} selected={w.index === action.from} onPress={() => setAction({ ...action, from: w.index })} testID={`block-from-${w.index}`} />)}</View>
                <T variant="eyebrow">De combien de semaines</T>
                <View style={chipRow}>{[1, 2, 3, 4].map((n) => <Chip key={n} label={`${n} semaine${n > 1 ? "s" : ""}`} selected={n === action.weeks} onPress={() => setAction({ ...action, weeks: n })} testID={`block-by-${n}`} />)}</View>
              </>
            ) : null}
            {v && action.kind === "copy" ? (
              <>
                <T variant="eyebrow">Copier la semaine</T>
                <View style={chipRow}>{v.weeks.map((w) => <Chip key={w.index} label={`${w.label} · ${dayShort(w.week)}`} selected={w.index === action.from} onPress={() => setAction({ ...action, from: w.index })} testID={`block-copy-from-${w.index}`} />)}</View>
                <T variant="eyebrow">Sur la semaine</T>
                <View style={chipRow}>{openWeeks.map((w) => <Chip key={w.index} label={`${w.label} · ${dayShort(w.week)}`} selected={w.index === action.to} onPress={() => setAction({ ...action, to: w.index })} testID={`block-copy-to-${w.index}`} />)}</View>
              </>
            ) : null}
            <T variant="eyebrow">Aperçu</T>
            {preview ? (
              <View style={{ gap: 2 }} testID="block-preview">
                {preview.lines.map((x) => <T key={x} variant="small">{x}</T>)}
                {preview.notes.map((x) => <T key={x} variant="small" tone="muted">{x}</T>)}
                <T variant="small" testID="block-where-applies">{preview.where}</T>
              </View>
            ) : error ? <T variant="small" tone="warn" testID="block-error">{error}</T> : null}
            <Button label={action.kind === "remove" ? "Retirer le bloc" : "Confirmer"} disabled={busy || !result} onPress={confirm} testID="block-confirm" />
            <Button kind="ghost" label="Annuler" onPress={() => setAction(null)} testID="block-cancel" />
          </View>
        ) : null}
      </Sheet>
    </Section>
  );
}
