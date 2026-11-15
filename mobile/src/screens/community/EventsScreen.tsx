/* AUD-23: « Quêtes et événements » on Android — the weekly and monthly quests (claim a keepsake), the common quest of the week,
   the season and the world goal (join on purpose). Every rule stays on the server: this screen reads, explains and asks. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ProgressBar } from "../../components/Progress";
import { Screen } from "../../components/Screen";
import { EmptyState, ErrorState, LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Format, PeriodicQuests, Sports, type QuestView } from "../../core";
import * as api from "../../data/api";
import { useOwner } from "../../data/auth";
import { errorMessage } from "../../lib/errors";
import { useOnline } from "../../lib/network";
import { colors, space } from "../../theme/tokens";

export const eventsKey = (owner: string) => ["events", owner] as const;

const shortDate = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

export function useEvents() {
  const owner = useOwner();
  return useQuery({ queryKey: eventsKey(owner), queryFn: () => api.fetchEvents(owner), staleTime: 60_000 });
}

/** Questions answered by the screen, in order: what can I claim now, what can I join, how far are we together. */
export function EventsScreen() {
  const owner = useOwner();
  const q = useEvents();
  const qc = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const act = useMutation({
    mutationFn: async ({ fn }: { fn: () => Promise<unknown>; ok: string }) => {
      if (!online) throw new Error("Connexion requise pour participer.");
      return fn();
    },
    onSuccess: (_r, v) => {
      toast({ kind: "ok", title: v.ok });
      qc.invalidateQueries({ queryKey: eventsKey(owner) });
    },
    onError: (e) => toast({ kind: "err", title: "Action impossible", message: errorMessage(e) }),
  });

  if (q.isLoading && !q.data) return <Screen><LoadingCards /></Screen>;
  if (!q.data) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const { quests, common, season, goal, cadence } = q.data;
  const heldWeeks = cadence ? [cadence.current, cadence.previous].filter((w) => w.held && !w.claimed) : [];
  const label = (s: string) => Sports.label(s);
  const views = [quests?.week, quests?.month].map((x) => PeriodicQuests.describe(x, { sportLabel: label })).filter((x): x is QuestView => !!x);
  const busy = act.isPending;
  const nothing = !views.length && !common && !season?.current && !goal && !heldWeeks.length;

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <T tone="muted">Tout est facultatif : tes séances comptent d’elles-mêmes, en minutes d’effort, 90 au plus par jour. Le repos ne coûte rien.</T>
      {nothing ? <EmptyState icon="flag" title="Rien de prévu pour le moment" text="De nouvelles quêtes arrivent chaque semaine. Tes séances restent comptées dans ta progression." /> : null}

      {heldWeeks.map((w) => (
        <Card key={w.week} tone="amber" style={{ gap: space.s2 }} testID={`held-${w.week}`}>
          <T variant="eyebrow" tone="amber">{w.week === cadence!.current.week ? "Semaine tenue" : "Semaine dernière tenue"}</T>
          <T variant="h3">{w.days}/{w.target} jours actifs : bravo !</T>
          <T variant="small">Ta régularité vaut {w.reward} crédits, à dépenser en apparence à l’Atelier.</T>
          <Button label={`Récupérer +${w.reward} crédits`} loading={busy} onPress={() => act.mutate({ fn: () => api.cadenceClaim(owner, w.week), ok: `+${w.reward} crédits` })} testID={`claim-held-${w.week}`} />
        </Card>
      ))}
      {views.map((v) => (
        <Card key={v.scope} tone={v.state === "ready" ? "accent" : undefined} style={{ gap: space.s2 }} testID={`quest-${v.scope}`}>
          <T variant="eyebrow" tone="accent">{v.scopeLabel}</T>
          <T variant="h3">{v.title}</T>
          <T variant="small">{v.text}</T>
          {v.focus.length ? <T variant="caption" tone="faint">Tes sports : {v.focus.join(", ")}</T> : null}
          <ProgressBar value={v.target ? v.value / v.target : 0} accessibilityLabel={v.scopeLabel} />
          <T variant="caption" tone="muted">{Format.number(v.value)} / {Format.number(v.target)} {v.target > 1 ? v.unit[1] : v.unit[0]}</T>
          {v.state === "ready" ? (
            <Button label="Récupérer mon souvenir" loading={busy} onPress={() => act.mutate({ fn: () => api.questClaim(owner, v.scope), ok: "Souvenir ajouté à ta collection" })} testID={`claim-${v.scope}`} />
          ) : v.state === "claimed" ? (
            <T variant="caption" tone="accent">Souvenir récupéré. Bravo !</T>
          ) : null}
        </Card>
      ))}
      {quests ? <T variant="caption" tone="faint">Souvenirs de quêtes : {quests.souvenirs.weeks} semaine{quests.souvenirs.weeks > 1 ? "s" : ""}, {quests.souvenirs.months} mois.</T> : null}

      {common ? (
        <Card style={{ gap: space.s2 }} testID="common-quest">
          <T variant="eyebrow" tone="amber">Quête commune · jusqu’au {shortDate(common.endsAt)}</T>
          <T variant="h3">{common.title}</T>
          {common.detail ? <T variant="small">{common.detail}</T> : null}
          <ProgressBar value={common.minutes / Math.max(1, common.target)} color={colors.am} accessibilityLabel="Quête commune" />
          <T variant="caption" tone="muted">{Format.number(common.minutes)} / {Format.number(common.target)} min · {common.members} participant{common.members > 1 ? "s" : ""}{common.joined ? ` · ta part : ${Format.number(common.mine)} min` : ""}</T>
          {common.state === "done" ? <T variant="caption" tone="amber">Objectif atteint ensemble !</T> : null}
          {common.state !== "closed" ? (
            <Button small kind={common.joined ? "ghost" : "secondary"} label={common.joined ? "Quitter la quête" : "Rejoindre la quête"} loading={busy} onPress={() => act.mutate({ fn: () => api.commonQuestJoin(owner, common.id, !common.joined), ok: common.joined ? "Tu as quitté la quête" : "Quête rejointe : tes prochaines séances comptent" })} testID="join-common" />
          ) : null}
        </Card>
      ) : null}

      {season?.current ? (
        <Card style={{ gap: space.s2 }} testID="season">
          <T variant="eyebrow" tone="accent">Saison · {shortDate(season.current.startsOn)} → {shortDate(season.current.endsOn)}</T>
          <T variant="h3">{season.current.name}</T>
          {season.current.rules ? <T variant="small">{season.current.rules}</T> : null}
          <T variant="caption" tone="muted">
            {season.current.participants} participant{season.current.participants > 1 ? "s" : ""}
            {season.current.joined ? ` · toi : ${Format.number(season.current.myMinutes)} min, ${season.current.myDays} jour${season.current.myDays > 1 ? "s" : ""} actif${season.current.myDays > 1 ? "s" : ""}` : ""}
          </T>
          <Button small kind={season.current.joined ? "ghost" : "secondary"} label={season.current.joined ? "Quitter la saison" : "Participer à la saison"} loading={busy} onPress={() => act.mutate({ fn: () => api.seasonJoin(owner, season.current!.id, !season.current!.joined), ok: season.current!.joined ? "Tu as quitté la saison" : "Saison rejointe" })} testID="join-season" />
        </Card>
      ) : null}

      {goal ? (
        <Card style={{ gap: space.s2 }} testID="world-goal">
          <T variant="eyebrow" tone="accent">Objectif mondial · jusqu’au {shortDate(goal.endsOn)}</T>
          <T variant="h3">{goal.title}</T>
          {goal.detail ? <T variant="small">{goal.detail}</T> : null}
          <View style={{ gap: 6 }}>
            {goal.levels.map((lvl, i) => (
              <View key={lvl} style={{ gap: 2 }}>
                <T variant="caption" tone={goal.minutes >= lvl ? "accent" : "muted"}>Palier {i + 1} · {Format.number(lvl)} min{goal.minutes >= lvl ? " · atteint" : ""}</T>
                <ProgressBar value={goal.minutes / lvl} height={5} accessibilityLabel={`Palier ${i + 1}`} />
              </View>
            ))}
          </View>
          <T variant="caption" tone="muted">{Format.number(goal.minutes)} min ensemble · {goal.members} participant{goal.members > 1 ? "s" : ""}{goal.joined ? ` · ta part : ${Format.number(goal.mine)} min` : ""}</T>
          {goal.state !== "closed" ? (
            <Button small kind={goal.joined ? "ghost" : "secondary"} label={goal.joined ? "Ne plus participer" : "Participer"} loading={busy} onPress={() => act.mutate({ fn: () => api.worldGoalJoin(owner, goal.id, !goal.joined), ok: goal.joined ? "Participation retirée" : "Tu participes à l’objectif mondial" })} testID="join-goal" />
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}

/** Compact entry for the QG and Community: the one thing worth knowing about events right now. */
export function EventsTeaser({ onPress }: { onPress: () => void }) {
  const q = useEvents();
  const d = q.data;
  if (!d) return null;
  const views = [d.quests?.week, d.quests?.month].map((x) => PeriodicQuests.describe(x)).filter((x): x is QuestView => !!x);
  const ready = views.find((v) => v.state === "ready");
  const held = d.cadence ? [d.cadence.current, d.cadence.previous].find((w) => w.held && !w.claimed) : undefined;
  const open = views.find((v) => v.state === "open");
  const line = held
    ? `Semaine tenue : récupère +${held.reward} crédits`
    : ready
    ? `${ready.scopeLabel} accomplie : récupère ton souvenir`
    : open
      ? `${open.title} · ${Format.number(open.value)}/${Format.number(open.target)}`
      : d.common && !d.common.joined && d.common.state === "open"
        ? `Quête commune : ${d.common.title}`
        : d.season?.current && !d.season.current.joined
          ? `Nouvelle saison : ${d.season.current.name}`
          : null;
  if (!line) return null;
  return (
    <Card onPress={onPress} tone={held ? "amber" : ready ? "accent" : undefined} accessibilityLabel={`Quêtes et événements. ${line}`} testID="events-teaser">
      <T variant="eyebrow" tone="accent">Quêtes et événements</T>
      <T variant="bodyStrong">{line}</T>
    </Card>
  );
}
