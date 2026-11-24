/* V1.7.6 — Scénarios multisports on Android (Progrès › Ma semaine): the comparisons written on the website or here, read with the same
   figures (time per sport, free days, overlaps, milestones that move, the fields to fill, the past and the hypotheses), the chosen
   variant applied from an explicit Monday through a preview, the undo through a preview, and, for the week shown, the decision read
   again at the bilan. Rules and words: the shared module (src/core/web/block-scenario.js), the same as Séance › Prévoir on the website.
   Nothing is written before « Confirmer »; « Annuler » writes nothing; a session is never changed here. The drafts are edited on the
   website (the phone applies, undoes and makes a variant fit an availability). */
import { useState } from "react";
import { View } from "react-native";
import { BlockScenario, Sports, type Schedule, type ScenarioComparison, type ScenarioPreview } from "../core";
import type { TrainingLog } from "../core/types";
import { space } from "../theme/tokens";
import { Button } from "./Button";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { Section } from "./Section";
import { Sheet } from "./Sheet";
import { T } from "./Text";

const label = (s: string) => Sports.label(s);
const at = (k: string) => new Date(`${k}T12:00:00`);
const dayShort = (k: string) => (k ? at(k).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
const dayLong = (k: string) => (k ? at(k).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "");
const words = { label, dayLong };
const ERRORS: Record<string, string> = {
  SCENARIO_WEEK_STARTED: "Cette semaine a déjà commencé : elle garde son programme.",
  SCENARIO_ALREADY_APPLIED: "Un scénario est déjà appliqué : annule-le d’abord.",
  SCENARIO_BASE_CHANGED: "Le bloc a changé depuis la comparaison : crée une nouvelle comparaison sur le site.",
  SCENARIO_BLOCK_OVERLAP: "Un bloc occupe déjà une de ces semaines.",
  SCENARIO_CHANGED_SINCE: "Le bloc a été modifié après l’application : ce changement plus récent est gardé.",
  SCENARIO_UNDO_CLOSED: "Toutes les semaines du scénario ont commencé : il n’y a plus rien à annuler.",
};
type Action = { kind: "apply"; id: string; variant: "a" | "b"; from: string } | { kind: "undo"; id: string };

export function ScenarioCard({ schedule, logs, today, zone, pauses, shownWeek, onSave, busy = false }: {
  schedule: Schedule;
  logs: TrainingLog[];
  today: string;
  zone: string | null;
  pauses: string[];
  shownWeek: string;
  onSave: (schedule: Schedule, ok: string, message?: string) => Promise<boolean> | boolean;
  busy?: boolean;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const opts = { today, zone, pauses, at: new Date().toISOString() };
  const list = BlockScenario.list(schedule);
  const comparisons: ScenarioComparison[] = [];
  for (const s of list) { try { comparisons.push(BlockScenario.compare(schedule, logs, s.id, opts)); } catch { /* a scenario the rules no longer read is skipped */ } }
  const follow = BlockScenario.followUp(schedule, logs, { ...opts, week: shownWeek });
  const fw = BlockScenario.describeFollowUp(follow, words);

  let result: { schedule: Schedule; preview: ScenarioPreview } | null = null;
  let error = "";
  if (action) {
    try {
      result = action.kind === "apply" ? BlockScenario.apply(schedule, logs, action.id, { variant: action.variant, from: action.from }, opts) : BlockScenario.undo(schedule, logs, action.id, opts);
    } catch (e) {
      error = ERRORS[(e as Error).message] || "Ce changement n’est pas possible pour ce scénario.";
    }
  }
  const preview = result ? BlockScenario.describePreview(result.preview, words) : null;
  const confirm = async () => {
    if (!result || !action) return;
    const ok = await onSave(result.schedule, action.kind === "apply" ? "Scénario appliqué" : "Application annulée", action.kind === "apply" ? `S’applique à partir du ${dayLong(result.preview.from)}. Tu peux l’annuler.` : `Le programme d’avant revient à partir du ${dayLong(result.preview.from)}. Tes séances restent au journal.`);
    if (ok) setAction(null);
  };
  const fit = async (id: string, variant: "a" | "b", week: number) => {
    let r;
    try { r = BlockScenario.fit(schedule, id, { variant, week }, opts); } catch { return; }
    await onSave(r.schedule, `Variante ${BlockScenario.LETTER[variant]} adaptée`, "Les jours indisponibles sont libérés dans le brouillon. Ton programme actif ne change pas.");
  };
  if (!comparisons.length && !fw) return null;
  const chipRow = { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6 };
  const current = action ? comparisons.find((c) => c.id === action.id) : null;

  return (
    <Section title="Scénarios">
      {fw && follow ? (
        <Card tone="flat" style={{ gap: 2 }} testID="scenario-followup">
          <T variant="eyebrow">Scénario choisi</T>
          <T variant="small" testID="scenario-followup-lead">{fw.lead}</T>
          <T variant="small" testID="scenario-followup-planned">{fw.planned}</T>
          <T variant="small" testID="scenario-followup-done">{fw.done}</T>
          <T variant="caption" tone="muted">{fw.result}</T>
        </Card>
      ) : null}
      {comparisons.map((c) => {
        const w = BlockScenario.describeComparison(c, words);
        const ap = c.applied;
        const live = !!ap && !ap.undone;
        const status = !ap ? "Brouillon privé : ton programme actif ne change pas tant que tu n’appliques pas une variante."
          : live ? `« ${ap.name} » appliqué le ${dayLong(ap.at.slice(0, 10))} à partir du ${dayLong(ap.from)}.`
          : `« ${ap.name} » appliqué le ${dayLong(ap.at.slice(0, 10))}, annulé le ${dayLong(ap.undone!.at.slice(0, 10))} : le programme d’avant est revenu à partir du ${dayLong(ap.undone!.from)}.`;
        const line = (name: string, x: { active: string; a: string; b: string; delta: string }, id: string) => (
          <View key={id} style={{ gap: 1 }} testID={`scenario-row-${id}`}>
            <T variant="small" tone="muted">{name}</T>
            <T variant="small">Actif {x.active} · A {x.a} · B {x.b} · écart B − A {x.delta}</T>
          </View>
        );
        return (
          <Card key={c.id} tone="flat" style={{ gap: space.s2 }} testID={`scenario-${c.id}`}>
            <T variant="h3">{c.title}</T>
            <T variant="small" testID="scenario-status">{status}</T>
            <T variant="caption" tone="muted">{w.planned}</T>
            <T variant="small">A · {w.names.a}</T>
            <T variant="small">B · {w.names.b}</T>
            {w.sports.map((r) => line(r.label, r, r.sport))}
            {line("Temps planifié", w.total, "total")}
            {line("Jours libres", w.free, "free")}
            {line("Chevauchements", { active: String(c.conflicts.active), a: String(c.conflicts.a), b: String(c.conflicts.b), delta: c.conflicts.b === c.conflicts.a ? "=" : `${c.conflicts.b > c.conflicts.a ? "+" : "−"}${Math.abs(c.conflicts.b - c.conflicts.a)}` }, "conflicts")}
            <T variant="eyebrow">Semaine par semaine</T>
            {w.weeks.map((x, i) => (
              <View key={x.week} style={{ gap: 1 }} testID={`scenario-week-${i}`}>
                <T variant="small">{x.title}{x.availability ? ` · ${x.availability}` : ""}</T>
                <T variant="caption" tone="muted">Actif : {x.active}</T>
                <T variant="caption">A : {x.a}</T>
                <T variant="caption">B : {x.b}</T>
                {!live && c.availability[i].days ? (
                  <View style={chipRow}>
                    {BlockScenario.KEYS.filter((k) => c.plans[k].conflicts.some((y) => y.week === x.week && y.kind !== "decision")).map((k) => <Chip key={k} label={`Adapter ${BlockScenario.LETTER[k]}`} onPress={() => fit(c.id, k, i)} testID={`scenario-fit-${k}-${i}`} />)}
                  </View>
                ) : null}
              </View>
            ))}
            <T variant="eyebrow">Chevauchements</T>
            {(["a", "b"] as const).map((k) => (
              <View key={k} style={{ gap: 1 }} testID={`scenario-conflicts-${k}`}>
                <T variant="small" tone="muted">{BlockScenario.LETTER[k]} · {w.names[k]}</T>
                {w.conflicts[k].length ? w.conflicts[k].map((x) => <T key={x} variant="caption">{x}</T>) : <T variant="caption" tone="faint">Aucun chevauchement.</T>}
              </View>
            ))}
            {w.milestones.map((m) => <T key={m.id} variant="small" testID={`scenario-milestone-${m.id}`}>{m.title} · actif : {m.active} · A : {m.a} · B : {m.b}</T>)}
            {w.fields.map((x) => <T key={x} variant="small" tone="warn">{x}</T>)}
            <T variant="eyebrow">{w.observed.title}</T>
            {w.observed.lines.map((x) => <T key={x} variant="caption" tone="muted">{x}</T>)}
            <T variant="eyebrow">Hypothèses du calcul</T>
            {c.hypotheses.map((x) => <T key={x} variant="caption" tone="faint">{x}</T>)}
            {live ? (
              <Button kind="secondary" label="Annuler l’application" disabled={busy} onPress={() => setAction({ kind: "undo", id: c.id })} testID="scenario-undo" />
            ) : (
              <View style={{ gap: space.s2 }}>
                {BlockScenario.KEYS.map((k) => <Button key={k} kind="secondary" label={`Appliquer ${BlockScenario.LETTER[k]} · ${w.names[k]}`} disabled={busy} onPress={() => setAction({ kind: "apply", id: c.id, variant: k, from: c.weeks.find((m) => m >= c.open) || c.weeks[0] })} testID={`scenario-apply-${k}`} />)}
              </View>
            )}
            <T variant="caption" tone="faint">{BlockScenario.RULES.draft} {BlockScenario.RULES.undo}</T>
          </Card>
        );
      })}
      <Sheet visible={!!action} onClose={() => setAction(null)} title={action?.kind === "undo" ? "Annuler l’application" : "Appliquer un scénario"}>
        {action && current ? (
          <View style={{ gap: space.s3 }} testID="scenario-sheet">
            {action.kind === "apply" ? (
              <>
                <T variant="eyebrow">À partir du lundi</T>
                <View style={chipRow}>{current.weeks.filter((m) => m >= current.open).map((m) => <Chip key={m} label={dayShort(m)} selected={m === action.from} onPress={() => setAction({ ...action, from: m })} testID={`scenario-from-${m}`} />)}</View>
              </>
            ) : null}
            <T variant="eyebrow">Aperçu</T>
            {preview ? (
              <View style={{ gap: 2 }} testID="scenario-preview">
                {preview.lines.map((x, i) => <T key={`${i}${x}`} variant="small">{x}</T>)}
                {preview.notes.map((x) => <T key={x} variant="small" tone="muted">{x}</T>)}
                <T variant="small" testID="scenario-where">{preview.where}</T>
              </View>
            ) : error ? <T variant="small" tone="warn" testID="scenario-error">{error}</T> : null}
            <Button label={action.kind === "undo" ? "Annuler l’application" : "Confirmer"} disabled={busy || !result} onPress={confirm} testID="scenario-confirm" />
            <Button kind="ghost" label="Fermer sans rien changer" onPress={() => setAction(null)} testID="scenario-cancel" />
          </View>
        ) : null}
      </Sheet>
    </Section>
  );
}
