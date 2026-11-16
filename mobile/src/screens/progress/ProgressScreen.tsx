import { AdBanner } from "../../components/AdBanner";
import { useNavigation } from "@react-navigation/native";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { BarChart } from "../../components/Charts";
import { Icon, type IconName } from "../../components/Icon";
import { ProgressBar } from "../../components/Progress";
import { Tap } from "../../components/Pressable";
import { Screen } from "../../components/Screen";
import { Section, Stat, StatRow } from "../../components/Section";
import { Segmented } from "../../components/Segmented";
import { SelfComparisonCard } from "../../components/MemoryCard";
import { YearSquares } from "../../components/HabitCards";
import { EmptyState, ErrorState, LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { Codex, Format, Progress, Questions, Sports, Training, type Recap, type WeekChapter } from "../../core";
import { useOwner } from "../../data/auth";
import { useAdventure, useGoals, useLogs, usePrefs } from "../../data/hooks";
import { navigateHref } from "../../navigation/href";
import { Program, type ProgramWeek } from "../../core/program";
import { ProgramGrid } from "../../components/ProgramGrid";
import { FieldFigure, SpaceField } from "../../components/SpaceField";
import { colors, spaces, familyColors, space } from "../../theme/tokens";
import { SportQuestions } from "./Questions";

type View_ = "week" | "trends" | "mastery";

type Km = { sport: string; label: string; km: number };
/** Kilometres per sport over a period, largest first. A run and a ride are both "km" but not the same effort: when several sports
    contribute, the total is labelled as such and each sport's own distance is listed, so nobody reads 60 km as 60 km of running. */
export function kmBySport(logs: { sport: string; unit?: string | null; val?: number | string | null; date: string }[], from: number, to: number): Km[] {
  const out = new Map<string, number>();
  for (const l of logs) {
    const t = new Date(l.date).getTime();
    const km = Number(l.val);
    if (l.unit !== "km" || !(km > 0) || t < from || t >= to) continue;
    out.set(l.sport, (out.get(l.sport) ?? 0) + km);
  }
  return [...out.entries()].map(([sport, km]) => ({ sport, label: Sports.label(sport), km: Math.round(km * 10) / 10 })).sort((a, b) => b.km - a.km);
}
const kmLabel = (km: Km[]) => (km.length > 1 ? "parcourus, tous sports" : "parcourus");
function KmDetail({ km }: { km: Km[] }) {
  if (km.length < 2) return null;
  return (
    <T variant="caption" tone="muted" testID="km-detail">
      Distances par sport : {km.map((k) => `${k.label} ${Format.distance(k.km)}`).join(" · ")}
    </T>
  );
}

const LINKS: { icon: IconName; label: string; route: "Journal" | "Records" | "Goals" | "Plan" | "Steps" | "Career" }[] = [
  { icon: "crown", label: "Ma carrière", route: "Career" },
  { icon: "journal", label: "Journal", route: "Journal" },
  { icon: "trophy", label: "Records", route: "Records" },
  { icon: "target", label: "Objectifs", route: "Goals" },
  { icon: "run", label: "Mes pas", route: "Steps" },
  { icon: "calendar", label: "Semaine type", route: "Plan" },
];

function RecapCard({ recap, title, chapter, km, paused = false, local = false, grid, onNext }: { recap: Recap; title: string; chapter: WeekChapter; km: Km[]; paused?: boolean; local?: boolean; grid?: ProgramWeek; onNext: () => void }) {
  const w = recap.week;
  const { comparison, story } = chapter;
  const world = story && Codex.worlds.find((item) => item.id === story.world);
  const sessions = local ? Format.plural(chapter.sessions, "séance enregistrée sur cet appareil", "séances enregistrées sur cet appareil") : Format.plural(chapter.sessions, "séance confirmée", "séances confirmées");
  return (
    <Card tone="plain" style={{ gap: space.s3, paddingBottom: space.s4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <T variant="title">{title}</T>
        <T variant="caption" tone="faint">
          {recap.from.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} – {recap.to.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
        </T>
      </View>
      {grid ? <ProgramGrid grid={grid} /> : null}
      {paused ? <T variant="bodyStrong">Cadence en pause</T> : null}
      <T variant="small">{chapter.sessions ? `${sessions} · ${Format.plural(chapter.activeDays, "jour actif", "jours actifs")}.` : `Aucune séance ${local ? "enregistrée" : "confirmée"} sur cette période. Une semaine calme ne t’enlève rien.`}</T>
      {comparison ? <T variant="small">{comparison.label} · {Format.duration(comparison.minutes)} renseignées, contre {Format.duration(comparison.previousMinutes)} la semaine précédente{comparison.partial ? " au même moment" : ""}.</T> : null}
      {story && world ? <T variant="small" tone="accent">Chapitre {story.chapter} validé · {world.name}.</T> : null}
      {!recap.empty ? (
        <>
          <StatRow flat>
            <Stat label="de pratique" value={Format.duration(w.minutes)} sub={w.estimatedMinutes ? `dont ${Format.duration(w.estimatedMinutes)} estimées` : undefined} />
            {w.distance ? <Stat label={kmLabel(km)} value={Format.distance(w.distance)} /> : <Stat label="min d’effort" value={String(w.effortMinutes)} />}
            <Stat label="XP gagnés" value={Format.number(w.xp)} tone="accent" />
          </StatRow>
          <KmDetail km={km} />
          {recap.topSport ? (
            <T variant="small">
              Sport dominant : <T variant="small" tone="default">{recap.topSport.label}</T> ({Format.duration(recap.topSport.minutes)}, {recap.topSport.sessions} séance{recap.topSport.sessions > 1 ? "s" : ""}).
            </T>
          ) : null}
          {recap.records.length ? (
            <View style={{ gap: 4 }}>
              {recap.records.slice(0, 3).map((r) => (
                <View key={r.id} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <Icon name="trophy" size={16} color={colors.am} />
                  <T variant="small" tone="default" style={{ flex: 1 }}>
                    {r.label} · {typeof r.value === "number" ? Format.recordValue(r.unit, r.value) : r.value} ({Sports.label(r.sport)})
                  </T>
                </View>
              ))}
            </View>
          ) : null}
          {recap.goals.map((g) => (
            <View key={g.goal.id} style={{ gap: 4 }}>
              <T variant="caption" tone="muted">
                {g.goal.title}
                {g.completedThisWeek ? " · atteint cette semaine" : ""}
              </T>
              <ProgressBar value={g.ratio} color={g.complete ? colors.ok : colors.cy} height={6} accessibilityLabel={g.goal.title} />
            </View>
          ))}
        </>
      ) : null}
      <Button small kind="secondary" label={chapter.next.label} onPress={onNext} />
    </Card>
  );
}

export function ProgressScreen() {
  const navigation = useNavigation();
  const owner = useOwner();
  const q = useLogs();
  const goals = useGoals();
  const adventure = useAdventure();
  const prefs = usePrefs();
  const [view, setView] = useState<View_>("week");
  const [range, setRange] = useState<"26" | "52">("26");
  const { active } = q;
  const now = new Date();

  const journal = useMemo(() => q.confirmed.filter((log) => !log.is_suspicious), [q.confirmed]);
  const current = useMemo(() => Progress.recap(journal, { now, goals: goals.data ?? [], current: true }), [journal, goals.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const last = useMemo(() => Progress.recap(journal, { now, goals: goals.data ?? [] }), [journal, goals.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const series = useMemo(() => Questions.weeklySeries(active, { weeks: Number(range) }), [active, range]);
  const month = useMemo(() => Training.summarize(active, 30), [active]);
  const kmCurrent = useMemo(() => kmBySport(journal, current.from.getTime(), current.to.getTime()), [journal, current]);
  const kmLast = useMemo(() => kmBySport(journal, last.from.getTime(), last.to.getTime()), [journal, last]);
  const kmMonth = useMemo(() => kmBySport(active, Date.now() - 30 * 86_400_000, Date.now() + 86_400_000), [active]);
  const dna = useMemo(() => Progress.dna(active), [active]);
  const gridCurrent = useMemo(() => Program.week(journal, { start: current.from, maxRows: 5 }), [journal, current.from]);
  const gridLast = useMemo(() => Program.week(journal, { start: last.from, maxRows: 5 }), [journal, last.from]);
  const span = useMemo(() => Program.span(active, { weeks: 12, maxRows: 6 }), [active]);
  const mastery = useMemo(() => Progress.mastery(active), [active]);
  const cadence = useMemo(() => Progress.cadence(active, { target: prefs.weeklyGoalSessions, pauses: prefs.cadencePauses }), [active, prefs]);
  const chapter = Progress.weekChapter(journal, { now, owner: owner ?? undefined, adventure: adventure.data, paused: cadence.currentPaused });
  const previousChapter = Progress.weekChapter(journal, { now, start: last.from, owner: owner ?? undefined, adventure: adventure.data });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen tab padded={false} refreshing={q.isRefetching} onRefresh={() => { q.refetch(); goals.refetch(); }}>
        {/* The azure field: the last thirty days in three figures, read before anything is opened. */}
        <SpaceField id="progres" title="Progrès" testID="progress-field">
          {active.length ? (
            <View style={{ gap: space.s1 }}>
              <View style={{ flexDirection: "row", gap: space.s4 }}>
                <FieldFigure id="progres" value={String(month.sessions)} label={month.sessions > 1 ? "séances" : "séance"} />
                <FieldFigure id="progres" value={Format.duration(month.minutes)} label="de pratique" />
                <FieldFigure id="progres" value={String(month.buckets.filter((b) => b.sessions > 0).length)} label="jours actifs" />
              </View>
              <T variant="caption" color={spaces.progres.ink} style={{ opacity: 0.78 }}>Sur les 30 derniers jours</T>
            </View>
          ) : null}
        </SpaceField>
        <View style={styles.body}>
        <View style={styles.links}>
          {LINKS.map((l) => (
            <Tap key={l.route} onPress={() => navigation.navigate(l.route)} accessibilityLabel={l.label} style={styles.link}>
              <Icon name={l.icon} size={22} color={colors.azur} />
              <T variant="caption" tone="default" numberOfLines={2}>
                {l.label}
              </T>
            </Tap>
          ))}
        </View>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "week", label: "Semaine" },
            { value: "trends", label: "Tendances" },
            { value: "mastery", label: "Maîtrise" },
          ]}
          accessibilityLabel="Vue des progrès"
        />
        {q.isLoading && !q.data ? (
          <LoadingCards />
        ) : q.error && !q.data ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !active.length && (view !== "week" || (!cadence.currentPaused && !chapter.story && !previousChapter.story)) ? (
          <EmptyState brand icon="chart" title="Tes statistiques commencent ici" text="Enregistre une séance : semaine, tendances, records et maîtrises se construisent avec ton journal." action="Enregistrer une séance" onAction={() => navigation.navigate("Tabs", { screen: "Record" })} />
        ) : view === "week" ? (
          <>
            <Section title="Ma semaine, mon chapitre">
              <RecapCard grid={gridCurrent} recap={current} title="Cette semaine" chapter={chapter} km={kmCurrent} paused={cadence.currentPaused} local={owner?.startsWith("guest_")} onNext={() => navigateHref(navigation, chapter.next.href)} />
              <RecapCard grid={gridLast} recap={last} title="Semaine dernière" chapter={previousChapter} km={kmLast} local={owner?.startsWith("guest_")} onNext={() => navigateHref(navigation, previousChapter.next.href)} />
            </Section>
            <Card tone="flat" style={{ gap: 6 }}>
              <T variant="bodyStrong">
                Cadence : {cadence.held}/{cadence.window} semaines tenues
              </T>
              <T variant="small">
                {cadence.lifetimeHeld} semaine{cadence.lifetimeHeld > 1 ? "s" : ""} tenue{cadence.lifetimeHeld > 1 ? "s" : ""} depuis le début, avec un objectif de {cadence.target} jour{cadence.target > 1 ? "s" : ""} actif{cadence.target > 1 ? "s" : ""}.
              </T>
            </Card>
          </>
        ) : view === "trends" ? (
          <>
            <Section title="Mon programme sur 12 semaines">
              <ProgramGrid grid={span} testID="progress-program" />
            </Section>
            <YearSquares logs={active} />
            <SelfComparisonCard logs={active} />
            <Section title="Tes questions">
              <SportQuestions logs={active} cadenceTarget={prefs.weeklyGoalSessions} pauses={prefs.cadencePauses} />
            </Section>
            <Section title="Sur la durée">
              <Card style={{ gap: space.s3 }}>
                <Segmented value={range} onChange={setRange} options={[{ value: "26", label: "6 mois" }, { value: "52", label: "1 an" }]} accessibilityLabel="Période" />
                <BarChart
                  data={series.map((w) => ({ label: w.current ? "Sem." : w.start.toLocaleDateString("fr-FR", { day: "numeric", month: "numeric" }), detail: w.current ? "Cette semaine" : `Semaine du ${w.start.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`, value: w.minutes, highlight: w.current }))}
                  format={(v) => Format.duration(v)}
                  average
                  accessibilityLabel="Minutes de pratique par semaine"
                />
              </Card>
            </Section>
            <Section title="30 derniers jours">
              <Card style={{ gap: space.s3 }}>
                <StatRow flat>
                  <Stat label="séances" value={String(month.sessions)} />
                  <Stat label="de pratique" value={Format.duration(month.minutes)} />
                  {month.distance ? <Stat label={kmLabel(kmMonth)} value={Format.distance(month.distance)} /> : null}
                </StatRow>
                {month.distance ? <KmDetail km={kmMonth} /> : null}
                <BarChart
                  data={Training.chartBuckets(month.buckets, 30).map((b) => ({ label: String(new Date(`${b.date}T12:00:00`).getDate()), detail: new Date(`${b.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }), value: b.minutes }))}
                  height={120}
                  format={(v) => Format.duration(v)}
                  accessibilityLabel="Minutes de pratique par jour sur 30 jours"
                />
                {month.measured < month.sessions ? <T variant="caption" tone="faint">{Format.plural(month.sessions - month.measured, "séance sans durée renseignée ne compte", "séances sans durée renseignée ne comptent")} pas dans ce graphique.</T> : null}
              </Card>
            </Section>
          </>
        ) : (
          <>
            <Card tone="accent" style={{ gap: 8 }}>
              <T variant="eyebrow" tone="accent">
                TITAN DNA
              </T>
              <StatRow>
                <Stat label="séances" value={Format.number(dna.sessions)} />
                <Stat label="de pratique" value={Format.hours(dna.minutes)} />
                <Stat label="semaines actives" value={String(dna.activeWeeks)} />
              </StatRow>
              {dna.enough ? (
                <T variant="small">
                  {[dna.timeOfDay ? `Tu t’entraînes surtout le ${dna.timeOfDay === "après-midi" ? "l’après-midi" : dna.timeOfDay}` : null, dna.favoriteDay ? `ton jour le plus actif est le ${dna.favoriteDay}` : null].filter(Boolean).join(", ")}
                  {dna.first ? `. Premier repère le ${Format.longDate(dna.first)}.` : "."}
                </T>
              ) : (
                <T variant="small">Ton ADN se précise à partir de 5 séances.</T>
              )}
            </Card>
            <AdBanner placement="stats" />
            <Section title="Maîtrise par discipline">
              <T variant="caption" tone="faint">
                La maîtrise mesure la pratique (heures et semaines), jamais la performance.
              </T>
              {mastery.map((m) => (
                <Card key={m.sport} style={{ gap: 8 }} onPress={() => navigation.navigate("Journal", { sport: m.sport })} accessibilityLabel={`${m.label}, maîtrise ${m.level}, ${m.name}`}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.s3 }}>
                    <View style={[styles.lvl, { borderColor: familyColors[m.family] }]}>
                      <T variant="num">{m.level}</T>
                    </View>
                    <View style={{ flex: 1 }}>
                      <T variant="bodyStrong">{m.label}</T>
                      <T variant="caption" tone="faint">
                        {m.name} · {Format.number(m.hours, 1)} h · {m.weeks} semaine{m.weeks > 1 ? "s" : ""}
                      </T>
                    </View>
                  </View>
                  {m.next ? (
                    <>
                      <ProgressBar value={m.progress} color={familyColors[m.family]} height={6} accessibilityLabel={`Vers ${m.next.name}`} />
                      <T variant="caption" tone="faint">
                        Prochain : {m.next.name} à {m.next.hours} h et {m.next.weeks} semaines
                      </T>
                    </>
                  ) : (
                    <T variant="caption" tone="amber">
                      Niveau de référence atteint
                    </T>
                  )}
                </Card>
              ))}
            </Section>
          </>
        )}
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  // Wraps to two rows on a narrow window or a large system font instead of cutting "Semaine type" to "Semaine ty…" (V12-24).
  body: { paddingHorizontal: space.s5, paddingTop: space.s4, gap: space.s5 },
  links: { flexDirection: "row", flexWrap: "wrap", columnGap: space.s3 },
  link: { flexGrow: 1, flexBasis: 96, flexDirection: "row", alignItems: "center", gap: space.s2, paddingVertical: space.s3, minHeight: 52, borderBottomWidth: 1, borderBottomColor: colors.line },
  lvl: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
