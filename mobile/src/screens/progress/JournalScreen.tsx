import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, SectionList, View } from "react-native";
import { Chip } from "../../components/Chip";
import { OfflineBanner } from "../../components/OfflineBanner";
import { SessionRow } from "../../components/SessionRow";
import { EmptyState, ErrorState, LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { Format, Sports } from "../../core";
import { recordHolders } from "../../core/moment";
import type { TrainingLog } from "../../core/types";
import { useLogs } from "../../data/hooks";
import type { RootParams } from "../../navigation/types";
import { colors, space } from "../../theme/tokens";

/** Full journal, virtualised (thousands of sessions stay fluid), grouped by month, filterable by sport. */
export function JournalScreen({ navigation, route }: NativeStackScreenProps<RootParams, "Journal">) {
  const q = useLogs();
  const [sport, setSport] = useState<string | null>(route.params?.sport ?? null);
  const [showArchived, setShowArchived] = useState(false);
  const source = showArchived ? q.archived : q.logs;
  const sports = useMemo(() => {
    const count = new Map<string, number>();
    for (const l of q.logs) count.set(l.sport, (count.get(l.sport) || 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  }, [q.logs]);
  const holders = useMemo(() => recordHolders(q.logs), [q.logs]);
  const sections = useMemo(() => {
    const list = source.filter((l) => !sport || l.sport === sport).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const groups = new Map<string, TrainingLog[]>();
    for (const l of list) {
      const key = new Date(l.date).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(l);
    }
    return [...groups.entries()].map(([title, data]) => ({ title, data, minutes: data.reduce((n, l) => n + (Number(l.details?.duration || l.details?.val2) || (l.unit === "min" ? Number(l.val) : 0)), 0) }));
  }, [source, sport]);

  if (q.isLoading && !q.data) return <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.s4 }}><LoadingCards /></View>;
  if (q.error && !q.data) return <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.s4 }}><ErrorState error={q.error} onRetry={() => q.refetch()} /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OfflineBanner />
      <SectionList
        sections={sections}
        keyExtractor={(l) => l.id}
        stickySectionHeadersEnabled
        initialNumToRender={14}
        windowSize={9}
        contentContainerStyle={{ padding: space.s4, paddingBottom: space.s9, gap: space.s2 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} colors={[colors.cy]} progressBackgroundColor={colors.bg3} />}
        ListHeaderComponent={
          <View style={{ gap: space.s3, marginBottom: space.s2 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              <Chip label="Tous les sports" selected={!sport} onPress={() => setSport(null)} />
              {sports.map((s) => (
                <Chip key={s} label={Sports.label(s)} selected={sport === s} onPress={() => setSport(sport === s ? null : s)} />
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Chip label={`Journal (${q.logs.length})`} selected={!showArchived} onPress={() => setShowArchived(false)} />
              <Chip label={`Archives (${q.archived.length})`} icon="archive" selected={showArchived} onPress={() => setShowArchived(true)} />
            </View>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={{ backgroundColor: colors.bg, paddingVertical: space.s2, flexDirection: "row", justifyContent: "space-between" }}>
            <T variant="eyebrow">{section.title}</T>
            <T variant="caption" tone="faint">
              {section.data.length} séance{section.data.length > 1 ? "s" : ""}
              {section.minutes ? ` · ${Format.duration(section.minutes)}` : ""}
            </T>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={{ marginBottom: space.s2 }}>
            <SessionRow log={item} record={holders.has(item.id)} onPress={() => navigation.navigate("SessionDetail", { id: item.id })} />
          </View>
        )}
        ListEmptyComponent={
          showArchived ? (
            <EmptyState icon="archive" title="Aucune séance archivée" />
          ) : (
            <EmptyState icon="journal" title={sport ? "Aucune séance de ce sport" : "Ton journal est vide"} text="Chaque séance enregistrée apparaît ici, même hors ligne." action="Enregistrer une séance" onAction={() => navigation.navigate("Tabs", { screen: "Record" })} />
          )
        }
      />
    </View>
  );
}
