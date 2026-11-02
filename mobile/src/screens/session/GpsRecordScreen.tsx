import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
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
import { awaitSession, buildPending, flushRoutes, queueRoute } from "../../lib/routeSync";
import { shareTextFile } from "../../lib/exportFile";
import { draftFromRecording } from "../../lib/gpsDraft";
import { ensureLocationPermission, getActiveOwner, recorder, setActiveOwner } from "../../lib/gpsNative";
import type { Recording } from "../../lib/gpsRecorder";
import { currentSpeed } from "../../lib/gpsTrack";
import { haptic } from "../../lib/haptics";
import { ownerKey, writeJSON } from "../../lib/storage";
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
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [denied, setDenied] = useState<"denied" | "blocked" | "unavailable" | null>(null);

  useEffect(() => {
    let alive = true;
    const off = recorder.subscribe((r) => alive && r?.owner === owner && setRec(r));
    recorder.reconcile(owner).then(() => recorder.load(owner)).then((r) => {
      if (alive) {
        setRec(r);
        setReady(true);
      }
    });
    return () => {
      alive = false;
      off();
    };
  }, [owner]);

  // A lost service or a sign-out must not leave a stale recording running under another account.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") recorder.reconcile(owner).then((r) => r && setRec(r));
    });
    return () => sub.remove();
  }, [owner]);

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
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast({ kind: "err", title: failure, message: (e as Error).message === "ALREADY_RECORDING" ? "Un enregistrement est déjà en cours." : "Réessaie dans un instant." });
    } finally {
      setBusy(false);
    }
  }

  const start = () =>
    run(async () => {
      const perm = await ensureLocationPermission();
      if (perm !== "ok") return setDenied(perm);
      setDenied(null);
      const other = await getActiveOwner();
      if (other && other !== owner) await recorder.pause(other); // never two accounts at once
      await setActiveOwner(owner);
      haptic("success");
      setRec(await recorder.start(owner, sport));
    }, "Démarrage impossible");

  const finish = () => run(async () => setRec(await recorder.finish(owner)), "Fin impossible");

  const keep = () =>
    run(async () => {
      if (!rec) return;
      const sum = recorder.summary(rec);
      const draft = draftFromRecording(rec, sum);
      // The trace goes to the private route library through a durable outbox (idempotent); the session itself follows the usual path.
      const pending = buildPending({ track: rec.track, sport: rec.sport, startedAt: sum.start ?? rec.startedAt, distanceKm: sum.distanceKm, activeSeconds: sum.activeSeconds, ascent: sum.ascent });
      if (pending) {
        await queueRoute(owner, pending).catch(() => {});
        await awaitSession(owner, pending.clientRouteId, rec.sport);
      }
      saveDraft(owner, draft);
      await writeJSON(ownerKey("draft", owner), { draft, updatedAt: Date.now() }); // on disk before the recording is released
      await recorder.discard(owner);
      await setActiveOwner(null);
      flushRoutes(owner, routeSave, routeLink).catch(() => {});
      navigation.replace("SessionForm", { sport: rec.sport });
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
      await setActiveOwner(null);
      setRec(null);
      navigation.goBack();
    }, "Abandon impossible");

  if (!ready) return <Screen><T tone="muted">Chargement…</T></Screen>;

  if (!rec)
    return (
      <Screen footer={<Button label="Démarrer" icon="play" loading={busy} onPress={start} testID="gps-start" />}>
        <T variant="eyebrow" tone="accent">Enregistrement GPS</T>
        <T variant="h1">{Sports.label(sport)}</T>
        <Card>
          <T variant="bodyStrong">Pourquoi TITAN te demande ta position</T>
          <T tone="muted">Pour mesurer ta distance, ton allure ou ta vitesse et dessiner ta trace. Elle n’est utilisée que pendant une séance que tu démarres, avec une notification visible, et reste sur ce téléphone : seuls les totaux sont enregistrés dans ton journal.</T>
          <T tone="muted">L’enregistrement continue écran verrouillé tant qu’il est en cours. Tu peux le mettre en pause ou le terminer à tout moment.</T>
        </Card>
        {denied ? (
          <Card tone="amber">
            <T variant="bodyStrong">
              {denied === "unavailable" ? "Localisation désactivée" : denied === "blocked" ? "Autorisation refusée" : "Autorisation nécessaire"}
            </T>
            <T tone="muted">
              {denied === "unavailable"
                ? "Active la localisation du téléphone, puis réessaie."
                : denied === "blocked"
                  ? "Android ne redemandera plus. Ouvre les réglages de TITAN et autorise la position pendant l’utilisation."
                  : "Sans position, TITAN ne peut pas enregistrer ta trace. Tu peux toujours saisir la séance à la main."}
            </T>
            {denied === "blocked" ? <Button small kind="secondary" label="Ouvrir les réglages" onPress={() => Linking.openSettings()} /> : null}
          </Card>
        ) : null}
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
            <Button label={live ? "Pause" : "Reprendre"} kind="secondary" icon={live ? "pause" : "play"} loading={busy} onPress={() => run(async () => setRec((live ? await recorder.pause(owner) : await recorder.resume(owner)) ?? rec), "Action impossible")} style={{ flex: 1 }} testID="gps-toggle" />
            <Button label="Terminer" icon="check" loading={busy} onPress={finish} style={{ flex: 1 }} testID="gps-finish" />
          </View>
        )
      }
    >
      <T variant="eyebrow" tone="accent">{ended ? "Séance terminée" : live ? "Enregistrement en cours" : "En pause"} · {Sports.label(rec.sport)}</T>
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
          <T variant="caption" tone="faint">La trace est privée : elle n’est jamais publiée. Exporte-la avant d’enregistrer si tu veux la garder.</T>
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
