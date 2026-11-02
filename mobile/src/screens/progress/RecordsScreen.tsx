import { useNavigation } from "@react-navigation/native";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { Screen } from "../../components/Screen";
import { Section } from "../../components/Section";
import { EmptyState } from "../../components/States";
import { T } from "../../components/Text";
import { Format, Insights, Sports, type RecordEntry } from "../../core";
import { useLogs } from "../../data/hooks";
import { colors, space } from "../../theme/tokens";

const KIND_LABEL: Record<RecordEntry["kind"], string> = { distance: "Distance", time: "Temps sur distance", duration: "Durée", strength: "Force", climbing: "Escalade" };

/** Standard cautions of the record rules: shown once under the list instead of under every card. A changed wording just stays on its card. */
const NOTES: { text: string; label: string }[] = [
  { text: "Un repère historique, pas une recommandation de durée.", label: "La durée est un repère de ton historique, pas une recommandation." },
  { text: "Ce n’est pas un 1RM estimé.", label: "La charge est la plus élevée que tu as déclarée, pas un 1RM estimé." },
  { text: "Ce n’est pas un temps de segment GPS.", label: "Les temps sur distance viennent de séances de cette distance (à ±1 %), pas d’un segment GPS." },
  { text: "Distance totale de la séance, selon la saisie ou le fichier importé.", label: "La distance est celle de la séance entière, selon ta saisie ou le fichier importé." },
];

/** The card keeps what is specific to this record; the standard cautions go to the notes below. */
export function specific(context: string, used: Set<string>) {
  let rest = context;
  for (const n of NOTES)
    if (rest.includes(n.text)) {
      rest = rest.replace(n.text, "");
      used.add(n.label);
    }
  return rest.replace(/\s+/g, " ").replace(/^[\s.·]+|[\s·]+$/g, "").trim();
}

/** Records only between comparable values, always linked to the source session (same rules as the website). */
export function RecordsScreen() {
  const navigation = useNavigation();
  const { active } = useLogs();
  const [sport, setSport] = useState<string | null>(null);
  const records = useMemo(() => Insights.records(active.filter((l) => l.syncStatus === "confirmed" || !l.syncStatus), "all", Date.now()), [active]);
  const sports = useMemo(() => [...new Set(records.map((r) => r.sport))], [records]);
  const shown = records.filter((r) => !sport || r.sport === sport);
  const grouped = useMemo(() => {
    const m = new Map<string, RecordEntry[]>();
    for (const r of shown) {
      if (!m.has(r.sport)) m.set(r.sport, []);
      m.get(r.sport)!.push(r);
    }
    return [...m.entries()];
  }, [shown]);

  const notes = new Set<string>();
  const details = new Map(shown.map((r) => [r.id, specific(r.context, notes)]));

  if (!records.length)
    return (
      <Screen>
        <EmptyState icon="trophy" title="Pas encore de record" text="Tes meilleures distances, durées, charges et cotations apparaîtront ici, chacune reliée à la séance d’origine." action="Enregistrer une séance" onAction={() => navigation.navigate("Tabs", { screen: "Record" })} />
      </Screen>
    );

  return (
    <Screen>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        <Chip label="Tous" selected={!sport} onPress={() => setSport(null)} />
        {sports.map((s) => (
          <Chip key={s} label={Sports.label(s)} selected={sport === s} onPress={() => setSport(sport === s ? null : s)} />
        ))}
      </ScrollView>
      {grouped.map(([s, list]) => (
        <Section key={s} title={Sports.label(s)}>
          {list.map((r) => (
            <Card key={r.id} onPress={() => navigation.navigate("SessionDetail", { id: r.log.id })} accessibilityLabel={`${r.label} : ${typeof r.value === "number" ? Format.recordValue(r.unit, r.value) : r.value}. Ouvrir la séance du ${Format.longDate(r.log.date)}`} style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.s3 }}>
                <Icon name="trophy" size={20} color={colors.am} />
                <View style={{ flex: 1 }}>
                  <T variant="caption" tone="faint">
                    {KIND_LABEL[r.kind]}
                  </T>
                  <T variant="bodyStrong">{r.label}</T>
                </View>
                <T variant="num" tone="amber">
                  {typeof r.value === "number" ? Format.recordValue(r.unit, r.value) : r.value}
                </T>
              </View>
              <T variant="caption" tone="faint">
                {Format.longDate(r.log.date)}
                {details.get(r.id) ? ` · ${details.get(r.id)}` : ""}
              </T>
            </Card>
          ))}
        </Section>
      ))}
      {notes.size ? (
        <Card tone="flat" style={{ gap: 6 }}>
          <T variant="eyebrow">À savoir</T>
          {[...notes].map((n) => (
            <T key={n} variant="caption" tone="muted">
              {n}
            </T>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
