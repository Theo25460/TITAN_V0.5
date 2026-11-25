import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, PanResponder, View } from "react-native";
import Svg, { Circle, Polyline, Rect } from "react-native-svg";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Alert } from "../../components/Dialog";
import { Field } from "../../components/Field";
import { Tap } from "../../components/Pressable";
import { Sheet } from "../../components/Sheet";
import { SportChip } from "../../components/SportPicker";
import { ToggleRow } from "../../components/Toggle";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { ErrorState, LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Format, GpsEngine, GpsNav, GpsSession, Sports, type NavEncoded, type NavRoute } from "../../core";
import * as api from "../../data/api";
import { useOwner } from "../../data/auth";
import { errorMessage, isNetworkError } from "../../lib/errors";
import { shareTextFile } from "../../lib/exportFile";
import { decodeTrack, projectTrack, toGpx, trimEnds, type Track } from "../../lib/gpsTrack";
import { isOnline, useOnline } from "../../lib/network";
import { addPlace } from "../../lib/places";
import { fetchPois, POI_ALONG_M, POI_KINDS, POI_STATES, poiAsPlace, poisAlong, poiSourceLine, readPoiCache, thinRoute, writePoiCache, type Poi, type PoiAnswer, type PoiFailure } from "../../lib/poi";
import {
  addToLibrary, APPROX_TIME_NOTE, cleanRouteName, compareCandidates, compareOnCourse, currentRouteId, discardLibraryRoute, figuresOf, flushLibraryRoutes, isServerRouteId, listOfflineRoutes, loadRouteForFollow,
  pendingLibraryRoutes, removeRouteOffline, renamePendingLibraryRoute, routeNotes, routeToTrack, saveRouteOffline, setRouteNote,
  type CompareMeta, type CourseComparison, type OfflineRouteMeta, type PendingLibraryRoute, type RouteNote,
} from "../../lib/routeLibrary";
import { fitView, panBy, TILE, TILES_ATTRIBUTION, tilesConfigured, tilesFor, tileUrl, toScreen, zoomBy, type View as MapViewState } from "../../lib/tiles";
import { readJSON, writeJSON } from "../../lib/storage";
import { discardPendingRoute, newRouteId, pendingRoutes } from "../../lib/routeSync";
import type { RootParams } from "../../navigation/types";
import { colors, familyColors, radius, space } from "../../theme/tokens";
import { PoiRows } from "./PlacesScreen";

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
    <View style={{ borderRadius: radius.r3, overflow: "hidden", backgroundColor: colors.bg2 }}>
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

/** Server-side limit of the private route library. */
const ROUTE_LIMIT = 200;
const GPX_MAX_BYTES = 15 * 1024 * 1024;
export const NAME_KEPT_ON_PHONE = "Nom gardé sur ce téléphone en attendant la mise à jour du serveur";
const FULL_LIBRARY = `Bibliothèque pleine : ${ROUTE_LIMIT} parcours. Supprime un parcours pour que le suivant puisse être enregistré.`;
type Origin = api.RouteOrigin;
const ORIGINS: Record<Origin, string> = { recorded: "Enregistré", imported: "Importé", planned: "Planifié" };
const originOf = (o: string | null | undefined): Origin => (o === "imported" || o === "planned" ? o : "recorded");
/** A library route as the screens read it: the phone's notes (a name or an origin the server cannot keep yet) already applied. */
export type LibraryRow = Omit<api.LibraryRoute, "origin"> & { origin: Origin; title: string; /** the name lives on this phone only, for now */ nameOnPhone: boolean };
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const titleOf = (r: { name?: string | null; sport: string; startedAt?: string | null }) => r.name?.trim() || `${Sports.label(r.sport)}${r.startedAt ? ` · ${when(r.startedAt)}` : ""}`;
const km = (m: number) => Format.distance(m / 1000);
export const libraryKey = (o: string) => [...routeKey(o), "library"] as const;
const localKey = (o: string) => ["routes-local", o] as const;

function asRow(r: api.LibraryRoute, note: RouteNote | undefined): LibraryRow {
  const noted = !!note?.name && (note.unsent === true || !r.name);
  const name = noted ? note!.name! : r.name;
  return { ...r, name, origin: note?.origin ?? originOf(r.origin), title: titleOf({ ...r, name }), nameOnPhone: noted };
}
/** The library with the phone's notes applied. A name that waited on the phone leaves for the account as soon as the server can keep it. */
export async function loadLibrary(owner: string): Promise<{ routes: LibraryRow[]; legacy: boolean }> {
  const { routes, legacy } = await api.routesLibrary(owner);
  const notes = await routeNotes(owner).catch(() => ({}) as Record<string, RouteNote>);
  if (!legacy) {
    for (const r of routes) {
      const note = notes[r.id];
      if (!note?.name || note.name === r.name || !(note.unsent || !r.name)) continue;
      try {
        if ((await api.routeRename(owner, r.id, note.name)) !== "server") continue;
        r.name = note.name;
        notes[r.id] = { origin: note.origin };
        await setRouteNote(owner, r.id, { name: undefined, unsent: undefined });
      } catch { /* the name stays noted on the phone and is tried again at the next reading */ }
    }
  }
  return { routes: routes.map((r) => asRow(r, notes[r.id])), legacy };
}
/** Sends the imported and planned routes that wait on this phone (nothing without a network), then refreshes what the lists read. */
export async function sendLibrary(owner: string, qc?: QueryClient): Promise<{ sent: number; left: number; legacy: boolean } | null> {
  if (!isOnline()) return null;
  const result = await flushLibraryRoutes(owner, (r) => api.routeSaveV2(owner, r)).catch(() => null);
  if (qc && result && (result.sent || result.left)) {
    if (result.sent) qc.invalidateQueries({ queryKey: routeKey(owner) });
    qc.invalidateQueries({ queryKey: localKey(owner) });
  }
  return result;
}
/** What the athlete reads after a route was put in the library, whatever the network and the server could do. */
export function savedToast(sent: { sent: number; legacy: boolean } | null): { kind: "ok" | "info"; title: string; message?: string } {
  if (sent?.sent && sent.legacy) return { kind: "info", title: "Parcours enregistré", message: `${NAME_KEPT_ON_PHONE}.` };
  if (sent?.sent) return { kind: "ok", title: "Parcours enregistré dans Mes parcours" };
  return { kind: "info", title: "Parcours enregistré sur ce téléphone", message: "Tu peux déjà le suivre. Il rejoindra ta bibliothèque en ligne à la prochaine connexion." };
}
const saveFailure = (e: unknown) => {
  const code = String((e as Error)?.message ?? "");
  return code === "ROUTE_OUTBOX_FULL" ? "Trop de parcours attendent déjà d’être envoyés. Connecte-toi à Internet, puis réessaie : la copie pour le suivi est gardée sur ce téléphone."
    : code === "ROUTE_TOO_LONG" ? "Ce parcours dépasse 2 000 km : il ne peut pas entrer dans la bibliothèque. Tu peux le suivre sans l’enregistrer."
    : code === "ROUTE_NAME" ? "Donne un nom à ce parcours (1 à 80 caractères)."
    : "Le parcours n’a pas pu être enregistré sur ce téléphone. Réessaie.";
};

const COMMON_GPS_SPORTS = ["running", "trail", "walking", "hiking", "cycling", "cycling_road", "gravel", "mountain_bike"];
/** The sport of an outing that follows a route: only sports the GPS records. */
export function GpsSportPicker({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const wide = all || (!!value && !COMMON_GPS_SPORTS.includes(value));
  return (
    <View style={{ gap: space.s2 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2 }}>
        {(wide ? GpsEngine.GPS_SPORTS : COMMON_GPS_SPORTS).map((id) => <SportChip key={id} id={id} selected={value === id} onPress={() => onChange(id)} testID={`gps-sport-${id}`} />)}
      </View>
      {wide ? null : <Button small kind="ghost" label="Autres sports GPS" onPress={() => setAll(true)} testID="gps-sport-more" />}
    </View>
  );
}

type Picked = { ok: true; text: string; name: string } | { ok: false; reason: string } | null;
/** Lets the athlete choose a file and reads it, refusing one over 15 MB before it is read. Null when nothing was chosen. */
async function pickGpxFile(): Promise<Picked> {
  const pick = await DocumentPicker.getDocumentAsync({ type: ["application/gpx+xml", "application/xml", "text/xml", "application/octet-stream"], copyToCacheDirectory: true });
  if (pick.canceled || !pick.assets?.[0]) return null;
  const file = pick.assets[0];
  try {
    // Some document providers give no size: the cached copy is measured instead, so a huge file is refused before it is read.
    const size = file.size ?? (await FileSystem.getInfoAsync(file.uri).then((info) => (info.exists ? info.size : null)).catch(() => null));
    if (size == null) return { ok: false, reason: "TITAN n’a pas pu vérifier la taille de ce fichier. Copie-le sur ton téléphone, puis réessaie." };
    if (size > GPX_MAX_BYTES) return { ok: false, reason: "Le GPX doit faire moins de 15 Mo." };
    return { ok: true, text: await FileSystem.readAsStringAsync(file.uri), name: String(file.name ?? "") };
  } finally {
    // DocumentPicker makes its own cache copy. Never delete the source supplied by a document provider.
    if (FileSystem.cacheDirectory && file.uri.startsWith(`${FileSystem.cacheDirectory}DocumentPicker/`)) void FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => {});
  }
}
type GpxFacts = { points: number; ignoredPoints: number; segments: number; hasAltitude: boolean; cut: number };
type ImportState = null | { step: "reading" } | { step: "error"; reason: string } | { step: "preview"; route: NavRoute; facts: GpxFacts };

/** The athlete's private route library. Nothing here is shared with anyone. */
export function RoutesScreen({ navigation, route }: NativeStackScreenProps<RootParams, "Routes">) {
  const owner = useOwner();
  const toast = useToast();
  const qc = useQueryClient();
  const online = useOnline();
  const [exporting, setExporting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const q = useQuery({ queryKey: libraryKey(owner), queryFn: () => loadLibrary(owner) });
  const waiting = useQuery({ queryKey: ["routes-outbox", owner], queryFn: () => pendingRoutes(owner) });
  const local = useQuery({ queryKey: localKey(owner), queryFn: async () => ({ pending: await pendingLibraryRoutes(owner), copies: await listOfflineRoutes(owner) }) });
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // Coming (back) to the library: what waits on the phone is sent, then the lists are read again.
  const refetchAll = useRef(() => {});
  refetchAll.current = () => { q.refetch(); waiting.refetch(); local.refetch(); };
  useEffect(() => {
    let last = Date.now();
    void sendLibrary(owner, qc);
    return navigation?.addListener?.("focus", () => {
      if (Date.now() - last < 1500) return;
      last = Date.now();
      refetchAll.current();
      void sendLibrary(owner, qc);
    });
  }, [navigation, owner, qc]);

  /* ---- Import of a GPX file: read, previewed, then an explicit choice ---- */
  const [imp, setImp] = useState<ImportState>(null);
  const [impName, setImpName] = useState("");
  const [impSport, setImpSport] = useState<string | null>(null);
  const [impError, setImpError] = useState<string | null>(null);
  const [impBusy, setImpBusy] = useState(false);
  const importGpx = useCallback(async () => {
    setImpError(null);
    let picked: Picked;
    try {
      picked = await pickGpxFile();
    } catch {
      picked = { ok: false, reason: "Le fichier n’a pas pu être lu. Réessaie." };
    }
    if (!picked || !mounted.current) return;
    if (!picked.ok) return setImp({ step: "error", reason: picked.reason });
    setImp({ step: "reading" });
    // The analysis is synchronous: let « Lecture du fichier… » reach the screen before it starts.
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (!mounted.current) return;
    let read: ReturnType<typeof GpsNav.importGpx>;
    try {
      read = GpsNav.importGpx(picked.text, (globalThis as unknown as { TitanGpx: unknown }).TitanGpx);
    } catch {
      read = { ok: false, error: "Ce fichier GPX est incomplet ou non pris en charge." };
    }
    if (!read.ok) return setImp({ step: "error", reason: read.error });
    setImpName(cleanRouteName(read.route.name || picked.name.replace(/\.gpx$/i, "")));
    setImpSport(null);
    // Thinned to what a stored route may hold (3 000 points): the same line is previewed, followed and saved.
    setImp({ step: "preview", route: GpsNav.fit(read.route), facts: read.facts });
  }, []);
  const wantsImport = route?.params?.importGpx === true;
  useEffect(() => {
    if (!wantsImport) return;
    navigation?.setParams?.({ importGpx: undefined });
    void importGpx();
  }, [wantsImport, navigation, importGpx]);
  const finishImport = async (follow: boolean) => {
    if (imp?.step !== "preview" || impBusy) return;
    const name = cleanRouteName(impName);
    if (!name) return setImpError("Donne un nom à ce parcours (1 à 80 caractères).");
    if (!impSport) return setImpError("Choisis le sport de ce parcours.");
    setImpBusy(true);
    setImpError(null);
    try {
      if (follow) {
        // Followed without entering the library: the copy on this phone is all there is, and the outing reads it from there.
        const id = newRouteId();
        await saveRouteOffline(owner, id, { ...imp.route, name, sport: impSport, origin: "imported" });
        setImp(null);
        local.refetch();
        navigation.navigate("GpsRecord", { sport: impSport, follow: id });
      } else {
        await addToLibrary(owner, imp.route, { name, sport: impSport, origin: "imported" });
        setImp(null);
        local.refetch();
        toast(savedToast(await sendLibrary(owner, qc)));
      }
    } catch (e) {
      if (mounted.current) setImpError(saveFailure(e));
    } finally {
      if (mounted.current) setImpBusy(false);
    }
  };

  const pendingLib = local.data?.pending ?? [];
  const pendingIds = new Set(pendingLib.map((p) => p.clientRouteId));
  const copies = (local.data?.copies ?? []).filter((c) => !pendingIds.has(c.id));
  const hasLocal = !!waiting.data?.length || pendingLib.length > 0 || copies.length > 0;
  // No answer from the library and nothing read before: the phone shows what it holds itself.
  const offlineMode = !!q.error && !q.data;
  const network = offlineMode && (!online || isNetworkError(q.error));
  if (q.isLoading && !q.data && !hasLocal) return <Screen><LoadingCards count={2} /></Screen>;
  if (offlineMode && !network && !hasLocal) return <Screen><ErrorState error={q.error} onRetry={() => refetchAll.current()} /></Screen>;
  const list = q.data?.routes ?? [];
  const needle = fold(search.trim());
  const shown = needle ? list.filter((r) => fold(r.title).includes(needle) || fold(Sports.label(r.sport)).includes(needle)) : list;
  // Copies that exist on this phone only (a file followed without being saved); offline, every copy is listed.
  const phoneCopies = offlineMode ? copies : copies.filter((c) => !isServerRouteId(c.id));
  // The server keeps at most 200 routes per account (migration 20261102120000_routes.sql): a full library is said as such, with the way out.
  const libraryFull = list.length >= ROUTE_LIMIT;
  const nothing = !offlineMode && list.length === 0 && !hasLocal;
  const copyCard = (c: OfflineRouteMeta) => (
    <Card key={c.id} onPress={() => navigation.navigate("Route", { id: c.id })} accessibilityLabel={`${titleOf({ name: c.name, sport: c.sport ?? "running" })}, ${km(c.distanceM)}`} testID={`copy-${c.id}`} style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.s2 }}>
        <T variant="bodyStrong" style={{ flex: 1 }}>{c.name || (c.sport ? Sports.label(c.sport) : "Parcours")}</T>
        <Chip label={ORIGINS[originOf(c.origin)]} />
      </View>
      <T variant="small" tone="muted">{km(c.distanceM)}{c.ascentM !== null ? ` · D+ ${c.ascentM} m` : ""}{c.sport ? ` · ${Sports.label(c.sport)}` : ""}</T>
    </Card>
  );
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => { refetchAll.current(); void sendLibrary(owner, qc); }}>
      <T variant="eyebrow" tone="accent">Mes parcours</T>
      <T tone="muted">Tes traces GPS, gardées pour toi seul. Elles ne sont jamais partagées ni publiées, et se suppriment une par une.</T>
      <View style={{ gap: space.s2 }}>
        <Button icon="upload" label="Importer un GPX" loading={imp?.step === "reading"} onPress={importGpx} testID="routes-import" />
        <View style={{ flexDirection: "row", gap: space.s2 }}>
          <Button small kind="secondary" icon="route" label="Créer un parcours" onPress={() => navigation.navigate("RoutePlanner")} style={{ flex: 1 }} testID="routes-plan" />
          <Button small kind="secondary" icon="pin" label="Mes points" onPress={() => navigation.navigate("Places")} style={{ flex: 1 }} testID="routes-places" />
        </View>
      </View>
      {network ? <T tone="warn" accessibilityRole="alert" testID="routes-offline">Hors ligne : parcours enregistrés sur ce téléphone</T>
        : q.error ? <T tone="warn">La bibliothèque en ligne est indisponible. Tes parcours en attente restent sur ce téléphone.</T> : null}
      {offlineMode ? <Button small kind="secondary" icon="restore" label="Réessayer" onPress={() => refetchAll.current()} testID="routes-retry" /> : null}
      {libraryFull ? <T variant="small" tone="warn" accessibilityRole="alert" testID="routes-full">{FULL_LIBRARY}</T> : null}
      {list.length > 0 ? <Field value={search} onChangeText={setSearch} placeholder="Chercher un parcours par son nom" accessibilityLabel="Chercher un parcours par son nom" autoCorrect={false} returnKeyType="search" testID="routes-search" /> : null}
      {waiting.data?.length ? <T variant="small" tone="warn">{waiting.data.length} parcours en attente d’envoi. Ils restent sur ce téléphone jusqu’à confirmation du serveur.</T> : null}
      {waiting.data?.map((r) => (
        <Card key={r.clientRouteId}>
          <T variant="bodyStrong">{Sports.label(r.sport)} · {when(r.startedAt)}</T>
          <T variant="small" tone={r.rejected ? "warn" : "muted"}>{r.rejected && libraryFull ? `Ta bibliothèque est pleine (${ROUTE_LIMIT} parcours) : supprime un parcours ci-dessous, l’envoi reprendra tout seul. En attendant, garde une copie GPX.` : r.rejected ? "Envoi refusé : la trace est conservée. Garde une copie GPX avant de contacter l’assistance." : "Envoi à réessayer. Tu peux déjà garder une copie GPX."}</T>
          <Button small kind="secondary" label="Exporter le parcours en attente" testID={`pending-export-${r.clientRouteId}`} loading={exporting === r.clientRouteId} onPress={async () => {
            if (exporting) return;
            setExporting(r.clientRouteId);
            try {
              await shareTextFile(`titan-${r.sport}-${r.startedAt.slice(0, 10)}.gpx`, toGpx(decodeTrack(r.track), Sports.label(r.sport)), "application/gpx+xml");
            } catch {
              toast({ kind: "err", title: "Export impossible", message: "Ta trace reste conservée. Réessaie dans un instant." });
            } finally { setExporting(null); }
          }} />
          <Button small kind="ghost" label="Retirer de ce téléphone" testID={`pending-discard-${r.clientRouteId}`} disabled={!!exporting} onPress={() => Alert.alert(
            "Retirer ce parcours en attente ?",
            "La trace est effacée de ce téléphone et ne sera jamais envoyée. La séance reste dans ton journal. Exporte une copie GPX avant si tu veux la garder.",
            [
              { text: "Annuler", style: "cancel" },
              { text: "Retirer", style: "destructive", onPress: async () => {
                try {
                  await discardPendingRoute(owner, r.clientRouteId);
                  await waiting.refetch();
                  toast({ kind: "ok", title: "Parcours retiré de ce téléphone" });
                } catch {
                  toast({ kind: "err", title: "Retrait impossible", message: "La trace reste conservée. Réessaie dans un instant." });
                }
              } },
            ],
          )} />
        </Card>
      ))}
      {pendingLib.map((p: PendingLibraryRoute) => (
        <Card key={p.clientRouteId} onPress={() => navigation.navigate("Route", { id: p.clientRouteId })} accessibilityLabel={`${p.name}, ${km(p.distanceM)}, en attente d’envoi`} testID={`waiting-${p.clientRouteId}`} style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.s2 }}>
            <T variant="bodyStrong" style={{ flex: 1 }}>{p.name}</T>
            <Chip label={ORIGINS[p.origin]} />
          </View>
          <T variant="small" tone="muted">{km(p.distanceM)}{p.ascentM !== null ? ` · D+ ${p.ascentM} m` : ""} · {Sports.label(p.sport)}</T>
          <T variant="small" tone="warn">{p.rejected && p.reason === "ROUTE_LIMIT" ? `Ta bibliothèque est pleine (${ROUTE_LIMIT} parcours) : supprime un parcours, l’envoi reprendra tout seul. Il reste utilisable sur ce téléphone.`
            : p.rejected ? "Envoi refusé par le serveur : ce parcours reste utilisable sur ce téléphone, sans rejoindre ta bibliothèque en ligne."
            : "En attente d’envoi : déjà utilisable sur ce téléphone."}</T>
        </Card>
      ))}
      {nothing ? (
        <Card>
          <T variant="bodyStrong">Aucun parcours pour le moment</T>
          <T variant="small" tone="muted">Enregistre une sortie GPS, importe un GPX ou crée un parcours</T>
        </Card>
      ) : (
        shown.map((r) => (
          <Card key={r.id} onPress={() => navigation.navigate("Route", { id: r.id })} accessibilityLabel={`${r.title}, ${ORIGINS[r.origin]}, ${km(r.distanceM)}`} testID={`route-${r.id}`} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.s2 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: familyColors[Sports.familyOf(r.sport)] ?? colors.cy }} />
              <T variant="bodyStrong" style={{ flex: 1 }}>{r.title}</T>
              <Chip label={ORIGINS[r.origin]} />
            </View>
            <T variant="small" tone="muted">
              {km(r.distanceM)}
              {r.origin === "recorded" && r.durationS > 0 ? ` · ${dur(r.durationS)}` : ""}
              {r.ascentM ? ` · D+ ${r.ascentM} m` : ""}
              {` · ${Sports.label(r.sport)}`}
              {r.name ? ` · ${when(r.startedAt)}` : ""}
            </T>
            {r.nameOnPhone ? <T variant="caption" tone="faint">{NAME_KEPT_ON_PHONE}</T> : null}
          </Card>
        ))
      )}
      {needle && list.length > 0 && shown.length === 0 ? <T variant="small" tone="muted" testID="routes-no-match">Aucun parcours ne porte ce nom.</T> : null}
      {phoneCopies.length ? (
        <View style={{ gap: space.s3 }}>
          <T variant="eyebrow">{offlineMode ? "Copies gardées sur ce téléphone" : "Sur ce téléphone seulement"}</T>
          {offlineMode ? null : <T variant="small" tone="muted">Des parcours suivis sans être enregistrés dans ta bibliothèque. Ouvre-en un pour l’y ajouter ou supprimer sa copie.</T>}
          {phoneCopies.map(copyCard)}
        </View>
      ) : offlineMode && !hasLocal ? <T variant="small" tone="muted">Aucun parcours n’est gardé sur ce téléphone. Une fois en ligne, ouvre un parcours : il sera copié ici pour être suivi sans réseau.</T> : null}

      <Sheet visible={imp?.step === "error" || imp?.step === "preview"} onClose={() => { if (!impBusy) setImp(null); }} title={imp?.step === "error" ? "GPX illisible" : "Aperçu du GPX"}>
        {imp?.step === "error" ? (
          <>
            <T accessibilityRole="alert" testID="import-error">{imp.reason}</T>
            <T variant="small" tone="muted">Rien n’a été enregistré. Tu peux choisir un autre fichier.</T>
            <Button kind="secondary" label="Choisir un autre fichier" onPress={() => { setImp(null); void importGpx(); }} />
            <Button kind="ghost" label="Annuler" onPress={() => setImp(null)} testID="import-cancel" />
          </>
        ) : imp?.step === "preview" ? (
          <>
            <RouteMap track={routeToTrack(imp.route)} height={180} accessibilityLabel={`Aperçu de la trace, ${km(imp.route.distanceM)}`} />
            <View style={{ gap: 2 }} testID="import-facts">
              <T variant="bodyStrong">Distance : {km(imp.route.distanceM)}</T>
              <T variant="small" tone="muted">{imp.facts.hasAltitude && imp.route.ascentM !== null ? `Dénivelé positif : ${imp.route.ascentM} m` : "Dénivelé : non calculable, le fichier n’a pas d’altitude partout"}</T>
              <T variant="small" tone="muted">{imp.facts.points} point{imp.facts.points > 1 ? "s" : ""} lu{imp.facts.points > 1 ? "s" : ""}, {imp.facts.ignoredPoints} ignoré{imp.facts.ignoredPoints > 1 ? "s" : ""}{imp.route.points < imp.facts.points ? ` · tracé allégé à ${imp.route.points} points` : ""}</T>
              <T variant="small" tone="muted">{imp.facts.segments} tronçon{imp.facts.segments > 1 ? "s" : ""}{imp.facts.segments > 1 ? " : ils ne sont pas reliés par une ligne inventée" : ""}{imp.facts.cut > 0 ? ` · ${imp.facts.cut} coupure${imp.facts.cut > 1 ? "s" : ""} ajoutée${imp.facts.cut > 1 ? "s" : ""} (saut de plus de 5 km)` : ""}</T>
            </View>
            <Field label="Nom du parcours" value={impName} onChangeText={(v) => { setImpName(v); setImpError(null); }} maxLength={80} placeholder="Tour du lac" testID="import-name" />
            <T variant="caption" tone="muted">Sport</T>
            <GpsSportPicker value={impSport} onChange={(id) => { setImpSport(id); setImpError(null); }} />
            {impError ? <T variant="small" tone="err" accessibilityRole="alert" testID="import-problem">{impError}</T> : null}
            {libraryFull
              ? <T variant="small" tone="warn">{FULL_LIBRARY} Tu peux quand même suivre ce parcours maintenant.</T>
              : <Button icon="check" label="Enregistrer dans Mes parcours" loading={impBusy} onPress={() => finishImport(false)} testID="import-save" />}
            <Button kind="secondary" icon="play" label="Suivre maintenant" disabled={impBusy} onPress={() => finishImport(true)} testID="import-follow" />
            <Button kind="ghost" label="Annuler" disabled={impBusy} onPress={() => setImp(null)} testID="import-cancel" />
            <T variant="caption" tone="faint">Le fichier reste sur ton téléphone et, si tu l’enregistres, sur ton compte, en privé. Suivre un tracé est une indication : il ne dit rien de l’état des chemins.</T>
          </>
        ) : null}
      </Sheet>
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

type Detail = {
  id: string; /** "phone": read from the copy kept here (the server does not have it, or could not be reached: `stale`) */ source: "server" | "phone"; stale: boolean; pending: boolean;
  sport: string; startedAt: string | null; distanceM: number; durationS: number; ascentM: number | null; name: string; nameOnPhone: boolean; origin: Origin; summary: api.RouteSummary | null;
  nav: NavRoute; track: Track;
};
/** One route, from the account when it can be read, else from the copy kept on this phone (a route followed offline stays readable). */
async function loadDetail(owner: string, asked: string): Promise<Detail> {
  const id = await currentRouteId(owner, asked).catch(() => asked);
  const fromPhone = async (stale: boolean): Promise<Detail | null> => {
    const local = await loadRouteForFollow(owner, id);
    if (!local) return null;
    const pending = (await pendingLibraryRoutes(owner).catch(() => [])).some((p) => p.clientRouteId === id);
    return { id, source: "phone", stale, pending, sport: local.sport ?? "running", startedAt: null, distanceM: local.distanceM, durationS: 0, ascentM: local.ascentM, name: local.name ?? "", nameOnPhone: false,
      origin: originOf(local.origin), summary: null, nav: local, track: routeToTrack(local) };
  };
  if (!isServerRouteId(id)) {
    const d = await fromPhone(false);
    if (!d) throw Object.assign(new Error("ROUTE_NOT_ON_PHONE"), { code: "ROUTE_NOT_ON_PHONE" });
    return d;
  }
  try {
    const r = await api.routeGetV2(owner, id);
    const row = asRow(r, (await routeNotes(owner).catch(() => ({}) as Record<string, RouteNote>))[id]);
    const nav = GpsNav.decode(r.track as NavEncoded, { name: row.name ?? "", sport: r.sport, origin: row.origin });
    if (!nav) throw new Error("BAD_TRACK");
    return { id, source: "server", stale: false, pending: false, sport: r.sport, startedAt: r.startedAt, distanceM: r.distanceM, durationS: r.durationS, ascentM: r.ascentM, name: row.name ?? "", nameOnPhone: row.nameOnPhone,
      origin: row.origin, summary: r.summary, nav, track: decodeTrack(r.track) };
  } catch (e) {
    const d = await fromPhone(true);
    if (!d) throw e;
    return d;
  }
}
const slug = (s: string) => fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "parcours";
const metaOf = (d: Detail): CompareMeta => ({ id: d.id, sport: d.sport, startedAt: d.startedAt ?? "", distanceM: d.distanceM, durationS: d.durationS, ascentM: d.ascentM, origin: d.origin, name: d.name, summary: d.summary });
const speedText = (sport: string, distanceM: number, seconds: number) =>
  Sports.paceMode(sport) === "pace" ? Format.pace(distanceM / 1000, seconds / 60) : `${((distanceM / seconds) * 3.6).toFixed(1).replace(".", ",")} km/h`;
type Compare = { state: "idle" } | { state: "running"; done: number; total: number } | { state: "done"; result: CourseComparison } | { state: "failed" };

export function RouteDetailScreen({ navigation, route }: NativeStackScreenProps<RootParams, "Route">) {
  const owner = useOwner();
  const qc = useQueryClient();
  const toast = useToast();
  const asked = route.params.id;
  const q = useQuery({ queryKey: [...routeKey(owner), "detail", asked], queryFn: () => loadDetail(owner, asked) });
  const d = q.data;
  const [busy, setBusy] = useState(false);
  const [basemap, setBasemap] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => {
    readJSON<boolean>("titan.basemap.v1", false).then(setBasemap);
  }, []);

  /* ---- The copy on this phone: made when the route is opened, so it can be followed without a network ---- */
  const [copy, setCopy] = useState<OfflineRouteMeta | null>(null);
  const keptOff = useRef(false);
  useEffect(() => {
    if (!d) return;
    let live = true;
    (async () => {
      let meta = (await listOfflineRoutes(owner)).find((m) => m.id === d.id) ?? null;
      // Never again in this view once the athlete removed the copy by hand.
      if (!meta && d.source === "server" && !keptOff.current) meta = await saveRouteOffline(owner, d.id, d.nav).catch(() => null);
      if (live) setCopy(meta);
    })().catch(() => {});
    return () => { live = false; };
  }, [d, owner]);

  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [followSport, setFollowSport] = useState<string | null | undefined>(undefined);
  const [cmp, setCmp] = useState<Compare>({ state: "idle" });
  const stop = useRef(false);
  const [others, setOthers] = useState<LibraryRow[] | null>(null);
  const [versus, setVersus] = useState<LibraryRow | null>(null);
  const [poi, setPoi] = useState<{ answer: PoiAnswer; cached: boolean } | null>(null);
  const [poiFailure, setPoiFailure] = useState<PoiFailure | null>(null);
  const [poiBusy, setPoiBusy] = useState(false);
  const [savedPois, setSavedPois] = useState<Set<string>>(new Set());
  const cacheSlot = d ? `route:${d.id}` : null;
  useEffect(() => {
    if (!cacheSlot) return;
    let live = true;
    readPoiCache(owner, cacheSlot).then((c) => { if (c && live) setPoi((cur) => cur ?? { answer: c.answer, cached: true }); }).catch(() => {});
    return () => { live = false; };
  }, [cacheSlot, owner]);
  const along = useMemo(() => (d && poi ? poisAlong(poi.answer.pois, d.nav, POI_ALONG_M).map((p) => ({ poi: p as Poi, lead: `km ${p.km} · à ${p.offM} m du tracé` })) : []), [d, poi]);

  if (q.isLoading && !d) return <Screen><LoadingCards count={2} /></Screen>;
  if (!d) {
    if ((q.error as { code?: string } | null)?.code === "ROUTE_NOT_ON_PHONE") return (
      <Screen>
        <Card>
          <T variant="bodyStrong">Ce parcours n’est plus sur ce téléphone</T>
          <T variant="small" tone="muted">Sa copie a été supprimée ou remplacée. S’il est dans ta bibliothèque, tu le retrouveras dans Mes parcours.</T>
        </Card>
        <Button kind="secondary" label="Retour à Mes parcours" onPress={() => navigation.goBack()} />
      </Screen>
    );
    return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  }

  const onServer = isServerRouteId(d.id);
  const recorded = d.origin === "recorded" && d.durationS > 0;
  const title = d.name || titleOf({ sport: d.sport, startedAt: d.startedAt });
  const day = d.startedAt ? new Date(d.startedAt).toISOString().slice(0, 10) : null;
  const timed = d.track.segs.flat().every((f) => f.t > 0);
  const refreshLists = () => {
    // Every list that reads the library, but not this very route: it is still on screen (or about to leave it).
    qc.invalidateQueries({ queryKey: routeKey(owner), predicate: (query) => !(query.queryKey[2] === "detail" && query.queryKey[3] === asked) });
    qc.invalidateQueries({ queryKey: localKey(owner) });
  };

  const exportGpx = async () => {
    setBusy(true);
    try {
      const file = recorded && day ? `titan-${d.sport}-${day}.gpx` : `titan-parcours-${slug(title)}.gpx`;
      await shareTextFile(file, toGpx(d.track, recorded && day && !d.name ? `${Sports.label(d.sport)} ${day}` : title, timed ? {} : { time: false }), "application/gpx+xml");
    } catch (e) {
      toast({ kind: "err", title: "Export impossible", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  const share = async () => {
    const trimmed = trimEnds(d.track);
    if (!trimmed) return toast({ kind: "warn", title: "Parcours trop court", message: "Impossible de masquer le début et la fin d’un parcours aussi court sans révéler d’où tu pars. Il reste privé." });
    setBusy(true);
    try {
      await shareTextFile(recorded && day ? `titan-parcours-${day}.gpx` : `titan-parcours-${slug(title)}-partage.gpx`, toGpx(trimmed, `${Sports.label(d.sport)}`, { time: false, ele: false }), "application/gpx+xml");
    } catch (e) {
      toast({ kind: "err", title: "Partage impossible", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const rename = async () => {
    const name = cleanRouteName(renaming ?? "");
    if (!name) return setRenameError("Le nom fait entre 1 et 80 caractères.");
    setBusy(true);
    try {
      let message: string | undefined;
      if (!onServer) await renamePendingLibraryRoute(owner, d.id, name);
      else {
        let kept: "server" | "local" | "later";
        try {
          kept = await api.routeRename(owner, d.id, name);
        } catch (e) {
          if (!isNetworkError(e)) throw e;
          kept = "later";
        }
        if (kept === "server") await setRouteNote(owner, d.id, { name: undefined, unsent: undefined });
        else await setRouteNote(owner, d.id, { name, unsent: true });
        message = kept === "local" ? `${NAME_KEPT_ON_PHONE}.` : kept === "later" ? "Pas de connexion : le nom est gardé sur ce téléphone et sera envoyé à la prochaine ouverture de Mes parcours." : undefined;
      }
      // The copy on the phone carries the name too: an outing that follows it shows the same title.
      const local = await loadRouteForFollow(owner, d.id);
      if (local) setCopy(await saveRouteOffline(owner, d.id, { ...local, name }));
      setRenaming(null);
      refreshLists();
      await q.refetch();
      toast({ kind: message ? "info" : "ok", title: "Parcours renommé", message });
    } catch (e) {
      setRenameError(errorMessage(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const startFollow = async () => {
    if (!followSport) return;
    setBusy(true);
    try {
      // The outing reads the route from this phone only: the copy must exist before the screen changes.
      if (!(await loadRouteForFollow(owner, d.id))) setCopy(await saveRouteOffline(owner, d.id, d.nav));
      const sport = followSport;
      setFollowSport(undefined);
      navigation.navigate("GpsRecord", { sport, follow: d.id });
    } catch {
      toast({ kind: "err", title: "Copie impossible", message: "Le parcours n’a pas pu être copié sur ce téléphone : il ne peut pas être suivi pour l’instant. Libère un peu d’espace, puis réessaie." });
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const removeCopy = async () => {
    keptOff.current = true;
    await removeRouteOffline(owner, d.id).catch(() => {});
    setCopy(null);
    qc.invalidateQueries({ queryKey: localKey(owner) });
  };
  const keepCopy = async () => {
    keptOff.current = false;
    setCopy(await saveRouteOffline(owner, d.id, d.nav).catch(() => null));
    qc.invalidateQueries({ queryKey: localKey(owner) });
  };
  const addPhoneRoute = async () => {
    setBusy(true);
    try {
      await addToLibrary(owner, d.nav, { name: d.name || title, sport: d.sport, origin: d.origin === "planned" ? "planned" : "imported", id: d.id });
      toast(savedToast(await sendLibrary(owner, qc)));
      refreshLists();
      await q.refetch();
    } catch (e) {
      toast({ kind: "err", title: "Parcours non enregistré", message: saveFailure(e) });
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      if (onServer) await api.routeDelete(owner, d.id);
      else await discardLibraryRoute(owner, d.id);
      await removeRouteOffline(owner, d.id).catch(() => {});
      await setRouteNote(owner, d.id, null).catch(() => {});
      refreshLists();
      navigation.goBack();
    } catch (e) {
      toast({ kind: "err", title: "Suppression impossible", message: errorMessage(e) });
      if (mounted.current) setBusy(false);
    }
  };
  const confirmRemove = () => Alert.alert(
    "Supprimer ce parcours ?",
    onServer ? "Il est retiré de ta bibliothèque, sur tous tes appareils, et sa copie sur ce téléphone est effacée. Cette action est définitive."
      : d.pending ? "Il n’a pas encore été envoyé : il est effacé de ce téléphone et ne rejoindra pas ta bibliothèque. Cette action est définitive."
      : "Il n’existe que sur ce téléphone : sa copie est effacée. Cette action est définitive.",
    [{ text: "Annuler", style: "cancel" }, { text: "Supprimer", style: "destructive", onPress: remove }],
  );

  /* ---- The same course, other days ---- */
  const library = () => qc.fetchQuery({ queryKey: libraryKey(owner), queryFn: () => loadLibrary(owner), staleTime: 60_000 });
  const compare = async () => {
    stop.current = false;
    setVersus(null);
    setCmp({ state: "running", done: 0, total: 0 });
    try {
      const rows = (await library()).routes;
      setOthers(rows.filter((r) => r.id !== d.id));
      const candidates = compareCandidates(metaOf(d), rows);
      setCmp({ state: "running", done: 0, total: candidates.length });
      const result = await compareOnCourse({ meta: metaOf(d), route: d.nav }, candidates, async (id) => {
        // The copy on the phone when there is one (no request), else the account's trace, read once and not kept.
        const local = await loadRouteForFollow(owner, id);
        if (local) return local;
        const r = await api.routeGetV2(owner, id);
        return GpsNav.decode(r.track as NavEncoded, { sport: r.sport, origin: "recorded" });
      }, { onProgress: (done, total) => { if (mounted.current) setCmp({ state: "running", done, total }); }, shouldStop: () => stop.current || !mounted.current });
      if (mounted.current) setCmp({ state: "done", result });
    } catch {
      if (mounted.current) setCmp({ state: "failed" });
    }
  };
  const openVersus = async () => {
    try {
      setOthers((await library()).routes.filter((r) => r.id !== d.id));
    } catch {
      setOthers([]);
      toast({ kind: "warn", title: "Bibliothèque indisponible", message: "La liste de tes parcours n’a pas pu être lue. Réessaie avec une connexion." });
    }
  };
  const [picking, setPicking] = useState(false);

  /* ---- Useful points along the line: asked only on a tap ---- */
  const searchPoi = async () => {
    if (poiBusy) return;
    setPoiBusy(true);
    setPoiFailure(null);
    try {
      const result = await fetchPois(owner, { kinds: POI_KINDS, along: { points: thinRoute(d.nav), radiusM: POI_ALONG_M } });
      if (!mounted.current) return;
      if (!result.ok) return setPoiFailure(result.code);
      const { ok: _ok, ...answer } = result;
      void _ok;
      setPoi({ answer, cached: false });
      writePoiCache(owner, `route:${d.id}`, { answer, kinds: [...POI_KINDS], radiusM: POI_ALONG_M }).catch(() => {});
    } finally {
      if (mounted.current) setPoiBusy(false);
    }
  };
  const savePoi = async (p: Poi, fetchedAt: string) => {
    try {
      await addPlace(owner, poiAsPlace(p, fetchedAt));
      setSavedPois((s) => new Set(s).add(p.id));
      toast({ kind: "ok", title: "Ajouté à tes points" });
    } catch (e) {
      toast({ kind: "err", title: "Point non enregistré", message: String((e as Error)?.message) === "PLACE_LIMIT" ? "Tu as déjà 300 points : supprime-en un pour en ajouter." : "Réessaie dans un instant." });
    }
  };

  const result = cmp.state === "done" ? cmp.result : null;
  const found = result ? result.comparable.filter((e) => !e.self).length + result.excluded.filter((e) => !e.self).length : 0;
  const mine = figuresOf(metaOf(d));
  const theirs = versus ? figuresOf(versus) : null;
  const figureRows = theirs ? [
    { label: "Distance", a: km(mine.distanceM), b: km(theirs.distanceM) },
    { label: "Dénivelé positif", a: mine.ascentM === null ? "–" : `${mine.ascentM} m`, b: theirs.ascentM === null ? "–" : `${theirs.ascentM} m` },
    { label: "Temps", a: mine.timeS === null ? "–" : `${GpsSession.chrono(mine.timeS)}${mine.approx ? " *" : ""}`, b: theirs.timeS === null ? "–" : `${GpsSession.chrono(theirs.timeS)}${theirs.approx ? " *" : ""}` },
    { label: "Moyenne", a: mine.timeS ? speedText(d.sport, mine.distanceM, mine.timeS) : "–", b: theirs.timeS && versus ? speedText(versus.sport, theirs.distanceM, theirs.timeS) : "–" },
  ] : [];
  return (
    <Screen>
      <View style={{ gap: space.s2 }}>
        <T variant="eyebrow" tone="accent">{Sports.label(d.sport)}{d.startedAt ? ` · ${when(d.startedAt)}` : ""}</T>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.s2 }}>
          <T variant="h2" style={{ flex: 1 }} testID="route-title">{title}</T>
          <Chip label={ORIGINS[d.origin]} />
        </View>
        <Button small kind="ghost" icon="edit" label="Renommer" disabled={busy || (!onServer && !d.pending && false)} onPress={() => { setRenameError(null); setRenaming(d.name); }} style={{ alignSelf: "flex-start" }} testID="route-rename" />
        {d.nameOnPhone ? <T variant="caption" tone="faint" testID="route-name-local">{NAME_KEPT_ON_PHONE}</T> : null}
        {d.stale ? <T variant="small" tone="warn" accessibilityRole="alert" testID="route-stale">Bibliothèque en ligne injoignable : tu vois la copie gardée sur ce téléphone. Elle peut être suivie normalement.</T>
          : d.pending ? <T variant="small" tone="warn" testID="route-pending">En attente d’envoi vers ta bibliothèque : déjà utilisable sur ce téléphone.</T>
          : !onServer ? <T variant="small" tone="warn" testID="route-phone-only">Ce parcours n’existe que sur ce téléphone : il n’est pas dans ta bibliothèque en ligne.</T> : null}
        {!onServer && !d.pending ? <Button small kind="secondary" icon="check" label="Enregistrer dans Mes parcours" loading={busy} onPress={addPhoneRoute} testID="route-add" /> : null}
      </View>
      <RouteMap track={d.track} basemap={basemap} accessibilityLabel={`Trace de ${km(d.distanceM)}`} />
      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", gap: space.s4 }}>
          <View style={{ flex: 1 }}><T variant="h2">{km(d.distanceM)}</T><T variant="caption" tone="faint">Distance</T></View>
          {recorded
            ? <View style={{ flex: 1 }}><T variant="h2">{dur(d.durationS)}</T><T variant="caption" tone="faint">Temps actif</T></View>
            : <View style={{ flex: 1 }}><T variant="h2">{d.ascentM === null ? "–" : `${d.ascentM} m`}</T><T variant="caption" tone="faint">{d.ascentM === null ? "D+ inconnu : pas d’altitude partout" : "Dénivelé positif"}</T></View>}
        </View>
        {recorded ? (
          <View style={{ flexDirection: "row", gap: space.s4 }}>
            <View style={{ flex: 1 }}><T variant="h3">{d.durationS > 30 && d.distanceM > 50 ? speedText(d.sport, d.distanceM, d.durationS) : "–"}</T><T variant="caption" tone="faint">{Sports.paceMode(d.sport) === "pace" ? "Allure moyenne" : "Vitesse moyenne"}</T></View>
            <View style={{ flex: 1 }}><T variant="h3">{d.ascentM === null ? "–" : `${d.ascentM} m`}</T><T variant="caption" tone="faint">{d.ascentM === null ? "D+ non fiable" : "Dénivelé positif"}</T></View>
          </View>
        ) : <T variant="caption" tone="faint">Un tracé {d.origin === "planned" ? "planifié" : "importé"} n’a pas de chrono : il se suit, il ne se compare pas.</T>}
        {recorded && Number(d.summary?.movingS) > 0 ? (
          <T variant="small" tone="muted" testID="route-summary">
            En mouvement : {GpsSession.chrono(Number(d.summary!.movingS))}
            {Number(d.summary!.elapsedS) > 0 ? ` · Temps total : ${GpsSession.chrono(Number(d.summary!.elapsedS))}` : ""}
            {Number.isFinite(Number(d.summary!.stoppedS)) && d.summary!.stoppedS !== undefined ? ` · À l’arrêt : ${GpsSession.chrono(Number(d.summary!.stoppedS))}` : ""}
          </T>
        ) : null}
      </Card>

      <Button icon="play" label="Suivre ce parcours" disabled={busy} onPress={() => setFollowSport(GpsEngine.isGpsSport(d.sport) ? d.sport : null)} testID="route-follow" />
      <T variant="caption" tone="faint">Le suivi montre le tracé et ta position, et dit quand tu t’en écartes. C’est une indication : il ne connaît ni l’état des chemins ni la circulation.</T>
      {copy ? (
        <View style={{ gap: space.s2 }} testID="route-copy">
          <T variant="small" tone="muted">Gardé sur ce téléphone ({Math.max(1, Math.round(copy.bytes / 1024))} ko) : utilisable sans réseau.</T>
          {onServer ? <Button small kind="ghost" label="Supprimer la copie" onPress={removeCopy} style={{ alignSelf: "flex-start" }} testID="route-copy-remove" /> : null}
        </View>
      ) : onServer && d.source === "server" ? (
        <Button small kind="secondary" icon="download" label="Garder sur ce téléphone" onPress={keepCopy} testID="route-copy-keep" />
      ) : null}

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

      <View style={{ gap: space.s3 }}>
        <T variant="eyebrow">Comparer mes sorties sur ce parcours</T>
        {cmp.state === "idle" ? (
          <>
            <T variant="small" tone="muted">TITAN cherche, dans ta bibliothèque, tes autres sorties du même sport dont la distance est proche (25 au plus), puis vérifie tracé par tracé qu’il s’agit du même parcours.</T>
            <Button kind="secondary" icon="search" label="Chercher mes sorties sur ce parcours" onPress={compare} testID="compare-start" />
          </>
        ) : cmp.state === "running" ? (
          <>
            <T variant="small" tone="muted" accessibilityLiveRegion="polite" testID="compare-progress">{cmp.total ? `Comparaison des tracés : ${cmp.done} sur ${cmp.total}…` : "Lecture de ta bibliothèque…"}</T>
            <Button small kind="secondary" label="Arrêter" onPress={() => { stop.current = true; }} testID="compare-stop" />
          </>
        ) : cmp.state === "failed" ? (
          <>
            <T variant="small" tone="warn" accessibilityRole="alert">La comparaison a besoin de ta bibliothèque en ligne, qui n’a pas pu être lue. Réessaie avec une connexion.</T>
            <Button small kind="secondary" icon="restore" label="Réessayer" onPress={compare} />
          </>
        ) : result ? (
          <View style={{ gap: space.s2 }} testID="compare-result">
            <T variant="caption" tone="faint">{result.criteria}</T>
            {found === 0 ? <T variant="bodyStrong" testID="compare-none">Aucune autre sortie sur ce parcours</T> : null}
            {found > 0 && result.comparable.length ? (
              <Card tone="flat" style={{ gap: 4 }}>
                <T variant="bodyStrong">Sorties comparables, par temps en mouvement</T>
                {result.comparable.map((e, i) => (
                  <T key={e.id} variant="small" tone="muted" testID={`compare-row-${e.id}`}>
                    {i + 1}. {e.self ? "Cette sortie" : e.date ? when(e.date) : "Sortie"} · {GpsSession.chrono(e.movingS)} · {speedText(d.sport, e.distanceM, e.movingS)}{e.approx ? ` · ${APPROX_TIME_NOTE}` : ""}
                  </T>
                ))}
                {result.best
                  ? <T variant="small" tone="ok" testID="compare-best">Meilleur temps en mouvement : {GpsSession.chrono(result.best.movingS)}{result.best.self ? " (cette sortie)" : result.best.date ? `, ${when(result.best.date)}` : ""}</T>
                  : <T variant="small" tone="muted" testID="compare-no-best">{result.comparable.some((e) => e.approx) ? `Pas de meilleur temps affiché : il faut deux sorties dont le temps en mouvement est mesuré (sans la mention « ${APPROX_TIME_NOTE} »).` : result.note}</T>}
                {result.best ? <T variant="caption" tone="faint">{result.note}</T> : null}
              </Card>
            ) : null}
            {result.excluded.length ? (
              <Card tone="flat" style={{ gap: 4 }}>
                <T variant="bodyStrong">Mises de côté</T>
                {result.excluded.map((e) => <T key={e.id} variant="small" tone="muted" testID={`compare-out-${e.id}`}>{e.self ? "Cette sortie" : e.date ? when(e.date) : "Sortie"} : {e.reason}</T>)}
              </Card>
            ) : null}
            <T variant="caption" tone="faint">
              {result.examined} tracé{result.examined > 1 ? "s" : ""} examiné{result.examined > 1 ? "s" : ""} sur {result.total}
              {result.stopped ? " (recherche arrêtée avant la fin)" : ""}
              {result.different.length ? ` · ${result.different.length} de distance proche ${result.different.length > 1 ? "sont d’autres parcours" : "est un autre parcours"}` : ""}
              {result.unreadable ? ` · ${result.unreadable} illisible${result.unreadable > 1 ? "s" : ""} (pas de connexion ?)` : ""}
            </T>
            <Button small kind="ghost" icon="restore" label="Relancer la recherche" onPress={compare} style={{ alignSelf: "flex-start" }} />
            {found === 0 ? <Button small kind="secondary" icon="swap" label="Comparer avec…" onPress={async () => { await openVersus(); setPicking(true); }} testID="compare-manual" /> : null}
          </View>
        ) : null}
        {versus && theirs ? (
          <Card tone="amber" style={{ gap: 6 }} testID="compare-versus">
            <T variant="bodyStrong" tone="warn">Parcours différents : comparaison indicative</T>
            <View style={{ flexDirection: "row", gap: space.s2 }}>
              <T variant="caption" tone="faint" style={{ flex: 1.2 }}> </T>
              <T variant="caption" style={{ flex: 1 }} numberOfLines={2}>{title}</T>
              <T variant="caption" style={{ flex: 1 }} numberOfLines={2}>{versus.title}</T>
            </View>
            {figureRows.map((r) => (
              <View key={r.label} style={{ flexDirection: "row", gap: space.s2 }}>
                <T variant="small" tone="muted" style={{ flex: 1.2 }}>{r.label}</T>
                <T variant="small" style={{ flex: 1 }}>{r.a}</T>
                <T variant="small" style={{ flex: 1 }}>{r.b}</T>
              </View>
            ))}
            {mine.approx || theirs.approx ? <T variant="caption" tone="faint">* {APPROX_TIME_NOTE}</T> : null}
            <T variant="caption" tone="faint">Deux tracés différents n’ont ni la même distance ni le même relief : ces chiffres se lisent côte à côte, sans classement.</T>
          </Card>
        ) : null}
      </View>

      <View style={{ gap: space.s3 }}>
        <T variant="eyebrow">Points utiles le long du parcours</T>
        <T variant="small" tone="muted">Facultatif : eau, toilettes, abris et réparation vélo relevés sur OpenStreetMap à moins de {POI_ALONG_M} m du tracé. La recherche envoie au serveur TITAN une version simplifiée du tracé (60 points au plus) ; rien ne part avant ton appui.</T>
        <Button kind="secondary" icon="search" label={poiBusy ? "Recherche…" : poi ? "Relever de nouveau" : "Chercher le long du parcours"} loading={poiBusy} onPress={searchPoi} testID="along-search" />
        {poiFailure ? (
          <Card tone="amber" style={{ gap: 4 }} accessibilityRole="alert" testID="along-state">
            <T variant="bodyStrong">{POI_STATES[poiFailure].title}</T>
            <T variant="small" tone="muted">{POI_STATES[poiFailure].text}</T>
          </Card>
        ) : null}
        {poi ? (
          <>
            {poi.cached ? <T variant="small" tone="warn" testID="along-cached">Dernier relevé gardé sur ce téléphone.</T> : null}
            <T variant="caption" tone="faint" testID="along-source">{poiSourceLine(poi.answer)}</T>
            {along.length === 0
              ? <T variant="small" tone="muted" testID="along-empty">Aucun point relevé le long de ce tracé. La carte est tenue par des bénévoles : un point peut exister sans y figurer.</T>
              : <PoiRows rows={along} fetchedAt={poi.answer.fetchedAt} saved={savedPois} onSave={savePoi} />}
            {poi.answer.truncated ? <T variant="small" tone="warn">Liste incomplète : le serveur n’a pas tout renvoyé pour un tracé aussi long.</T> : null}
            <T variant="caption" tone="faint">{poi.answer.attribution}. Données collaboratives, non vérifiées par TITAN : un point peut avoir disparu ou être fermé.</T>
          </>
        ) : null}
      </View>

      <Button kind="ghost" label="Supprimer ce parcours" disabled={busy} onPress={confirmRemove} testID="route-delete" />
      <T variant="caption" tone="faint">Cette trace n’est visible que par toi. La carte est un simple tracé : aucun serveur de cartes n’est contacté.</T>

      <Sheet visible={renaming !== null} onClose={() => { if (!busy) setRenaming(null); }} title="Renommer le parcours">
        <Field label="Nom (1 à 80 caractères)" value={renaming ?? ""} onChangeText={(v) => { setRenaming(v); setRenameError(null); }} maxLength={80} autoFocus error={renameError} testID="rename-field" />
        <Button label="Enregistrer le nom" loading={busy} onPress={rename} testID="rename-save" />
        <Button kind="ghost" label="Annuler" disabled={busy} onPress={() => setRenaming(null)} />
      </Sheet>
      <Sheet visible={followSport !== undefined} onClose={() => setFollowSport(undefined)} title="Suivre ce parcours">
        <T variant="small" tone="muted">Choisis le sport de cette sortie. L’enregistrement GPS s’ouvre avec le tracé à suivre ; rien ne démarre avant ton appui sur Démarrer.</T>
        <GpsSportPicker value={followSport ?? null} onChange={setFollowSport} />
        <Button icon="play" label={followSport ? `Suivre en ${Sports.label(followSport).toLowerCase()}` : "Choisis un sport"} disabled={!followSport} loading={busy} onPress={startFollow} testID="follow-go" />
      </Sheet>
      <Sheet visible={picking} onClose={() => setPicking(false)} title="Comparer avec…">
        {(others ?? []).length === 0 ? <T variant="small" tone="muted">Aucun autre parcours dans ta bibliothèque.</T> : (others ?? []).map((r) => (
          <Card key={r.id} tone="flat" onPress={() => { setVersus(r); setPicking(false); }} accessibilityLabel={`${r.title}, ${km(r.distanceM)}`} testID={`versus-${r.id}`} style={{ gap: 2 }}>
            <T variant="bodyStrong">{r.title}</T>
            <T variant="small" tone="muted">{km(r.distanceM)} · {Sports.label(r.sport)} · {ORIGINS[r.origin]}</T>
          </Card>
        ))}
      </Sheet>
    </Screen>
  );
}
