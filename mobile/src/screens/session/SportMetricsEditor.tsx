import { useState } from "react";
import { View } from "react-native";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Field } from "../../components/Field";
import { Section } from "../../components/Section";
import { T } from "../../components/Text";
import { metricFields, metricVisible, structuredMetricKeys, type MetricField, type MetricValues } from "../../core/sportMetrics";

export function SportMetricsEditor({ sport, values = {}, onChange, plus = false, error, skip = structuredMetricKeys(sport) }: { sport: string; values?: MetricValues; onChange: (values: MetricValues) => void; plus?: boolean; error?: string | null; skip?: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const fields = metricFields(sport, plus).filter((f) => !skip.includes(f.id) && metricVisible(f, values));
  const primary = fields.filter((f) => f.type !== "text" && !f.eliteOnly).slice(0, 3);
  const rest = fields.filter((f) => !primary.includes(f));
  const update = (f: MetricField, value: unknown) => onChange({ ...values, [f.id]: value });
  const render = (f: MetricField) => (
    <View key={f.id} style={{ gap: 6 }}>
      {f.type === "select" || f.type === "checkbox" ? <>
        <T variant="caption" tone="muted">{f.label}{f.unit ? ` (${f.unit})` : ""}</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {(f.type === "checkbox" ? [{ label: "Oui", value: true }, { label: "Non", value: false }] : (f.options || []).map((value) => ({ label: value, value }))).map((o) => <Chip key={String(o.value)} label={o.label} selected={values[f.id] === o.value} onPress={() => update(f, values[f.id] === o.value ? "" : o.value)} />)}
        </View>
      </> : <Field label={f.label} value={values[f.id] == null ? "" : String(values[f.id])} onChangeText={(v) => update(f, v)} keyboardType={f.type === "number" ? "decimal-pad" : "default"} suffix={f.unit} maxLength={f.type === "text" ? 120 : 24} hint={f.type === "number" ? `${f.min ?? 0} à ${f.max ?? 1000000}${f.unit ? ` ${f.unit}` : ""}` : undefined} testID={`metric-${f.id}`} />}
    </View>
  );
  if (!fields.length) return null;
  return <Section title="Mesures spécifiques">
    <T variant="caption" tone="faint">Facultatif : renseigne uniquement les valeurs observées ou mesurées. Une valeur absente reste inconnue.</T>
    {primary.map(render)}
    {rest.length ? <Button kind="ghost" small label={expanded ? "Masquer les autres mesures" : "Autres mesures (facultatif)"} onPress={() => setExpanded(!expanded)} /> : null}
    {rest.filter((f) => expanded || (values[f.id] !== undefined && values[f.id] !== null && values[f.id] !== "")).map(render)}
    {error ? <T variant="small" tone="err" accessibilityRole="alert">{error}</T> : null}
  </Section>;
}
