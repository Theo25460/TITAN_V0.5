/* V1.7.7 — the map of a GPS outing, drawn by TITAN itself (react-native-svg): the trace travelled in cyan, the line to follow in
   amber and dashed, the start, the current position with its accuracy and, when the receiver gives one, the course over the ground.
   Stretches are never joined: a pause or a lost signal stays a hole. Without a base map no server is contacted (a neutral panel
   with a grid); with the athlete's opt-in and a tile provider in the build, tiles are drawn underneath with their attribution.
   Live: the map follows the position; dragging frees it and « Recentrer » brings it back. Controls sit on the edges. */
import { useMemo, useRef, useState } from "react";
import { Image, PanResponder, StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Polygon, Polyline } from "react-native-svg";
import { GpsEngine, type GpsLive, type GpsSignal } from "../core";
import { fitView, MAX_ZOOM, MIN_ZOOM, panBy, TILE, TILES_ATTRIBUTION, tilesConfigured, tilesFor, tileUrl, toScreen, zoomBy, type View as MapView } from "../lib/tiles";
import { colors, radius, space, TOUCH } from "../theme/tokens";
import { GpsSignalChip } from "./GpsDashboard";
import { Tap } from "./Pressable";
import { T } from "./Text";

type Pt = { lat: number; lon: number };
export type MapPlace = Pt & { id: string; name: string };

/** Zoom the map opens at while following the position: closer on foot, wider on wheels, skis and water. */
export const liveZoom = (sport: string) => (["walk", "run"].includes(GpsEngine.familyOf(sport)) ? 16 : 15);
/** Ground metres per screen pixel at a latitude and zoom (Web Mercator, 256 px tiles). */
export const metresPerPixel = (lat: number, z: number) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
const NICE = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000];
/** The scale bar: the longest round distance that fits in `maxPx`. */
export function scaleBar(lat: number, z: number, maxPx = 96): { metres: number; px: number; label: string } {
  const mpp = metresPerPixel(lat, z);
  const metres = [...NICE].reverse().find((m) => m / mpp <= maxPx) ?? NICE[0]!;
  return { metres, px: Math.max(8, Math.round(metres / mpp)), label: metres >= 1000 ? `${metres / 1000} km` : `${metres} m` };
}

const MAX_DRAWN = 1800;
/** The parts of a line that can be seen: points outside the box (with a margin) are dropped, the line is cut there, and a very
    dense remainder is thinned evenly. Keeps a 12 000-point trace cheap to draw once per second. */
export function visibleRuns<P extends Pt>(segs: P[][], view: MapView, w: number, h: number): P[][] {
  const k = 360 / (TILE * 2 ** view.z), margin = Math.max(w, h);
  const dLon = (w / 2 + margin) * k, dLat = (h / 2 + margin) * k * Math.cos((view.lat * Math.PI) / 180);
  const inside = (p: Pt) => Math.abs(p.lat - view.lat) <= dLat && Math.abs(p.lon - view.lon) <= dLon;
  const runs: P[][] = [];
  for (const s of segs) {
    let run: P[] = [];
    for (let i = 0; i < s.length; i++) {
      const p = s[i]!;
      if (inside(p) || (i > 0 && inside(s[i - 1]!)) || (i + 1 < s.length && inside(s[i + 1]!))) run.push(p);
      else if (run.length) { runs.push(run); run = []; }
    }
    if (run.length) runs.push(run);
  }
  const total = runs.reduce((n, r) => n + r.length, 0);
  if (total <= MAX_DRAWN) return runs;
  const step = Math.ceil(total / MAX_DRAWN);
  return runs.map((r) => r.filter((_, i) => i === 0 || i === r.length - 1 || i % step === 0));
}

export function GpsLiveMap({ segs, planned = null, position = null, moving = false, places = [], sport, basemap, signal = null, mode = "live", height, accessibilityLabel }: {
  segs: Pt[][];
  /** The line to follow (a route, or the way back): amber, thinner, dashed. */
  planned?: Pt[][] | null;
  position?: GpsLive | null;
  /** The course arrow is drawn only while moving: a receiver at rest reports no meaningful course. */
  moving?: boolean;
  places?: MapPlace[];
  sport: string;
  basemap: boolean;
  signal?: GpsSignal | null;
  /** « live » follows the position; « overview » shows the whole outing. */
  mode?: "live" | "overview";
  height?: number;
  accessibilityLabel: string;
}) {
  const [size, setSize] = useState({ w: 328, h: height ?? 280 });
  const [free, setFree] = useState<MapView | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const { w, h } = size;
  const tiles = basemap && tilesConfigured();
  const here = position && Number.isFinite(position.lat) && Number.isFinite(position.lon) ? { lat: position.lat as number, lon: position.lon as number } : null;
  const lastSeg = segs[segs.length - 1];
  const anchor: Pt | null = here ?? lastSeg?.[lastSeg.length - 1] ?? planned?.[0]?.[0] ?? null;
  const fitted = useMemo(() => {
    if (mode !== "overview") return null;
    const pts = [...segs.flat(), ...(planned ?? []).flat()];
    return pts.length ? fitView(pts, w, h, 28) : null;
  }, [mode, segs, planned, w, h]);
  const following = free === null;
  const auto: MapView | null = mode === "overview" ? (fitted ? { ...fitted, z: zoom ?? fitted.z } : null) : anchor ? { lat: anchor.lat, lon: anchor.lon, z: zoom ?? liveZoom(sport) } : null;
  const view = free ?? auto;
  const viewRef = useRef<MapView | null>(view);
  viewRef.current = view;

  const pan = useMemo(() => {
    let last = { x: 0, y: 0 };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 4,
      onPanResponderGrant: () => (last = { x: 0, y: 0 }),
      onPanResponderMove: (_e, g) => {
        const dx = g.dx - last.x, dy = g.dy - last.y;
        if (Math.abs(g.dx) + Math.abs(g.dy) < 4 || !viewRef.current) return;
        last = { x: g.dx, y: g.dy };
        setFree(panBy(viewRef.current, dx, dy));
      },
    });
  }, []);
  const zoomTo = (dz: number) => {
    if (!view) return;
    if (free) setFree(zoomBy(free, dz));
    else setZoom(zoomBy(view, dz).z);
  };

  const drawn = useMemo(() => {
    if (!view) return null;
    const at = (p: Pt) => toScreen(p, view, w, h);
    const line = (s: Pt[]) => s.map((p) => { const q = at(p); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(" ");
    const first = segs.find((s) => s.length)?.[0] ?? null;
    return {
      trace: visibleRuns(segs, view, w, h).map(line),
      plan: planned ? visibleRuns(planned, view, w, h).filter((s) => s.length > 1).map(line) : [],
      start: first ? at(first) : null,
      here: here ? at(here) : null,
      places: places.map((p) => ({ ...p, ...at(p) })).filter((p) => p.x > -12 && p.x < w + 12 && p.y > -12 && p.y < h + 12).slice(0, 40),
    };
  // `here` is rebuilt at every render: its coordinates are what matters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.lat, view?.lon, view?.z, w, h, segs, planned, places, here?.lat, here?.lon]);

  const bar = view ? scaleBar(view.lat, view.z) : null;
  const mpp = view ? metresPerPixel(view.lat, view.z) : 1;
  const accR = here && position && Number.isFinite(position.acc) && (position.acc as number) > 0 ? Math.min(Math.max(w, h), Math.max(10, (position.acc as number) / mpp)) : 0;
  const hdg = moving && position && position.hdg !== null && position.hdg !== undefined && Number.isFinite(position.hdg) ? (position.hdg * Math.PI) / 180 : null;
  const arrow = (c: { x: number; y: number }, a: number) => {
    const tip = { x: c.x + Math.sin(a) * 22, y: c.y - Math.cos(a) * 22 };
    const l = { x: c.x + Math.sin(a - 0.5) * 12, y: c.y - Math.cos(a - 0.5) * 12 }, r = { x: c.x + Math.sin(a + 0.5) * 12, y: c.y - Math.cos(a + 0.5) * 12 };
    return `${tip.x.toFixed(1)},${tip.y.toFixed(1)} ${l.x.toFixed(1)},${l.y.toFixed(1)} ${r.x.toFixed(1)},${r.y.toFixed(1)}`;
  };
  // A subtle grid that moves with the map, so a drag is visible even on an empty ground.
  const grid = useMemo(() => {
    if (tiles || !view) return [] as { key: string; x1: number; y1: number; x2: number; y2: number }[];
    const origin = toScreen({ lat: 0, lon: 0 }, view, w, h), step = 64, out = [];
    for (let x = ((origin.x % step) + step) % step; x < w; x += step) out.push({ key: `v${Math.round(x)}`, x1: x, y1: 0, x2: x, y2: h });
    for (let y = ((origin.y % step) + step) % step; y < h; y += step) out.push({ key: `h${Math.round(y)}`, x1: 0, y1: y, x2: w, y2: y });
    return out;
  }, [tiles, view, w, h]);

  return (
    <View style={[styles.box, height ? { height } : { flex: 1, minHeight: 160 }]} onLayout={(e) => setSize({ w: Math.max(120, Math.round(e.nativeEvent.layout.width)), h: Math.max(120, Math.round(e.nativeEvent.layout.height)) })} testID="gps-map">
      <View style={StyleSheet.absoluteFill} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} testID="gps-map-surface" {...pan.panHandlers}>
        {tiles && view ? tilesFor(view, w, h).map((t) => <Image key={t.key} source={{ uri: tileUrl(t) }} style={{ position: "absolute", left: t.left, top: t.top, width: TILE, height: TILE }} />) : null}
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          {grid.map((g) => <Line key={g.key} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke={colors.line} strokeWidth={1} />)}
          {drawn?.plan.map((p, i) => <Polyline key={`p${i}`} points={p} fill="none" stroke={colors.am} strokeWidth={3} strokeDasharray="8 6" strokeLinejoin="round" strokeLinecap="round" />)}
          {drawn?.trace.map((p, i) => <Polyline key={`t${i}`} points={p} fill="none" stroke={colors.cy} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />)}
          {drawn?.places.map((p) => <Polygon key={p.id} points={`${p.x},${p.y - 7} ${p.x + 7},${p.y} ${p.x},${p.y + 7} ${p.x - 7},${p.y}`} fill={colors.tx} stroke={colors.bg} strokeWidth={2} />)}
          {drawn?.start ? <Circle cx={drawn.start.x} cy={drawn.start.y} r={7} fill={colors.ok} stroke={colors.bg} strokeWidth={2} /> : null}
          {drawn?.here ? (
            <>
              {accR ? <Circle cx={drawn.here.x} cy={drawn.here.y} r={accR} fill={colors.cySoft} stroke={colors.cyLine} strokeWidth={1} /> : null}
              {hdg !== null ? <Polygon points={arrow(drawn.here, hdg)} fill={colors.tx} stroke={colors.bg} strokeWidth={1.5} /> : null}
              <Circle cx={drawn.here.x} cy={drawn.here.y} r={8} fill={colors.tx} stroke={colors.cy} strokeWidth={4} />
            </>
          ) : null}
        </Svg>
        {!view ? (
          <View style={styles.empty}>
            <T tone="muted" center>La carte s’affichera dès la première position fiable.</T>
          </View>
        ) : null}
      </View>
      {signal ? <View style={styles.topLeft} pointerEvents="none"><GpsSignalChip signal={signal} solid /></View> : null}
      {view ? (
        <View style={styles.right}>
          <MapButton label="+" hint="Zoom avant" disabled={view.z >= MAX_ZOOM} onPress={() => zoomTo(1)} testID="gps-map-zoom-in" />
          <MapButton label="−" hint="Zoom arrière" disabled={view.z <= MIN_ZOOM} onPress={() => zoomTo(-1)} testID="gps-map-zoom-out" />
        </View>
      ) : null}
      {view && !following ? (
        <Tap onPress={() => setFree(null)} accessibilityLabel={mode === "live" ? "Recentrer la carte sur ta position" : "Recentrer la carte sur la sortie"} style={styles.recenter} testID="gps-map-recenter">
          <T variant="caption" color={colors.cyInk}>Recentrer</T>
        </Tap>
      ) : null}
      <View style={styles.bottomLeft} pointerEvents="none">
        {bar ? (
          <View accessible accessibilityRole="text" accessibilityLabel={`Échelle : ${bar.label}`} testID="gps-map-scale">
            <T variant="caption" color={colors.tx}>{bar.label}</T>
            <View style={[styles.scale, { width: bar.px }]} />
          </View>
        ) : null}
        <T variant="caption" tone="faint" style={styles.note}>{tiles ? TILES_ATTRIBUTION : "Fond neutre : trace et position seulement"}</T>
      </View>
    </View>
  );
}

function MapButton({ label, hint, onPress, disabled, testID }: { label: string; hint: string; onPress: () => void; disabled?: boolean; testID: string }) {
  return (
    <Tap onPress={onPress} disabled={disabled} accessibilityLabel={hint} style={styles.button} testID={testID}>
      <T variant="h3" color={colors.tx} accessibilityRole="none">{label}</T>
    </Tap>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.r3, overflow: "hidden", backgroundColor: colors.bg1, borderWidth: 1, borderColor: colors.line },
  empty: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", padding: space.s5 },
  topLeft: { position: "absolute", left: space.s2, top: space.s2 },
  right: { position: "absolute", right: space.s2, top: space.s2, gap: space.s2 },
  button: { width: TOUCH, height: TOUCH, borderRadius: radius.r2, backgroundColor: "rgba(19,25,32,0.92)", borderWidth: 1, borderColor: colors.line2, alignItems: "center", justifyContent: "center" },
  recenter: { position: "absolute", right: space.s2, bottom: space.s2, minHeight: TOUCH, paddingHorizontal: space.s4, borderRadius: radius.r2, backgroundColor: colors.cy, alignItems: "center", justifyContent: "center" },
  bottomLeft: { position: "absolute", left: space.s2, bottom: space.s2, right: 132, gap: 4 },
  scale: { height: 4, borderLeftWidth: 2, borderRightWidth: 2, borderBottomWidth: 2, borderColor: colors.tx, marginTop: 2 },
  note: { backgroundColor: "rgba(9,12,16,0.72)", alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.r1 },
});
