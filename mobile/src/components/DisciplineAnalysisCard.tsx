/* V1.7.5 — Analyse avancée par discipline on Android (Progrès › Tendances), the same three depth views as the website's Progrès ›
   Semaine: endurance on a comparable route and distance, force per exercise and variant, escalade per grade scale. Each metric shows
   its value beside the reference (the period before, a V1.7.4 training block or one session), its coverage, and on demand its
   rule, its source and its sessions (each opens its sheet). A missing value stays « — », a session without it stays « non mesurée »:
   nothing is interpolated. The plain-text reading comes from the shared module (src/core/web/discipline-analysis.js). */
import { useMemo, useState } from "react";
import { View } from "react-native";
import { DisciplineAnalysis, type AnalysisDiscipline, type AnalysisReference, type AnalysisRow, type AnalysisSide } from "../core";
import type { TrainingLog } from "../core/types";
import { space } from "../theme/tokens";
import { Button } from "./Button";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { Tap } from "./Pressable";
import { Segmented } from "./Segmented";
import { T } from "./Text";

export type AnalysisBlock = { id: string; title: string; start: string; end: string };
const DIR: Record<string, string> = { better: "en progrès", worse: "en retrait", stable: "stable" };

function side(s: AnalysisSide | null) {
  if (!s) return "—";
  return `${s.display} (${s.measured}/${s.total} séance${s.total > 1 ? "s" : ""})`;
}

function Row({ r, reference, rules, onOpen, label }: { r: AnalysisRow; reference: boolean; rules: boolean; onOpen: (id: string) => void; label: (id: string) => string }) {
  const verdict = DIR[r.direction] || (r.reason === "short" ? "sans verdict : trop peu de séances" : "");
  return (
    <View style={{ gap: 2 }} testID={`analysis-row-${r.id}`} accessibilityLabel={`${r.label} : ${r.current.display}${reference && r.reference ? `, référence ${r.reference.display}` : ""}${verdict ? `, ${verdict}` : ""}`}>
      <T variant="caption" tone="muted">{r.label}</T>
      <T variant="small" testID={`analysis-value-${r.id}`}>{side(r.current)}{reference ? ` · référence ${side(r.reference)}` : ""}{verdict ? ` · ${verdict}` : ""}</T>
      {r.current.missing ? <T variant="caption" tone="faint">{r.current.missing}</T> : null}
      {rules ? <View style={{ gap: 2 }}>
        <T variant="caption" tone="faint">Règle : {r.rule}</T>
        <T variant="caption" tone="faint">Source : {r.provenance}</T>
        {r.current.sessions.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s1 }}>
          {r.current.sessions.map((id) => <Tap key={id} onPress={() => onOpen(id)} accessibilityRole="link" accessibilityLabel={`Ouvrir la séance du ${label(id)}`} testID={`analysis-source-${r.id}-${id}`} style={{ minHeight: 44, justifyContent: "center" }}>
            <T variant="caption" tone="default">{label(id)}</T>
          </Tap>)}
        </View> : null}
      </View> : null}
    </View>
  );
}

export function DisciplineAnalysisCard({ logs, blocks = [], now = new Date(), onOpen }: { logs: TrainingLog[]; blocks?: AnalysisBlock[]; now?: Date; onOpen: (id: string) => void }) {
  const [discipline, setDiscipline] = useState<AnalysisDiscipline>("endurance");
  const [sport, setSport] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<"6" | "12" | "26">("12");
  const [ref, setRef] = useState<string>("period");
  const [rules, setRules] = useState(false);
  const t = now.getTime();

  const sports = useMemo(() => (discipline === "endurance" ? DisciplineAnalysis.sports(logs, "endurance") : []), [logs, discipline]);
  const chosenSport = discipline === "endurance" ? (sports.some((s) => s.sport === sport) ? sport : sports[0]?.sport) || undefined : undefined;
  const groups = useMemo(() => DisciplineAnalysis.groups(logs, discipline, { sport: chosenSport }), [logs, discipline, chosenSport]);
  const chosenGroup = groups.some((g) => g.id === group) ? group! : groups[0]?.id;
  const reference: AnalysisReference = ref === "none" ? null
    : ref.startsWith("block:") ? (() => { const b = blocks.find((x) => `block:${x.id}` === ref); return b ? { kind: "block", id: b.id, title: b.title, start: b.start, end: b.end } : { kind: "period" }; })()
    : ref.startsWith("session:") ? { kind: "session", id: ref.slice(8) } : { kind: "period" };
  const v = useMemo(() => DisciplineAnalysis.view(logs, { discipline, sport: chosenSport, group: chosenGroup, now, weeks: Number(weeks), reference }), [logs, discipline, chosenSport, chosenGroup, weeks, ref, blocks]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!logs.length || !v) return null;

  const pick = (d: AnalysisDiscipline) => { setDiscipline(d); setGroup(null); setRef("period"); };
  const refChips: [string, string][] = [["period", `${weeks} semaines d’avant`], ...blocks.map((b): [string, string] => [`block:${b.id}`, `Bloc « ${b.title} »`]), ["none", "Aucune"]];
  const showRef = !!v.reference && v.reference.status === "ok";
  const date = (iso: string) => DisciplineAnalysis.dateText(new Date(iso).getTime(), t);

  return (
    <Card style={{ gap: space.s3 }} testID="discipline-analysis">
      <T variant="bodyStrong">Analyse par discipline</T>
      <T variant="caption" tone="muted">Une mesure propre à ta discipline, comparée à une période, un bloc ou une séance, avec les séances qui l’expliquent. Une valeur absente reste absente.</T>
      <Segmented value={discipline} onChange={pick} options={[{ value: "endurance", label: "Endurance" }, { value: "strength", label: "Force" }, { value: "climbing", label: "Escalade" }]} accessibilityLabel="Discipline" />
      {sports.length > 1 ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s1 }}>
        {sports.map((s) => <Chip key={s.sport} label={`${s.label} (${s.sessions})`} selected={s.sport === chosenSport} onPress={() => { setSport(s.sport); setGroup(null); setRef("period"); }} testID={`analysis-sport-${s.sport}`} />)}
      </View> : null}
      {groups.length ? <View style={{ gap: space.s1 }}>
        <T variant="caption" tone="muted">{discipline === "endurance" ? "Sorties comparables" : discipline === "strength" ? "Exercice et variante" : "Échelle et discipline"}</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s1 }}>
          {groups.slice(0, 8).map((g) => <Chip key={g.id} label={`${g.label} · ${g.sessions}`} selected={g.id === chosenGroup} onPress={() => { setGroup(g.id); setRef("period"); }} testID={`analysis-group-${g.id}`} />)}
        </View>
      </View> : null}
      <Segmented value={weeks} onChange={setWeeks} options={[{ value: "6", label: "6 sem." }, { value: "12", label: "12 sem." }, { value: "26", label: "26 sem." }]} accessibilityLabel="Période" />
      {v.group ? <View style={{ gap: space.s1 }}>
        <T variant="caption" tone="muted">Comparer avec</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s1 }}>
          {refChips.map(([k, label]) => <Chip key={k} label={label} selected={ref === k} onPress={() => setRef(k)} testID={`analysis-ref-${k}`} />)}
          {ref.startsWith("session:") ? <Chip label={v.reference?.label || "Séance"} selected onPress={() => setRef("period")} testID="analysis-ref-session" /> : null}
        </View>
      </View> : null}

      {!v.group ? <T variant="small" testID="analysis-empty">{v.limits.join(" ")}</T> : <>
        <T variant="small" tone="default" testID="analysis-title">{v.group.label}</T>
        <T variant="caption" tone="muted" testID="analysis-sides">{v.current.label}{v.reference ? ` · référence : ${v.reference.label}` : ""}</T>
        {v.status !== "ok" ? <T variant="caption" testID="analysis-status">{v.status === "limited" ? "Analyse avec limites" : "Données insuffisantes pour une tendance"}</T> : null}
        {v.reference?.note ? <T variant="small" testID="analysis-reference-note">{v.reference.note}</T> : null}
        {v.rows.map((r) => <Row key={r.id} r={r} reference={showRef} rules={rules} onOpen={onOpen} label={(id) => { const l = logs.find((x) => String(x.id) === id); return l ? date(l.date) : id; }} />)}
        <Button kind="ghost" small label={rules ? "Masquer règles et sources" : "Voir règles, sources et séances"} onPress={() => setRules((o) => !o)} testID="analysis-rules-toggle" />
        <View style={{ gap: 2 }} testID="analysis-series">
          <T variant="eyebrow">Séance par séance</T>
          {v.series.map((p) => <View key={p.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.s2 }}>
            <Tap onPress={() => onOpen(p.id)} accessibilityRole="link" accessibilityLabel={`Ouvrir la séance du ${date(p.date)} : ${p.display}`} testID={`analysis-point-${p.id}`} style={{ minHeight: 44, justifyContent: "center", flex: 1 }}>
              <T variant="small" tone={p.value === null ? "faint" : "default"}>{date(p.date)} · {p.display}{p.side === "reference" ? " (référence)" : ""}</T>
            </Tap>
            {p.side === "current" ? null : <Tap onPress={() => setRef(`session:${p.id}`)} accessibilityRole="button" accessibilityLabel={`Comparer avec la séance du ${date(p.date)}`} testID={`analysis-compare-${p.id}`} style={{ minHeight: 44, justifyContent: "center" }}>
              <T variant="caption" tone="muted">Comparer</T>
            </Tap>}
          </View>)}
        </View>
        {v.levels?.current ? <View style={{ gap: 2 }} testID="analysis-levels">
          <T variant="eyebrow">Par niveau</T>
          {v.levels.current.map((l) => <T key={l.grade} variant="small">{l.grade} · {l.done} réussie{l.done > 1 ? "s" : ""} · {l.tried} tentée{l.tried > 1 ? "s" : ""}{l.measured ? ` · ${l.successes}/${l.attempts} réussites/essais` : ""}</T>)}
        </View> : null}
        <View style={{ gap: 4 }} testID="analysis-reading">
          <T variant="eyebrow">Lecture</T>
          {DisciplineAnalysis.reading(v).map((line, i) => <T key={i} variant="caption" testID={`analysis-line-${i}`}>• {line}</T>)}
        </View>
      </>}
    </Card>
  );
}
