import { AdBanner } from "../../components/AdBanner";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, SectionList, View } from "react-native";
import { Chip } from "../../components/Chip";
import { OfflineBanner } from "../../components/OfflineBanner";
import { SessionRow } from "../../components/SessionRow";
import { EmptyState, ErrorState, LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { Format, Progress, Sports } from "../../core";
import { recordHolders } from "../../core/moment";
import type { TrainingLog } from "../../core/types";
import { useLogs } from "../../data/hooks";
import type { RootParams } from "../../navigation/types";
import { SpaceProvider, spaceOfRoute } from "../../theme/space";
import { colors, space } from "../../theme/tokens";

/** Full journal, virtualised (thousands of sessions stay fluid), grouped by month, filterable by sport. */
export function JournalScreen({ navigation, route }: NativeStackScreenProps<RootParams, "Journal">) {
  const q = useLogs();
  const [sport, setSport] = useState<string | null>(route.params?.sport ?? null);
  const [showArchived, setShowArchived] = useState(false);
  const source = showArchived ? q.archived : q.logs;
  const weekStart = route.params?.weekStart;
  // The same counted sessions as the weekly recap (V1.6.3 matrix, shared with the website).
  const periodLogs = useMemo(() => {
    if (weekStart == null) return source;
    return Progress.weekLogs(q.active, new Date(weekStart));
  }, [weekStart, source, q.active]);
  const sports = useMemo(() => {
    const count = new Map<string, number>();
    for (const l of periodLogs) count.set(l.sport, (count.get(l.sport) || 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  }, [periodLogs]);
  // A record badge follows the records view: counted sessions only, never a refused or archived one (V1.6.3 matrix).
  const holders = useMemo(() => recordHolders(q.active), [q.active]);
  const sections = useMemo(() => {
    const list = periodLogs.filter((l) => !sport || l.sport === sport).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const month = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
    const groups = new Map<string, TrainingLog[]>();
    for (const l of list) {
      const key = Number.isFinite(Date.parse(l.date)) ? month.format(new Date(l.date)) : "Date inconnue";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(l);
    }
    return [...groups.entries()].map(([title, data]) => ({ title, data, minutes: data.reduce((n, l) => n + (Number(l.details?.duration || l.details?.val2) || (l.unit === "min" ? Number(l.val) : 0)), 0) }));
  }, [periodLogs, sport]);

  // This screen is a virtualised list, not a <Screen>: it names its space itself (Progrès), so chips, buttons and links are azure.
  const theme = spaceOfRoute(route.name);
  if (q.isLoading && !q.data) return <SpaceProvider space={theme}><View style={{ flex: 1, backgroundColor: colors.bg, padding: space.s4 }}><LoadingCards /></View></SpaceProvider>;
  if (q.error && !q.data) return <SpaceProvider space={theme}><View style={{ flex: 1, backgroundColor: colors.bg, padding: space.s4 }}><ErrorState error={q.error} onRetry={() => q.refetch()} /></View></SpaceProvider>;

  return (
    <SpaceProvider space={theme}>
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OfflineBanner />
      <SectionList
        sections={sections}
        keyExtractor={(l) => l.id}
        stickySectionHeadersEnabled
        initialNumToRender={14}
        windowSize={9}
        contentContainerStyle={{ padding: space.s4, paddingBottom: space.s9, gap: space.s2 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} colors={[theme.accent]} progressBackgroundColor={colors.bg3} />}
        ListHeaderComponent={
          <View style={{ gap: space.s3, marginBottom: space.s2 }}>
            {weekStart != null ? (
              <View style={{ gap: space.s2 }}>
                <T variant="title">Semaine du {Format.longDate(new Date(weekStart).toISOString())}</T>
                <Chip label="Voir tout le journal" onPress={() => navigation.setParams({ weekStart: undefined })} />
              </View>
            ) : null}
            {/* The chips slide to the screen edge (a bleed of the page margin), not into a cut at the margin. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.s4 }} contentContainerStyle={{ gap: 6, paddingHorizontal: space.s4 }}>
              <Chip label="Tous les sports" selected={!sport} onPress={() => setSport(null)} />
              {sports.map((s) => (
                <Chip key={s} label={Sports.label(s)} selected={sport === s} onPress={() => setSport(sport === s ? null : s)} />
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {weekStart == null ? <Chip label={`Journal (${q.logs.length})`} selected={!showArchived} onPress={() => { setShowArchived(false); setSport(null); }} /> : null}
              {weekStart == null ? <Chip label={`Archives (${q.archived.length})`} icon="archive" selected={showArchived} onPress={() => { setShowArchived(true); setSport(null); }} /> : null}
              <Chip label="Mes parcours" icon="route" onPress={() => navigation.navigate("Routes")} testID="journal-routes" />
            </View>
            <AdBanner placement="journal" />
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
            <EmptyState brand={!sport} icon="journal" title={sport ? "Aucune séance de ce sport" : "Ton journal est vide"} text="Chaque séance enregistrée apparaît ici, même hors ligne." action="Enregistrer une séance" onAction={() => navigation.navigate("Tabs", { screen: "Record" })} />
          )
        }
      />
    </View>
    </SpaceProvider>
  );
}
