import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ask } from "../../components/Dialog";
import { GpsCells, GpsFigure, GpsFollowBanner, GpsGoalBanner, GpsSignalChip, GpsStateText, GpsStepBanner, gpsStateLine } from "../../components/GpsDashboard";
import { GpsLiveMap } from "../../components/GpsLiveMap";
import { EMPTY_PLAN_FORM, GpsBackSheet, GpsGoalSheet, GpsMoreSheet, GpsPlaceSheet, GpsPlanSheet, GpsSettingsSheet, type GpsSheetName, type PlanForm } from "../../components/GpsSheets";
import { GpsBreakdown, GpsSummary } from "../../components/GpsSummary";
import { ListRow } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import { Segmented } from "../../components/Segmented";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { GpsEngine, GpsNav, GpsSession, Sports, type GpsGoal, type GpsStep, type NavRoute } from "../../core";
import { routeLink, routeSave } from "../../data/api";
import { useOwner } from "../../data/auth";
import { saveDraft } from "../../data/drafts";
import { IS_E2E } from "../../lib/config";
import { shareTextFile } from "../../lib/exportFile";
import { draftFromRecording } from "../../lib/gpsDraft";
import { ensureLocationPermission, getActiveOwner, recorder, setActiveOwner } from "../../lib/gpsNative";
import { DEFAULT_GPS_PREFS, fieldsFor, GPS_VIEWS, loadBasemap, loadGpsPrefs, saveBasemap, saveGpsPrefs, type GpsPrefs, type GpsView } from "../../lib/gpsPrefs";
import { backtrackOf, type Recording } from "../../lib/gpsRecorder";
import { haptic } from "../../lib/haptics";
import { PERMISSION_COPY } from "../../lib/permissionCopy";
import { addPlace, listPlaces, type Place, type PlaceKind } from "../../lib/places";
import { ensurePermission as ensureNotificationPermission } from "../../lib/reminders";
import { loadRouteForFollow, saveRouteOffline } from "../../lib/routeLibrary";
import { buildPending, flushRoutes, queueRoute } from "../../lib/routeSync";
import { setVoiceEnabled, speak, splitAnnouncement, voiceEnabled } from "../../lib/voiceCoach";
import { useWeekPlan } from "../../lib/weekPlan";
import type { RootParams } from "../../navigation/types";
import { SpaceProvider } from "../../theme/space";
import { colors, space, TOUCH } from "../../theme/tokens";

/** Same pattern as lib/permissionCopy (TITAN explains before Android asks), for the one notification a recording shows. */
const NOTICE_COPY = {
  title: "Afficher l’enregistrement en cours",
  message: "Pendant l’enregistrement, TITAN affiche une notification pour que tu voies qu’il continue, écran verrouillé compris. Rien d’autre n’est envoyé.\n\nAndroid va te demander l’autorisation d’afficher des notifications.",
  confirmLabel: "Continuer",
} as const;

const goalLabel = (g: GpsGoal) => (g.kind === "distance" ? `${String(g.km).replace(".", ",")} km` : g.kind === "time" ? GpsSession.span(g.minutes * 60) : `Être rentré pour ${GpsSession.hhmm(g.at)}`);
type Followed = { id: string; route: NavRoute | null };

/** Live GPS outing: Démarrer → Pause/Reprendre → Terminer → bilan → Enregistrer. Runs as a visible foreground service so a locked
    screen does not stop it. Positions stay on this phone; only the totals go into the usual session form. Three views while it
    records (map, figures, both), the engine's own reading of the time everywhere, and nothing that pretends: a followed route is a
    route kept on the phone, the way back is the athlete's own trace, an estimate is a range. */
export function GpsRecordScreen({ navigation, route }: NativeStackScreenProps<RootParams, "GpsRecord">) {
  const owner = useOwner();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const sport = route.params.sport;
  const wanted = route.params.follow ?? null;
  const [rec, setRec] = useState<Recording | null>(null);
  const [ready, setReady] = useState(false);
  const [readError, setReadError] = useState(false);
  const [readAttempt, retryRead] = useState(0);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [denied, setDenied] = useState<"denied" | "blocked" | "unavailable" | null>(null);
  const [noNotice, setNoNotice] = useState(false);
  const [prefs, setPrefs] = useState<GpsPrefs>(DEFAULT_GPS_PREFS);
  const [basemap, setBasemap] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [sheet, setSheet] = useState<GpsSheetName | null>(null);
  const [setup, setSetup] = useState<{ goal: GpsGoal | null; plan: { steps: GpsStep[]; alerts: boolean } | null; noFollow: boolean }>({ goal: null, plan: null, noFollow: false });
  const [planForm, setPlanForm] = useState<PlanForm>(EMPTY_PLAN_FORM);
  const [followed, setFollowed] = useState<Followed | null>(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let alive = true;
    mounted.current = true;
    const off = recorder.subscribe((r) => alive && r?.owner === owner && setRec(r));
    const refresh = () => recorder.reconcile(owner).then((r) => {
      if (!alive) return;
      setRec(r);
      setReadError(false);
      setReady(true);
    }).catch(() => { if (alive) setReadError(true); });
    void refresh();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      alive = false;
      mounted.current = false;
      off();
      sub.remove();
    };
  }, [owner, readAttempt]);

  // What the athlete chose for this screen, and their private points: read once per account, never required to record.
  useEffect(() => {
    let alive = true;
    loadGpsPrefs(owner).then((p) => { if (alive) { setPrefs(p); setPlanForm((f) => ({ ...f, alerts: p.stepAlerts })); } }).catch(() => {});
    loadBasemap().then((b) => alive && setBasemap(b)).catch(() => {});
    listPlaces(owner).then((p) => alive && setPlaces(p)).catch(() => {});
    return () => { alive = false; };
  }, [owner]);

  const open = !!rec && rec.status !== "ended";
  const live = rec?.status === "recording";
  // The clock also runs while paused: the pause is shown growing, and « Terminer » reads the right totals.
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  // The line to follow is read from this phone only: the route asked for by the navigation, or the one the recording already follows.
  const followId = open ? rec!.follow?.id ?? wanted : rec ? null : setup.noFollow ? null : wanted;
  useEffect(() => {
    let alive = true;
    if (!followId) return setFollowed(null);
    loadRouteForFollow(owner, followId).then((r) => alive && setFollowed({ id: followId, route: r && r.segs?.length ? r : null })).catch(() => alive && setFollowed({ id: followId, route: null }));
    return () => { alive = false; };
  }, [owner, followId]);
  // « Suivre ce parcours » opened while an outing is already being recorded: the outing starts following it.
  const attached = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !wanted || rec!.follow || attached.current === wanted || followed?.id !== wanted || !followed.route) return;
    attached.current = wanted;
    recorder.follow(owner, { id: wanted, name: followed.route.name || "Parcours" }).catch(() => {});
  }, [open, wanted, rec, followed, owner]);

  const week = useWeekPlan();
  const planned = useMemo(() => GpsSession.plannedGoal(week, sport), [week, sport]);

  const analysis = useMemo(() => (rec ? recorder.analysis(rec, now) : null), [rec, now]);
  // AUD-30: one spoken split per whole kilometre while recording (optional, its switch lives in the settings sheet).
  const [voice, setVoice] = useState(true);
  useEffect(() => {
    voiceEnabled().then((v) => mounted.current && setVoice(v));
  }, []);
  const lastKm = useRef<number | null>(null);
  useEffect(() => {
    if (!analysis || !live) return;
    const km = analysis.distanceKm;
    if (lastKm.current === null) {
      lastKm.current = km;
      return;
    }
    const text = splitAnnouncement(lastKm.current, km, analysis.effortS, Sports.paceMode(rec?.sport ?? sport) === "pace" ? "pace" : "speed");
    lastKm.current = km;
    if (text && voice) speak(text);
  }, [analysis, live, voice, rec?.sport, sport]);

  // The way back, drawn from the trace recorded until it was asked: recomputed only when it is asked again.
  const backAt = rec?.back?.at ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const backWay = useMemo(() => (rec && backAt !== null ? backtrackOf(rec, backAt) : null), [backAt, rec?.startedAt]);

  async function run(fn: () => Promise<unknown>, failure: string) {
    if (inFlight.current || !mounted.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const code = (e as Error).message;
      if (mounted.current) toast({ kind: "err", title: failure, message: code === "ALREADY_RECORDING" ? "Un enregistrement est déjà en cours." : code === "DRAFT_PINNED" ? "Une autre séance GPS attend d’être enregistrée. Ouvre la saisie pour l’enregistrer ou l’abandonner, puis reviens : cette trace-ci reste sur ce téléphone." : code === "ROUTE_OUTBOX_FULL" ? "20 parcours attendent déjà leur envoi. Ta trace reste sur ce téléphone : exporte-la ou synchronise tes parcours avant de réessayer." : code === "PLACE_LIMIT" ? "Tu as déjà 300 points personnels : supprime-en un dans Mes parcours avant d’en ajouter." : "Réessaie dans un instant. Ta trace reste sur ce téléphone." });
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function activate(operation: () => Promise<Recording | null>, first = false) {
    const perm = await ensureLocationPermission(() => ask(PERMISSION_COPY.location.title, PERMISSION_COPY.location.message, { confirmLabel: PERMISSION_COPY.location.confirmLabel }));
    if (!mounted.current) return;
    if (perm !== "ok") return setDenied(perm);
    setDenied(null);
    // The screen promises "a visible notification": on Android 13+ it needs its own permission, asked here, at the first start and not
    // earlier, with TITAN's explanation first. A refusal never blocks the recording: the screen then says the notification will not show.
    // Never in the end-to-end build: a second system dialog would sit over the buttons the flow taps.
    if (first && !IS_E2E) {
      const shown = await ensureNotificationPermission(() => ask(NOTICE_COPY.title, NOTICE_COPY.message, { confirmLabel: NOTICE_COPY.confirmLabel })).catch(() => true);
      if (!mounted.current) return;
      setNoNotice(!shown);
    }
    const other = await getActiveOwner();
    if (other && other !== owner) {
      await recorder.reconcile(other);
      await recorder.pause(other);
    }
    if (!mounted.current) return;
    await setActiveOwner(owner);
    const next = mounted.current ? await operation() : null;
    if (!mounted.current) {
      if (next) await recorder.pause(owner);
      await setActiveOwner(null, owner);
      return;
    }
    if (next) {
      haptic("success");
      setRec(next);
    }
  }

  const start = () =>
    run(
      () =>
        activate(
          () =>
            recorder.start(owner, sport, {
              opts: { autoPause: prefs.autoPause, offRouteAlert: prefs.offRouteAlert },
              goal: setup.goal,
              plan: setup.plan,
              follow: followed?.route ? { id: followed.id, name: followed.route.name || "Parcours" } : null,
            }),
          true,
        ),
      "Démarrage impossible",
    );
  const toggle = () => run(async () => {
    if (live) setRec(await recorder.pause(owner));
    else await activate(() => recorder.resume(owner));
  }, "Action impossible");

  /* « Terminer » asks first: a tap in a pocket or with a glove must not end an outing. The recording goes on until confirmed. */
  const finish = async () => {
    const sure = await ask("Terminer la sortie ?", "L’enregistrement s’arrête et tu vois le bilan. Tu décides ensuite de l’enregistrer ou non.", { confirmLabel: "Oui, terminer", cancelLabel: "Continuer la sortie" });
    if (!sure || !mounted.current) return;
    return run(async () => setRec(await recorder.finish(owner)), "Fin impossible");
  };

  const keep = () =>
    run(async () => {
      if (!rec) return;
      const a = recorder.analysis(rec);
      const draft = draftFromRecording(rec, a);
      // The trace goes to the private route library through a durable outbox (idempotent); the session itself follows the usual path.
      const pending = buildPending({ track: rec.track, sport: rec.sport, startedAt: a.firstFixAt ?? rec.startedAt, distanceKm: a.distanceKm, activeSeconds: a.effortS, ascent: a.ascentM, id: `gps-${rec.startedAt.toString(36)}`, summary: GpsEngine.digest(a) });
      if (pending) {
        await queueRoute(owner, pending);
        draft.gpsRouteId = pending.clientRouteId;
        // A copy stays on this phone so the outing can be followed again later, with or without a network. Never blocks the save.
        const day = new Date(a.firstFixAt ?? rec.startedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
        const kept = GpsNav.fromFixes(rec.track.segs, { name: `${Sports.label(rec.sport)} · ${day}`, sport: rec.sport });
        if (kept) await saveRouteOffline(owner, pending.clientRouteId, GpsNav.fit(kept)).catch(() => {});
      }
      // On disk before the recording is released. Another sport's finished recording may be pinned as the draft: then this one is
      // NOT released (no discard below) and the athlete is told to send or give up the waiting one first.
      if (!(await saveDraft(owner, draft, { release: true }))) throw new Error("DRAFT_PINNED");
      await recorder.discard(owner);
      await setActiveOwner(null, owner);
      flushRoutes(owner, (r) => routeSave(owner, r), (id, event) => routeLink(owner, id, event)).catch(() => {});
      if (mounted.current) navigation.replace("SessionForm", { sport: rec.sport });
    }, "Enregistrement impossible");

  const exportGpx = () =>
    run(async () => {
      if (!rec) return;
      const day = new Date(rec.startedAt).toISOString().slice(0, 10);
      await shareTextFile(`titan-${rec.sport}-${day}.gpx`, recorder.gpx(rec, `${Sports.label(rec.sport)} ${day}`), "application/gpx+xml");
    }, "Export impossible");

  /* A whole outing must never vanish on one tap (AUD-07): the trace is only deleted after an explicit confirmation. */
  const discard = async () => {
    const sure = await ask("Abandonner cette séance ?", "La trace GPS et la durée enregistrées seront supprimées de ce téléphone. Tu ne pourras pas les récupérer.", { confirmLabel: "Supprimer la trace", cancelLabel: "Garder" });
    if (!sure || !mounted.current) return;
    return run(async () => {
      await recorder.discard(owner);
      await setActiveOwner(null, owner);
      setRec(null);
      navigation.goBack();
    }, "Abandon impossible");
  };

  /* Choices: kept for the next outing (per account), and applied at once to the outing in progress. */
  const changePrefs = (patch: Partial<GpsPrefs>) => {
    setPrefs((p) => ({ ...p, ...patch }));
    saveGpsPrefs(owner, patch).then((p) => mounted.current && setPrefs(p)).catch(() => {});
    if (open && ("autoPause" in patch || "offRouteAlert" in patch))
      recorder.setOptions(owner, { ...("autoPause" in patch ? { autoPause: patch.autoPause } : {}), ...("offRouteAlert" in patch ? { offRouteAlert: patch.offRouteAlert } : {}) }).catch(() => {});
  };
  const changeBasemap = (on: boolean) => {
    setBasemap(on);
    saveBasemap(on).catch(() => {});
  };
  const changeGoal = (goal: GpsGoal | null) => (open ? void run(() => recorder.setGoal(owner, goal), "Objectif non enregistré") : setSetup((s) => ({ ...s, goal })));
  const changePlan = (plan: { steps: GpsStep[]; alerts: boolean } | null) => {
    if (plan) changePrefs({ stepAlerts: plan.alerts });
    if (open) void run(() => recorder.setPlan(owner, plan), "Séance structurée non enregistrée");
    else setSetup((s) => ({ ...s, plan }));
  };
  const skipStep = () => run(() => recorder.skipStep(owner), "Étape non passée");
  const toggleBack = (on: boolean) => run(async () => {
    await recorder.backToStart(owner, on);
    if (mounted.current) setSheet(null);
  }, "Retour au départ indisponible");

  const lastFix = rec?.track.segs.at(-1)?.at(-1) ?? null;
  const fresh = rec?.live && Number.isFinite(rec.live.lat) && Number.isFinite(rec.live.lon) && (rec.live.acc ?? 0) <= GpsEngine.MAX_ACCURACY_M ? { lat: rec.live.lat as number, lon: rec.live.lon as number, acc: rec.live.acc ?? null } : null;
  const goodPosition = fresh ?? (lastFix ? { lat: lastFix.lat, lon: lastFix.lon, acc: lastFix.acc } : null);
  const addPoint = (name: string, kind: PlaceKind) =>
    run(async () => {
      if (!goodPosition) return;
      await addPlace(owner, { name, kind, lat: goodPosition.lat, lon: goodPosition.lon, note: "" });
      const list = await listPlaces(owner).catch(() => places);
      if (!mounted.current) return;
      setPlaces(list);
      setSheet(null);
      toast({ kind: "ok", title: "Point ajouté", message: "Il est privé : toi seul le vois." });
    }, "Point non ajouté");

  if (readError) return <Screen><T tone="err" accessibilityRole="alert">Impossible de lire l’enregistrement sur ce téléphone.</T><Button label="Réessayer" onPress={() => retryRead((n) => n + 1)} /></Screen>;
  if (!ready) return <Screen><T tone="muted">Chargement…</T></Screen>;

  const permissionNotice = denied ? (
    <Card tone="amber">
      <T variant="bodyStrong" accessibilityRole="alert">
        {denied === "unavailable" ? "Localisation désactivée" : denied === "blocked" ? "Autorisation refusée" : "Autorisation nécessaire"}
      </T>
      <T tone="muted">
        {denied === "unavailable"
          ? "Active la localisation du téléphone, puis réessaie."
          : denied === "blocked"
            ? "Ouvre les réglages de TITAN et autorise la position pendant l’utilisation."
            : "Sans position, TITAN ne peut pas enregistrer ta trace. Tu peux toujours saisir la séance à la main."}
      </T>
      {denied === "blocked" ? <Button small kind="secondary" label="Ouvrir les réglages" onPress={() => Linking.openSettings()} /> : null}
    </Card>
  ) : null;

  const goal = open ? rec!.goal : setup.goal;
  const plan = open ? rec!.plan : setup.plan;
  const sheets = (
    <>
      <GpsGoalSheet visible={sheet === "goal"} onClose={() => setSheet(null)} goal={goal} onChange={changeGoal} planned={planned} />
      <GpsPlanSheet
        visible={sheet === "plan"}
        onClose={() => setSheet(null)}
        form={planForm}
        onForm={setPlanForm}
        current={plan ? { steps: plan.steps, position: open && rec!.plan ? `${Math.min(rec!.plan.cursor.index + 1, rec!.plan.steps.length)}/${rec!.plan.steps.length}` : "" } : null}
        onApply={changePlan}
        onRemove={() => changePlan(null)}
      />
      <GpsSettingsSheet visible={sheet === "settings"} onClose={() => setSheet(null)} sport={rec?.sport ?? sport} prefs={prefs} onPrefs={changePrefs} basemap={basemap} onBasemap={changeBasemap} voice={voice} onVoice={(on) => { setVoice(on); void setVoiceEnabled(on); }} />
    </>
  );

  /* ---- Before the start ---- */
  if (!rec)
    return (
      <Screen footer={<Button label="Démarrer" icon="play" loading={busy} onPress={start} testID="gps-start" />}>
        <T variant="eyebrow" tone="accent">Enregistrement GPS</T>
        <T variant="h1">{Sports.label(sport)}</T>
        <Card>
          <T variant="bodyStrong">Pourquoi TITAN te demande ta position</T>
          <T tone="muted">Pour mesurer ta distance, ton allure ou ta vitesse et dessiner ta trace. Elle n’est utilisée que pendant une séance que tu démarres, avec une notification visible (Android te demandera de l’autoriser au démarrage). Elle reste sur ce téléphone pendant l’enregistrement, puis rejoint ta bibliothèque privée quand tu enregistres la séance.</T>
          <T tone="muted">L’enregistrement continue écran verrouillé tant qu’il est en cours. Tu peux le mettre en pause ou le terminer à tout moment.</T>
        </Card>
        {permissionNotice}
        <View style={styles.group}>
          {wanted && !setup.noFollow ? (
            followed?.id === wanted && followed.route ? (
              <ListRow icon="route" title="Parcours à suivre" subtitle={`${followed.route.name || "Parcours"} · ${GpsSession.km(followed.route.distanceM)} km. Touche pour ne pas le suivre.`} onPress={() => setSetup((s) => ({ ...s, noFollow: true }))} testID="gps-setup-route" />
            ) : followed?.id === wanted ? (
              <ListRow icon="route" title="Parcours à suivre" subtitle="Ce parcours n’est pas enregistré sur ce téléphone. Ouvre-le dans Mes parcours pour le garder ici." onPress={() => navigation.navigate("Routes")} testID="gps-setup-route" />
            ) : (
              <ListRow icon="route" title="Parcours à suivre" subtitle="Lecture du parcours…" testID="gps-setup-route" />
            )
          ) : (
            <ListRow icon="route" title="Parcours à suivre" subtitle="Choisir dans Mes parcours" onPress={() => navigation.navigate("Routes")} testID="gps-setup-route" />
          )}
          <ListRow icon="target" title="Objectif" subtitle={goal ? goalLabel(goal) : planned ? `Aucun · ${planned.label}` : "Aucun"} onPress={() => setSheet("goal")} testID="gps-setup-goal" />
          <ListRow icon="timer" title="Séance structurée" subtitle={plan ? `${plan.steps.length} étape${plan.steps.length > 1 ? "s" : ""}${plan.alerts ? " · vibration à chaque étape" : ""}` : "Aucune"} onPress={() => setSheet("plan")} testID="gps-setup-plan" />
          <ListRow icon="settings" title="Réglages" subtitle={`Pause automatique ${prefs.autoPause ? "activée" : "désactivée"} · vue ${GPS_VIEWS.find((v) => v.value === prefs.view)!.label}`} onPress={() => setSheet("settings")} testID="gps-setup-settings" last />
        </View>
        {plan ? (
          <Card tone="flat" testID="gps-setup-steps">
            {plan.steps.map((s, i) => <T key={i} variant="small" tone="muted">{GpsSession.describeStep(s)}</T>)}
          </Card>
        ) : null}
        <Button kind="ghost" label="Saisir la séance à la main" onPress={() => navigation.replace("SessionForm", { sport })} />
        {sheets}
      </Screen>
    );

  const a = analysis!;

  /* ---- Ended: the bilan, then the session ---- */
  if (rec.status === "ended")
    return (
      <Screen footer={<Button label="Enregistrer la séance" icon="check" loading={busy} onPress={keep} testID="gps-keep" />}>
        <T variant="eyebrow" tone="accent">Séance terminée · {Sports.label(rec.sport)}</T>
        <GpsSummary rec={rec} analysis={a} basemap={basemap} places={places} />
        <Button kind="secondary" icon="route" label="Exporter la trace GPX" onPress={exportGpx} />
        <T variant="caption" tone="faint">La trace est privée : elle n’est jamais publiée. Elle sera conservée dans Mes parcours ; tu peux aussi en garder une copie GPX.</T>
        <Button kind="ghost" label="Abandonner cette séance" onPress={discard} />
      </Screen>
    );

  /* ---- Recording or paused ---- */
  const signal = GpsEngine.signal(rec.live, now);
  const lay = GpsSession.layout(rec.sport, fieldsFor(prefs, rec.sport));
  const speed = live ? GpsEngine.currentSpeed(rec.track.segs, now, rec.live) : null;
  const leading = rec.back ?? rec.follow;
  const ctx = { speedMs: speed, altitudeM: live && rec.live && now - rec.live.t <= 20000 ? rec.live.alt ?? null : null, remainingM: leading?.state.joined ? leading.state.remainingM ?? null : null, now };
  const cell = (k: (typeof lay.main)[number]) => GpsSession.cell(k, a, ctx, lay.pace);
  const main = lay.main.map(cell), more = lay.more.map(cell);
  const stateLine = gpsStateLine(rec.status, a, signal);
  const missingRoute = !!rec.follow && followed?.id === rec.follow.id && !followed.route;
  const goalView = rec.goal ? GpsSession.goalProgress(rec.goal, a, { now, eta: (d) => GpsNav.eta(d, a), backM: rec.back?.state.joined ? rec.back.state.remainingM ?? null : a.distanceM }) : null;
  const stepView = rec.plan ? GpsSession.runPlan(rec.plan.steps, rec.plan.cursor, a) : null;
  const banners = (
    <View style={{ gap: space.s2 }}>
      {rec.back ? <GpsFollowBanner mode="back" name="" state={rec.back.state} analysis={a} /> : rec.follow ? <GpsFollowBanner mode="route" name={rec.follow.name} state={rec.follow.state} analysis={a} missing={missingRoute} /> : null}
      {stepView ? <GpsStepBanner view={stepView} onSkip={skipStep} busy={busy} /> : null}
      {goalView ? <GpsGoalBanner view={goalView} /> : null}
    </View>
  );
  const hasBanner = !!(rec.back || rec.follow || stepView || goalView);
  const map = (
    <GpsLiveMap
      mode="live"
      segs={rec.track.segs}
      planned={rec.back ? backWay?.route.segs ?? null : followed?.route?.segs ?? null}
      position={live ? rec.live : null}
      moving={(speed ?? 0) > 0.5}
      places={places}
      sport={rec.sport}
      basemap={basemap}
      signal={live ? signal : null}
      accessibilityLabel={`Carte de la sortie : ${GpsSession.km(a.distanceM)} km parcourus${rec.back ? ", chemin du retour en pointillés" : followed?.route ? ", parcours à suivre en pointillés" : ""}${places.length ? `, ${places.length} point${places.length > 1 ? "s" : ""} personnel${places.length > 1 ? "s" : ""}` : ""}`}
    />
  );

  return (
    <SpaceProvider space="seance">
      <View style={styles.root}>
        <View style={styles.head}>
          <View style={styles.headRow}>
            <T variant="eyebrow" tone="accent" style={{ flex: 1 }}>{live ? "Enregistrement en cours" : "En pause"} · {Sports.label(rec.sport)}</T>
            {live && prefs.view === "dash" ? <GpsSignalChip signal={signal} /> : null}
          </View>
          {permissionNotice}
          {noNotice ? (
            <T variant="caption" tone="warn" accessibilityRole="alert" testID="gps-no-notification">
              Notifications refusées : l’enregistrement continue, mais sans notification visible dans le volet. Tu peux les autoriser dans les réglages d’Android pour TITAN.
            </T>
          ) : null}
          {live ? <Segmented<GpsView> accessibilityLabel="Vue de la sortie" options={GPS_VIEWS} value={prefs.view} onChange={(view) => changePrefs({ view })} /> : null}
        </View>

        {!live ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} testID="gps-paused">
            {rec.interrupted ? (
              <Card tone="amber">
                <T variant="bodyStrong">Enregistrement interrompu</T>
                <T tone="muted">Android a arrêté le suivi (arrêt de l’application, batterie). TITAN a gardé ce qui était enregistré jusqu’à la dernière position. Reprends, ou termine.</T>
              </Card>
            ) : null}
            <View style={{ flexDirection: "row", gap: space.s4 }}>
              <GpsFigure cell={GpsSession.cell("distance", a, null, lay.pace)} size={56} />
              <GpsFigure cell={GpsSession.cell("moving", a, null, lay.pace)} size={56} />
            </View>
            <GpsBreakdown analysis={a} sport={rec.sport} title="Jusqu’ici" />
            <T variant="caption" tone="faint">En pause, rien n’est enregistré ni compté. Reprends quand tu repars : la trace repartira d’un nouveau tronçon, sans trait inventé.</T>
          </ScrollView>
        ) : prefs.view === "map" ? (
          <View style={styles.body} testID="gps-view-map">
            {map}
            <View style={styles.strip}>
              <GpsStateText line={stateLine} />
              <T variant="bodyStrong" accessibilityLabel={main.map((c) => `${c.label} ${c.value} ${c.unit}`).join(", ")}>{main.map((c) => `${c.value}${c.unit ? ` ${c.unit}` : ""}`).join(" · ")}</T>
            </View>
            {hasBanner ? banners : null}
          </View>
        ) : prefs.view === "dash" ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} testID="gps-view-dash">
            {main.map((c) => <View key={c.key} style={{ flexDirection: "row" }}><GpsFigure cell={c} size={84} /></View>)}
            <GpsStateText line={stateLine} />
            <GpsCells cells={more} />
            {hasBanner ? banners : null}
          </ScrollView>
        ) : (
          <View style={styles.body} testID="gps-view-mixed">
            <View style={{ flex: 55 }}>{map}</View>
            <ScrollView style={{ flex: 45 }} contentContainerStyle={{ gap: space.s2 }}>
              <View style={{ flexDirection: "row", gap: space.s3 }}>{main.map((c) => <GpsFigure key={c.key} cell={c} size={46} />)}</View>
              <GpsStateText line={stateLine} />
              <GpsCells cells={more.slice(0, 2)} />
              {hasBanner ? banners : null}
            </ScrollView>
          </View>
        )}

        <View style={[styles.foot, { paddingBottom: insets.bottom + space.s3 }]}>
          <Button label={live ? "Pause" : "Reprendre"} kind="secondary" icon={live ? "pause" : "play"} loading={busy} onPress={toggle} style={{ flex: 1 }} testID="gps-toggle" />
          <Button label="Terminer" icon="check" disabled={busy} onPress={finish} style={{ flex: 1 }} testID="gps-finish" />
          <Button label="Plus" kind="secondary" icon="more" accessibilityHint="Retour au départ, point personnel, objectif, séance structurée, réglages" onPress={() => setSheet("more")} style={{ minWidth: TOUCH + 28 }} testID="gps-more" />
        </View>
        <GpsMoreSheet visible={sheet === "more"} onClose={() => setSheet(null)} onPick={setSheet} backOn={!!rec.back} />
        <GpsBackSheet visible={sheet === "back"} onClose={() => setSheet(null)} rec={rec} analysis={a} onToggle={toggleBack} busy={busy} />
        <GpsPlaceSheet visible={sheet === "place"} onClose={() => setSheet(null)} position={goodPosition} onAdd={addPoint} busy={busy} />
        {sheets}
      </View>
    </SpaceProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: space.s4, paddingTop: space.s3, gap: space.s2 },
  headRow: { flexDirection: "row", alignItems: "center", gap: space.s2, minHeight: 28 },
  body: { flex: 1, paddingHorizontal: space.s4, paddingTop: space.s3, gap: space.s2 },
  scroll: { paddingHorizontal: space.s4, paddingTop: space.s3, paddingBottom: space.s4, gap: space.s3 },
  strip: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", columnGap: space.s3 },
  foot: { flexDirection: "row", gap: space.s2, paddingHorizontal: space.s4, paddingTop: space.s3, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
  group: { backgroundColor: colors.bg2, borderRadius: 12, overflow: "hidden" },
});
