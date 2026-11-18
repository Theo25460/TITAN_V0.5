import { useNavigation } from "@react-navigation/native";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Reveal } from "../../components/Motion";
import { JourneyPreview } from "../../components/JourneyCard";
import { EventsTeaser } from "../community/EventsScreen";
import { periodBounds, retroMonth, retroYear } from "../../lib/retro";
import { DiscoveryBanner } from "../settings/SaveAccountScreen";
import { CadenceNotches } from "../../components/Cadence";
import { baselineLine, weeklyBaseline } from "../../lib/baseline";
import { HealthDetectCard } from "../../components/HealthDetectCard";
import { MemoryCard } from "../../components/MemoryCard";
import { MilestoneCard } from "../../components/MilestoneCard";
import { EnergyCheckIn, HabitStrip, SundayRitualCard } from "../../components/HabitCards";
import { CircleCard, FriendsFeedCard, IntentCard } from "../../components/CommunityCards";
import { CapsuleArrivedCard } from "../profile/CapsuleScreen";
import { lastSessionsToRepeat, RepeatLastCard } from "../../components/RepeatLastCard";
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
import { Codex, EffortRules, Format, Progress, Sports } from "../../core";
import { useAdventure, useGoals, useLogs, usePrefs, useProfile } from "../../data/hooks";
import { useDraftSport } from "../../data/drafts";
import { useQueue } from "../../data/queue";
import { worldImages } from "../../core/images";
import { useAfterPaint } from "../../lib/deferred";
import { useOnline } from "../../lib/network";
import { useSteps } from "../../data/steps";
import { dayOfYear, voiceLine } from "../../lib/voice";
import { navigateHref } from "../../navigation/href";
import { Program } from "../../core/program";
import { colors, space, spaces, TOUCH } from "../../theme/tokens";

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** A door to a place the tab bar does not reach: its name, one line on what is behind it right now, in the colour of that place. */
function Access({ icon, label, hint, onPress, testID, last }: { icon: IconName; label: string; hint: string; onPress: () => void; stacked?: boolean; testID?: string; last?: boolean }) {
  return (
    <Tap onPress={onPress} testID={testID} accessibilityLabel={label} accessibilityHint={hint} style={[styles.access, !last && styles.accessLine]}>
      <Icon name={icon} size={22} color={spaces.cercle.accent} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T variant="title">{label}</T>
        <T variant="caption" tone="muted" numberOfLines={2}>
          {hint}
        </T>
      </View>
      <Icon name="chevron" size={18} color={colors.tx3} />
    </Tap>
  );
}

/** QG: who I am (rank, level, XP), the one thing to do now, three stable accesses, then where I stand (the week and the chapter in
    progress) and what I did recently. Everything else is one tap further. */
export function HomeScreen() {
  const owner = useOwner();
  const [showDetails, setShowDetails] = useState(false);
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
  const insights = useAfterPaint(() => !showDetails ? [] : Progress.insights(ctx).filter((i) => i.id !== action.id).slice(0, 2), [ctx, action.id, showDetails]) ?? [];
  const cadence = useMemo(() => Progress.cadence(active, { target: prefs.weeklyGoalSessions, pauses: prefs.cadencePauses }), [active, prefs]);
  const week = useMemo(() => Progress.summarize(Progress.weekLogs(active, new Date())), [active]);
  // The week as a programme: one line per sport, one column per day, with the days of the usual week still to come.
  const grid = useMemo(() => Program.week(active, { maxRows: 4, plan: DAY_KEYS.map((k) => { const d = prefs.schedule?.[k]; return d?.sport && Sports.conf(d.sport) ? d.sport : null; }) }), [active, prefs.schedule]);
  const previousGrid = useMemo(() => Program.week(active, { maxRows: 4, start: new Date(Date.now() - 7 * 86_400_000) }), [active]);

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
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen tab padded={false} refreshing={logsQ.isRefetching} onRefresh={refresh}>
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
        <View style={styles.body}>
        {/* The one thing to do now: the only slab of colour on the page. */}
        <Reveal order={1}>
          <View style={[styles.slab, action.tone === "err" && styles.slabErr]}>
            {action.eyebrow || action.tone === "err" ? <T variant="eyebrow" color={action.tone === "err" ? colors.err : spaces.qg.ink} style={action.tone === "err" ? undefined : { opacity: 0.72 }}>{action.eyebrow ?? "Attention"}</T> : null}
            <T variant="h1" color={action.tone === "err" ? colors.tx : spaces.qg.ink}>{action.title}</T>
            <T color={action.tone === "err" ? colors.tx2 : spaces.qg.ink} style={action.tone === "err" ? undefined : { opacity: 0.84 }}>{action.text}</T>
            {/* The slab's title already says « Ta première séance »: its button keeps to one line on a narrow phone. */}
            <Button kind={action.tone === "err" ? "primary" : "ink"} icon="chevron" label={action.id === "first" ? "Enregistrer ma séance" : action.cta.label} onPress={() => navigateHref(navigation, action.cta.href)} testID="qg-hero-cta" style={{ marginTop: space.s2 }} />
          </View>
        </Reveal>
        {/* AUD-23/24: the tab bar already reaches Séance, Aventure and Progrès; the QG now surfaces what only it can — events and the circle. */}
        <DiscoveryBanner onPress={() => navigation.navigate("SaveAccount")} />
        {retroYear() && active.length ? (
          <Card tone="amber" onPress={() => navigation.navigate("Retro", { year: retroYear()! })} accessibilityLabel={`TITAN Rétro ${retroYear()} : ton année en images`} testID="qg-retro">
            <T variant="eyebrow" tone="amber">TITAN Rétro {retroYear()}</T>
            <T variant="bodyStrong">Ton année en images est prête : à partager en story.</T>
          </Card>
        ) : null}
        {!retroYear() && retroMonth() && active.length ? (
          <Card tone="accent" onPress={() => navigation.navigate("Retro", retroMonth()!)} accessibilityLabel={`TITAN Rétro de ${periodBounds(retroMonth()!).label}`} testID="qg-retro-month">
            <T variant="eyebrow" tone="accent">TITAN Rétro · {periodBounds(retroMonth()!).label}</T>
            <T variant="bodyStrong">Ton mois en images, comparé au précédent.</T>
          </Card>
        ) : null}
        {loading ? (
          <LoadingCards count={2} />
        ) : online && logsQ.error && !logsQ.data ? (
          <ErrorState error={logsQ.error} onRetry={() => logsQ.refetch()} />
        ) : (
          <>
            {/* Where I stand: the week as a programme (confirmed sessions only) and the chapter in progress. Always visible. */}
            <Reveal order={2}>
              <QgProgress
                cadence={cadence}
                sessions={week.sessions}
                weekXp={week.xp}
                weekMinutes={week.minutes}
                showWeek={active.length > 0}
                chapter={chapter}
                online={online}
                grid={grid}
                previous={previousGrid}
                onWeek={() => navigation.navigate("Tabs", { screen: "Progress" })}
                onChapter={() => (chapter && world ? navigation.navigate("World", { id: world.id }) : navigation.navigate("Tabs", { screen: "Adventure" }))}
              />
            </Reveal>
            {draft ? null : lastSessionsToRepeat(active, 1).map((log) => <RepeatLastCard key={log.id} log={log} compact />)}
          </>
        )}

        {/* The two places the tab bar does not reach. They stay reachable while the page loads. */}
        <View style={styles.doors}>
          <EventsTeaser onPress={() => navigation.navigate("Events")} />
          <Access icon="flag" label="Quêtes et événements" hint="Ce qui se joue cette semaine" onPress={() => navigation.navigate("Events")} testID="qg-events" />
          <Access last icon="group" label="Ma communauté" hint="Amis, défis, clubs" onPress={() => navigation.navigate("Community")} testID="qg-community" />
        </View>

        {loading || (online && logsQ.error && !logsQ.data) ? null : (
          <>
            <SinceCard key={String(visit.since)} logs={active} since={visit.since} onClose={visit.close} />
            <Tap accessibilityState={{ expanded: showDetails }} accessibilityLabel="Mon suivi personnel"
              onPress={() => setShowDetails((open) => !open)} testID="qg-details" style={styles.access}>
              <Icon name="journal" size={22} color={colors.cy} />
              <View style={{ flex: 1 }}>
                <T variant="title">Mon suivi personnel</T>
                <T variant="caption" tone="muted">Habitudes, dernières séances et repères</T>
              </View>
              <Icon name={showDetails ? "minus" : "plus"} size={22} color={colors.tx2} />
            </Tap>
            {showDetails ? <>
            <HealthDetectCard logs={active} />
            <CapsuleArrivedCard onPress={() => navigation.navigate("Capsules")} />
            <SundayRitualCard />
            <HabitStrip logs={active} cadence={cadence} favorite={prefs.favoriteSports.find((x) => Sports.conf(x)) ?? null} />
            <EnergyCheckIn />
            <IntentCard />
            <CircleCard />
            <FriendsFeedCard />
            <MilestoneCard logs={active} cadence={cadence} />
            <MemoryCard logs={active} />

            {/* AUD-24: the last eight weeks in notches. No streak to break: a held week is a fact, a calm week is not a fault. */}
            {active.length ? (
              <Section title="Mes 8 dernières semaines">
                <View style={{ gap: space.s2 }} testID="qg-cadence">
                  <CadenceNotches cadence={cadence} />
                  <T variant="caption" tone="muted">{cadence.held}/{cadence.window} semaines tenues · {cadence.lifetimeHeld} depuis tes débuts</T>
                  {(() => {
                    const b = weeklyBaseline(active);
                    return b ? <T variant="small" testID="qg-baseline">{baselineLine(b, Format.duration)}</T> : null;
                  })()}
                </View>
              </Section>
            ) : null}

            {active.length ? (
              <Section title="Dernières séances" action="Journal" onAction={() => navigation.navigate("Journal")}>
                <View>
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
                  <Card key={i.id} tone="plain" onPress={i.cta ? () => navigateHref(navigation, i.cta!.href) : undefined} accessibilityLabel={i.cta ? `${i.title}. ${i.cta.label}` : undefined} style={{ gap: 6 }} testID="qg-insight">
                    <View style={styles.row}>
                      <View style={{ flex: 1, gap: 4 }}>
                        <T variant="title">{i.title}</T>
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
            </> : null}
            <AdBanner placement="hq" />
          </>
        )}
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.s5, paddingTop: space.s4, gap: space.s5 },
  slab: { backgroundColor: spaces.qg.accent, borderRadius: 12, padding: space.s5, gap: space.s2 },
  slabErr: { backgroundColor: colors.bg2 },
  doors: { borderTopWidth: 2, borderTopColor: colors.tx },
  access: { flexDirection: "row", alignItems: "center", gap: space.s4, minHeight: TOUCH + space.s5, paddingVertical: space.s3 },
  accessLine: { borderBottomWidth: 1, borderBottomColor: colors.line },
  row: { flexDirection: "row", alignItems: "center", gap: space.s3 },
});
