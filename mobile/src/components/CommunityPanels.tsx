/* Lot 8 « communauté » inside the Community screen: C4 the fair ranking among friends (opt-in, progress rather than raw volume)
   and C7 clubs (my clubs with members, announcements and trophies; join by code). Both use RPCs the server already serves. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import * as api from "../data/api";
import { useOwner } from "../data/auth";
import { errorMessage } from "../lib/errors";
import { useOnline } from "../lib/network";
import { space } from "../theme/tokens";
import { Button } from "./Button";
import { Card } from "./Card";
import { Field } from "./Field";
import { ProgressBar } from "./Progress";
import { T } from "./Text";
import { useToast } from "./Toast";

function useAct(invalidate: unknown[]) {
  const qc = useQueryClient();
  const online = useOnline();
  const toast = useToast();
  return useMutation({
    mutationFn: async ({ fn }: { fn: () => Promise<unknown>; ok?: string }) => {
      if (!online) throw new Error("Connexion requise.");
      return fn();
    },
    onSuccess: (_d, v) => {
      if (v.ok) toast({ kind: "ok", title: v.ok });
      return qc.invalidateQueries({ queryKey: invalidate });
    },
    onError: (e) => toast({ kind: "err", title: "Action impossible", message: errorMessage(e) }),
  });
}

/** C4: a ranking where everyone can win — the score weighs regularity and progress against oneself, not raw volume. */
export function RankingPanel() {
  const owner = useOwner();
  const key = ["ranking", owner];
  const q = useQuery({ queryKey: key, queryFn: () => api.fetchRanking(owner).catch(() => null), staleTime: 60_000 });
  const act = useAct(key);
  if (!q.data) return null;
  const r = q.data;
  return (
    <Card style={{ gap: space.s2 }} testID="ranking">
      <T variant="eyebrow" tone="accent">Classement équitable</T>
      {!r.optedIn ? (
        <>
          <T variant="small">Un classement entre amis où compte ta régularité et ta progression face à toi-même, pas le volume brut. Le débutant qui progresse peut passer devant le marathonien.</T>
          <Button small label="Participer au classement" loading={act.isPending} onPress={() => act.mutate({ fn: () => api.rankingSet(owner, true), ok: "Tu participes au classement" })} testID="ranking-join" />
        </>
      ) : (
        <>
          {(r.entries ?? []).slice(0, 10).map((e) => (
            <View key={`${e.rank}-${e.name}`} style={{ flexDirection: "row", gap: space.s2 }}>
              <T variant="bodyStrong" style={{ width: 28 }}>{e.rank}</T>
              <T variant={e.me ? "bodyStrong" : "small"} style={{ flex: 1 }} numberOfLines={1}>{e.me ? "Toi" : e.name}</T>
              <T variant="caption" tone="muted">{e.activeDays} j{e.progressPct != null ? ` · ${e.progressPct > 0 ? "+" : ""}${e.progressPct} %` : ""}</T>
            </View>
          ))}
          {!(r.entries ?? []).length ? <T variant="small" tone="muted">Personne d’autre n’y participe encore : invite un ami.</T> : null}
          <Button small kind="ghost" label="Ne plus participer" onPress={() => act.mutate({ fn: () => api.rankingSet(owner, false) })} testID="ranking-leave" />
        </>
      )}
    </Card>
  );
}

/** Social lot B: the club's common goal of the week — a total and the number of active members, never a name or a share. */
function ClubWeek({ owner, club }: { owner: string; club: string }) {
  const q = useQuery({ queryKey: ["club-week", owner, club], queryFn: () => api.fetchClubWeek(owner, club).catch(() => null), staleTime: 60_000 });
  const w = q.data;
  if (!w) return null;
  const goal = w.goal ?? 0;
  return (
    <View style={{ gap: 4 }} testID={`club-week-${club}`}>
      <T variant="small">Cette semaine ensemble : {w.minutes} min d’effort{goal ? ` / ${goal}` : ""} · {w.active} membre{w.active > 1 ? "s" : ""} actif{w.active > 1 ? "s" : ""} sur {w.members}</T>
      {goal ? <ProgressBar value={Math.min(1, w.minutes / goal)} accessibilityLabel="Objectif commun du club" /> : null}
      {goal && w.minutes >= goal ? <T variant="small" tone="ok">Objectif de la semaine atteint ensemble.</T> : null}
      <T variant="caption" tone="faint">Seul le total est visible : personne ne voit la part d’un autre membre.</T>
    </View>
  );
}

/** C7: the clubs I belong to — a running club, a workplace, a group of friends — and joining one by its code. */
export function ClubsPanel() {
  const owner = useOwner();
  const key = ["clubs", owner];
  const q = useQuery({ queryKey: key, queryFn: () => api.fetchClubs(owner).catch(() => null), staleTime: 60_000 });
  const act = useAct(key);
  const [code, setCode] = useState("");
  if (q.data === null) return null;
  const clubs = q.data ?? [];
  return (
    <View style={{ gap: space.s3 }} testID="clubs">
      <T variant="eyebrow" tone="accent">Mes clubs</T>
      {clubs.map((c) => (
        <Card key={c.id} style={{ gap: 6 }}>
          <T variant="title">{c.name}</T>
          <T variant="caption" tone="faint">{c.members} membre{c.members > 1 ? "s" : ""}{c.role === "admin" && c.code ? ` · code ${c.code}` : ""}</T>
          {c.description ? <T variant="small">{c.description}</T> : null}
          {(c.announcements ?? []).slice(0, 2).map((a) => <T key={a.id} variant="small" tone="muted">« {a.body} »</T>)}
          {(c.trophies ?? []).slice(0, 3).map((t) => <T key={t.id} variant="caption" tone="amber">Trophée : {t.title}</T>)}
          <ClubWeek owner={owner} club={c.id} />
        </Card>
      ))}
      <Card style={{ gap: space.s2 }}>
        <Field label="Rejoindre un club" value={code} onChangeText={(v) => setCode(v.toUpperCase())} placeholder="Code du club" autoCapitalize="characters" autoCorrect={false} testID="club-code" />
        <Button small label="Rejoindre" disabled={code.trim().length < 4} loading={act.isPending} onPress={() => act.mutate({ fn: async () => { await api.clubJoin(owner, code.trim()); setCode(""); }, ok: "Club rejoint" })} testID="club-join" />
        {!clubs.length ? <T variant="caption" tone="faint">Ton club de course, ta boîte, ta bande d’amis : un club se crée sur la version web, puis se rejoint ici avec son code.</T> : null}
      </Card>
    </View>
  );
}
