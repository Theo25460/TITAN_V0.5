/* Lot 8 « communauté » on the QG — the circle is visible where the day starts:
   C1 « Ton cercle » (requests, encouragements received, challenges in progress), C8 the guild's week and its shared celebration,
   C10 the duo pact, C2 friends' moments with one-tap encouragement, C5 today's intentions (mine and my friends'). */
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import * as api from "../data/api";
import { useOwner } from "../data/auth";
import { keys, useSocial } from "../data/hooks";
import { dayKey } from "../lib/habits";
import { errorMessage } from "../lib/errors";
import { useOnline } from "../lib/network";
import { space } from "../theme/tokens";
import { Button } from "./Button";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { Field } from "./Field";
import { ProgressBar } from "./Progress";
import { T } from "./Text";
import { useToast } from "./Toast";

/** C1 + C8 + C10: one card that says what the circle is doing for you right now. */
export function CircleCard() {
  const navigation = useNavigation();
  const owner = useOwner();
  const s = useSocial().data;
  const duo = useQuery({ queryKey: ["duo", owner], queryFn: () => api.fetchDuo(owner).catch(() => null), staleTime: 60_000 });
  if (!s) return null;
  const weekAgo = Date.now() - 7 * 86_400_000;
  const cheers = s.moments.filter((m) => m.mine && new Date(m.created_at).getTime() >= weekAgo).reduce((n, m) => n + (m.cheers || 0), 0);
  const challenges = s.challenges.filter((c) => c.status === "active" && c.my_status === "joined").length;
  const invited = s.challenges.filter((c) => c.status === "active" && c.my_status === "invited").length;
  const g = s.guild;
  const guildDone = !!g && g.minutes >= g.target;
  const d = duo.data && duo.data.status === "active" ? duo.data : null;
  const lines = [
    s.requests_in.length ? `${s.requests_in.length} demande${s.requests_in.length > 1 ? "s" : ""} d’ami en attente` : null,
    cheers ? `${cheers} encouragement${cheers > 1 ? "s" : ""} reçu${cheers > 1 ? "s" : ""} cette semaine` : null,
    invited ? `${invited} défi${invited > 1 ? "s" : ""} t’attend${invited > 1 ? "ent" : ""}` : null,
    challenges ? `${challenges} défi${challenges > 1 ? "s" : ""} en cours` : null,
    d ? `Duo avec ${d.partner.name} : ${d.together} jour${d.together > 1 ? "s" : ""} ensemble, ${d.daysLeft} jour${d.daysLeft > 1 ? "s" : ""} restants` : null,
  ].filter(Boolean) as string[];
  if (!lines.length && !g) return null;
  return (
    <Card onPress={() => navigation.navigate("Community")} tone={guildDone ? "amber" : "ruled"} style={{ gap: 6 }} accessibilityLabel={`Ton cercle. ${lines.join(". ")}`} testID="qg-circle">
      <T variant="title" tone={guildDone ? "amber" : "default"}>Ton cercle</T>
      {lines.map((l) => <T key={l} variant="small">{l}</T>)}
      {g ? (
        <View style={{ gap: 4 }}>
          <T variant="small" tone={guildDone ? "amber" : undefined} testID="qg-guild">
            {guildDone ? `Objectif de la guilde atteint ensemble : ${g.minutes} / ${g.target} min. Bravo à tous !` : `Guilde : ${g.minutes} / ${g.target} min cette semaine`}
          </T>
          <ProgressBar value={g.minutes / Math.max(1, g.target)} height={5} accessibilityLabel="Semaine de la guilde" />
        </View>
      ) : null}
    </Card>
  );
}

/** C2: the latest moments of friends, with one-tap encouragement. */
export function FriendsFeedCard() {
  const owner = useOwner();
  const qc = useQueryClient();
  const online = useOnline();
  const toast = useToast();
  const s = useSocial().data;
  const cheer = useMutation({
    mutationFn: (id: string) => api.momentCheer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.social(owner) }),
    onError: (e) => toast({ kind: "err", title: "Encouragement non envoyé", message: errorMessage(e) }),
  });
  const items = (s?.moments ?? []).filter((m) => !m.mine).slice(0, 3);
  if (!items.length) return null;
  return (
    <Card tone="ruled" style={{ gap: space.s2 }} testID="qg-feed">
      <T variant="title">Tes amis bougent</T>
      {items.map((m) => (
        <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: space.s2 }}>
          <View style={{ flex: 1 }}>
            <T variant="bodyStrong" numberOfLines={1}>{m.author.name}</T>
            <T variant="small" numberOfLines={2}>{m.title}</T>
          </View>
          <Chip label={m.cheered ? "Encouragé" : "Encourager"} icon="heart" selected={m.cheered} onPress={() => { if (!m.cheered && online) cheer.mutate(m.id); }} />
        </View>
      ))}
    </Card>
  );
}

/** C5: today's intention (« Ce soir : 30 min de vélo »), shared with friends if wanted, and friends' intentions to encourage. */
export function IntentCard({ now = new Date() }: { now?: Date }) {
  const owner = useOwner();
  const qc = useQueryClient();
  const online = useOnline();
  const toast = useToast();
  const day = dayKey(now);
  const q = useQuery({ queryKey: ["intents", owner, day], queryFn: () => api.fetchIntents(owner, day).catch(() => null), staleTime: 60_000 });
  const [text, setText] = useState("");
  const [share, setShare] = useState(true);
  const act = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => {
      if (!online) throw new Error("Connexion requise.");
      return fn();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intents", owner, day] }),
    onError: (e) => toast({ kind: "err", title: "Action impossible", message: errorMessage(e) }),
  });
  if (q.data === null) return null;
  const mine = q.data?.mine;
  const friends = q.data?.friends ?? [];
  return (
    <Card tone="ruled" style={{ gap: space.s2 }} testID="qg-intent">
      <T variant="title">Mon intention du jour</T>
      {mine ? (
        <View style={{ gap: 4 }}>
          <T variant="bodyStrong">{mine.done ? "✓ " : ""}{mine.intent}</T>
          <T variant="caption" tone="muted">{mine.visibility === "friends" ? `Partagée avec tes amis${mine.cheers ? ` · ${mine.cheers} encouragement${mine.cheers > 1 ? "s" : ""}` : ""}` : "Pour toi seul"}</T>
          {!mine.done ? <Button small kind="ghost" label="C’est fait" onPress={() => act.mutate(() => api.intentDone(owner, day, true))} testID="intent-done" /> : null}
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          <Field value={text} onChangeText={setText} maxLength={80} placeholder="Ce soir : 30 min de vélo" testID="intent-text" />
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            <Chip label="Partager avec mes amis" selected={share} onPress={() => setShare(!share)} />
            <View style={{ flex: 1 }} />
            <Button small label="Annoncer" disabled={text.trim().length < 3} loading={act.isPending} onPress={() => act.mutate(() => api.intentSet(owner, day, text.trim(), share))} testID="intent-set" />
          </View>
          <T variant="caption" tone="faint">Dire ce qu’on va faire, c’est déjà à moitié le faire.</T>
        </View>
      )}
      {friends.slice(0, 4).map((f) => (
        <View key={f.userId} style={{ flexDirection: "row", alignItems: "center", gap: space.s2 }}>
          <T variant="small" style={{ flex: 1 }}>{f.done ? "✓ " : ""}{f.name} : {f.intent}</T>
          <Chip label={f.cheered ? "Encouragé" : "Allez !"} selected={f.cheered} onPress={() => act.mutate(() => api.intentCheer(owner, f.userId, day, !f.cheered))} />
        </View>
      ))}
    </Card>
  );
}
