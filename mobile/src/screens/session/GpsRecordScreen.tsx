import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Format, Sports } from "../../core";
import { useOwner } from "../../data/auth";
import { routeLink, routeSave } from "../../data/api";
import { saveDraft } from "../../data/drafts";
import { buildPending, flushRoutes, queueRoute } from "../../lib/routeSync";
import { shareTextFile } from "../../lib/exportFile";
import { draftFromRecording } from "../../lib/gpsDraft";
import { ask } from "../../components/Dialog";
import { PERMISSION_COPY } from "../../lib/permissionCopy";
import { ensureLocationPermission, getActiveOwner, recorder, setActiveOwner } from "../../lib/gpsNative";
import type { Recording } from "../../lib/gpsRecorder";
import { currentSpeed } from "../../lib/gpsTrack";
import { haptic } from "../../lib/haptics";
import { colors, space } from "../../theme/tokens";
import type { RootParams } from "../../navigation/types";

const clock = (sec: number) => `${Math.floor(sec / 3600) ? `${Math.floor(sec / 3600)}:` : ""}${String(Math.floor((sec % 3600) / 60)).padStart(Math.floor(sec / 3600) ? 2 : 1, "0")}:${String(sec % 60).padStart(2, "0")}`;

/** Live recording: Démarrer → Pause/Reprendre → Terminer → Enregistrer. Runs as a visible foreground service so a locked
    screen does not stop it. Positions stay on this phone; only the totals go into the usual session form. */
export function GpsRecordScreen({ navigation, route }: NativeStackScreenProps<RootParams, "GpsRecord">) {
  const owner = useOwner();
  const toast = useToast();
  const sport = route.params.sport;
  const [rec, setRec] = useState<Recording | null>(null);
  const [ready, setReady] = useState(false);
  const [readError, setReadError] = useState(false);
  const [readAttempt, retryRead] = useState(0);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [denied, setDenied] = useState<"denied" | "blocked" | "unavailable" | null>(null);
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

  const live = rec?.status === "recording";
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  const summary = useMemo(() => (rec ? recorder.summary(rec, now) : null), [rec, now]);
  const speed = rec && live ? currentSpeed(rec.track, now) : null;
  const paceMode = Sports.paceMode(rec?.sport ?? sport);
  const shown = (kmh: number | null) => (kmh === null ? "–" : paceMode === "pace" ? Format.pace(1, 60 / Math.max(kmh, 0.1)) : `${kmh.toFixed(1).replace(".", ",")} km/h`);
  const lastFixAge = rec && live ? (rec.track.segs.at(-1)?.at(-1) ? now - rec.track.segs.at(-1)!.at(-1)!.t : null) : null;
  const noSignal = live && (lastFixAge === null ? now - rec!.startedAt > 20000 : lastFixAge > 20000);

  async function run(fn: () => Promise<unknown>, failure: string) {
    if (inFlight.current || !mounted.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      if (mounted.current) toast({ kind: "err", title: failure, message: (e as Error).message === "ALREADY_RECORDING" ? "Un enregistrement est déjà en cours." : (e as Error).message === "ROUTE_OUTBOX_FULL" ? "20 parcours attendent déjà leur envoi. Ta trace reste sur ce téléphone : exporte-la ou synchronise tes parcours avant de réessayer." : "Réessaie dans un instant. Ta trace reste sur ce téléphone." });
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function activate(operation: () => Promise<Recording | null>) {
    const perm = await ensureLocationPermission(() => ask(PERMISSION_COPY.location.title, PERMISSION_COPY.location.message, { confirmLabel: PERMISSION_COPY.location.confirmLabel }));
    if (!mounted.current) return;
    if (perm !== "ok") return setDenied(perm);
    setDenied(null);
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

  const start = () => run(() => activate(() => recorder.start(owner, sport)), "Démarrage impossible");
  const toggle = () => run(async () => {
    if (live) setRec(await recorder.pause(owner));
    else await activate(() => recorder.resume(owner));
  }, "Action impossible");

  const finish = () => run(async () => setRec(await recorder.finish(owner)), "Fin impossible");

  const keep = () =>
    run(async () => {
      if (!rec) return;
      const sum = recorder.summary(rec);
      const draft = draftFromRecording(rec, sum);
      // The trace goes to the private route library through a durable outbox (idempotent); the session itself follows the usual path.
      const pending = buildPending({ track: rec.track, sport: rec.sport, startedAt: sum.start ?? rec.startedAt, distanceKm: sum.distanceKm, activeSeconds: sum.activeSeconds, ascent: sum.ascent, id: `gps-${rec.startedAt.toString(36)}` });
      if (pending) {
        await queueRoute(owner, pending);
        draft.gpsRouteId = pending.clientRouteId;
      }
      await saveDraft(owner, draft); // on disk before the recording is released
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

  const discard = () =>
    run(async () => {
      await recorder.discard(owner);
      await setActiveOwner(null, owner);
      setRec(null);
      navigation.goBack();
    }, "Abandon impossible");

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

  if (!rec)
    return (
      <Screen footer={<Button label="Démarrer" icon="play" loading={busy} onPress={start} testID="gps-start" />}>
        <T variant="eyebrow" tone="accent">Enregistrement GPS</T>
        <T variant="h1">{Sports.label(sport)}</T>
        <Card>
          <T variant="bodyStrong">Pourquoi TITAN te demande ta position</T>
          <T tone="muted">Pour mesurer ta distance, ton allure ou ta vitesse et dessiner ta trace. Elle n’est utilisée que pendant une séance que tu démarres, avec une notification visible. Elle reste sur ce téléphone pendant l’enregistrement, puis rejoint ta bibliothèque privée quand tu enregistres la séance.</T>
          <T tone="muted">L’enregistrement continue écran verrouillé tant qu’il est en cours. Tu peux le mettre en pause ou le terminer à tout moment.</T>
        </Card>
        {permissionNotice}
        <Button kind="ghost" label="Saisir la séance à la main" onPress={() => navigation.replace("SessionForm", { sport })} />
      </Screen>
    );

  const s = summary!;
  const ended = rec.status === "ended";
  const avg = s.avgSpeedKmh;
  return (
    <Screen
      footer={
        ended ? (
          <Button label="Enregistrer la séance" icon="check" loading={busy} onPress={keep} testID="gps-keep" />
        ) : (
          <View style={{ flexDirection: "row", gap: space.s2 }}>
            <Button label={live ? "Pause" : "Reprendre"} kind="secondary" icon={live ? "pause" : "play"} loading={busy} onPress={toggle} style={{ flex: 1 }} testID="gps-toggle" />
            <Button label="Terminer" icon="check" loading={busy} onPress={finish} style={{ flex: 1 }} testID="gps-finish" />
          </View>
        )
      }
    >
      <T variant="eyebrow" tone="accent">{ended ? "Séance terminée" : live ? "Enregistrement en cours" : "En pause"} · {Sports.label(rec.sport)}</T>
      {ended ? null : permissionNotice}
      {rec.interrupted && !ended ? (
        <Card tone="amber">
          <T variant="bodyStrong">Enregistrement interrompu</T>
          <T tone="muted">Android a arrêté le suivi (arrêt de l’application, batterie). TITAN a gardé ce qui était enregistré jusqu’à la dernière position. Reprends, ou termine.</T>
        </Card>
      ) : null}
      {noSignal ? <T variant="small" tone="warn" accessibilityRole="alert">Signal GPS faible : TITAN attend une position fiable. Rien n’est inventé.</T> : null}
      <Card>
        <T variant="display" accessibilityLabel={`Temps actif ${clock(s.activeSeconds)}`}>{clock(s.activeSeconds)}</T>
        <T tone="muted">Temps actif</T>
        <View style={{ flexDirection: "row", gap: space.s4, marginTop: space.s3 }}>
          <View style={{ flex: 1 }}>
            <T variant="h2">{Format.distance(s.distanceKm)}</T>
            <T variant="caption" tone="faint">Distance</T>
          </View>
          <View style={{ flex: 1 }}>
            <T variant="h2">{ended || !live ? shown(avg) : shown(speed === null ? null : speed * 3.6)}</T>
            <T variant="caption" tone="faint">{ended || !live ? (paceMode === "pace" ? "Allure moyenne" : "Vitesse moyenne") : paceMode === "pace" ? "Allure actuelle" : "Vitesse actuelle"}</T>
          </View>
        </View>
        {live && avg ? <T variant="small" tone="muted">Moyenne {shown(avg)}</T> : null}
        <T variant="small" tone="muted">{s.ascent === null ? "Dénivelé : altitude pas assez fiable, aucun chiffre." : `Dénivelé positif ${s.ascent} m`}</T>
      </Card>
      {ended ? (
        <>
          <Button kind="secondary" icon="route" label="Exporter la trace GPX" onPress={exportGpx} />
          <T variant="caption" tone="faint">La trace est privée : elle n’est jamais publiée. Elle sera conservée dans Mes parcours ; tu peux aussi en garder une copie GPX.</T>
          <Button kind="ghost" label="Abandonner cette séance" onPress={discard} />
        </>
      ) : (
        <T variant="caption" tone="faint" color={colors.tx3}>
          Le suivi continue écran verrouillé. S’il est interrompu par Android, TITAN garde ce qui est déjà enregistré.
        </T>
      )}
    </Screen>
  );
}
