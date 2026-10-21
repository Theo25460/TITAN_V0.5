import { useNavigation } from "@react-navigation/native";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card } from "../../components/Card";
import { BarChart, ShareBar } from "../../components/Charts";
import { Icon, type IconName } from "../../components/Icon";
import { ProgressBar } from "../../components/Progress";
import { Tap } from "../../components/Pressable";
import { Screen } from "../../components/Screen";
import { Section, Stat, StatRow } from "../../components/Section";
import { Segmented } from "../../components/Segmented";
import { EmptyState, ErrorState, LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { Format, Progress, Questions, Sports, Training, type Recap } from "../../core";
import { useGoals, useLogs, usePrefs } from "../../data/hooks";
import { colors, familyColors, space } from "../../theme/tokens";

type View_ = "week" | "trends" | "mastery";

const LINKS: { icon: IconName; label: string; route: "Journal" | "Records" | "Goals" | "Plan" }[] = [
  { icon: "journal", label: "Journal", route: "Journal" },
  { icon: "trophy", label: "Records", route: "Records" },
  { icon: "target", label: "Objectifs", route: "Goals" },
  { icon: "calendar", label: "Semaine type", route: "Plan" },
];

function delta(n: number | null, unit: (v: number) => string) {
  if (n === null) return "première référence";
  if (Math.abs(n) < 0.5) return "comme d’habitude";
  return `${n > 0 ? "+" : "−"}${unit(Math.abs(n))} vs moyenne`;
}

function RecapCard({ recap, title }: { recap: Recap; title: string }) {
  const w = recap.week;
  return (
    <Card style={{ gap: space.s3 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <T variant="h3">{title}</T>
        <T variant="caption" tone="faint">
          {recap.from.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} – {recap.to.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
        </T>
      </View>
      {recap.empty ? (
        <T variant="small">Aucune séance sur cette période. Une semaine calme ne t’enlève rien.</T>
      ) : (
        <>
          <StatRow>
            <Stat label="séances" value={String(w.sessions)} sub={delta(recap.deltaSessions, (v) => Format.number(v, 1))} />
            <Stat label="de pratique" value={Format.duration(w.minutes)} sub={delta(recap.deltaMinutes, (v) => Format.duration(v))} />
          </StatRow>
          <StatRow>
            <Stat label="jours actifs" value={String(w.activeDays)} />
            {w.distance ? <Stat label="parcourus" value={Format.distance(w.distance)} /> : <Stat label="min d’effort" value={String(w.effortMinutes)} />}
            <Stat label="XP" value={Format.number(w.xp)} tone="accent" />
          </StatRow>
          {recap.topSport ? (
            <T variant="small">
              Sport dominant : <T variant="small" tone="default">{recap.topSport.label}</T> ({Format.duration(recap.topSport.minutes)}, {recap.topSport.sessions} séance{recap.topSport.sessions > 1 ? "s" : ""}).
            </T>
          ) : null}
          {recap.bestOfRecentWeeks ? <T variant="small" tone="amber">Ta semaine la plus active depuis un mois.</T> : null}
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
          <T variant="caption" tone="faint">
            {recap.baseline.weeks ? `Comparé à la moyenne de tes ${recap.baseline.weeks} semaine${recap.baseline.weeks > 1 ? "s" : ""} précédente${recap.baseline.weeks > 1 ? "s" : ""}${recap.baseline.partial ? ", au même moment de la semaine" : ""}.` : "Les comparaisons apparaîtront avec plus d’historique."}
          </T>
        </>
      )}
    </Card>
  );
}

export function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const q = useLogs();
  const goals = useGoals();
  const prefs = usePrefs();
  const [view, setView] = useState<View_>("week");
  const [range, setRange] = useState<"12" | "26" | "52">("12");
  const { active } = q;
  const now = new Date();

  const current = useMemo(() => Progress.recap(active, { now, goals: goals.data ?? [], current: true }), [active, goals.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const last = useMemo(() => Progress.recap(active, { now, goals: goals.data ?? [] }), [active, goals.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const series = useMemo(() => Questions.weeklySeries(active, { weeks: Number(range) }), [active, range]);
  const month = useMemo(() => Training.summarize(active, 30), [active]);
  const dna = useMemo(() => Progress.dna(active), [active]);
  const mastery = useMemo(() => Progress.mastery(active), [active]);
  const cadence = useMemo(() => Progress.cadence(active, { target: prefs.weeklyGoalSessions, pauses: prefs.cadencePauses }), [active, prefs]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <Screen tab refreshing={q.isRefetching} onRefresh={() => { q.refetch(); goals.refetch(); }}>
        <T variant="h1">Progrès</T>
        <View style={styles.links}>
          {LINKS.map((l) => (
            <Tap key={l.route} onPress={() => navigation.navigate(l.route)} accessibilityLabel={l.label} style={styles.link}>
              <Icon name={l.icon} size={22} color={colors.cy} />
              <T variant="caption" tone="default" numberOfLines={1}>
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
        ) : !active.length ? (
          <EmptyState icon="chart" title="Tes statistiques commencent ici" text="Enregistre une séance : semaine, tendances, records et maîtrises se construisent avec ton journal." action="Enregistrer une séance" onAction={() => navigation.navigate("Tabs", { screen: "Record" })} />
        ) : view === "week" ? (
          <>
            <RecapCard recap={current} title="Cette semaine" />
            <RecapCard recap={last} title="Semaine dernière" />
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
            <Section title="Temps de pratique par semaine">
              <Card style={{ gap: space.s3 }}>
                <Segmented value={range} onChange={setRange} options={[{ value: "12", label: "12 sem." }, { value: "26", label: "6 mois" }, { value: "52", label: "1 an" }]} accessibilityLabel="Période" />
                <BarChart
                  data={series.map((w) => ({ label: new Date(`${w.start}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "numeric" }), detail: `Semaine du ${new Date(`${w.start}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`, value: w.minutes }))}
                  unit="min"
                  accessibilityLabel="Minutes de pratique par semaine"
                />
              </Card>
            </Section>
            <Section title="30 derniers jours">
              <Card style={{ gap: space.s3 }}>
                <StatRow>
                  <Stat label="séances" value={String(month.sessions)} />
                  <Stat label="de pratique" value={Format.duration(month.minutes)} />
                  {month.distance ? <Stat label="parcourus" value={Format.distance(month.distance)} /> : null}
                </StatRow>
                <BarChart
                  data={Training.chartBuckets(month.buckets, 30).map((b) => ({ label: String(new Date(`${b.date}T12:00:00`).getDate()), detail: new Date(`${b.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }), value: b.minutes }))}
                  height={120}
                  unit="min"
                  accessibilityLabel="Minutes de pratique par jour sur 30 jours"
                />
                {month.measured < month.sessions ? <T variant="caption" tone="faint">{month.sessions - month.measured} séance(s) sans durée renseignée ne comptent pas dans ce graphique.</T> : null}
              </Card>
            </Section>
            {dna.families.length ? (
              <Section title="Répartition par famille">
                <Card>
                  <ShareBar parts={dna.families.map((f) => ({ id: f.id, label: f.label, share: f.share, color: familyColors[f.id] ?? colors.tx3 }))} />
                </Card>
              </Section>
            ) : null}
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
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  links: { flexDirection: "row", gap: space.s2 },
  link: { flex: 1, alignItems: "center", gap: 6, paddingVertical: space.s3, borderRadius: 14, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, minHeight: 64 },
  lvl: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
