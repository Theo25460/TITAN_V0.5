import { useNavigation } from "@react-navigation/native";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../../components/Avatar";
import { Brand } from "../../components/Brand";
import { Button } from "../../components/Button";
import { CadenceNotches } from "../../components/Cadence";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { ProgressBar } from "../../components/Progress";
import { Tap } from "../../components/Pressable";
import { Screen } from "../../components/Screen";
import { Section, Stat, StatRow } from "../../components/Section";
import { SessionRow } from "../../components/SessionRow";
import { ErrorState, LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { Codex, EffortRules, Format, Progress, Sports } from "../../core";
import { useAdventure, useGoals, useLogs, usePrefs, useProfile } from "../../data/hooks";
import { useQueue } from "../../data/queue";
import { navigateHref } from "../../navigation/href";
import { colors, radius, space } from "../../theme/tokens";

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** QG: what matters now — one dominant action, the week, the ascent, then context. Sport and RPG side by side. */
export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const profile = useProfile();
  const logsQ = useLogs();
  const goals = useGoals();
  const adventure = useAdventure();
  const prefs = usePrefs();
  const queue = useQueue();
  const { active } = logsQ;

  const planToday = useMemo(() => {
    const day = prefs.schedule?.[DAY_KEYS[(new Date().getDay() + 6) % 7]];
    return day?.sport && Sports.conf(day.sport) ? { sport: day.sport, minutes: day.minutes ?? null } : null;
  }, [prefs.schedule]);
  const ctx = useMemo(
    () => ({ logs: active, goals: goals.data ?? [], cadenceTarget: prefs.weeklyGoalSessions, pauses: prefs.cadencePauses, adventure: adventure.data ?? null, pending: queue.items, plan: planToday }),
    [active, goals.data, prefs, adventure.data, queue.items, planToday],
  );
  const action = useMemo(() => Progress.nextAction(ctx), [ctx]);
  const insights = useMemo(() => Progress.insights(ctx).filter((i) => i.id !== action.id).slice(0, 2), [ctx, action.id]);
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
  const loading = (logsQ.isLoading && !logsQ.data) || (profile.isLoading && !profile.data);

  const refresh = () => {
    logsQ.refetch();
    profile.refetch();
    adventure.refetch();
    goals.refetch();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <Screen tab refreshing={logsQ.isRefetching} onRefresh={refresh}>
        <View style={styles.top}>
          <Brand size={30} />
          <Tap onPress={() => navigation.navigate("Tabs", { screen: "Profile" })} accessibilityLabel={`Profil de ${name}, niveau ${level}`} style={styles.me}>
            <T variant="caption" tone="muted">
              Niv. {level}
            </T>
            <Avatar id={snap?.avatar} frame={String((profile.data?.appearance as Record<string, unknown> | undefined)?.frame ?? "")} size={34} />
          </Tap>
        </View>
        <T variant="h1">
          {hello}, {name}
        </T>

        {queue.items.length ? (
          <Card onPress={() => navigation.navigate("Pending")} tone="flat" accessibilityLabel="Voir les séances en attente d’envoi">
            <View style={styles.row}>
              <Icon name={queue.items.some((i) => i.status === "error") ? "alert" : "offline"} color={queue.items.some((i) => i.status === "error") ? colors.err : colors.warn} />
              <T variant="small" tone="default" style={{ flex: 1 }}>
                {queue.items.length} séance{queue.items.length > 1 ? "s" : ""} {queue.sending ? "en cours d’envoi" : "en attente d’envoi"}
                {queue.items.some((i) => i.status === "error") ? " · une correction est nécessaire" : ""}
              </T>
              <Icon name="chevron" size={18} color={colors.tx4} />
            </View>
          </Card>
        ) : null}

        {loading ? (
          <LoadingCards count={2} />
        ) : logsQ.error && !logsQ.data ? (
          <ErrorState error={logsQ.error} onRetry={() => logsQ.refetch()} />
        ) : (
          <>
            <Card tone={action.tone === "am" ? "amber" : "accent"} style={{ gap: space.s3 }}>
              <T variant="eyebrow" tone={action.tone === "am" ? "amber" : "accent"}>
                {action.tone === "am" ? "Moment remarquable" : action.tone === "err" ? "Attention" : action.tone === "ok" ? "Aujourd’hui" : "À faire maintenant"}
              </T>
              <T variant="h2">{action.title}</T>
              <T tone="muted">{action.text}</T>
              {action.why ? (
                <T variant="caption" tone="faint">
                  Pourquoi : {action.why}
                </T>
              ) : null}
              {action.cta ? <Button label={action.cta.label} onPress={() => navigateHref(navigation, action.cta!.href)} testID="qg-hero-cta" /> : null}
            </Card>

            <Section title="Ma semaine" action="Ajuster" onAction={() => navigation.navigate("Plan")}>
              <Card style={{ gap: space.s4 }}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <T variant="numLarge">
                      {cadence.currentDays}
                      <T variant="h3" tone="faint">
                        /{cadence.target}
                      </T>
                    </T>
                    <T variant="small">jours actifs cette semaine</T>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <T variant="num" tone="accent">
                      {cadence.held}/{cadence.window}
                    </T>
                    <T variant="caption" tone="faint">
                      semaines tenues
                    </T>
                  </View>
                </View>
                <CadenceNotches cadence={cadence} />
                <T variant="caption" tone="muted">
                  {cadence.remaining === 0 ? "Semaine tenue. Le repos fait aussi partie de la progression." : cadence.reachable ? `Encore ${cadence.remaining} jour${cadence.remaining > 1 ? "s" : ""} actif${cadence.remaining > 1 ? "s" : ""} pour tenir la semaine (${cadence.daysLeftInWeek} jour${cadence.daysLeftInWeek > 1 ? "s" : ""} restant${cadence.daysLeftInWeek > 1 ? "s" : ""}).` : "Pas de série à casser : une semaine calme ne t’enlève rien."}
                </T>
              </Card>
              <StatRow>
                <Stat label="séances" value={String(week.sessions)} />
                <Stat label="de pratique" value={Format.duration(week.minutes)} />
                <Stat label="XP cette semaine" value={Format.number(week.xp)} tone="accent" />
              </StatRow>
            </Section>

            <Section title="Mon ascension" action="Aventure" onAction={() => navigation.navigate("Tabs", { screen: "Adventure" })}>
              <Card style={{ gap: space.s3 }}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <T variant="h3">
                      Niveau {level} · {rank.name}
                    </T>
                    <T variant="caption" tone="faint">
                      {nextRank ? `${nextRank.name} au niveau ${nextRank.level}` : "Rang maximal atteint"}
                    </T>
                  </View>
                  <T variant="caption" tone="muted">
                    {Format.number(xp)} / {Format.number(need)} XP
                  </T>
                </View>
                <ProgressBar value={xp / Math.max(1, need)} accessibilityLabel="Progression vers le niveau suivant" />
                {world && cp ? (
                  <Tap onPress={() => navigation.navigate("World", { id: world.id })} accessibilityLabel={`${world.name}, chapitre ${campaign!.chapter}`} style={styles.campaign}>
                    <View style={[styles.worldDot, { backgroundColor: world.color }]} />
                    <View style={{ flex: 1 }}>
                      <T variant="bodyStrong" numberOfLines={1}>
                        {world.name} · chapitre {Math.min(9, campaign!.chapter)}
                      </T>
                      <T variant="caption" tone={cp.ready ? "accent" : "faint"}>
                        {cp.status === "complete" ? "Monde terminé" : cp.ready ? "Chapitre prêt à être validé" : cp.objectives.map((o) => `${Math.round(o.value)}/${o.target} ${o.label}`).join(" · ")}
                      </T>
                    </View>
                    <Icon name="chevron" size={18} color={colors.tx4} />
                  </Tap>
                ) : (
                  <Button label="Commencer une aventure" kind="secondary" icon="compass" onPress={() => navigation.navigate("Tabs", { screen: "Adventure" })} />
                )}
              </Card>
            </Section>

            {insights.length ? (
              <Section title="Repères">
                {insights.map((i) => (
                  <Card key={i.id} tone="flat" style={{ gap: 6 }}>
                    <T variant="bodyStrong">{i.title}</T>
                    <T variant="small">{i.text}</T>
                    {i.why ? (
                      <T variant="caption" tone="faint">
                        {i.why}
                      </T>
                    ) : null}
                    {i.cta ? <Button small kind="ghost" label={i.cta.label} onPress={() => navigateHref(navigation, i.cta!.href)} style={{ alignSelf: "flex-start" }} /> : null}
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
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  me: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingLeft: 10, borderRadius: radius.pill },
  row: { flexDirection: "row", alignItems: "center", gap: space.s3 },
  campaign: { flexDirection: "row", alignItems: "center", gap: space.s3, padding: space.s3, borderRadius: 12, backgroundColor: colors.bg1 },
  worldDot: { width: 12, height: 12, borderRadius: 6 },
});
