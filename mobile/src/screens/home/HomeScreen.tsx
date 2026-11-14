import { useNavigation } from "@react-navigation/native";
import { useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Reveal } from "../../components/Motion";
import { JourneyPreview } from "../../components/JourneyCard";
import { useOwner } from "../../data/auth";
import { QgBanner } from "../../components/QgBanner";
import { QgProgress, type QgChapter } from "../../components/QgProgress";
import { SinceCard, useLastVisit } from "../../components/SinceCard";
import { TodayStrip } from "../../components/TodayStrip";
import { TourCard } from "../../components/TourCard";
import { AdBanner } from "../../components/AdBanner";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon, type IconName } from "../../components/Icon";
import { Tap } from "../../components/Pressable";
import { Screen } from "../../components/Screen";
import { Section } from "../../components/Section";
import { SessionRow } from "../../components/SessionRow";
import { ErrorState, LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { Codex, EffortRules, Progress, Sports } from "../../core";
import { useAdventure, useGoals, useLogs, usePrefs, useProfile } from "../../data/hooks";
import { useDraftSport } from "../../data/drafts";
import { useQueue } from "../../data/queue";
import { worldImages } from "../../core/images";
import { useAfterPaint } from "../../lib/deferred";
import { useOnline } from "../../lib/network";
import { useSteps } from "../../data/steps";
import { dayOfYear, voiceLine } from "../../lib/voice";
import { navigateHref } from "../../navigation/href";
import { colors, radius, space, TOUCH } from "../../theme/tokens";

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** One of the three stable accesses under the main action: a name, and one line that says what is behind it right now. */
function Access({ icon, label, hint, onPress, stacked }: { icon: IconName; label: string; hint: string; onPress: () => void; stacked: boolean }) {
  return (
    <Tap onPress={onPress} accessibilityLabel={label} accessibilityHint={hint} style={[styles.access, stacked && styles.accessStacked]}>
      <Icon name={icon} size={20} color={colors.cy} />
      <View style={stacked ? { flex: 1, minWidth: 0 } : { alignSelf: "stretch" }}>
        <T variant="bodyStrong">{label}</T>
        <T variant="caption" tone="muted" numberOfLines={stacked ? 2 : 3}>
          {hint}
        </T>
      </View>
    </Tap>
  );
}

/** QG: who I am (rank, level, XP), the one thing to do now, three stable accesses, then where I stand (the week and the chapter in
    progress) and what I did recently. Everything else is one tap further. */
export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const owner = useOwner();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  const navigation = useNavigation();
  const profile = useProfile();
  const logsQ = useLogs();
  const goals = useGoals();
  const adventure = useAdventure();
  const prefs = usePrefs();
  const queue = useQueue();
  const draft = useDraftSport();
  const online = useOnline();
  const visit = useLastVisit();
  const steps = useSteps();
  const { active } = logsQ;

  const planToday = useMemo(() => {
    const day = prefs.schedule?.[DAY_KEYS[(new Date().getDay() + 6) % 7]];
    return day?.sport && Sports.conf(day.sport) ? { sport: day.sport, minutes: day.minutes ?? null } : null;
  }, [prefs.schedule]);
  const ctx = useMemo(
    () => ({
      logs: active, goals: goals.data ?? [], cadenceTarget: prefs.weeklyGoalSessions, pauses: prefs.cadencePauses,
      adventure: online ? adventure.data ?? null : null, pending: queue.owner === owner ? queue.items : [], plan: planToday,
      draftSport: draft?.sport && Sports.conf(draft.sport) ? draft.sport : undefined, online, historyAvailable: logsQ.data !== undefined,
    }),
    [active, goals.data, prefs, adventure.data, queue.owner, queue.items, owner, planToday, draft?.sport, online, logsQ.data],
  );
  const action = useMemo(() => Progress.nextAction(ctx), [ctx]);
  // The secondary markers sit below the fold and cost as much as the main action (nextAction calls insights itself):
  // they are computed once the first frame is on screen.
  const insights = useAfterPaint(() => Progress.insights(ctx).filter((i) => i.id !== action.id).slice(0, 2), [ctx, action.id]) ?? [];
  const cadence = useMemo(() => Progress.cadence(active, { target: prefs.weeklyGoalSessions, pauses: prefs.cadencePauses }), [active, prefs]);
  const week = useMemo(() => Progress.summarize(Progress.weekLogs(active, new Date())), [active]);

  const snap = adventure.data;
  const level = snap?.level ?? profile.data?.level ?? 1;
  const xp = snap?.xp ?? profile.data?.xp ?? 0;
  const need = snap?.next_level_xp ?? EffortRules.levelRequirement(level);
  const rank = EffortRules.rank(level);
  const campaign = snap?.campaigns.find((c) => c.id === snap.selected_world && c.chapter > 0) ?? snap?.campaigns.find((c) => c.chapter > 0 && c.chapter < 10);
  const world = campaign ? Codex.worlds.find((w) => w.id === campaign.id) : null;
  const cp = campaign ? Progress.campaignProgress(campaign) : null;
  const name = profile.data?.username || "Athlète";
  const hour = new Date().getHours();
  const hello = hour < 5 ? "Bonne nuit" : hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
  const todayKey = new Date().toDateString();
  const sessionsToday = active.filter((l) => new Date(l.date).toDateString() === todayKey).length;
  const daysAway = visit.since ? Math.floor((Date.now() - visit.since) / 86_400_000) : null;
  const newcomer = ctx.historyAvailable && active.length === 0;
  const chapterNumber = campaign ? Math.min(9, campaign.chapter) : 0;
  const chapter: QgChapter | null = world && campaign && cp
    ? {
        worldName: world.name, color: world.color, image: worldImages[world.image], chapter: chapterNumber, chapterName: world.chapters[chapterNumber - 1]?.name,
        status: cp.status === "complete" ? "complete" : cp.ready ? "ready" : "active",
        objectives: cp.objectives.map((o) => `${Math.round(o.value)}/${o.target} ${o.label}`).join(" · "),
      }
    : null;
  // A newcomer reads what TITAN is before anything else; the narrative voice starts with the first session.
  const voice = newcomer
    ? "TITAN enregistre tes séances de sport et les transforme en progression : niveau, records et aventure."
    : ctx.historyAvailable
    ? voiceLine({ hour, dayOfYear: dayOfYear(new Date()), sessions: active.length, sessionsToday, weekDays: cadence.currentDays, weekTarget: cadence.currentPaused ? 0 : cadence.target, chapterReady: online && !!cp?.ready, worldName: world?.name ?? null, stepsRatio: null, daysAway })
    : "Tu peux saisir une séance sur ce téléphone.";
  const loading = (logsQ.isLoading && !logsQ.data) || (profile.isLoading && !profile.data);

  const refresh = () => {
    logsQ.refetch();
    profile.refetch();
    adventure.refetch();
    goals.refetch();
    // The usual gesture also reads Santé Connect again (when it is connected): no "Synchroniser" button to hunt for. TITAN's own counter is live already.
    if (steps.connected) steps.refresh(false).catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <Screen tab refreshing={logsQ.isRefetching} onRefresh={refresh}>
        <QgBanner
          greeting={`${hello}, ${name}`}
          line={voice}
          level={snap || profile.data ? level : undefined}
          rankName={rank.name}
          xp={snap || profile.data ? xp : undefined}
          need={need}
          avatar={snap?.avatar}
          frame={String((profile.data?.appearance as Record<string, unknown> | undefined)?.frame ?? "")}
          image={world ? worldImages[world.image] : null}
          accent={world?.color}
          onProfile={() => navigation.navigate("Tabs", { screen: "Profile" })}
        />

        <Reveal order={1}>
          <Card tone="accent" style={{ gap: space.s3 }}>
            <T variant="eyebrow" tone={action.tone === "err" ? "err" : "accent"}>
              {action.eyebrow ?? (action.tone === "err" ? "Attention" : "À faire maintenant")}
            </T>
            <T variant="h2">{action.title}</T>
            <T tone="muted">{action.text}</T>
            <Button label={action.cta.label} onPress={() => navigateHref(navigation, action.cta.href)} testID="qg-hero-cta" />
          </Card>
        </Reveal>
        <View style={[styles.destinations, stacked && { flexDirection: "column" }]}>
          <Access stacked={stacked} icon="plus" label="Sport" hint="Enregistrer une séance" onPress={() => navigation.navigate("Tabs", { screen: "Record" })} />
          <Access stacked={stacked} icon="compass" label="Aventure" hint={chapter ? `Chapitre ${chapter.chapter}/9` : "Les quatre mondes"} onPress={() => navigation.navigate("Tabs", { screen: "Adventure" })} />
          <Access stacked={stacked} icon="chart" label="Progrès" hint="Semaine, records, journal" onPress={() => navigation.navigate("Tabs", { screen: "Progress" })} />
        </View>
        {loading ? (
          <LoadingCards count={2} />
        ) : online && logsQ.error && !logsQ.data ? (
          <ErrorState error={logsQ.error} onRetry={() => logsQ.refetch()} />
        ) : (
          <>
            <SinceCard key={String(visit.since)} logs={active} since={visit.since} onClose={visit.close} />

            {/* Where I stand: the week (confirmed XP only) and the chapter in progress. Always visible, never behind a toggle. */}
            <Reveal order={3}>
              <QgProgress
                cadence={cadence}
                sessions={week.sessions}
                weekXp={week.xp}
                showWeek={active.length > 0}
                chapter={chapter}
                online={online}
                onWeek={() => navigation.navigate("Tabs", { screen: "Progress" })}
                onChapter={() => (chapter && world ? navigation.navigate("World", { id: world.id }) : navigation.navigate("Tabs", { screen: "Adventure" }))}
              />
            </Reveal>

            {active.length ? (
              <Section title="Dernières séances" action="Journal" onAction={() => navigation.navigate("Journal")}>
                <View style={{ gap: space.s2 }}>
                  {active.slice(0, 3).map((l) => (
                    <SessionRow key={l.id} log={l} onPress={() => navigation.navigate("SessionDetail", { id: l.id })} />
                  ))}
                </View>
              </Section>
            ) : null}

            {/* The visit is an invitation, never the first thing on the QG: it comes after the player's own progression and sessions. */}
            <TourCard />

            {insights.length ? (
              <Section title="Repère">
                {insights.slice(0, 1).map((i) => (
                  <Card key={i.id} tone="flat" onPress={i.cta ? () => navigateHref(navigation, i.cta!.href) : undefined} accessibilityLabel={i.cta ? `${i.title}. ${i.cta.label}` : undefined} style={{ gap: 6 }} testID="qg-insight">
                    <View style={styles.row}>
                      <View style={{ flex: 1, gap: 4 }}>
                        <T variant="bodyStrong">{i.title}</T>
                        <T variant="small" numberOfLines={3}>
                          {i.text}
                        </T>
                      </View>
                      {i.cta ? <Icon name="chevron" size={18} color={colors.tx3} /> : null}
                    </View>
                  </Card>
                ))}
              </Section>
            ) : null}

            {/* Steps are optional and never a reward: they come last, as one line until there is a number to show. */}
            <TodayStrip steps={steps} />
            {steps.hasAny ? <JourneyPreview owner={owner} /> : null}
            <AdBanner placement="hq" />
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  destinations: { flexDirection: "row", gap: space.s2 },
  access: { flex: 1, minWidth: 0, minHeight: TOUCH + space.s4, gap: space.s1, padding: space.s3, borderRadius: radius.r2, backgroundColor: colors.bg1, borderWidth: 1, borderColor: colors.line },
  accessStacked: { flex: 0, flexDirection: "row", alignItems: "center", gap: space.s3 },
  row: { flexDirection: "row", alignItems: "center", gap: space.s3 },
});
