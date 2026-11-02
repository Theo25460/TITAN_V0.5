import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Image, PanResponder, View } from "react-native";
import Svg, { Circle, Polyline, Rect } from "react-native-svg";
import { Button } from "../../components/Button";
import { Tap } from "../../components/Pressable";
import { ToggleRow } from "../../components/Toggle";
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
import { decodeTrack, projectTrack, toGpx, trimEnds } from "../../lib/gpsTrack";
import { fitView, panBy, TILE, TILES_ATTRIBUTION, tilesConfigured, tilesFor, tileUrl, toScreen, zoomBy, type View as MapViewState } from "../../lib/tiles";
import { readJSON, writeJSON } from "../../lib/storage";
import { pendingRoutes } from "../../lib/routeSync";
import type { RootParams } from "../../navigation/types";
import { colors, familyColors, radius, space } from "../../theme/tokens";

const when = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const dur = (s: number) => Format.duration(Math.round(s / 60));
export const routeKey = (o: string) => ["routes", o] as const;

/** The route on a plain panel, or on a base map when the athlete turned it on (and the build carries a tile provider). Without the base map no map
    server is contacted, so looking at a route reveals nothing about where it is. With it: pan by dragging, zoom with + / −, one tap to fit the trace again. */
export function RouteMap({ track, height = 240, basemap = false, accessibilityLabel }: { track: Parameters<typeof projectTrack>[0]; height?: number; basemap?: boolean; accessibilityLabel: string }) {
  const [w, setW] = useState(320);
  const pts = track.segs.flat();
  const useTiles = basemap && tilesConfigured() && pts.length > 1;
  const fitted = useMemo(() => (useTiles ? fitView(pts, w, height) : null), [useTiles, pts, w, height]);
  const [view, setView] = useState<MapViewState | null>(null);
  const v = view ?? fitted;
  const pan = useMemo(
    () => {
      let last = { x: 0, y: 0 };
      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 4,
        onPanResponderGrant: () => (last = { x: 0, y: 0 }),
        onPanResponderMove: (_e, g) => {
          const dx = g.dx - last.x, dy = g.dy - last.y;
          last = { x: g.dx, y: g.dy };
          setView((cur) => panBy(cur ?? fitted ?? { lat: 0, lon: 0, z: 2 }, dx, dy));
        },
      });
    },
    [fitted],
  );
  const flat = projectTrack(track, w, height);
  const project = (p: { lat: number; lon: number }) => (useTiles && v ? toScreen(p, v, w, height) : null);
  const line = (s: { lat: number; lon: number }[]) => s.map((q) => { const o = project(q)!; return `${o.x.toFixed(1)},${o.y.toFixed(1)}`; }).join(" ");
  const first = pts[0], last = pts[pts.length - 1];
  return (
    <View style={{ borderRadius: radius.r3, overflow: "hidden", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg2 }}>
      <View onLayout={(e) => setW(Math.max(120, Math.round(e.nativeEvent.layout.width)))} style={{ height }} accessible accessibilityLabel={accessibilityLabel} accessibilityRole="image" {...(useTiles ? pan.panHandlers : {})}>
        {useTiles && v ? tilesFor(v, w, height).map((t) => <Image key={t.key} source={{ uri: tileUrl(t) }} style={{ position: "absolute", left: t.left, top: t.top, width: TILE, height: TILE }} />) : null}
        <Svg width={w} height={height} style={{ position: "absolute", left: 0, top: 0 }}>
          {useTiles && v ? null : <Rect x={0} y={0} width={w} height={height} fill={colors.bg2} />}
          {useTiles && v
            ? track.segs.filter((s) => s.length).map((s, i) => <Polyline key={i} points={line(s)} fill="none" stroke={colors.cy} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />)
            : flat.segs.map((s, i) => <Polyline key={i} points={s.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")} fill="none" stroke={colors.cy} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />)}
          {(() => {
            const a = useTiles && v && first ? project(first) : flat.start;
            const b = useTiles && v && last ? project(last) : flat.end;
            return (
              <>
                {a ? <Circle cx={a.x} cy={a.y} r={7} fill={colors.ok} stroke={colors.bg} strokeWidth={2} /> : null}
                {b ? <Circle cx={b.x} cy={b.y} r={7} fill={colors.am} stroke={colors.bg} strokeWidth={2} /> : null}
              </>
            );
          })()}
        </Svg>
        {useTiles && v ? (
          <View style={{ position: "absolute", right: 8, top: 8, gap: 6 }}>
            <MapButton label="+" hint="Zoom avant" onPress={() => setView(zoomBy(v, 1))} />
            <MapButton label="−" hint="Zoom arrière" onPress={() => setView(zoomBy(v, -1))} />
            <MapButton label="◎" hint="Recentrer sur le parcours" onPress={() => setView(null)} />
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", gap: space.s3, padding: space.s2 }}>
        <T variant="caption" tone="faint">● départ</T>
        <T variant="caption" tone="amber">● arrivée</T>
        {useTiles ? <T variant="caption" tone="faint" style={{ flex: 1, textAlign: "right" }}>{TILES_ATTRIBUTION}</T> : null}
      </View>
    </View>
  );
}

function MapButton({ label, hint, onPress }: { label: string; hint: string; onPress: () => void }) {
  return (
    <Tap onPress={onPress} accessibilityLabel={hint} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" }}>
      <T variant="bodyStrong">{label}</T>
    </Tap>
  );
}

/** The athlete's private route library. Nothing here is shared with anyone. */
export function RoutesScreen({ navigation }: NativeStackScreenProps<RootParams, "Routes">) {
  const owner = useOwner();
  const toast = useToast();
  const [exporting, setExporting] = useState<string | null>(null);
  const q = useQuery({ queryKey: routeKey(owner), queryFn: () => api.routesList(owner) });
  const waiting = useQuery({ queryKey: ["routes-outbox", owner], queryFn: () => pendingRoutes(owner) });
  if (q.isLoading && !q.data && !waiting.data?.length) return <Screen><LoadingCards count={2} /></Screen>;
  if (q.error && !q.data && !waiting.data?.length) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const list = q.data ?? [];
  const refresh = () => { q.refetch(); waiting.refetch(); };
  return (
    <Screen refreshing={q.isRefetching} onRefresh={refresh}>
      <T variant="eyebrow" tone="accent">Mes parcours</T>
      <T tone="muted">Tes traces GPS, gardées pour toi seul. Elles ne sont jamais partagées ni publiées, et se suppriment une par une.</T>
      {q.error ? <T tone="warn">La bibliothèque en ligne est indisponible. Tes parcours en attente restent sur ce téléphone.</T> : null}
      {waiting.data?.length ? <T variant="small" tone="warn">{waiting.data.length} parcours en attente d’envoi. Ils restent sur ce téléphone jusqu’à confirmation du serveur.</T> : null}
      {waiting.data?.map((r) => (
        <Card key={r.clientRouteId}>
          <T variant="bodyStrong">{Sports.label(r.sport)} · {when(r.startedAt)}</T>
          <T variant="small" tone={r.rejected ? "warn" : "muted"}>{r.rejected ? "Envoi refusé : la trace est conservée. Garde une copie GPX avant de contacter l’assistance." : "Envoi à réessayer. Tu peux déjà garder une copie GPX."}</T>
          <Button small kind="secondary" label="Exporter le parcours en attente" testID={`pending-export-${r.clientRouteId}`} loading={exporting === r.clientRouteId} onPress={async () => {
            if (exporting) return;
            setExporting(r.clientRouteId);
            try {
              await shareTextFile(`titan-${r.sport}-${r.startedAt.slice(0, 10)}.gpx`, toGpx(decodeTrack(r.track), Sports.label(r.sport)), "application/gpx+xml");
            } catch {
              toast({ kind: "err", title: "Export impossible", message: "Ta trace reste conservée. Réessaie dans un instant." });
            } finally { setExporting(null); }
          }} />
        </Card>
      ))}
      {list.length === 0 && !waiting.data?.length ? (
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

/** The map of the route linked to a session, inside the session detail (nothing at all when the session has no route). */
export function SessionRoute({ eventId, onOpen }: { eventId: string; onOpen: (id: string) => void }) {
  const owner = useOwner();
  const meta = useQuery({ queryKey: [...routeKey(owner), "event", eventId], queryFn: () => api.routeForEvent(owner, eventId), staleTime: 60_000 });
  const full = useQuery({ queryKey: [...routeKey(owner), meta.data?.id ?? "none"], queryFn: () => api.routeGet(owner, meta.data!.id), enabled: !!meta.data?.id });
  const [basemap, setBasemap] = useState(false);
  useEffect(() => {
    readJSON<boolean>("titan.basemap.v1", false).then(setBasemap);
  }, []);
  if (!meta.data || !full.data) return null;
  return (
    <View style={{ gap: space.s2 }} testID="session-route">
      <T variant="eyebrow">Parcours</T>
      <RouteMap track={decodeTrack(full.data.track)} basemap={basemap} height={200} accessibilityLabel={`Trace de ${Format.distance(meta.data.distanceM / 1000)}`} />
      <Button small kind="secondary" icon="route" label="Voir le parcours" onPress={() => onOpen(meta.data!.id)} testID="session-route-open" />
    </View>
  );
}

export function RouteDetailScreen({ navigation, route }: NativeStackScreenProps<RootParams, "Route">) {
  const owner = useOwner();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: [...routeKey(owner), route.params.id], queryFn: () => api.routeGet(owner, route.params.id) });
  const [busy, setBusy] = useState(false);
  const [basemap, setBasemap] = useState(false);
  useEffect(() => {
    readJSON<boolean>("titan.basemap.v1", false).then(setBasemap);
  }, []);
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
  const share = async () => {
    const trimmed = trimEnds(track);
    if (!trimmed) return toast({ kind: "warn", title: "Parcours trop court", message: "Impossible de masquer le début et la fin d’un parcours aussi court sans révéler d’où tu pars. Il reste privé." });
    setBusy(true);
    try {
      const day = new Date(r.startedAt).toISOString().slice(0, 10);
      await shareTextFile(`titan-parcours-${day}.gpx`, toGpx(trimmed, `${Sports.label(r.sport)}`, { time: false, ele: false }), "application/gpx+xml");
    } catch (e) {
      toast({ kind: "err", title: "Partage impossible", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api.routeDelete(owner, r.id);
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
      <RouteMap track={track} basemap={basemap} accessibilityLabel={`Trace de ${Format.distance(r.distanceM / 1000)}`} />
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
      <Button kind="secondary" icon="share" label="Partager sans le début ni la fin" disabled={busy} onPress={share} testID="route-share" />
      <T variant="caption" tone="faint">Le fichier partagé ne contient ni l’heure, ni l’altitude, et les 300 premiers et derniers mètres sont retirés pour ne pas révéler ton point de départ. Rien n’est publié : c’est toi qui choisis où l’envoyer.</T>
      {tilesConfigured() ? (
        <ToggleRow
          label="Afficher le fond de carte"
          hint={`Le fournisseur de cartes (${TILES_ATTRIBUTION}) voit la zone que tu regardes, pas ton identité. Désactivé par défaut.`}
          value={basemap}
          onChange={(v) => { setBasemap(v); writeJSON("titan.basemap.v1", v).catch(() => {}); }}
          last
        />
      ) : null}
      <Button kind="ghost" label="Supprimer ce parcours" disabled={busy} onPress={remove} testID="route-delete" />
      <T variant="caption" tone="faint">Cette trace n’est visible que par toi. La carte est un simple tracé : aucun serveur de cartes n’est contacté.</T>
    </Screen>
  );
}
