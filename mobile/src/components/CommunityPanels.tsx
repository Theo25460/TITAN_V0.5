/* Lot 8 « communauté » inside the Community screen: C4 the fair ranking among friends (opt-in, progress rather than raw volume)
   and C7 clubs (my clubs with members, announcements and trophies; join by code). Both use RPCs the server already serves.
   V1.8.4: each club card shows its private season (behind screens.club_season): explicit joining, pause, resume, leave, the organiser's
   postpone and stop, the stages and the frozen report — every word from the shared module, every figure from the server.
   V1.8.5: each club card shows its meeting with another club (behind screens.club_match): the other club's name, participants and rate
   only, the common score as of midnight, explicit joining, leave and stop behind a dialog, the recap and the two questions of the pilot.
   Proposing a meeting and answering a code stay on the website.
   V1.8.6: each club card shows its agenda (behind screens.club_agenda): answers with a waiting list when it is full, a reminder, the
   history, the precise place only when the server gives it, the finished card with a declared presence and one's own session linked by
   choice (never written for anyone); the organiser switches to the fallback or cancels after a dialog. Proposing, moving and managing a
   series stay on the website. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { View } from "react-native";
import { Sports } from "../core";
import { ClubAgenda, type ClubAgendaAction, type ClubAgendaSlot } from "../core/clubAgenda";
import { ClubMatch, type ClubMatchAction } from "../core/clubMatch";
import { ClubSeason, type ClubSeasonAction } from "../core/clubSeason";
import * as api from "../data/api";
import { useOwner } from "../data/auth";
import { useServerFlag } from "../data/flags";
import { errorMessage } from "../lib/errors";
import { useOnline } from "../lib/network";
import { space } from "../theme/tokens";
import { Button } from "./Button";
import { Card } from "./Card";
import { Alert } from "./Dialog";
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
  // Below 3 members the server keeps the totals to itself (null): the goal only, no figure and no bar.
  if (w.minutes == null || w.active == null) {
    return (
      <View style={{ gap: 4 }} testID={`club-week-${club}`}>
        <T variant="small">Cette semaine ensemble : {goal ? `objectif ${goal} min d’effort · ` : ""}le total s’affiche à partir de 3 membres</T>
      </View>
    );
  }
  const minutes = w.minutes, active = w.active;
  return (
    <View style={{ gap: 4 }} testID={`club-week-${club}`}>
      <T variant="small">Cette semaine ensemble : {minutes} min d’effort{goal ? ` / ${goal}` : ""} · {active} membre{active > 1 ? "s" : ""} actif{active > 1 ? "s" : ""} sur {w.members}</T>
      {goal ? <ProgressBar value={Math.min(1, minutes / goal)} accessibilityLabel="Objectif commun du club" /> : null}
      {goal && minutes >= goal ? <T variant="small" tone="ok">Objectif de la semaine atteint ensemble.</T> : null}
      <T variant="caption" tone="faint">Seul le total est visible : personne ne voit la part d’un autre membre.</T>
    </View>
  );
}

/** V1.8.4: the club's private season. Nothing of the group below 3 participants; one's own part always; no ranking. */
function ClubSeasonBlock({ owner, club }: { owner: string; club: string }) {
  const flag = useServerFlag("screens.club_season");
  const key = ["club-season", owner, club];
  const qc = useQueryClient();
  const online = useOnline();
  const toast = useToast();
  const q = useQuery({ queryKey: key, queryFn: () => api.fetchClubSeason(owner, club).catch(() => null), staleTime: 60_000, enabled: flag });
  // A synchronous lock: a double tap sends one request (isPending is only seen at the next render).
  const busy = useRef(false);
  const act = useMutation({
    mutationFn: async ({ action, days }: { action: ClubSeasonAction; days?: number }) => {
      if (!online) throw new Error("Connexion requise.");
      return api.clubSeasonAct(owner, club, action, days ?? null);
    },
    onSuccess: (data, v) => {
      if (data) qc.setQueryData(key, data);
      toast({ kind: "ok", title: ClubSeason.result(v.action) });
      return qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast({ kind: "err", title: "Action impossible", message: ClubSeason.message(e) ?? errorMessage(e) }),
    onSettled: () => { busy.current = false; },
  });
  const view = q.data;
  if (!flag || !view) return null;
  const s = view.current;
  const report = ClubSeason.report(view.last);
  const go = (action: ClubSeasonAction, days?: number) => {
    if (busy.current) return;
    busy.current = true;
    act.mutate({ action, days });
  };
  const run = (action: ClubSeasonAction, days?: number) => {
    if (busy.current) return;
    const ask = ClubSeason.confirmText(action, s);
    if (ask) Alert.alert(ask.title, ask.message, [{ text: "Annuler", style: "cancel" }, { text: ask.confirm, style: "destructive", onPress: () => go(action, days) }]);
    else go(action, days);
  };
  const p = ClubSeason.progress(s);
  return (
    <View style={{ gap: 4 }} testID={`club-season-${club}`}>
      <T variant="small" tone="ink">Saison du club</T>
      <T variant="caption" tone="faint" testID={`club-season-role-${club}`}>{ClubSeason.role(view)}</T>
      {s ? (
        <>
          <T variant="small" tone="ink">{s.title}</T>
          <T variant="caption" tone="muted">{ClubSeason.header(s)}</T>
          <T variant="small" testID={`club-season-group-${club}`}>{ClubSeason.group(s)}</T>
          {p ? <T variant="small" testID={`club-season-progress-${club}`}>{p.line}</T> : null}
          {p ? <ProgressBar value={p.target ? Math.min(1, p.total / p.target) : 0} accessibilityLabel="Objectif de la saison" /> : null}
          {ClubSeason.stages(s).map((st) => (
            <T key={st.n} variant="caption" tone={st.status === "reached" ? "ok" : st.status === "current" ? "default" : "faint"} testID={`club-season-stage-${club}-${st.n}`}>{st.text}</T>
          ))}
          {ClubSeason.ongoing(s) ? <T variant="small" testID={`club-season-ongoing-${club}`}>{ClubSeason.ongoing(s)}</T> : null}
          <T variant="small" testID={`club-season-me-${club}`}>{ClubSeason.mine(s)}</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2 }}>
            {ClubSeason.actions(s).flatMap((a) => a.id === "postpone"
              ? [7, 14].map((d) => <Button key={`postpone-${d}`} small kind="secondary" label={d === 7 ? "Reporter d’une semaine" : "Reporter de deux semaines"} disabled={act.isPending} onPress={() => run("postpone", d)} testID={`club-season-postpone-${club}-${d}`} />)
              : [<Button key={a.id} small kind={a.id === "join" || a.id === "resume" ? "primary" : a.danger ? "ghost" : "secondary"} label={a.label} loading={act.isPending && act.variables?.action === a.id} disabled={act.isPending} onPress={() => run(a.id)} testID={`club-season-${a.id}-${club}`} />])}
          </View>
        </>
      ) : view.canCreate ? (
        <T variant="caption" tone="faint">Une saison privée se lance depuis la version web du club. Chaque membre choisit ensuite d’y participer.</T>
      ) : !report ? <T variant="caption" tone="faint">Pas de saison en cours.</T> : null}
      {report && !s ? (
        <View style={{ gap: 2 }} testID={`club-season-report-${club}`}>
          <T variant="small" tone="ink">{report.title}</T>
          {report.lines.map((l, i) => <T key={i} variant="caption" tone="muted">{l}</T>)}
        </View>
      ) : null}
    </View>
  );
}

/** V1.8.5: the club's meeting with another club. The other club: a name, a number of participants and a rate; never a person. */
function ClubMatchBlock({ owner, club }: { owner: string; club: string }) {
  const flag = useServerFlag("screens.club_match");
  const key = ["club-match", owner, club];
  const qc = useQueryClient();
  const online = useOnline();
  const toast = useToast();
  const [clear, setClear] = useState<boolean | null>(null);
  const [again, setAgain] = useState<boolean | null>(null);
  const q = useQuery({ queryKey: key, queryFn: () => api.fetchClubMatch(owner, club).catch(() => null), staleTime: 60_000, enabled: flag });
  // A synchronous lock: a double tap sends one request (isPending is only seen at the next render).
  const busy = useRef(false);
  const act = useMutation({
    mutationFn: async ({ action, answers }: { action: ClubMatchAction; answers?: { clear: boolean; again: boolean } }) => {
      if (!online) throw new Error("Connexion requise.");
      return api.clubMatchAct(owner, club, action, answers ?? null);
    },
    onSuccess: (data, v) => {
      if (data) qc.setQueryData(key, data);
      toast({ kind: "ok", title: ClubMatch.result(v.action) });
      return qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast({ kind: "err", title: "Action impossible", message: ClubMatch.message(e) ?? errorMessage(e) }),
    onSettled: () => { busy.current = false; },
  });
  const view = q.data;
  if (!flag || !view) return null;
  const m = view.current;
  const report = ClubMatch.report(view.last);
  const go = (action: ClubMatchAction, answers?: { clear: boolean; again: boolean }) => {
    if (busy.current) return;
    busy.current = true;
    act.mutate({ action, answers });
  };
  const run = (action: ClubMatchAction) => {
    if (busy.current) return;
    const ask = ClubMatch.confirmText(action, m);
    if (ask) Alert.alert(ask.title, ask.message, [{ text: "Annuler", style: "cancel" }, { text: ask.confirm, style: "destructive", onPress: () => go(action) }]);
    else go(action);
  };
  const choice = (value: boolean | null, set: (v: boolean) => void, id: string) => (
    <View style={{ flexDirection: "row", gap: space.s2 }}>
      <Button small kind={value === true ? "primary" : "secondary"} label="Oui" onPress={() => set(true)} testID={`${id}-yes-${club}`} />
      <Button small kind={value === false ? "primary" : "secondary"} label="Non" onPress={() => set(false)} testID={`${id}-no-${club}`} />
    </View>
  );
  const canAnswer = Boolean(view.last && view.last.can?.includes("feedback"));
  return (
    <View style={{ gap: 4 }} testID={`club-match-${club}`}>
      <T variant="small" tone="ink">Rencontre entre clubs</T>
      <T variant="caption" tone="faint" testID={`club-match-role-${club}`}>{ClubMatch.role(view)}</T>
      {m ? (
        <>
          <T variant="caption" tone="muted" testID={`club-match-header-${club}`}>{ClubMatch.header(m)}</T>
          {m.phase === "proposed" ? <T variant="small" testID={`club-match-proposal-${club}`}>{ClubMatch.proposal(m)}</T> : null}
          {ClubMatch.sides(m).map((line, i) => <T key={i} variant="small" testID={`club-match-side-${club}-${i}`}>{line}</T>)}
          {ClubMatch.score(m) ? <T variant="small" testID={`club-match-score-${club}`}>{ClubMatch.score(m)}</T> : null}
          {ClubMatch.mine(m) ? <T variant="small" testID={`club-match-me-${club}`}>{ClubMatch.mine(m)}</T> : null}
          <T variant="caption" tone="faint" testID={`club-match-rules-${club}`}>{ClubMatch.rules(m)}</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2 }}>
            {ClubMatch.actions(m).map((a) => (
              <Button key={a.id} small kind={a.id === "join" ? "primary" : "ghost"} label={a.label} loading={act.isPending && act.variables?.action === a.id} disabled={act.isPending} onPress={() => run(a.id)} testID={`club-match-${a.id}-${club}`} />
            ))}
          </View>
        </>
      ) : view.canPropose ? (
        <T variant="caption" tone="faint">Proposer une rencontre à un autre club, ou répondre à un code reçu, se fait depuis la version web du club.</T>
      ) : !report ? <T variant="caption" tone="faint">Pas de rencontre en cours.</T> : null}
      {report && !m ? (
        <View style={{ gap: 2 }} testID={`club-match-report-${club}`}>
          <T variant="small" tone="ink">{report.title}</T>
          {report.lines.map((l, i) => <T key={i} variant="caption" tone="muted">{l}</T>)}
          {canAnswer ? (
            <View style={{ gap: space.s2 }} testID={`club-match-feedback-${club}`}>
              <T variant="caption">Le score était-il clair pour toi ? (compté, jamais montré aux clubs)</T>
              {choice(clear, setClear, "club-match-clear")}
              <T variant="caption">Referais-tu une rencontre avec ton club ?</T>
              {choice(again, setAgain, "club-match-again")}
              <Button small kind="secondary" label="Envoyer mon avis" disabled={clear === null || again === null || act.isPending}
                onPress={() => { if (clear !== null && again !== null) go("feedback", { clear, again }); }} testID={`club-match-send-${club}`} />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** V1.8.6: one meeting of the club's agenda. Counts of answers, never a name (the organiser's list aside). */
function ClubAgendaSlotView({ slot, club, organizer, pending, run }: { slot: ClubAgendaSlot; club: string; organizer: boolean; pending: boolean;
  run: (action: ClubAgendaAction, args: { answer?: "yes" | "maybe" | "no"; on?: boolean; log?: string }) => void }) {
  const label = (sport: string) => Sports.label(sport) || sport;
  const report = ClubAgenda.report(slot);
  const history = ClubAgenda.history(slot);
  const id = `club-agenda-${club}-${slot.id}`;
  return (
    <View style={{ gap: 2, paddingTop: space.s2 }} testID={id}>
      <T variant="small" tone="ink">{slot.title}{slot.phase === "cancelled" ? " · annulé" : ""}</T>
      <T variant="caption" tone="muted" testID={`${id}-header`}>{ClubAgenda.header(slot)}</T>
      {ClubAgenda.status(slot).map((l, i) => <T key={i} variant="caption" testID={`${id}-status-${i}`}>{l}</T>)}
      {slot.phase !== "cancelled" ? <T variant="caption" testID={`${id}-counts`}>{ClubAgenda.counts(slot)}</T> : null}
      {ClubAgenda.place(slot) ? <T variant="caption" testID={`${id}-place`}>{ClubAgenda.place(slot)}</T> : null}
      {ClubAgenda.mine(slot) ? <T variant="caption" tone="ink" testID={`${id}-me`}>{ClubAgenda.mine(slot)}</T> : null}
      {report ? (
        <View style={{ gap: 2 }} testID={`${id}-report`}>
          <T variant="caption" tone="ink">{report.title}</T>
          {report.lines.map((l, i) => <T key={i} variant="caption" tone="muted">{l}</T>)}
        </View>
      ) : null}
      {ClubAgenda.linked(slot, label) ? <T variant="caption" testID={`${id}-linked`}>{ClubAgenda.linked(slot, label)}</T> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2 }}>
        {ClubAgenda.actions(slot).filter((a) => a.id !== "move" && a.id !== "restore" && (!a.organizer || organizer)).map((a) => (
          <Button key={`${a.id}-${a.answer ?? ""}-${String(a.on ?? "")}`} small kind={a.primary ? "primary" : a.danger ? "ghost" : "secondary"} label={a.label} disabled={pending}
            onPress={() => run(a.id as ClubAgendaAction, { answer: a.answer, on: a.on })} testID={`${id}-${a.id}${a.answer ? `-${a.answer}` : a.on != null ? `-${a.on}` : ""}`} />
        ))}
        {slot.can.includes("link") ? ClubAgenda.candidates(slot, label).map((c) => (
          <Button key={c.id} small kind="secondary" label={`Associer : ${c.label}`} disabled={pending} onPress={() => run("link", { log: c.id })} testID={`${id}-link-${c.id}`} />
        )) : null}
      </View>
      {slot.can.includes("link") && !ClubAgenda.candidates(slot).length ? <T variant="caption" tone="faint" testID={`${id}-no-candidate`}>Aucune séance confirmée ce jour-là dans ton journal. Le rendez-vous n’en crée jamais à ta place.</T> : null}
      {organizer && slot.roster ? <T variant="caption" tone="faint" testID={`${id}-roster`}>{slot.roster.length ? `Réponses : ${slot.roster.map((r) => `${r.name} (${r.answer ? ClubAgenda.ANSWERS[r.answer] : "pas de réponse"}${r.attended === true ? ", présent·e" : ""})`).join(" · ")}` : "Pas encore de réponse."}</T> : null}
      {history.length ? <T variant="caption" tone="faint" testID={`${id}-history`}>{`Historique : ${history.join(" ")}`}</T> : null}
    </View>
  );
}

/** V1.8.6: the club's agenda. Answers, reminders, presence and one's own session; the organiser's fallback and cancellation. */
function ClubAgendaBlock({ owner, club }: { owner: string; club: string }) {
  const flag = useServerFlag("screens.club_agenda");
  const key = ["club-agenda", owner, club];
  const qc = useQueryClient();
  const online = useOnline();
  const toast = useToast();
  const q = useQuery({ queryKey: key, queryFn: () => api.fetchClubAgenda(owner, club).catch(() => null), staleTime: 60_000, enabled: flag });
  // A synchronous lock: a double tap sends one request (isPending is only seen at the next render).
  const busy = useRef(false);
  const act = useMutation({
    mutationFn: async ({ action, slot, answer, on, log }: { action: ClubAgendaAction; slot: string; answer?: "yes" | "maybe" | "no"; on?: boolean; log?: string }) => {
      if (!online) throw new Error("Connexion requise.");
      return api.clubAgendaAct(owner, club, action, { slot, answer: answer ?? null, on: on ?? null, log: log ?? null });
    },
    onSuccess: (data, v) => {
      if (data) qc.setQueryData(key, data);
      const fresh = data ? [...(data.upcoming ?? []), ...(data.past ?? [])].find((x) => x.id === v.slot) : null;
      toast({ kind: "ok", title: (v.action === "answer" && ClubAgenda.answered(fresh)) || ClubAgenda.result(v.action, v.answer) });
      return qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast({ kind: "err", title: "Action impossible", message: ClubAgenda.message(e) ?? errorMessage(e) }),
    onSettled: () => { busy.current = false; },
  });
  const view = q.data;
  if (!flag || !view) return null;
  const organizer = view.role === "organizer";
  const run = (slot: string) => (action: ClubAgendaAction, args: { answer?: "yes" | "maybe" | "no"; on?: boolean; log?: string }) => {
    if (busy.current) return;
    const go = () => { if (busy.current) return; busy.current = true; act.mutate({ action, slot, ...args }); };
    const ask = ClubAgenda.confirmText(action);
    if (ask) Alert.alert(ask.title, ask.message, [{ text: "Retour", style: "cancel" }, { text: ask.confirm, style: "destructive", onPress: go }]);
    else go();
  };
  const upcoming = view.upcoming ?? [], past = (view.past ?? []).filter((x) => x.can.length || x.report);
  return (
    <View style={{ gap: 4 }} testID={`club-agenda-${club}`}>
      <T variant="small" tone="ink">Agenda du club</T>
      <T variant="caption" tone="faint" testID={`club-agenda-role-${club}`}>{ClubAgenda.role(view)}</T>
      {upcoming.length ? upcoming.map((s) => <ClubAgendaSlotView key={s.id} slot={s} club={club} organizer={organizer} pending={act.isPending} run={run(s.id)} />)
        : <T variant="caption" tone="faint">Pas de rendez-vous à venir.</T>}
      {past.length ? <T variant="caption" tone="muted">Rendez-vous passés</T> : null}
      {past.map((s) => <ClubAgendaSlotView key={s.id} slot={s} club={club} organizer={organizer} pending={act.isPending} run={run(s.id)} />)}
      {view.canCreate ? <T variant="caption" tone="faint">Proposer un rendez-vous, le déplacer ou gérer une série se fait depuis la version web du club.</T> : null}
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
          <ClubAgendaBlock owner={owner} club={c.id} />
          <ClubSeasonBlock owner={owner} club={c.id} />
          <ClubMatchBlock owner={owner} club={c.id} />
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
