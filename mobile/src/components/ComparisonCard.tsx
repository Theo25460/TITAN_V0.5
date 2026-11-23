/* V1.7.1 — Comparaisons justes, on the session sheet: the comparison with the last comparable session, then the selection
   behind it — the rule applied (versioned), its criteria, the sample, the sessions kept (each opens its own sheet), the sessions
   set aside and why, and the precise limit when the data is missing (« Comparaison · données insuffisantes »). The rule and the
   words come from the shared module (src/core/web/progression.js, copied unchanged from the website). */
import { useState } from "react";
import { View } from "react-native";
import { Progression, type Comparables, type ProgressionItem } from "../core";
import type { TrainingLog } from "../core/types";
import { space } from "../theme/tokens";
import { Button } from "./Button";
import { Card } from "./Card";
import { Tap } from "./Pressable";
import { Section } from "./Section";
import { T } from "./Text";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const longDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

function Line({ i }: { i: ProgressionItem }) {
  const now = i.currentReps !== undefined ? `${Progression.formatValue(i)} × ${i.currentReps}` : Progression.formatValue(i);
  const before = i.currentReps !== undefined ? `${Progression.formatValue(i, "previous")} × ${i.previousReps}` : Progression.formatValue(i, "previous");
  const word = Progression.DIRECTION_TEXT[i.direction];
  return (
    <View style={{ gap: 2 }}>
      <T variant="caption" tone="muted">{i.label}</T>
      <T variant="small">{now} · avant {before}{word ? ` · ${word}` : ""}</T>
    </View>
  );
}

function Limits({ s, testID }: { s: Comparables; testID: string }) {
  if (!s.limits.length) return null;
  return (
    <View style={{ gap: 4 }} testID={testID}>
      {s.limits.map((l) => <T key={l} variant="small">• {l}</T>)}
    </View>
  );
}

function Selection({ s, onOpen, limits }: { s: Comparables; onOpen: (id: string) => void; limits: boolean }) {
  const [open, setOpen] = useState(false);
  const n = s.sample;
  const counts = Object.entries(s.counts).map(([k, v]) => `${v} ${Progression.REASONS[k] || k}`).join(", ");
  return (
    <View style={{ gap: space.s2 }}>
      <Button kind="ghost" small label={open ? "Masquer la sélection" : n ? (n > 1 ? `Voir les ${n} séances comparées` : "Voir la séance comparée") : "Voir la règle et les séances examinées"} onPress={() => setOpen((o) => !o)} testID="comparables-toggle" />
      {open ? (
        <View style={{ gap: space.s2 }} testID="comparables">
          <T variant="small" tone="default" testID="comparables-rule">Règle appliquée · {s.rule.label} (règles {s.rule.version})</T>
          {s.rule.criteria.map((c) => <T key={c} variant="caption">• {c}</T>)}
          <T variant="small" tone="default" testID="comparables-sample">
            Échantillon · {n} séance{n > 1 ? "s" : ""} retenue{n > 1 ? "s" : ""} sur {s.considered} examinée{s.considered > 1 ? "s" : ""}{counts ? ` (écartées : ${counts})` : ""}.
          </T>
          {s.retained.length ? <T variant="eyebrow">Séances retenues</T> : null}
          {s.retained.map((r) => (
            <Tap key={r.id} onPress={() => onOpen(r.id)} accessibilityRole="link" accessibilityLabel={`Ouvrir la séance du ${shortDate(r.date)} : ${r.summary}`} testID={`comparable-${r.id}`} style={{ minHeight: 44, justifyContent: "center" }}>
              <T variant="small" tone="default">{shortDate(r.date)} · <T variant="small" tone="muted">{r.summary}</T></T>
            </Tap>
          ))}
          {s.excluded.length ? <T variant="eyebrow">Séances écartées</T> : null}
          {s.excluded.map((x) => (
            <Tap key={x.id} onPress={() => onOpen(x.id)} accessibilityRole="link" accessibilityLabel={`Ouvrir la séance du ${shortDate(x.date)}, écartée : ${x.text}`} testID={`excluded-${x.id}`} style={{ minHeight: 44, justifyContent: "center" }}>
              <T variant="small" tone="default">{shortDate(x.date)} · <T variant="small" tone="muted">{x.text}</T></T>
            </Tap>
          ))}
          {limits && s.limits.length ? <T variant="eyebrow">Limites</T> : null}
          {limits ? <Limits s={s} testID="comparison-limit" /> : null}
        </View>
      ) : null}
    </View>
  );
}

export function ComparisonCard({ log, logs, onOpen }: { log: TrainingLog; logs: TrainingLog[]; onOpen: (id: string) => void }) {
  if (log.archived_at) return null;
  const s = Progression.comparables(log, logs);
  if (!s) return null;
  if (s.status === "insufficient")
    return (
      <Section title="Comparaison · données insuffisantes">
        <Card tone="flat" style={{ gap: 8 }} testID="session-comparison-insufficient">
          <Limits s={s} testID="comparison-limit" />
          <Selection s={s} onOpen={onOpen} limits={false} />
        </Card>
      </Section>
    );
  const c = Progression.compare(log, logs);
  if (!c || !c.items.length) return null;
  return (
    <Section title={`Par rapport au ${longDate(c.previous.date)}`}>
      <Card tone="flat" style={{ gap: 8 }} testID="session-comparison">
        {c.items.slice(0, 6).map((i) => <Line key={i.id} i={i} />)}
        <T variant="caption" tone="faint">{c.basis} Seules les valeurs mesurées sont comparées.</T>
        {s.reference ? <T variant="small" testID="comparison-reference">{s.reference.kind === "best" ? "Meilleure réussite" : "Médiane"} de tes {s.reference.sessions} séances retenues : {s.reference.display}.</T> : null}
        {s.status === "limited" ? <T variant="small" tone="warn">Comparaison élargie : un critère n’a pas pu être vérifié.</T> : null}
        {s.status === "limited" ? <Limits s={s} testID="comparison-limit" /> : null}
        <Selection s={s} onOpen={onOpen} limits={s.status !== "limited"} />
      </Card>
    </Section>
  );
}
