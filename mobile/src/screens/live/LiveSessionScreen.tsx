/* TITAN LIVE on Android: prepare (intent, optional goal, immersion, missions) → live (sport view / adventure view) →
   report → the usual session form. The live layer never bypasses the existing save path: it pre-fills the draft and adds
   a bounded journal (details.live) that the server settles after the session is confirmed. GPS sports reuse the
   foreground-service recorder, so a locked screen or a killed app loses nothing. */
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { ask } from "../../components/Dialog";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Field } from "../../components/Field";
import { LiveTrail } from "../../components/LiveTrail";
import { ProgressBar } from "../../components/Progress";
import { RpeSelector } from "../../components/RpeSelector";
import { Screen } from "../../components/Screen";
import { Section } from "../../components/Section";
import { Segmented } from "../../components/Segmented";
import { T } from "../../components/Text";
import { ToggleRow } from "../../components/Toggle";
import { useToast } from "../../components/Toast";
import { Sports } from "../../core";
import { baselineFrom, LiveEngine, LiveVoies, type Immersion, type Intent, type LiveCue, type LiveInput, type LiveOut, type LiveState, type PublicMission } from "../../core/live";
import { freshDraft, type SessionDraft } from "../../core/session";
import { useOwner } from "../../data/auth";
import { saveDraft } from "../../data/drafts";
import { useLogs } from "../../data/hooks";
import { loadLive, saveLive, useLiveSession } from "../../data/live";
import { routeLink, routeSave } from "../../data/api";
import { ensureLocationPermission, getActiveOwner, recorder, setActiveOwner } from "../../lib/gpsNative";
import { PERMISSION_COPY } from "../../lib/permissionCopy";
import { draftFromRecording } from "../../lib/gpsDraft";
import type { Recording } from "../../lib/gpsRecorder";
import { buildPending, flushRoutes, queueRoute } from "../../lib/routeSync";
import { knownCells, newCellCount, rememberCells } from "../../lib/liveCells";
import { clearLiveNotification, deliver } from "../../lib/liveCompanion";
import { haptic } from "../../lib/haptics";
import type { RootParams } from "../../navigation/types";
import { colors, radius, space } from "../../theme/tokens";
import { clock, PANELS } from "./LivePanels";

type Props = NativeStackScreenProps<RootParams, "LiveSession">;
const PERSIST_EVERY_MS = 10000;
const uuid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16); });

export function LiveSessionScreen({ navigation, route }: Props) {
  const owner = useOwner();
  const toast = useToast();
  const saved = useLiveSession();
  const { active: logs } = useLogs();
  const sport = saved?.sport ?? route.params.sport;
  const config = useMemo(() => LiveVoies.resolve(sport), [sport]);
  const [state, setState] = useState<LiveState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [cue, setCue] = useState<LiveCue | null>(null);
  const [offer, setOffer] = useState<PublicMission | null>(null);
  const [view, setViewMode] = useState<"sport" | "aventure">("sport");
  const [interrupted, setInterrupted] = useState<{ gapS: number; since: number } | null>(null);
  const [rec, setRec] = useState<Recording | null>(null);
  const cells = useRef<Set<string> | null>(null);
  const lastPersist = useRef(0);
  const stateRef = useRef<LiveState | null>(null);
  stateRef.current = state;

  // Restore a running session (crash, reboot, account switch back) once.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    void loadLive(owner).then((s) => {
      restored.current = true;
      if (!s || s.sport !== sport) return;
      const r = LiveEngine.resume(s, Date.now());
      if (!r) return;
      setState(r.state);
      const gap = r.out.find((o) => o.type === "interrupted") as { gapS: number; since: number } | undefined;
      if (gap) setInterrupted(gap);
    });
  }, [owner, sport]);

  const persist = useCallback((s: LiveState | null, force = false) => {
    const t = Date.now();
    if (!force && t - lastPersist.current < PERSIST_EVERY_MS) return;
    lastPersist.current = t;
    void saveLive(owner, s);
  }, [owner]);

  const handle = useCallback((outs: LiveOut[], s: LiveState) => {
    const shown = deliver(outs, { title: `${config.voieName} · ${config.label}`, level: s.level });
    if (shown.length) setCue(shown[shown.length - 1]);
    for (const o of outs) {
      if (o.type === "mission_offer") setOffer(o.mission);
      if (o.type === "mission_done") toast({ kind: "ok", title: "Mission accomplie", message: o.mission.label });
      if (o.type === "event" && s.level >= 1) setCue({ id: o.event.id, at: Date.now(), text: o.event.text, why: "Événement de la Voie", channels: ["screen"], priority: 0 });
    }
  }, [config, toast]);

  const send = useCallback((input: LiveInput) => {
    const s = stateRef.current;
    if (!s) return;
    const r = LiveEngine.step(s, input, Date.now());
    stateRef.current = r.state;
    setState(r.state);
    handle(r.out, r.state);
    persist(r.state, input.type !== "tick" && input.type !== "gps");
    if (input.type === "beat") haptic("light");
  }, [handle, persist]);

  // One tick per second while active; the bell, the trail and the companion follow active time.
  const running = state?.status === "active";
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => { setNow(Date.now()); send({ type: "tick" }); }, 1000);
    return () => clearInterval(id);
  }, [running, send]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (a) => { if (a === "active") { setNow(Date.now()); send({ type: "tick" }); } });
    return () => sub.remove();
  }, [send]);

  // GPS: the recorder owns the trace; the engine receives totals only.
  useEffect(() => {
    if (!config.data.gps) return;
    let alive = true;
    const off = recorder.subscribe((r) => { if (alive && r?.owner === owner) setRec(r); });
    void recorder.reconcile(owner).then((r) => alive && setRec(r));
    return () => { alive = false; off(); };
  }, [config.data.gps, owner]);
  useEffect(() => {
    if (!rec || !stateRef.current) return;
    const sum = recorder.summary(rec);
    send({ type: "gps", distanceM: sum.distanceKm * 1000, elevationM: sum.ascent ?? 0, newPlaces: cells.current ? newCellCount(cells.current, rec.track) : undefined });
  }, [rec, send]);

  /* ---------------- preparation ---------------- */
  const [intent, setIntent] = useState<Intent>("atteindre");
  const [immersion, setImmersion] = useState<Immersion>(config.maxImmersion >= 1 ? "notifications" : "silence");
  const [goalKind, setGoalKind] = useState<"none" | "time" | "distance" | "beats">("none");
  const [goalValue, setGoalValue] = useState("");
  const [planCount, setPlanCount] = useState(config.plan.count ?? 0);
  const [recovery, setRecovery] = useState(false);
  const [project, setProject] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const sameSport = useMemo(() => logs.filter((l) => l.sport === sport), [logs, sport]);
  const baseline = useMemo(() => baselineFrom(logs as never, sport), [logs, sport]);
  const echo = useMemo(() => {
    const last = sameSport.find((l) => (l.details as { live?: { beats?: number; activeMin?: number } })?.live?.beats);
    const j = (last?.details as { live?: { beats: number; activeMin: number } } | undefined)?.live;
    return j && j.activeMin > 0 ? { minutes: j.activeMin, beats: j.beats } : null;
  }, [sameSport]);
  const knownExercises = useMemo(() => [...new Set(sameSport.flatMap((l) => (l.details?.exercises || []).map((e) => e.name)))].slice(0, 30), [sameSport]);
  const draftState = useMemo(() => LiveEngine.create({
    sportId: sport, intent, immersion, seed: "prepare", recovery, project, baseline, echo: intent === "depasser" ? echo : null,
    goal: goalKind === "none" ? null : { kind: goalKind, value: Number(goalValue.replace(",", ".")) || 0 },
    plan: planCount ? { count: planCount } : undefined,
  }), [sport, intent, immersion, recovery, project, baseline, echo, goalKind, goalValue, planCount]);
  const preparable = useMemo(() => LiveEngine.preparable(draftState), [draftState]);
  useEffect(() => setPicked((p) => p.filter((id) => preparable.some((m) => m.id === id))), [preparable]);

  async function start() {
    const s0 = LiveEngine.create({
      sportId: sport, intent, immersion, seed: uuid(), owner, recovery, project, baseline, echo: intent === "depasser" ? echo : null,
      goal: goalKind === "none" ? null : { kind: goalKind, value: Number(goalValue.replace(",", ".")) || 0 },
      plan: planCount ? { count: planCount } : undefined, knownExercises,
    });
    if (config.data.gps) {
      const perm = await ensureLocationPermission(() => ask(PERMISSION_COPY.location.title, PERMISSION_COPY.location.message, { confirmLabel: PERMISSION_COPY.location.confirmLabel }));
      if (perm === "ok") {
        try {
          const other = await getActiveOwner();
          if (other && other !== owner) { await recorder.reconcile(other); await recorder.pause(other); }
          await setActiveOwner(owner);
          cells.current = await knownCells(owner);
          setRec(await recorder.start(owner, sport));
        } catch (e) {
          toast({ kind: "warn", title: "GPS indisponible", message: (e as Error).message === "ALREADY_RECORDING" ? "Un suivi GPS est déjà en cours." : "La séance continue au chrono, sans carte réelle." });
        }
      } else toast({ kind: "warn", title: "Sans GPS", message: "La séance continue au chrono : la carte d’aventure avance pareil." });
    }
    const r = LiveEngine.step(s0, { type: "start", missions: picked }, Date.now());
    stateRef.current = r.state;
    setState(r.state);
    handle(r.out, r.state);
    persist(r.state, true);
    haptic("success");
  }

  async function pauseResume() {
    const s = stateRef.current;
    if (!s) return;
    if (s.status === "active") { send({ type: "pause" }); if (rec?.status === "recording") setRec(await recorder.pause(owner)); }
    else { send({ type: "resume" }); if (rec?.status === "paused") setRec(await recorder.resume(owner).catch(() => rec)); }
  }

  async function finish() {
    send({ type: "end" });
    if (rec && rec.status !== "ended") setRec(await recorder.finish(owner));
    clearLiveNotification();
  }

  /* ---------------- report and hand-off to the session form ---------------- */
  const [rpe, setRpe] = useState<number | null>(null);
  const [report, setReport] = useState<Record<string, string>>({});
  const reportMissions = useMemo(() => (state ? config.missions.filter((m) => m.verify === "report" && state.missions.active.includes(m.id)) : []), [config, state]);
  const declaredMissions = useMemo(() => (state ? config.missions.filter((m) => m.check.metric === "declared" && state.missions.active.includes(m.id)) : []), [config, state]);
  const reportFields = useMemo(() => [...new Set(reportMissions.flatMap((m) => [m.check.field as string, m.check.requires as string | undefined, (m.check.per as { field?: string } | undefined)?.field].filter(Boolean) as string[]))], [reportMissions]);

  async function keep() {
    const s0 = stateRef.current;
    if (!s0) return;
    let s = s0;
    const t = Date.now();
    for (const [id, raw] of Object.entries(report)) {
      const v = Number(raw.replace(",", "."));
      if (raw !== "" && Number.isFinite(v)) s = LiveEngine.step(s, { type: "field", id: `r_${id}`, value: v }, t).state;
    }
    const ld = LiveEngine.toDraft({ ...s, ended: { ...(s.ended as object), rpe } } as LiveState);
    let draft: SessionDraft = freshDraft(sport);
    if (rec && rec.status === "ended") {
      const sum = recorder.summary(rec);
      draft = draftFromRecording(rec, sum);
      const pending = buildPending({ track: rec.track, sport: rec.sport, startedAt: sum.start ?? rec.startedAt, distanceKm: sum.distanceKm, activeSeconds: sum.activeSeconds, ascent: sum.ascent, id: `live-${rec.startedAt.toString(36)}` });
      if (pending) { await queueRoute(owner, pending).catch(() => {}); draft.gpsRouteId = pending.clientRouteId; }
      await rememberCells(owner, rec.track).catch(() => {});
    } else {
      draft.durH = ld.durationMin >= 60 ? String(Math.floor(ld.durationMin / 60)) : "";
      draft.durM = String(ld.durationMin % 60);
    }
    const extras: Record<string, unknown> = { ...(draft.extras || {}), ...ld.extras };
    for (const [id, raw] of Object.entries(report)) if (raw !== "") extras[id] = Number(raw.replace(",", "."));
    draft = {
      ...draft, rpe: rpe ?? draft.rpe, extras,
      exercises: ld.exercises?.length ? ld.exercises.map((e) => ({ name: e.name, variant: "", kind: config.voie === "corps" ? "bodyweight" : "weighted", sets: e.setRows.map((r) => ({ weight: r.load != null ? String(r.load) : "", reps: r.reps != null ? String(r.reps) : "", rir: r.rir != null ? String(r.rir) : "", seconds: "" })) })) : draft.exercises,
      live: LiveEngine.journal(s),
    };
    // A GPS recording of another sport may be pinned as the draft: then nothing of this live session is released (recording, live
    // journal) and the athlete is told what to do first.
    if (!(await saveDraft(owner, draft, { release: true }))) {
      await ask("Une autre séance attend d’être enregistrée", "Une séance GPS terminée attend dans la saisie. Enregistre-la ou abandonne-la, puis reviens ici : cette séance live reste sur ce téléphone.", { confirmLabel: "Compris" });
      return;
    }
    if (rec) { await recorder.discard(owner); await setActiveOwner(null, owner); flushRoutes(owner, (r) => routeSave(owner, r), (id, event) => routeLink(owner, id, event)).catch(() => {}); }
    await saveLive(owner, null);
    navigation.replace("SessionForm", { sport });
  }

  async function abandon() {
    if (!(await ask("Abandonner la séance live ?", "Le chrono et le journal de cette séance seront effacés de ce téléphone. Rien n’est envoyé.", { confirmLabel: "Abandonner" }))) return;
    if (rec) { await recorder.discard(owner); await setActiveOwner(null, owner); }
    await saveLive(owner, null);
    clearLiveNotification();
    navigation.goBack();
  }

  /* ---------------- render ---------------- */
  if (!state || state.status === "ready") {
    const goalChoices = [{ value: "none" as const, label: "Aucun" }, { value: "time" as const, label: "Durée" },
      ...(config.data.gps ? [{ value: "distance" as const, label: "Distance" }] : []), { value: "beats" as const, label: capital(config.beat.many) }];
    const immersions = (Object.keys(LiveVoies.IMMERSION) as Immersion[]).filter((k) => LiveVoies.IMMERSION[k].level <= config.maxImmersion);
    return (
      <Screen footer={<Button label="Commencer" icon="play" onPress={() => void start()} testID="live-start" />}>
        <View style={{ gap: 4 }}>
          <T variant="eyebrow" tone="accent">{config.voieName}</T>
          <T variant="h1">{config.label}</T>
          <T tone="muted">{config.signature}</T>
        </View>
        <Section title="Ton intention">
          <View style={{ gap: space.s2 }}>
            {(Object.keys(LiveVoies.INTENTS) as Intent[]).map((k) => (
              <Card key={k} tone={intent === k ? "accent" : "default"} onPress={() => { setIntent(k); if (k === "explorer") setGoalKind("none"); }} accessibilityLabel={`${LiveVoies.INTENTS[k].label}. ${LiveVoies.INTENTS[k].promise}`}>
                <T variant="bodyStrong">{LiveVoies.INTENTS[k].label}</T>
                <T variant="small" tone="muted">{LiveVoies.INTENTS[k].promise}</T>
              </Card>
            ))}
          </View>
        </Section>
        <Section title="Objectif (facultatif)">
          <Segmented options={goalChoices} value={goalKind} onChange={setGoalKind} accessibilityLabel="Type d’objectif" />
          {goalKind !== "none" ? <Field label={goalKind === "time" ? "Durée" : goalKind === "distance" ? "Distance" : capital(config.beat.many)} value={goalValue} onChangeText={setGoalValue} keyboardType="decimal-pad" suffix={goalKind === "time" ? "min" : goalKind === "distance" ? "km" : undefined} testID="live-goal" /> : <T variant="small" tone="muted">Aucun chiffre : le monde réagit à ta présence.</T>}
        </Section>
        {config.plan.count ? (
          <Section title={`Plan : ${planCount} ${planCount > 1 ? config.beat.many : config.beat.one}`}>
            <View style={{ flexDirection: "row", gap: space.s2 }}>
              <Button small kind="secondary" icon="minus" label="Moins" onPress={() => setPlanCount(Math.max(1, planCount - 1))} style={{ flex: 1 }} />
              <Button small kind="secondary" icon="plus" label="Plus" onPress={() => setPlanCount(Math.min(60, planCount + 1))} style={{ flex: 1 }} />
            </View>
            {config.plan.workS ? <T variant="small" tone="muted">Cloche : {clock(config.plan.workS)} de travail, {clock(config.plan.restS ?? 0)} de repos.</T> : null}
          </Section>
        ) : null}
        <Section title="Immersion">
          <Segmented options={immersions.map((k) => ({ value: k, label: LiveVoies.IMMERSION[k].label }))} value={immersion} onChange={setImmersion} accessibilityLabel="Niveau d’immersion" />
          <T variant="small" tone="muted">{LiveVoies.IMMERSION[immersion].hint}</T>
          {config.maxImmersion < 3 ? <T variant="small" tone="muted">{config.safetyLabel} : {config.safetyWhy}</T> : null}
        </Section>
        <Section title={config.offerMode === "before" ? "Missions (choisies maintenant)" : "Missions (facultatives)"}>
          <T variant="small" tone="muted">{config.offerMode === "before" ? "Pendant l’effort, TITAN ne te sollicitera pas. Choisis jusqu’à deux missions ; elles se valident à la fin." : "Choisis-en jusqu’à deux maintenant, ou laisse TITAN t’en proposer au bon moment."}</T>
          <View style={{ gap: space.s2 }}>
            {preparable.slice(0, 8).map((m) => {
              const on = picked.includes(m.id);
              return (
                <Card key={m.id} tone={on ? "accent" : "flat"} onPress={() => setPicked(on ? picked.filter((x) => x !== m.id) : picked.length < 2 ? [...picked, m.id] : picked)} accessibilityLabel={`${m.label}. ${m.text}${on ? ". Choisie" : ""}`}>
                  <T variant="bodyStrong">{m.label}</T>
                  <T variant="small" tone="muted">{m.text}</T>
                  {m.safetyNote ? <T variant="caption" tone="faint">{m.safetyNote}</T> : null}
                </Card>
              );
            })}
          </View>
        </Section>
        <ToggleRow label="Séance de récupération" hint="Aucune mission de dépassement, un accompagnement calme." value={recovery} onChange={setRecovery} />
        {config.voie === "paroi" ? <ToggleRow label="Je travaille un projet" hint="Les essais marqués « projet » s’ajoutent à sa mémoire." value={project} onChange={setProject} /> : null}
        <T variant="caption" tone="faint">{config.fallback}</T>
      </Screen>
    );
  }

  const v = LiveEngine.view(state, now);
  const Panel = PANELS[v.panel];
  if (state.status === "ended") {
    const done = state.missions.done.length;
    return (
      <Screen footer={<Button label="Vérifier et enregistrer" icon="check" onPress={() => void keep()} testID="live-keep" />}>
        <View style={{ gap: 4 }}>
          <T variant="eyebrow" tone="accent">{config.voieName} · séance terminée</T>
          <T variant="h1">{clock(v.activeS)}</T>
          <T tone="muted">{v.beats} {v.beatLabel} · {done} mission{done > 1 ? "s" : ""} accomplie{done > 1 ? "s" : ""} · {(state.events as unknown[] | undefined)?.length ?? 0} événements</T>
        </View>
        <Section title="Effort ressenti">
          <RpeSelector value={rpe} onChange={setRpe} />
        </Section>
        {reportFields.length ? (
          <Section title="Rapport">
            {reportFields.map((f) => <Field key={f} label={fieldLabel(config, f)} value={report[f] ?? ""} onChangeText={(x) => setReport({ ...report, [f]: x })} keyboardType="decimal-pad" testID={`live-report-${f}`} />)}
          </Section>
        ) : null}
        {declaredMissions.length ? (
          <Section title="Missions à confirmer">
            {declaredMissions.map((m) => <Card key={m.id} onPress={() => send({ type: "declare", id: m.id })} accessibilityLabel={`Je l’ai fait : ${m.label}`}><T variant="bodyStrong">{m.label}</T><T variant="small" tone="muted">{m.text}</T><T variant="caption" tone="accent">Toucher pour confirmer</T></Card>)}
          </Section>
        ) : null}
        <T variant="small" tone="muted">Tu vérifies ensuite la séance dans le formulaire habituel. Les récompenses du monde sont confirmées par le serveur après l’envoi.</T>
        <Button kind="ghost" label="Abandonner la séance" onPress={() => void abandon()} />
      </Screen>
    );
  }

  return (
    <Screen footer={
      <View style={{ flexDirection: "row", gap: space.s2 }}>
        <Button kind="secondary" icon={state.status === "active" ? "pause" : "play"} label={state.status === "active" ? "Pause" : "Reprendre"} onPress={() => void pauseResume()} style={{ flex: 1 }} testID="live-pause" />
        <Button kind="primary" icon="stop" label="Terminer" onPress={() => void finish()} style={{ flex: 1 }} testID="live-finish" />
      </View>
    }>
      <Segmented options={[{ value: "sport", label: "Vue sportive" }, { value: "aventure", label: "Vue aventure" }]} value={view} onChange={setViewMode} accessibilityLabel="Changer de vue" />
      {interrupted ? (
        <Card tone="amber">
          <T variant="bodyStrong">Séance retrouvée</T>
          <T variant="small" tone="muted">L’application a été fermée pendant {Math.round(interrupted.gapS / 60)} min. Le chrono a continué.</T>
          <View style={{ flexDirection: "row", gap: space.s2 }}>
            <Button small kind="secondary" label="J’étais à l’arrêt" onPress={() => { const s = LiveEngine.trimGap(state, interrupted.since, Date.now()); setState(s); persist(s, true); setInterrupted(null); }} style={{ flex: 1 }} />
            <Button small kind="secondary" label="Je continuais" onPress={() => setInterrupted(null)} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : null}
      <View style={{ alignItems: "center", gap: 2 }}>
        <T variant="eyebrow" tone={state.status === "active" ? "accent" : "muted"}>{state.status === "active" ? config.label : "En pause"}</T>
        <T variant="display" accessibilityLabel={`Temps actif ${clock(v.activeS)}`}>{clock(v.activeS)}</T>
        {v.goal ? <View style={{ alignSelf: "stretch", gap: 4 }}><ProgressBar value={v.goal.ratio} accessibilityLabel="Progression de l’objectif" /><T variant="caption" tone="muted" center>Cap : {Math.round(v.goal.ratio * 100)} %</T></View> : null}
      </View>
      {view === "sport" ? (
        <Panel view={v} config={config} send={send} known={knownExercises} />
      ) : (
        <View style={{ gap: space.s3 }}>
          <LiveTrail lit={v.beats} planned={v.planCount} echo={v.echo?.beats ?? null} beatOne={v.beatOne} beatMany={v.beatMany} label={config.voieName} seed={config.sport} family={config.family} goalRatio={v.goal?.ratio ?? null} elan={v.elan} />
          <View style={{ gap: 4 }}>
            <T variant="caption" tone="muted">Élan du jour : {Math.round(v.elan.value)} / {v.elan.max}</T>
            <ProgressBar value={v.elan.value / v.elan.max} color={colors.cy2} />
          </View>
          {v.lastEvent ? <T variant="small" tone="muted">{v.lastEvent.text}</T> : <T variant="small" tone="faint">{config.tagline}</T>}
        </View>
      )}
      {cue && state.level >= 1 ? (
        <View style={{ padding: space.s3, borderRadius: radius.r2, backgroundColor: colors.bg2, borderLeftWidth: 3, borderLeftColor: colors.cy }} accessibilityLiveRegion="polite">
          <T variant="bodyStrong">{cue.text}</T>
          <T variant="caption" tone="faint">Pourquoi : {cue.why}</T>
        </View>
      ) : null}
      {offer && v.tapsAllowed ? (
        <Card tone="accent">
          <T variant="eyebrow" tone="accent">Mission proposée</T>
          <T variant="bodyStrong">{offer.label}</T>
          <T variant="small" tone="muted">{offer.text}</T>
          <View style={{ flexDirection: "row", gap: space.s2 }}>
            <Button small label="Accepter" onPress={() => { send({ type: "accept", id: offer.id }); setOffer(null); }} style={{ flex: 1 }} testID="live-accept" />
            <Button small kind="ghost" label="Pas aujourd’hui" onPress={() => { send({ type: "decline", id: offer.id }); setOffer(null); }} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : null}
      {v.missions.active.map((m) => (
        <View key={m.id} style={{ padding: space.s3, borderRadius: radius.r2, borderWidth: 1, borderColor: colors.line2, gap: 2 }}>
          <T variant="caption" tone="accent">Mission en cours</T>
          <T variant="bodyStrong">{m.label}</T>
          <T variant="small" tone="muted">{m.metric === "declared" ? "À confirmer à la fin." : m.metric === "report" ? "Se vérifie au rapport." : m.target != null ? `${m.value ?? 0} / ${Math.ceil(m.target)}` : m.text}</T>
        </View>
      ))}
      {v.tapsAllowed ? (
        <View style={{ gap: space.s2 }}>
          <T variant="caption" tone="muted">Effort ressenti (facultatif)</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2 }}>
            {[3, 5, 7, 8, 9].map((x) => <Chip key={x} label={`${x}/10`} selected={state.feel === x} onPress={() => send({ type: "feel", value: x })} />)}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function fieldLabel(config: ReturnType<typeof LiveVoies.resolve>, id: string) {
  // Labels come from the sport's own catalogue fields, the same as in the session form.
  const conf = Sports.conf(config.sport) as { extraFields?: { id: string; label?: string }[] } | null;
  return conf?.extraFields?.find((x) => x.id === id)?.label || id;
}
