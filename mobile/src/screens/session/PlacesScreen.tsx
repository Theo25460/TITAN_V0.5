import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Alert, ask } from "../../components/Dialog";
import { Field } from "../../components/Field";
import { Screen } from "../../components/Screen";
import { Segmented } from "../../components/Segmented";
import { Sheet } from "../../components/Sheet";
import { LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import * as api from "../../data/api";
import { useOwner } from "../../data/auth";
import {
  addPlace, distanceBetween, distanceLabel, lastKnownPosition, listPlaces, LOCATE_FAILURES, locateOnce, parseCoordinates, PLACE_KINDS, PLACES_LOCAL_NOTE, removePlace, syncPlaces, updatePlace,
  type Place, type PlaceKind, type PlacesRemote, type PlacesSync,
} from "../../lib/places";
import { fetchPois, POI_KINDS, POI_LABELS, POI_RADII, POI_STATES, poiAsPlace, poiExtras, poiFreshness, poiHours, poiSourceLine, poiTitle, readPoiCache, writePoiCache, type Poi, type PoiAnswer, type PoiFailure, type PoiKind } from "../../lib/poi";
import type { RootParams } from "../../navigation/types";
import { space } from "../../theme/tokens";

/* Before Android asks: what is read, once, and why (the same pattern as the other permissions, lib/permissionCopy.ts). */
const LOCATE_COPY = {
  title: "Utiliser ta position",
  message: "TITAN lit ta position une seule fois, maintenant, pour placer ce point. Aucun suivi n’est lancé et rien n’est partagé.\n\nAndroid va te demander l’autorisation de localisation.",
  confirmLabel: "Continuer",
};
/** One position, asked at the moment it is needed, after TITAN's own explanation. */
export const askPosition = () => locateOnce(() => ask(LOCATE_COPY.title, LOCATE_COPY.message, { confirmLabel: LOCATE_COPY.confirmLabel }));
export const placesRemote = (owner: string): PlacesRemote => ({ list: () => api.placesList(owner), save: (p) => api.placeSave(owner, p), remove: (id) => api.placeDelete(owner, id) });
export const placesKey = (owner: string) => ["places", owner] as const;
const coords = (p: { lat: number; lon: number }) => `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;

/** Points read from the map, one card each: where, what the source says (quoted, never interpreted), how fresh, and a way to keep one. */
export function PoiRows({ rows, fetchedAt, saved, onSave }: { rows: { poi: Poi; lead: string }[]; fetchedAt: string; saved: Set<string>; onSave: (poi: Poi, fetchedAt: string) => void }) {
  return (
    <View style={{ gap: space.s2 }}>
      {rows.map(({ poi, lead }) => {
        const hours = poiHours(poi), extras = poiExtras(poi);
        return (
          <Card key={poi.id} tone="flat" style={{ gap: 4 }} testID={`poi-${poi.id}`}>
            <T variant="bodyStrong">{poiTitle(poi)}</T>
            <T variant="small" tone="muted">{lead}{poi.name ? ` · ${POI_LABELS[poi.kind as PoiKind] ?? PLACE_KINDS[poi.kind as PlaceKind] ?? "Point utile"}` : ""} · {poiFreshness(poi)}</T>
            {hours ? <T variant="small" tone="muted">{hours}</T> : null}
            {extras ? <T variant="small" tone="muted">{extras}</T> : null}
            {saved.has(poi.id)
              ? <T variant="caption" tone="ok">Enregistré dans tes points</T>
              : <Button small kind="secondary" icon="pin" label="Enregistrer dans mes points" onPress={() => onSave(poi, fetchedAt)} testID={`poi-save-${poi.id}`} />}
          </Card>
        );
      })}
    </View>
  );
}

type Editor = { id: string | null; name: string; kind: PlaceKind; note: string; coords: string; here: { lat: number; lon: number; accuracyM: number | null } | null; error: string | null };
const emptyEditor = (): Editor => ({ id: null, name: "", kind: "water", note: "", coords: "", here: null, error: null });
type PoiPanel = { answer: PoiAnswer; center: { lat: number; lon: number } | null; cached: boolean } | null;

/** « Mes points »: the athlete's own places (private, local first), and — only when asked — the useful points the map knows nearby. */
export function PlacesScreen({ navigation }: NativeStackScreenProps<RootParams, "Places">) {
  const owner = useOwner();
  const toast = useToast();
  const q = useQuery({ queryKey: placesKey(owner), queryFn: () => listPlaces(owner) });
  const [sync, setSync] = useState<PlacesSync | null>(null);
  const [here, setHere] = useState<{ lat: number; lon: number } | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const refetch = q.refetch;
  const runSync = useCallback(async () => {
    const result = await syncPlaces(owner, placesRemote(owner)).catch(() => null);
    if (!mounted.current) return;
    if (result) setSync(result);
    await refetch();
  }, [owner, refetch]);
  useEffect(() => {
    void runSync();
    lastKnownPosition().then((p) => { if (p && mounted.current) setHere(p); }).catch(() => {});
    return navigation?.addListener?.("focus", () => { void runSync(); });
  }, [navigation, runSync]);

  const places = useMemo(() => {
    const list = [...(q.data ?? [])];
    return here ? list.sort((a, b) => distanceBetween(here, a) - distanceBetween(here, b)) : list.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [q.data, here]);

  const locateForEditor = async () => {
    setBusy(true);
    const got = await askPosition();
    if (!mounted.current) return;
    setBusy(false);
    if (!got.ok) return setEditor((e) => (e ? { ...e, error: LOCATE_FAILURES[got.reason] } : e));
    setHere({ lat: got.lat, lon: got.lon });
    setEditor((e) => (e ? { ...e, here: { lat: got.lat, lon: got.lon, accuracyM: got.accuracyM }, coords: "", error: null } : e));
  };
  const saveEditor = async () => {
    if (!editor || busy) return;
    const name = editor.name.replace(/\s+/g, " ").trim();
    if (!name) return setEditor({ ...editor, error: "Donne un nom à ce point." });
    setBusy(true);
    try {
      if (editor.id) await updatePlace(owner, editor.id, { name, kind: editor.kind, note: editor.note });
      else {
        const at = editor.here ?? parseCoordinates(editor.coords);
        if (!at) return setEditor({ ...editor, error: "Indique où est ce point : « À ma position », ou des coordonnées comme 48.5839, 7.7455." });
        await addPlace(owner, { name, kind: editor.kind, lat: at.lat, lon: at.lon, note: editor.note });
      }
      setEditor(null);
      toast({ kind: "ok", title: editor.id ? "Point modifié" : "Point enregistré" });
      void runSync();
    } catch (e) {
      const code = String((e as Error)?.message);
      setEditor({ ...editor, error: code === "PLACE_LIMIT" ? "Tu as déjà 300 points : supprime-en un pour en ajouter." : code === "PLACE_POSITION" ? "Cette position n’est pas valide." : "Le point n’a pas pu être enregistré sur ce téléphone. Réessaie." });
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const confirmRemove = (p: Place) => Alert.alert("Supprimer ce point ?", `« ${p.name} » est retiré de tes points, sur ce téléphone et sur ton compte. Cette action est définitive.`, [
    { text: "Annuler", style: "cancel" },
    { text: "Supprimer", style: "destructive", onPress: async () => {
      try {
        await removePlace(owner, p.id);
        setEditor(null);
        toast({ kind: "ok", title: "Point supprimé" });
        void runSync();
      } catch {
        toast({ kind: "err", title: "Suppression impossible", message: "Le point est toujours là. Réessaie dans un instant." });
      }
    } },
  ]);

  /* ---- Useful points around me: nothing is asked, nothing is sent, until the athlete opens this and taps « Chercher » ---- */
  const [poiOpen, setPoiOpen] = useState(false);
  const [kinds, setKinds] = useState<PoiKind[]>([...POI_KINDS]);
  const [radius, setRadius] = useState<number>(1000);
  const [panel, setPanel] = useState<PoiPanel>(null);
  const [failure, setFailure] = useState<{ code: PoiFailure } | { locate: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const openPoi = async () => {
    setPoiOpen(true);
    const cached = await readPoiCache(owner, "around").catch(() => null);
    if (cached && mounted.current) setPanel((cur) => cur ?? { answer: cached.answer, center: cached.center ?? null, cached: true });
  };
  const searchPoi = async () => {
    if (searching) return;
    if (!kinds.length) return setFailure({ locate: "Choisis au moins un type de point." });
    setSearching(true);
    setFailure(null);
    try {
      const got = await askPosition();
      if (!got.ok) return setFailure({ locate: LOCATE_FAILURES[got.reason] });
      const center = { lat: got.lat, lon: got.lon };
      setHere(center);
      const result = await fetchPois(owner, { kinds, around: { ...center, radiusM: radius } });
      if (!mounted.current) return;
      if (!result.ok) return setFailure({ code: result.code });
      const { ok: _ok, ...answer } = result;
      void _ok;
      setPanel({ answer, center, cached: false });
      writePoiCache(owner, "around", { answer, kinds, center, radiusM: radius }).catch(() => {});
    } finally {
      if (mounted.current) setSearching(false);
    }
  };
  const savePoi = async (poi: Poi, fetchedAt: string) => {
    try {
      await addPlace(owner, poiAsPlace(poi, fetchedAt));
      setSaved((s) => new Set(s).add(poi.id));
      toast({ kind: "ok", title: "Ajouté à tes points" });
      void runSync();
    } catch (e) {
      toast({ kind: "err", title: "Point non enregistré", message: String((e as Error)?.message) === "PLACE_LIMIT" ? "Tu as déjà 300 points : supprime-en un pour en ajouter." : "Réessaie dans un instant." });
    }
  };
  const poiRows = useMemo(() => {
    if (!panel) return [];
    const from = panel.center;
    return panel.answer.pois
      .map((poi) => ({ poi, d: from ? distanceBetween(from, poi) : null }))
      .sort((a, b) => (a.d ?? 0) - (b.d ?? 0))
      .map(({ poi, d }) => ({ poi, lead: d === null ? "distance inconnue" : `à ${distanceLabel(d)}` }));
  }, [panel]);

  if (q.isLoading && !q.data) return <Screen space="seance"><LoadingCards count={2} /></Screen>;
  const waiting = sync?.waiting ?? 0;
  const failureText = failure ? ("code" in failure ? POI_STATES[failure.code] : { title: "Position indisponible", text: failure.locate, retry: true }) : null;
  return (
    <Screen space="seance" refreshing={q.isRefetching} onRefresh={() => { void runSync(); }}>
      <T variant="eyebrow" tone="accent">Mes points</T>
      <T tone="muted">Une fontaine, un abri, un atelier vélo que tu veux retrouver. Tes points sont privés : ils ne figurent dans aucun partage.</T>
      {sync?.state === "local" ? (
        <Card tone="flat" style={{ gap: 4 }} testID="places-local">
          <T variant="bodyStrong">{PLACES_LOCAL_NOTE}</T>
          <T variant="small" tone="muted">Le serveur TITAN ne sait pas encore garder tes points. Ils restent ici, utilisables normalement, et rejoindront ton compte dès qu’il le pourra.</T>
        </Card>
      ) : sync?.state === "pending" && waiting > 0 ? (
        <T variant="small" tone="warn" testID="places-pending">{waiting} point{waiting > 1 ? "s" : ""} en attente d’envoi vers ton compte. {waiting > 1 ? "Ils sont gardés" : "Il est gardé"} sur ce téléphone et repartir{waiting > 1 ? "ont" : "a"} à la prochaine connexion.</T>
      ) : sync?.state === "synced" ? (
        <T variant="small" tone="muted" testID="places-synced">Points à jour sur ton compte.</T>
      ) : null}
      <Button icon="plus" label="Ajouter un point" onPress={() => setEditor(emptyEditor())} testID="place-add" />
      {places.length === 0 ? (
        <Card>
          <T variant="bodyStrong">Aucun point pour le moment</T>
          <T variant="small" tone="muted">Ajoute un point là où tu es, ou avec ses coordonnées. Tu le retrouveras ici et pour tracer un parcours.</T>
        </Card>
      ) : places.map((p) => (
        <Card key={p.id} onPress={() => setEditor({ id: p.id, name: p.name, kind: p.kind, note: p.note, coords: "", here: null, error: null })} accessibilityLabel={`${p.name}, ${PLACE_KINDS[p.kind]}`} testID={`place-${p.id}`} style={{ gap: 4 }}>
          <T variant="bodyStrong">{p.name}</T>
          <T variant="small" tone="muted">{PLACE_KINDS[p.kind]}{here ? ` · à ${distanceLabel(distanceBetween(here, p))} de ta dernière position connue` : ""}</T>
          {p.note ? <T variant="small" tone="muted">{p.note}</T> : null}
        </Card>
      ))}

      <View style={{ gap: space.s3 }}>
        <T variant="eyebrow">Points utiles autour de moi</T>
        {!poiOpen ? (
          <>
            <T variant="small" tone="muted">Facultatif : eau, toilettes, abris et réparation vélo relevés sur OpenStreetMap. Rien n’est demandé ni envoyé tant que tu ne lances pas une recherche.</T>
            <Button kind="secondary" icon="search" label="Chercher des points utiles" onPress={openPoi} testID="poi-open" />
          </>
        ) : (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2 }}>
              {POI_KINDS.map((k) => <Chip key={k} label={POI_LABELS[k]} selected={kinds.includes(k)} onPress={() => setKinds((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))} testID={`poi-kind-${k}`} />)}
            </View>
            <Segmented value={String(radius)} onChange={(v) => setRadius(Number(v))} options={POI_RADII.map((r) => ({ value: String(r), label: r < 1000 ? `${r} m` : `${r / 1000} km` }))} accessibilityLabel="Rayon de recherche" />
            <T variant="caption" tone="faint">La recherche lit ta position une fois et l’envoie au serveur TITAN arrondie à environ 100 m, avec le rayon et les types choisis.</T>
            <Button icon="search" label={searching ? "Recherche…" : "Chercher autour de moi"} loading={searching} onPress={searchPoi} testID="poi-search" />
            {failureText ? (
              <Card tone="amber" style={{ gap: 4 }} testID="poi-state" accessibilityRole="alert">
                <T variant="bodyStrong">{failureText.title}</T>
                <T variant="small" tone="muted">{failureText.text}</T>
                {failureText.retry ? <Button small kind="secondary" icon="restore" label="Réessayer" onPress={searchPoi} testID="poi-retry" /> : null}
              </Card>
            ) : null}
            {panel ? (
              <>
                {panel.cached ? <T variant="small" tone="warn" testID="poi-cached">Dernier relevé gardé sur ce téléphone (les distances partent de l’endroit de ce relevé).</T> : null}
                <T variant="caption" tone="faint" testID="poi-source">{poiSourceLine(panel.answer)}</T>
                {poiRows.length === 0
                  ? <T variant="small" tone="muted" testID="poi-empty">Aucun point de ce type relevé dans ce rayon. La carte est tenue par des bénévoles : un point peut exister sans y figurer.</T>
                  : <PoiRows rows={poiRows} fetchedAt={panel.answer.fetchedAt} saved={saved} onSave={savePoi} />}
                {panel.answer.truncated ? <T variant="small" tone="warn">Liste incomplète : il y a plus de points que le serveur n’en renvoie. Réduis le rayon pour tout voir.</T> : null}
                <T variant="caption" tone="faint">{panel.answer.attribution}. Données collaboratives, non vérifiées par TITAN : un point peut avoir disparu ou être fermé.</T>
              </>
            ) : null}
          </>
        )}
      </View>

      <Sheet visible={!!editor} onClose={() => setEditor(null)} title={editor?.id ? "Modifier le point" : "Ajouter un point"}>
        {editor ? (
          <>
            <Field label="Nom" value={editor.name} onChangeText={(name) => setEditor({ ...editor, name, error: null })} maxLength={60} placeholder="Fontaine du col" testID="place-name" />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2 }}>
              {(Object.keys(PLACE_KINDS) as PlaceKind[]).map((k) => <Chip key={k} label={PLACE_KINDS[k]} selected={editor.kind === k} onPress={() => setEditor({ ...editor, kind: k })} testID={`place-kind-${k}`} />)}
            </View>
            {editor.id ? null : (
              <>
                <Button kind="secondary" icon="pin" label={editor.here ? "Relire ma position" : "À ma position"} loading={busy && !editor.here && !editor.coords} onPress={locateForEditor} testID="place-here" />
                {editor.here
                  ? <T variant="small" tone="ok" testID="place-here-read">Position lue : {coords(editor.here)}{editor.here.accuracyM !== null ? ` (précision annoncée ± ${Math.round(editor.here.accuracyM)} m)` : ""}</T>
                  : <Field label="Ou des coordonnées (latitude, longitude)" value={editor.coords} onChangeText={(c) => setEditor({ ...editor, coords: c, error: null })} placeholder="48.5839, 7.7455" autoCapitalize="none" autoCorrect={false} testID="place-coords" />}
              </>
            )}
            <Field label="Note (facultatif)" value={editor.note} onChangeText={(note) => setEditor({ ...editor, note })} maxLength={200} placeholder="Coupée en hiver" testID="place-note" />
            {editor.error ? <T variant="small" tone="err" accessibilityRole="alert" testID="place-error">{editor.error}</T> : null}
            <Button label="Enregistrer" loading={busy} onPress={saveEditor} testID="place-save" />
            {editor.id ? <Button kind="ghost" label="Supprimer ce point" onPress={() => { const p = (q.data ?? []).find((x) => x.id === editor.id); if (p) confirmRemove(p); }} testID="place-delete" /> : null}
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
