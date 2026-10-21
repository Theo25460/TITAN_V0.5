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
            <Card key={r.id} tone={r.kind === "strength" || r.kind === "climbing" ? "default" : "default"} onPress={() => navigation.navigate("SessionDetail", { id: r.log.id })} accessibilityLabel={`${r.label} : ${typeof r.value === "number" ? Format.recordValue(r.unit, r.value) : r.value}. Ouvrir la séance du ${Format.longDate(r.log.date)}`} style={{ gap: 6 }}>
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
                {Format.longDate(r.log.date)} · {r.context}
              </T>
            </Card>
          ))}
        </Section>
      ))}
    </Screen>
  );
}
