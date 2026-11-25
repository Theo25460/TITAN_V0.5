import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { ask } from "../../components/Dialog";
import { Field } from "../../components/Field";
import { Screen } from "../../components/Screen";
import { Segmented } from "../../components/Segmented";
import { Sheet } from "../../components/Sheet";
import { T } from "../../components/Text";
import { ToggleRow } from "../../components/Toggle";
import { useToast } from "../../components/Toast";
import { Format, GpsNav, Sports, type NavEncoded, type NavRoute } from "../../core";
import * as api from "../../data/api";
import { useOwner } from "../../data/auth";
import { useOnline } from "../../lib/network";
import { listPlaces, LOCATE_FAILURES, locateOnce, parseCoordinates, PLACE_KINDS, type Place } from "../../lib/places";
import { addToLibrary, listOfflineRoutes, loadRouteForFollow, routeToTrack, saveRouteOffline } from "../../lib/routeLibrary";
import {
  buildPlanRequest, loopReading, MAX_PLAN_POINTS, NO_ADDRESS_SEARCH, PLAN_INDICATIVE, PLAN_NOT_CONFIGURED, PLAN_PROFILE_IDS, PLAN_PROFILES, PLAN_STATES, planDuration, planRoute, probePlanner, profileOf, sportForProfile,
  type PlanBody, type PlanFailure, type PlanPoint, type PlanProfile, type PlanResult, type PlanShare,
} from "../../lib/routePlanner";
import { newRouteId } from "../../lib/routeSync";
import type { RootParams } from "../../navigation/types";
import { colors, radius, space } from "../../theme/tokens";
import { libraryKey, loadLibrary, RouteMap, savedToast, sendLibrary } from "./RoutesScreen";

/* Before Android asks: what is read, once, and where it goes (the same pattern as the other permissions, lib/permissionCopy.ts). */
const LOCATE_COPY = {
  title: "Utiliser ta position",
  message: "TITAN lit ta position une seule fois, maintenant, pour placer ce point. Aucun suivi n’est lancé. Comme tout point de l’itinéraire, il sera envoyé au serveur TITAN au moment du calcul.\n\nAndroid va te demander l’autorisation de localisation.",
  confirmLabel: "Continuer",
};
const km = (m: number) => Format.distance(m / 1000);
const coords = (p: { lat: number; lon: number }) => `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
type Status = { kind: "form" } | { kind: "loading" } | { kind: "failed"; code: PlanFailure } | { kind: "done"; plan: PlanResult; route: NavRoute; body: PlanBody };
type RouteChoice = { id: string; title: string; distanceM: number };

/** Shares of the route as plain bars; the label of each bar is its legend. */
function ShareBars({ title, rows, missing }: { title: string; rows: PlanShare[] | null; missing: string }) {
  if (!rows) return <T variant="small" tone="muted">{missing}</T>;
  return (
    <View style={{ gap: 6 }} accessibilityLabel={`${title} : ${rows.map((r) => `${r.label} ${Math.round(r.share * 100)} %`).join(", ")}`}>
      <T variant="caption" tone="muted">{title}</T>
      {rows.map((r) => (
        <View key={r.key} style={{ gap: 2 }}>
          <View style={{ flexDirection: "row" }}>
            <T variant="small" style={{ flex: 1 }}>{r.label}</T>
            <T variant="small" tone="muted">{r.share < 0.01 ? "< 1 %" : `${Math.round(r.share * 100)} %`}</T>
          </View>
          <View style={{ height: 6, borderRadius: radius.r1, backgroundColor: colors.bg4, overflow: "hidden" }}>
            <View style={{ height: 6, width: `${Math.max(1, Math.round(r.share * 100))}%`, backgroundColor: r.key === "unknown" ? colors.tx3 : colors.cy }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Planning a route: the form, the answer of the routing service, and — first of all — an honest word when no service can answer. */
export function RoutePlannerScreen({ navigation, route: nav }: NativeStackScreenProps<RootParams, "RoutePlanner">) {
  const owner = useOwner();
  const qc = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const chosenSport = nav?.params?.sport ?? null;
  const first = profileOf(chosenSport ?? "running");
  const [profile, setProfile] = useState<PlanProfile>(first.profile);
  const [mode, setMode] = useState<"ab" | "loop">("ab");
  const [points, setPoints] = useState<(PlanPoint | null)[]>([null, null]);
  const [loopStart, setLoopStart] = useState<PlanPoint | null>(null);
  const [distanceKm, setDistanceKm] = useState("10");
  const [flat, setFlat] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const [seed, setSeed] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: "form" });
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  // What is known before any form is filled: "unavailable" = the server has no routing service (nothing here can work yet).
  const [service, setService] = useState<"checking" | "unknown" | "unavailable" | "offline">("checking");
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const probe = useCallback(async () => {
    setService("checking");
    const answer = await probePlanner(owner).catch(() => "unknown" as const);
    if (mounted.current) setService(answer);
  }, [owner]);
  useEffect(() => { void probe(); }, [probe]);

  /* ---- Choosing one point: my position, one of my points, an end of a route, or typed coordinates ---- */
  const [picker, setPicker] = useState<number | "loop" | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [routes, setRoutes] = useState<RouteChoice[]>([]);
  const [typed, setTyped] = useState("");
  const [pickError, setPickError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const openPicker = (target: number | "loop") => {
    setPicker(target);
    setTyped("");
    setPickError(null);
    listPlaces(owner).then((list) => { if (mounted.current) setPlaces(list); }).catch(() => {});
    // The library when it answers; otherwise the routes copied on this phone.
    qc.fetchQuery({ queryKey: libraryKey(owner), queryFn: () => loadLibrary(owner), staleTime: 60_000 })
      .then((lib) => lib.routes.map((r) => ({ id: r.id, title: r.title, distanceM: r.distanceM })))
      .catch(async () => (await listOfflineRoutes(owner)).map((c) => ({ id: c.id, title: c.name || (c.sport ? Sports.label(c.sport) : "Parcours"), distanceM: c.distanceM })))
      .then((list) => { if (mounted.current) setRoutes(list.slice(0, 40)); })
      .catch(() => {});
  };
  const place = (p: PlanPoint) => {
    if (picker === "loop") setLoopStart(p);
    else if (picker !== null) setPoints((cur) => cur.map((x, i) => (i === picker ? p : x)));
    setPicker(null);
    setFormError(null);
  };
  const pickHere = async () => {
    setLocating(true);
    const got = await locateOnce(() => ask(LOCATE_COPY.title, LOCATE_COPY.message, { confirmLabel: LOCATE_COPY.confirmLabel }));
    if (!mounted.current) return;
    setLocating(false);
    if (!got.ok) return setPickError(LOCATE_FAILURES[got.reason]);
    place({ lat: got.lat, lon: got.lon, label: "Ma position" });
  };
  const pickTyped = () => {
    const at = parseCoordinates(typed);
    if (!at) return setPickError("Coordonnées non reconnues. Exemple : 48.5839, 7.7455 (latitude, puis longitude).");
    place({ ...at, label: coords(at) });
  };
  const pickRouteEnd = async (choice: RouteChoice, end: "start" | "end") => {
    setPickError(null);
    try {
      let r = await loadRouteForFollow(owner, choice.id);
      if (!r) {
        const full = await api.routeGetV2(owner, choice.id);
        r = GpsNav.decode(full.track as NavEncoded, { sport: full.sport });
      }
      const flatPoints = r?.segs.flat() ?? [];
      const p = end === "start" ? flatPoints[0] : flatPoints[flatPoints.length - 1];
      if (!p) throw new Error("EMPTY");
      place({ lat: p.lat, lon: p.lon, label: `${end === "start" ? "Départ" : "Arrivée"} de « ${choice.title} »` });
    } catch {
      setPickError("Ce parcours n’a pas pu être lu (pas de connexion, et pas de copie sur ce téléphone). Choisis un autre point.");
    }
  };

  const compute = async (withSeed = seed) => {
    if (busy) return;
    const built = buildPlanRequest(mode === "ab" ? { mode, profile, points } : { mode, profile, start: loopStart, distanceKm, seed: withSeed, prefs: { flat, quiet } });
    if (!built.ok) return setFormError(built.error);
    setFormError(null);
    setBusy(true);
    setStatus({ kind: "loading" });
    const answer = await planRoute(owner, built.body);
    if (!mounted.current) return;
    setBusy(false);
    if (!answer.ok) {
      if (answer.code === "ROUTING_NOT_CONFIGURED") setService("unavailable");
      return setStatus({ kind: "failed", code: answer.code });
    }
    setName(`${built.body.loop ? "Boucle" : "Itinéraire"} ${km(answer.plan.distanceM)} · ${PLAN_PROFILES[answer.plan.profile]}`);
    setStatus({ kind: "done", plan: answer.plan, route: answer.route, body: built.body });
  };
  const another = () => {
    const next = (seed + 1) % 100;
    setSeed(next);
    void compute(next);
  };
  const sport = sportForProfile(profile, chosenSport);
  const save = async () => {
    if (status.kind !== "done" || busy) return;
    setBusy(true);
    try {
      await addToLibrary(owner, status.route, { name: name.trim() || `Parcours ${km(status.plan.distanceM)}`, sport, origin: "planned" });
      toast(savedToast(await sendLibrary(owner, qc)));
      navigation.navigate("Routes");
    } catch (e) {
      const code = String((e as Error)?.message);
      toast({ kind: "err", title: "Parcours non enregistré", message: code === "ROUTE_OUTBOX_FULL" ? "Trop de parcours attendent déjà d’être envoyés. Connecte-toi à Internet, puis réessaie." : "Le parcours n’a pas pu être enregistré sur ce téléphone. Réessaie." });
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const follow = async () => {
    if (status.kind !== "done" || busy) return;
    setBusy(true);
    try {
      // Followed without entering the library: the outing reads this copy from the phone.
      const id = newRouteId();
      await saveRouteOffline(owner, id, { ...GpsNav.fit(status.route), name: name.trim() || "Parcours planifié", sport, origin: "planned" });
      navigation.navigate("GpsRecord", { sport, follow: id });
    } catch {
      toast({ kind: "err", title: "Copie impossible", message: "Le parcours n’a pas pu être copié sur ce téléphone : il ne peut pas être suivi pour l’instant." });
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const slot = (label: string, value: PlanPoint | null, target: number | "loop", extra?: React.ReactNode) => (
    <Card key={`${target}`} tone="flat" style={{ gap: space.s2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.s2 }}>
        <View style={{ flex: 1 }}>
          <T variant="caption" tone="muted">{label}</T>
          <T variant="bodyStrong" tone={value ? "default" : "faint"} testID={`point-value-${target}`}>{value ? value.label ?? coords(value) : "À choisir"}</T>
          {value?.label && value.label !== coords(value) ? <T variant="caption" tone="faint">{coords(value)}</T> : null}
        </View>
        <Button small kind="secondary" icon="pin" label={value ? "Changer" : "Choisir"} onPress={() => openPicker(target)} testID={`point-pick-${target}`} />
      </View>
      {extra}
    </Card>
  );
  const move = (i: number, by: -1 | 1) => setPoints((cur) => {
    const next = [...cur], j = i + by;
    if (j < 0 || j >= next.length) return cur;
    [next[i], next[j]] = [next[j]!, next[i]!];
    return next;
  });

  const notConfigured = (
    <Card tone="amber" style={{ gap: space.s3 }} testID="planner-not-configured" accessibilityRole="alert">
      <T variant="h3">{PLAN_STATES.ROUTING_NOT_CONFIGURED.title}</T>
      <View style={{ gap: 4 }}>
        <T variant="bodyStrong">Ce qu’il faut</T>
        {PLAN_NOT_CONFIGURED.needs.map((line) => <T key={line} variant="small" tone="muted">{line}</T>)}
      </View>
      <View style={{ gap: 4 }}>
        <T variant="bodyStrong">Ce qui marche en attendant</T>
        {PLAN_NOT_CONFIGURED.meanwhile.map((line) => <T key={line} variant="small" tone="muted">• {line}</T>)}
      </View>
      <Button icon="upload" label="Importer un GPX" onPress={() => navigation.navigate("Routes", { importGpx: true })} testID="planner-import" />
      <Button kind="secondary" icon="route" label="Ouvrir Mes parcours" onPress={() => navigation.navigate("Routes")} testID="planner-library" />
      <Button kind="ghost" icon="restore" label="Vérifier de nouveau" onPress={probe} testID="planner-recheck" />
    </Card>
  );

  if (service === "unavailable") return (
    <Screen space="seance">
      <T variant="eyebrow" tone="accent">Créer un parcours</T>
      {notConfigured}
    </Screen>
  );

  if (status.kind === "done") {
    const { plan, route: line, body } = status;
    const loop = loopReading(plan, body);
    return (
      <Screen space="seance" keyboard>
        <T variant="eyebrow" tone="accent">{body.loop ? "Boucle proposée" : "Itinéraire proposé"} · {PLAN_PROFILES[plan.profile]}</T>
        <RouteMap track={routeToTrack(line)} height={220} accessibilityLabel={`Aperçu de l’itinéraire, ${km(plan.distanceM)}`} />
        <Card style={{ gap: 6 }} testID="plan-result">
          <View style={{ flexDirection: "row", gap: space.s4 }}>
            <View style={{ flex: 1 }}><T variant="h2">{km(plan.distanceM)}</T><T variant="caption" tone="faint">Distance</T></View>
            <View style={{ flex: 1 }}>
              <T variant="h2">{plan.ascentM === null ? "–" : `${Math.round(plan.ascentM)} m`}</T>
              <T variant="caption" tone="faint">{plan.ascentM === null ? "D+ non fourni" : `D+${plan.descentM === null ? "" : ` · D− ${Math.round(plan.descentM)} m`}`}</T>
            </View>
          </View>
          <T variant="small" tone="muted" testID="plan-duration">{plan.durationS === null ? "Durée : non fournie par le fournisseur pour ce profil." : `Durée estimée par le fournisseur : ${planDuration(plan.durationS)}. C’est son calcul, pas ton allure.`}</T>
          {loop ? <T variant="small" testID="plan-loop">{loop.distance}</T> : null}
          {loop?.relief ? <T variant="small" tone="muted" testID="plan-relief">{loop.relief}</T> : null}
        </Card>
        {plan.profileNote ? <T variant="small" tone="warn" testID="plan-profile-note">{plan.profileNote}</T> : null}
        {plan.warnings.length ? (
          <Card tone="amber" style={{ gap: 4 }} testID="plan-warnings">
            {plan.warnings.map((w) => <T key={w} variant="small" tone="muted">{w}</T>)}
          </Card>
        ) : null}
        <Card tone="flat" style={{ gap: space.s3 }}>
          <ShareBars title="Revêtement" rows={plan.surface} missing="Revêtement : donnée non fournie" />
          <ShareBars title="Type de voie" rows={plan.waytype} missing="Type de voie : donnée non fournie" />
        </Card>
        <T variant="caption" tone="faint">{PLAN_INDICATIVE}</T>
        <Field label="Nom du parcours" value={name} onChangeText={setName} maxLength={80} testID="plan-name" />
        <Button icon="check" label="Enregistrer dans Mes parcours" loading={busy} onPress={save} testID="plan-save" />
        <Button kind="secondary" icon="play" label={`Suivre maintenant (${Sports.label(sport).toLowerCase()})`} disabled={busy} onPress={follow} testID="plan-follow" />
        {body.loop ? <Button kind="secondary" icon="swap" label="Autre proposition" disabled={busy} onPress={another} testID="plan-another" /> : null}
        <Button kind="ghost" icon="edit" label="Modifier" disabled={busy} onPress={() => setStatus({ kind: "form" })} testID="plan-edit" />
        <T variant="caption" tone="faint" testID="plan-attribution">Calculé par {plan.provider}{plan.attribution ? ` · ${plan.attribution}` : ""}</T>
      </Screen>
    );
  }

  const failed = status.kind === "failed" ? PLAN_STATES[status.code] : null;
  return (
    <Screen space="seance" keyboard>
      <T variant="eyebrow" tone="accent">Créer un parcours</T>
      <T tone="muted">Un itinéraire calculé par un service de routage à partir de tes points. Indicatif : c’est à toi de vérifier sur place.</T>
      {!online || service === "offline" ? (
        <Card tone="amber" style={{ gap: 4 }} testID="planner-offline" accessibilityRole="alert">
          <T variant="bodyStrong">{PLAN_STATES.OFFLINE.title}</T>
          <T variant="small" tone="muted">{PLAN_STATES.OFFLINE.text}</T>
          <Button small kind="secondary" icon="route" label="Ouvrir Mes parcours" onPress={() => navigation.navigate("Routes")} />
        </Card>
      ) : null}
      {failed && status.kind === "failed" ? (
        <Card tone="amber" style={{ gap: 4 }} testID={`planner-state-${status.code}`} accessibilityRole="alert">
          <T variant="bodyStrong">{failed.title}</T>
          <T variant="small" tone="muted">{failed.text}</T>
          {failed.retry ? <Button small kind="secondary" icon="restore" label="Réessayer" onPress={() => compute()} testID="planner-retry" /> : null}
        </Card>
      ) : null}

      <View style={{ gap: space.s2 }}>
        <T variant="caption" tone="muted">Profil{chosenSport ? ` (proposé pour ${Sports.label(chosenSport).toLowerCase()})` : ""}</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2 }}>
          {PLAN_PROFILE_IDS.map((id) => <Chip key={id} label={PLAN_PROFILES[id]} selected={profile === id} onPress={() => setProfile(id)} testID={`profile-${id}`} />)}
        </View>
        {chosenSport && !first.fits ? <T variant="small" tone="warn">Aucun profil d’itinéraire n’existe pour ce sport : choisis le plus proche, en sachant que le tracé sera pensé pour un autre usage.</T> : null}
      </View>
      <Segmented value={mode} onChange={(v) => { setMode(v); setFormError(null); }} options={[{ value: "ab", label: "Aller d’un point à un autre" }, { value: "loop", label: "Boucle" }]} accessibilityLabel="Type de parcours" />

      {mode === "ab" ? (
        <View style={{ gap: space.s2 }}>
          {points.map((p, i) => slot(i === 0 ? "Départ" : i === points.length - 1 ? "Arrivée" : `Étape ${i}`, p, i, (
            <View style={{ flexDirection: "row", gap: space.s2 }}>
              <Button small kind="ghost" icon="up" label="Monter" disabled={i === 0} onPress={() => move(i, -1)} testID={`point-up-${i}`} />
              <Button small kind="ghost" icon="down" label="Descendre" disabled={i === points.length - 1} onPress={() => move(i, 1)} testID={`point-down-${i}`} />
              {points.length > 2 ? <Button small kind="ghost" icon="trash" label="Retirer" onPress={() => setPoints((cur) => cur.filter((_, j) => j !== i))} testID={`point-remove-${i}`} /> : null}
            </View>
          )))}
          {points.length < MAX_PLAN_POINTS
            ? <Button small kind="secondary" icon="plus" label="Ajouter une étape" onPress={() => setPoints((cur) => [...cur.slice(0, -1), null, cur[cur.length - 1] ?? null])} testID="point-add" />
            : <T variant="small" tone="muted">{MAX_PLAN_POINTS} points au plus, départ et arrivée compris.</T>}
        </View>
      ) : (
        <View style={{ gap: space.s2 }}>
          {slot("Départ et retour", loopStart, "loop")}
          <Field label="Distance souhaitée" value={distanceKm} onChangeText={(v) => { setDistanceKm(v); setFormError(null); }} keyboardType="decimal-pad" suffix="km" testID="loop-distance" />
          <ToggleRow label="Plutôt plat" hint="Une préférence transmise au service, pas une garantie : selon le profil, il peut ne pas en tenir compte (il le dit alors)." value={flat} onChange={setFlat} testID="loop-flat" />
          <ToggleRow label="Voies calmes ou chemins" hint="Même principe : une préférence. TITAN ne sait pas quelles voies sont réellement calmes." value={quiet} onChange={setQuiet} last testID="loop-quiet" />
        </View>
      )}
      {formError ? <T variant="small" tone="err" accessibilityRole="alert" testID="planner-form-error">{formError}</T> : null}
      <Button icon="route" label={status.kind === "loading" ? "Calcul en cours…" : "Calculer l’itinéraire"} loading={status.kind === "loading"} onPress={() => compute()} testID="planner-compute" />
      {status.kind === "loading" ? <T variant="caption" tone="faint" accessibilityLiveRegion="polite">Le serveur interroge le service d’itinéraire : 25 secondes au plus, puis une réponse ou un message clair.</T> : null}
      <T variant="caption" tone="faint">Les points choisis sont envoyés au serveur TITAN pour le calcul. {NO_ADDRESS_SEARCH}.</T>

      <Sheet visible={picker !== null} onClose={() => setPicker(null)} title="Choisir un point">
        <T variant="small" tone="muted" testID="no-address">{NO_ADDRESS_SEARCH}</T>
        <Button kind="secondary" icon="pin" label={locating ? "Lecture de la position…" : "Ma position"} loading={locating} onPress={pickHere} testID="point-here" />
        <Field label="Coordonnées (latitude, longitude)" value={typed} onChangeText={(v) => { setTyped(v); setPickError(null); }} placeholder="48.5839, 7.7455" autoCapitalize="none" autoCorrect={false} testID="point-coords" />
        <Button small kind="secondary" label="Utiliser ces coordonnées" onPress={pickTyped} testID="point-coords-use" />
        {pickError ? <T variant="small" tone="err" accessibilityRole="alert" testID="point-error">{pickError}</T> : null}
        <T variant="eyebrow">Mes points</T>
        {places.length === 0 ? <T variant="small" tone="muted">Aucun point enregistré. Tu peux en ajouter depuis Mes parcours → Mes points.</T> : places.map((p) => (
          <Card key={p.id} tone="flat" onPress={() => place({ lat: p.lat, lon: p.lon, label: p.name })} accessibilityLabel={`${p.name}, ${PLACE_KINDS[p.kind]}`} testID={`point-place-${p.id}`} style={{ gap: 2 }}>
            <T variant="bodyStrong">{p.name}</T>
            <T variant="small" tone="muted">{PLACE_KINDS[p.kind]}</T>
          </Card>
        ))}
        <T variant="eyebrow">Départ ou arrivée d’un parcours</T>
        {routes.length === 0 ? <T variant="small" tone="muted">Aucun parcours disponible.</T> : routes.map((r) => (
          <Card key={r.id} tone="flat" style={{ gap: space.s2 }}>
            <T variant="bodyStrong">{r.title}</T>
            <View style={{ flexDirection: "row", gap: space.s2 }}>
              <Button small kind="secondary" label="Son départ" onPress={() => pickRouteEnd(r, "start")} testID={`point-route-start-${r.id}`} />
              <Button small kind="secondary" label="Son arrivée" onPress={() => pickRouteEnd(r, "end")} testID={`point-route-end-${r.id}`} />
            </View>
          </Card>
        ))}
      </Sheet>
    </Screen>
  );
}
