import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import Svg, { Circle, Polyline, Rect } from "react-native-svg";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { ErrorState, LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Format, Sports } from "../../core";
import * as api from "../../data/api";
import { useOwner } from "../../data/auth";
import { errorMessage } from "../../lib/errors";
import { shareTextFile } from "../../lib/exportFile";
import { decodeTrack, projectTrack, toGpx } from "../../lib/gpsTrack";
import { pendingRoutes } from "../../lib/routeSync";
import type { RootParams } from "../../navigation/types";
import { colors, familyColors, radius, space } from "../../theme/tokens";

const when = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const dur = (s: number) => Format.duration(Math.round(s / 60));
export const routeKey = (o: string) => ["routes", o] as const;

/** A tile-less map: the trace alone on a plain panel. No map server is ever contacted, so looking at a route reveals nothing about where it is. */
export function RouteMap({ track, height = 220, accessibilityLabel }: { track: Parameters<typeof projectTrack>[0]; height?: number; accessibilityLabel: string }) {
  const [w, setW] = useState(320);
  const p = projectTrack(track, w, height);
  return (
    <View onLayout={(e) => setW(Math.max(120, Math.round(e.nativeEvent.layout.width)))} style={{ height, borderRadius: radius.r3, overflow: "hidden", backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line }} accessible accessibilityLabel={accessibilityLabel} accessibilityRole="image">
      <Svg width={w} height={height}>
        <Rect x={0} y={0} width={w} height={height} fill={colors.bg2} />
        {p.segs.map((s, i) => (
          <Polyline key={i} points={s.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")} fill="none" stroke={colors.cy} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {p.start ? <Circle cx={p.start.x} cy={p.start.y} r={6} fill={colors.ok} stroke={colors.bg} strokeWidth={2} /> : null}
        {p.end ? <Circle cx={p.end.x} cy={p.end.y} r={6} fill={colors.am} stroke={colors.bg} strokeWidth={2} /> : null}
      </Svg>
    </View>
  );
}

/** The athlete's private route library. Nothing here is shared with anyone. */
export function RoutesScreen({ navigation }: NativeStackScreenProps<RootParams, "Routes">) {
  const owner = useOwner();
  const q = useQuery({ queryKey: routeKey(owner), queryFn: api.routesList });
  const waiting = useQuery({ queryKey: ["routes-outbox", owner], queryFn: () => pendingRoutes(owner) });
  if (q.isLoading && !q.data) return <Screen><LoadingCards count={2} /></Screen>;
  if (q.error && !q.data) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const list = q.data ?? [];
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <T variant="eyebrow" tone="accent">Mes parcours</T>
      <T tone="muted">Tes traces GPS, gardées pour toi seul. Elles ne sont jamais partagées ni publiées, et se suppriment une par une.</T>
      {waiting.data?.length ? <T variant="small" tone="warn">{waiting.data.length} parcours en attente d’envoi : ils partiront dès que le réseau revient.</T> : null}
      {list.length === 0 ? (
        <Card>
          <T variant="bodyStrong">Aucun parcours pour le moment</T>
          <T variant="small" tone="muted">Enregistre une course, une marche ou une sortie à vélo avec le GPS : la trace apparaîtra ici.</T>
        </Card>
      ) : (
        list.map((r) => (
          <Card key={r.id} onPress={() => navigation.navigate("Route", { id: r.id })} accessibilityLabel={`${Sports.label(r.sport)}, ${when(r.startedAt)}, ${Format.distance(r.distanceM / 1000)}`} testID={`route-${r.id}`} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.s2 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: familyColors[Sports.familyOf(r.sport)] ?? colors.cy }} />
              <T variant="bodyStrong" style={{ flex: 1 }}>{Sports.label(r.sport)}</T>
              <T variant="caption" tone="faint">{when(r.startedAt)}</T>
            </View>
            <T variant="small" tone="muted">
              {Format.distance(r.distanceM / 1000)} · {dur(r.durationS)}
              {r.ascentM ? ` · D+ ${r.ascentM} m` : ""}
            </T>
          </Card>
        ))
      )}
    </Screen>
  );
}

export function RouteDetailScreen({ navigation, route }: NativeStackScreenProps<RootParams, "Route">) {
  const owner = useOwner();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: [...routeKey(owner), route.params.id], queryFn: () => api.routeGet(route.params.id) });
  const [busy, setBusy] = useState(false);
  if (q.isLoading && !q.data) return <Screen><LoadingCards count={2} /></Screen>;
  if (!q.data) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const r = q.data;
  const track = decodeTrack(r.track);
  const kmh = r.durationS > 30 && r.distanceM > 50 ? (r.distanceM / r.durationS) * 3.6 : null;
  const speed = kmh === null ? "–" : Sports.paceMode(r.sport) === "pace" ? Format.pace(r.distanceM / 1000, r.durationS / 60) : `${kmh.toFixed(1).replace(".", ",")} km/h`;
  const exportGpx = async () => {
    setBusy(true);
    try {
      const day = new Date(r.startedAt).toISOString().slice(0, 10);
      await shareTextFile(`titan-${r.sport}-${day}.gpx`, toGpx(track, `${Sports.label(r.sport)} ${day}`), "application/gpx+xml");
    } catch (e) {
      toast({ kind: "err", title: "Export impossible", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api.routeDelete(r.id);
      qc.invalidateQueries({ queryKey: routeKey(owner) });
      navigation.goBack();
    } catch (e) {
      toast({ kind: "err", title: "Suppression impossible", message: errorMessage(e) });
      setBusy(false);
    }
  };
  return (
    <Screen>
      <T variant="eyebrow" tone="accent">{Sports.label(r.sport)} · {when(r.startedAt)}</T>
      <RouteMap track={track} accessibilityLabel={`Trace de ${Format.distance(r.distanceM / 1000)}`} />
      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", gap: space.s4 }}>
          <View style={{ flex: 1 }}><T variant="h2">{Format.distance(r.distanceM / 1000)}</T><T variant="caption" tone="faint">Distance</T></View>
          <View style={{ flex: 1 }}><T variant="h2">{dur(r.durationS)}</T><T variant="caption" tone="faint">Temps actif</T></View>
        </View>
        <View style={{ flexDirection: "row", gap: space.s4 }}>
          <View style={{ flex: 1 }}><T variant="h3">{speed}</T><T variant="caption" tone="faint">{Sports.paceMode(r.sport) === "pace" ? "Allure moyenne" : "Vitesse moyenne"}</T></View>
          <View style={{ flex: 1 }}><T variant="h3">{r.ascentM === null ? "–" : `${r.ascentM} m`}</T><T variant="caption" tone="faint">{r.ascentM === null ? "D+ non fiable" : "Dénivelé positif"}</T></View>
        </View>
      </Card>
      <Button kind="secondary" icon="route" label="Exporter en GPX" loading={busy} onPress={exportGpx} testID="route-export" />
      <Button kind="ghost" label="Supprimer ce parcours" disabled={busy} onPress={remove} testID="route-delete" />
      <T variant="caption" tone="faint">Cette trace n’est visible que par toi. La carte est un simple tracé : aucun serveur de cartes n’est contacté.</T>
    </Screen>
  );
}
