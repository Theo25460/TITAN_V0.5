import { useNavigation } from "@react-navigation/native";
import { useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Reveal } from "../../components/Motion";
import { JourneyPreview } from "../../components/JourneyCard";
import { useOwner } from "../../data/auth";
import { QgBanner } from "../../components/QgBanner";
import { SinceCard, useLastVisit } from "../../components/SinceCard";
import { TodayStrip } from "../../components/TodayStrip";
import { TourCard } from "../../components/TourCard";
import { AdBanner } from "../../components/AdBanner";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Ring } from "../../components/Progress";
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
import { avatarImages, worldImages } from "../../core/images";
import { useAfterPaint } from "../../lib/deferred";
import { useOnline } from "../../lib/network";
import { useSteps } from "../../data/steps";
import { dayOfYear, voiceLine } from "../../lib/voice";
import { navigateHref } from "../../navigation/href";
import { colors, space } from "../../theme/tokens";

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** QG: what matters now — one dominant action, the week, the ascent, then context. Sport and RPG side by side. */
export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const owner = useOwner();
  const [showAscension, setShowAscension] = useState(false);
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
  const nextRank = EffortRules.nextRank(level);
  const campaign = snap?.campaigns.find((c) => c.id === snap.selected_world && c.chapter > 0) ?? snap?.campaigns.find((c) => c.chapter > 0 && c.chapter < 10);
  const world = campaign ? Codex.worlds.find((w) => w.id === campaign.id) : null;
  const cp = campaign ? Progress.campaignProgress(campaign) : null;
  const name = profile.data?.username || "Athlète";
  const hour = new Date().getHours();
  const hello = hour < 5 ? "Bonne nuit" : hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
  const todayKey = new Date().toDateString();
  const sessionsToday = active.filter((l) => new Date(l.date).toDateString() === todayKey).length;
  const daysAway = visit.since ? Math.floor((Date.now() - visit.since) / 86_400_000) : null;
  const voice = ctx.historyAvailable
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
          avatar={snap?.avatar}
          frame={String((profile.data?.appearance as Record<string, unknown> | undefined)?.frame ?? "")}
          image={world ? worldImages[world.image] : null}
          accent={world?.color}
          worldName={world?.name}
          chapterText={world ? `Chapitre ${Math.min(9, campaign!.chapter)} · ${cp?.ready && online ? "balise prête à valider" : world.chapters[Math.min(9, campaign!.chapter) - 1]?.name ?? "chemin en cours"}` : undefined}
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
        <View style={styles.destinations}>
          <Button small kind="ghost" label="Sport" onPress={() => navigation.navigate("Tabs", { screen: "Record" })} />
          <Button small kind="ghost" label="Aventure" onPress={() => navigation.navigate("Tabs", { screen: "Adventure" })} />
          <Button small kind="ghost" label="Progrès" onPress={() => navigation.navigate("Tabs", { screen: "Progress" })} />
        </View>
        {loading ? (
          <LoadingCards count={2} />
        ) : online && logsQ.error && !logsQ.data ? (
          <ErrorState error={logsQ.error} onRetry={() => logsQ.refetch()} />
        ) : (
          <>
            <SinceCard key={String(visit.since)} logs={active} since={visit.since} onClose={visit.close} />

            {/* Secondary information loads asynchronously; keep it below the main action so the QG never jumps above the priority. */}
            <Reveal order={3}>
              <TodayStrip steps={steps} cadence={cadence} sessions={week.sessions} showWeek={active.length > 0} />
            </Reveal>

            <JourneyPreview owner={owner} />
            <Button label="Mes repères d’ascension" kind="ghost" onPress={() => setShowAscension(v => !v)} />
            {showAscension ? <Section title="Mon ascension" action="Aventure" onAction={() => navigation.navigate("Tabs", { screen: "Adventure" })}>
              <Card style={{ gap: space.s4 }}>
                <View style={styles.row}>
                  <Ring value={xp / Math.max(1, need)} size={76} stroke={5}>
                    <Image source={avatarImages[snap?.avatar ?? "scout"] ?? avatarImages.scout} style={styles.portrait} accessibilityIgnoresInvertColors />
                  </Ring>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T variant="h3">
                      Niveau {level} · {rank.name}
                    </T>
                    <T variant="caption" tone="muted">
                      {Format.number(xp)} / {Format.number(need)} XP · encore {Format.number(Math.max(0, need - xp))}
                    </T>
                    <T variant="caption" tone="faint">
                      {nextRank ? `${nextRank.name} au niveau ${nextRank.level}` : "Rang maximal atteint"}
                    </T>
                  </View>
                </View>
                {world && cp ? (
                  <Tap onPress={() => navigation.navigate("World", { id: world.id })} accessibilityLabel={`${world.name}, chapitre ${campaign!.chapter}`} style={styles.campaign}>
                    <Image source={worldImages[world.image]} style={styles.worldThumb} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <T variant="caption" color={world.color} numberOfLines={1}>
                        {world.name} · chapitre {Math.min(9, campaign!.chapter)}
                      </T>
                      <T variant="bodyStrong" numberOfLines={1}>
                        {world.chapters[Math.min(9, campaign!.chapter) - 1]?.name}
                      </T>
                      <T variant="caption" tone={cp.ready && online ? "accent" : "faint"} numberOfLines={1}>
                        {cp.status === "complete" ? "Monde terminé" : cp.ready ? online ? "Chapitre prêt à être validé" : "Connexion nécessaire pour valider" : cp.objectives.map((o) => `${Math.round(o.value)}/${o.target} ${o.label}`).join(" · ")}
                      </T>
                    </View>
                    <Icon name="chevron" size={18} color={colors.tx4} />
                  </Tap>
                ) : (
                  <Button label="Commencer une aventure" kind="secondary" icon="compass" onPress={() => navigation.navigate("Tabs", { screen: "Adventure" })} />
                )}
              </Card>
            </Section> : null}

            {/* The visit is an invitation, never the first thing on the QG: it comes after the player's own numbers and ascension. */}
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

            {active.length ? (
              <Section title="Dernières séances" action="Journal" onAction={() => navigation.navigate("Journal")}>
                <View style={{ gap: space.s2 }}>
                  {active.slice(0, 3).map((l) => (
                    <SessionRow key={l.id} log={l} onPress={() => navigation.navigate("SessionDetail", { id: l.id })} />
                  ))}
                </View>
              </Section>
            ) : null}
            <AdBanner placement="hq" />
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  destinations: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  row: { flexDirection: "row", alignItems: "center", gap: space.s3 },
  campaign: { flexDirection: "row", alignItems: "center", gap: space.s3, padding: space.s2, paddingRight: space.s3, borderRadius: 14, backgroundColor: colors.bg1, borderWidth: 1, borderColor: colors.line },
  worldThumb: { width: 56, height: 56, borderRadius: 10 },
  portrait: { width: 62, height: 62, borderRadius: 31 },
});
