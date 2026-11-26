import { useNavigation } from "@react-navigation/native";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { CoverageNote } from "../../components/CoverageNote";
import { Icon } from "../../components/Icon";
import { Tap } from "../../components/Pressable";
import { Screen } from "../../components/Screen";
import { Section } from "../../components/Section";
import { EmptyState } from "../../components/States";
import { T } from "../../components/Text";
import { Format, Insights, Sports, type RecordEntry } from "../../core";
import { recordStory } from "../../core/shareStory";
import { useLogs, useProfile } from "../../data/hooks";
import { recordHistory } from "../../lib/recordBook";
import { colors, space, TOUCH } from "../../theme/tokens";

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
  const { active, coverage, isFetching } = useLogs();
  const [sport, setSport] = useState<string | null>(null);
  const records = useMemo(() => Insights.records(active, "all", Date.now()), [active]);
  const sports = useMemo(() => [...new Set(records.map((r) => r.sport))], [records]);
  const history = useMemo(() => recordHistory(active), [active]);
  const [opened, setOpened] = useState<string | null>(null);
  const username = useProfile().data?.username ?? null;
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
        <EmptyState brand icon="trophy" title="Pas encore de record" text="Tes meilleures distances, durées, charges et cotations apparaîtront ici, chacune reliée à la séance d’origine." action="Enregistrer une séance" onAction={() => navigation.navigate("Tabs", { screen: "Record" })} />
      </Screen>
    );

  return (
    <Screen>
      {/* V1.6.6: records of a partial copy are the records of the sessions this phone holds; the note says so. */}
      <CoverageNote coverage={coverage} loading={isFetching} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.s4 }} contentContainerStyle={{ gap: 6, paddingHorizontal: space.s4 }}>
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
              {(history.get(r.id)?.length ?? 0) > 1 ? (
                opened === r.id ? (
                  <View style={{ gap: 2, paddingTop: 4 }} testID={`record-book-${r.id}`}>
                    <T variant="caption" tone="amber">Livre d’or · {history.get(r.id)!.length} étapes</T>
                    {history.get(r.id)!.map((h) => (
                      <T key={h.logId} variant="caption" tone="muted">
                        {Format.longDate(h.date)} · {typeof h.value === "number" ? Format.recordValue(h.unit, h.value) : h.value}
                      </T>
                    ))}
                  </View>
                ) : (
                  // A 48 dp target for a one-line link; the negative margins take that room from the card's own padding, so the card stays compact.
                  <Tap onPress={() => setOpened(r.id)} accessibilityLabel={`Voir ses ${history.get(r.id)!.length} étapes depuis le début`} testID={`record-book-open-${r.id}`} style={styles.bookLink}>
                    <T variant="caption" tone="accent">
                      Voir ses {history.get(r.id)!.length} étapes depuis le début
                    </T>
                  </Tap>
                )
              ) : null}
              {/* « Partager » (before V2): this record as a success card; the step before it comes from its own history. */}
              <Tap
                onPress={() => {
                  const steps = history.get(r.id) ?? [];
                  const previous = steps.length > 1 && steps[steps.length - 1]?.logId === r.log.id ? steps[steps.length - 2]?.value ?? null : null;
                  navigation.navigate("ShareStory", { kind: "achievement", input: recordStory(r, { previous, name: username }) });
                }}
                accessibilityLabel={`Partager le record ${r.label}`}
                testID={`record-share-${r.id}`}
                style={styles.bookLink}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Icon name="share" size={16} color={colors.cy} />
                  <T variant="caption" tone="accent">Partager</T>
                </View>
              </Tap>
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

const styles = StyleSheet.create({
  bookLink: { minHeight: TOUCH, justifyContent: "center", alignSelf: "flex-start", paddingRight: space.s3, marginTop: -space.s2, marginBottom: -space.s3 },
});
