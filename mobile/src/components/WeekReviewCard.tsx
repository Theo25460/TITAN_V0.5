/* V1.7.3 — Bilan et ajustements on Android: the bilan of a week (one observation, its source sessions with their own measures, each
   opening its sheet), the follow-up of the previous bilan, the choice already made with its undo, and the actions on the week after
   (keep, move a slot, pause) through a preview where the athlete chooses the next week or the typical week. Nothing is written until
   « Confirmer »; « Annuler » and « Pas maintenant » write nothing. Rules and words: the shared module (src/core/web/week-review.js),
   the same as Progrès › Semaine on the website. Also AdjustmentsCard: the adjustments acting on a week, with their origin and undo. */
import { useState } from "react";
import { View } from "react-native";
import { Sports, WeekPlan, WeekReview, type ReviewAction, type ReviewRecord, type Schedule, type WeekReviewView } from "../core";
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
const dayShort = (k: string) => at(k).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
export const dayLong = (k: string) => (k ? at(k).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "");
const NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function WeekReviewCard({ review, schedule, logs, today, zone, pauses, onApply, onUndo, onOpen, busy = false, title = "Bilan et ajustement" }: {
  review: WeekReviewView;
  schedule: Schedule;
  logs: TrainingLog[];
  today: string;
  zone: string | null;
  pauses: string[];
  onApply: (week: string, action: ReviewAction) => Promise<boolean> | boolean;
  onUndo: (week: string) => Promise<boolean> | boolean;
  onOpen: (log: TrainingLog) => void;
  busy?: boolean;
  title?: string;
}) {
  const [choice, setChoice] = useState<ReviewAction | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [allSources, setAllSources] = useState(false);
  const r = review;
  const a = r.actions;
  const obs = r.observation;
  const byId = (id: string) => logs.find((l) => WeekPlan.sessionId(l) === id);
  const line = (id: string) => {
    const l = byId(id);
    if (!l) return "";
    const m = WeekReview.measureOf(l);
    return `${label(l.sport)} · ${dayShort(WeekPlan.sessionDay(l) ?? "")}${m ? ` · ${m}` : ""}`;
  };
  if (!a.open && !a.decided && !r.followUp) return null;
  const words = WeekReview.describeObservation(obs, { label });
  const follow = WeekReview.describeFollowUp(r.followUp, { label, dayLong });
  const decided = a.decided;
  const sources = [...new Set(obs.sources)].filter((id) => byId(id));
  const s = obs.suggestion;
  const showActions = a.open && !(decided && !decided.undone) && !dismissed;

  let preview: ReturnType<typeof WeekReview.describePreview> | null = null;
  let previewError = false;
  if (choice) {
    try {
      preview = WeekReview.describePreview(WeekReview.preview(schedule, logs, { week: r.week, today, zone, pauses }, choice), { label, dayLong });
    } catch {
      previewError = true;
    }
  }
  const ref = WeekPlan.reference(schedule, a.target, { current: WeekPlan.weekOf(today) }).days;
  const confirm = async () => {
    if (!choice) return;
    const ok = await onApply(r.week, choice);
    if (ok) setChoice(null);
  };

  return (
    <Section title={title}>
      <Card tone="flat" style={{ gap: space.s2 }} testID={`week-review-${r.week}`}>
        <T variant="caption" tone="muted">Pour la semaine du {dayShort(a.target)}</T>
        {follow ? (
          <View style={{ gap: 2 }} testID="review-follow">
            <T variant="small" testID="review-decided">{follow.decided}</T>
            <T variant="bodyStrong" tone={follow.tone === "warn" ? "warn" : "default"} testID="review-observed">{follow.observed}</T>
            {r.followUp?.session && byId(r.followUp.session) ? (
              <Tap onPress={() => onOpen(byId(r.followUp!.session!)!)} accessibilityRole="link" style={{ minHeight: 44, justifyContent: "center" }} testID={`review-follow-session-${r.followUp.session}`}>
                <T variant="small">{line(r.followUp.session)}</T>
              </Tap>
            ) : null}
          </View>
        ) : null}
        <T variant="bodyStrong" testID="review-observation">{words.title}</T>
        {words.text ? <T variant="small">{words.text}</T> : null}
        {(words.lines || []).map((x) => <T key={x} variant="small" tone="muted">{x}</T>)}
        {sources.length ? <T variant="eyebrow">{sources.length === 1 ? "La séance source" : `Les ${sources.length} séances sources`}</T> : null}
        {(allSources ? sources : sources.slice(0, 4)).map((id) => (
          <Tap key={id} onPress={() => onOpen(byId(id)!)} accessibilityRole="link" accessibilityLabel={`Ouvrir la séance : ${line(id)}`} style={{ minHeight: 44, justifyContent: "center" }} testID={`review-source-${id}`}>
            <T variant="small">{line(id)}</T>
          </Tap>
        ))}
        {sources.length > 4 && !allSources ? <Button small kind="ghost" label={`Voir les ${sources.length} séances`} onPress={() => setAllSources(true)} /> : null}
        {decided ? (
          decided.undone ? (
            <T variant="small" tone="muted" testID="review-choice-undone">Choix annulé : {lower(WeekReview.describeAction(decided.action, { label, sport: decided.observation?.slot?.sport }))}. Le programme a repris sa forme d’avant.</T>
          ) : (
            <View style={{ gap: space.s2 }} testID="review-choice">
              <T variant="small">Ton choix : {WeekReview.describeAction(decided.action, { label, sport: decided.observation?.slot?.sport })}{decided.action.kind === "move" ? "" : ` (semaine du ${dayLong(decided.target)})`}. Choisi à ce bilan.</T>
              {a.open ? <Button small kind="ghost" label="Annuler ce choix" disabled={busy} onPress={async () => { await onUndo(r.week); }} testID="review-undo" /> : null}
            </View>
          )
        ) : null}
        {showActions ? (
          <View style={{ gap: space.s2 }} testID="review-actions">
            {s.kind === "move" && s.to !== null && a.move && a.move.from.includes(s.from) && a.move.to.includes(s.to) ? (
              <Button label={s.scope === "type" ? `Garder le ${WeekPlan.DAY_NAMES[s.to]} dans ma semaine type` : `Tester le ${WeekPlan.DAY_NAMES[s.to]} la semaine prochaine`} disabled={busy} onPress={() => setChoice({ kind: "move", from: s.from, to: s.to!, scope: s.scope })} testID="review-suggested" />
            ) : null}
            {obs.kind === "short" ? <T variant="small">Pour enrichir ton historique, enregistre tes séances et relie-les à ta semaine type.</T> : null}
            {a.keep ? <Button kind={s.kind === "keep" && obs.kind !== "short" ? "primary" : "secondary"} label={obs.kind === "short" ? "Garder mon plan" : "Reconduire le plan"} disabled={busy} onPress={() => setChoice({ kind: "keep" })} testID="review-keep" /> : null}
            {a.move ? <Button kind="secondary" label={s.kind === "move" ? "Déplacer à un autre jour" : "Déplacer un créneau"} disabled={busy} onPress={() => setChoice({ kind: "move", from: s.kind === "move" && a.move!.from.includes(s.from) ? s.from : a.move!.from[0], to: s.kind === "move" && s.to !== null && a.move!.to.includes(s.to) ? s.to : a.move!.to[0], scope: "next" })} testID="review-move" /> : null}
            {a.pause ? <Button kind="secondary" label={`Mettre la semaine du ${dayShort(a.target)} en pause`} disabled={busy} onPress={() => setChoice({ kind: "pause" })} testID="review-pause" /> : null}
            <Button small kind="ghost" label="Pas maintenant" onPress={() => setDismissed(true)} testID="review-dismiss" />
            <T variant="caption" tone="faint">{WeekReview.RULES.choice}</T>
          </View>
        ) : null}
        <T variant="caption" tone="faint">{WeekReview.RULES.window} {WeekReview.RULES.count}</T>
      </Card>
      <Sheet visible={!!choice} onClose={() => setChoice(null)} title={choice?.kind === "move" ? "Déplacer un créneau" : choice?.kind === "pause" ? "Mettre la semaine en pause" : "Reconduire le plan"}>
        {choice ? (
          <View style={{ gap: space.s3 }} testID="review-sheet">
            {choice.kind === "move" && a.move ? (
              <>
                <T variant="eyebrow">Le créneau à déplacer</T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {a.move.from.map((i) => <Chip key={i} label={`${NAMES[i]} · ${label(ref[i]?.sport || "")}`} selected={i === choice.from} onPress={() => setChoice({ ...choice, from: i })} testID={`review-from-${i}`} />)}
                </View>
                <T variant="eyebrow">Vers</T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {a.move.to.map((i) => <Chip key={i} label={NAMES[i]} selected={i === choice.to} onPress={() => setChoice({ ...choice, to: i })} testID={`review-to-${i}`} />)}
                </View>
                <T variant="eyebrow">Appliquer à</T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  <Chip label={`La semaine du ${dayShort(a.target)} seulement`} selected={choice.scope === "next"} onPress={() => setChoice({ ...choice, scope: "next" })} testID="review-scope-next" />
                  <Chip label="Ma semaine type" selected={choice.scope === "type"} onPress={() => setChoice({ ...choice, scope: "type" })} testID="review-scope-type" />
                </View>
              </>
            ) : null}
            <T variant="eyebrow">Aperçu</T>
            {preview ? (
              <View style={{ gap: 2 }} testID="review-preview">
                {preview.lines.map((x) => <T key={x} variant="small">{x}</T>)}
                <T variant="small" testID="review-where">{preview.where}</T>
                <T variant="caption" tone="faint">{preview.undo}</T>
              </View>
            ) : previewError ? <T variant="small" tone="warn">Ce choix n’est pas possible pour cette semaine.</T> : null}
            <T variant="caption" tone="faint">Origine : bilan de la semaine du {dayLong(r.week)} · {words.title}.</T>
            <Button label="Confirmer" disabled={busy || !preview} onPress={confirm} testID="review-confirm" />
            <Button kind="ghost" label="Annuler" onPress={() => setChoice(null)} testID="review-cancel" />
          </View>
        ) : null}
      </Sheet>
    </Section>
  );
}

/** The adjustments the bilans decided for a week, with their origin and their undo (Progrès › Ma semaine). */
export function AdjustmentsCard({ list, title, today, onUndo, busy = false }: { list: ReviewRecord[]; title: string; today: string; onUndo: (week: string) => Promise<boolean> | boolean; busy?: boolean }) {
  if (!list.length) return null;
  return (
    <Section title={title}>
      {list.map((rv) => {
        const what = WeekReview.describeAction(rv.action, { label, sport: rv.observation?.slot?.sport });
        const scope = rv.action.kind === "move" && rv.action.scope === "type" ? `Semaine type modifiée à partir du ${dayLong(rv.applied?.from || "")}` : `Semaine du ${dayLong(rv.target)}`;
        return (
          <Card key={rv.week} tone="flat" style={{ gap: space.s2 }} testID={`adjustment-${rv.week}`}>
            <T variant="bodyStrong">{what}</T>
            <T variant="small" tone="muted">{scope} · choisi au bilan de la semaine du {dayLong(rv.week)}</T>
            {WeekPlan.addDays(rv.target, 6) >= today ? <Button small kind="ghost" label="Annuler" disabled={busy} onPress={async () => { await onUndo(rv.week); }} testID={`adjustment-undo-${rv.week}`} /> : null}
          </Card>
        );
      })}
    </Section>
  );
}
