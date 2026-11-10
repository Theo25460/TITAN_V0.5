import { DateTimePickerAndroid } from "../../components/Picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { usePreventRemove } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo, useRef, useState } from "react";
import { type ScrollView, StyleSheet, View } from "react-native";
import { Alert } from "../../components/Dialog";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Field } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { Tap } from "../../components/Pressable";
import { RpeSelector } from "../../components/RpeSelector";
import { Screen } from "../../components/Screen";
import { Section } from "../../components/Section";
import { Segmented } from "../../components/Segmented";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { EffortRules, Format, Gpx, Sports } from "../../core";
import { applyGpxImport, BELAYS, buildSession, draftDuration, freshDraft, GRADE_SYSTEMS, noteLimit, num, removeGpxImport, RPE_TEXT, type SessionDraft } from "../../core/session";
import type { TrainingLog } from "../../core/types";
import { useOwner } from "../../data/auth";
import { clearDraft, elapsedMs, saveDraft, setStopwatch, useDrafts } from "../../data/drafts";
import { useLogs, useProfile, useRecordSession } from "../../data/hooks";
import { shareTextFile } from "../../lib/exportFile";
import { haptic } from "../../lib/haptics";
import type { RootParams } from "../../navigation/types";
import { colors, familyColors, space, TOUCH } from "../../theme/tokens";
import { routeLink, routeSave } from "../../data/api";
import { flushRoutes, linkSavedSession } from "../../lib/routeSync";
import { GPS_SPORTS } from "../../lib/gpsTrack";
import { ExerciseEditor } from "./ExerciseEditor";
import { SportMetricsEditor } from "./SportMetricsEditor";

const pad = (n: number) => String(n).padStart(2, "0");

/** Pre-fill from an earlier session (duplicate), like the website's "Refaire cette séance". */
function prefillFrom(log: TrainingLog, base: SessionDraft): SessionDraft {
  const d = { ...base };
  const det = log.details || {};
  if (log.unit === "km") d.distance = String(log.val);
  if (log.unit === "m" && Sports.formOf(log.sport) === "swim") d.meters = String(log.val);
  const dur = Number(det.duration || det.val2) || 0;
  if (dur > 0) {
    d.durH = dur >= 60 ? String(Math.floor(dur / 60)) : "";
    d.durM = String(Math.floor(dur % 60));
    const sec = Math.round((dur - Math.floor(dur)) * 60);
    d.durS = sec ? String(sec) : "";
  }
  if (det.elevation) d.elevation = String(det.elevation);
  if (det.bio?.rpe) d.rpe = Number(det.bio.rpe);
  if (Array.isArray(det.exercises) && det.exercises.length)
    d.exercises = det.exercises.map((e) => ({
      name: e.name,
      variant: e.variant || "",
      kind: e.kind || "weighted",
      sets: (e.setRows?.length ? e.setRows : [{ weight: e.weight || 0, reps: e.reps || 0, rir: null }]).map((s) => ({ weight: s.weight ? String(s.weight) : "", reps: s.reps ? String(s.reps) : "", rir: s.rir === null || s.rir === undefined ? "" : String(s.rir), seconds: s.seconds ? String(s.seconds) : "" })),
    }));
  const x = (det.extras || {}) as Record<string, unknown>;
  d.extras = { ...x };
  if (x.pool) d.pool = String(x.pool);
  if (x.climbing_discipline) d.climbing = { ...d.climbing, discipline: x.climbing_discipline === "Voie" ? "Voie" : "Bloc", location: x.location === "Extérieur" ? "Extérieur" : "Salle", system: String(x.grade_system || d.climbing.system), belay: String(x.belay || ""), attempts: x.attempts == null ? "" : String(x.attempts), successes: x.successful_routes == null ? "" : String(x.successful_routes), best: String(x.max_done || "") };
  return d;
}

export function SessionFormScreen({ navigation, route }: NativeStackScreenProps<RootParams, "SessionForm">) {
  const owner = useOwner();
  const { sport, duplicateOf } = route.params;
  const drafts = useDrafts();
  const { logs } = useLogs();
  const profile = useProfile().data;
  const record = useRecordSession();
  const toast = useToast();
  const scroll = useRef<ScrollView>(null);
  const [errors, setErrors] = useState<{ field: string | null; message: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [gpxOriginal, setGpxOriginal] = useState<{ owner: string; sport: string; name: string; text: string } | null>(null);
  const [exportingGpx, setExportingGpx] = useState(false);
  const gpxRead = useRef(0);
  const gpxScope = useRef({ owner, sport });
  gpxScope.current = { owner, sport };
  useEffect(() => {
    setGpxOriginal(null);
    setExportingGpx(false);
    return () => { ++gpxRead.current; };
  }, [owner, sport]);
  const original = gpxOriginal?.owner === owner && gpxOriginal.sport === sport ? gpxOriginal : null;

  const [draft, setDraftState] = useState<SessionDraft>(() => {
    const stored = drafts.stored?.draft;
    if (stored && stored.sport === sport && !duplicateOf) return stored;
    const base = freshDraft(sport);
    const source = duplicateOf ? logs.find((l) => l.id === duplicateOf || l.client_event_id === duplicateOf) : null;
    return source ? prefillFrom(source, base) : base;
  });
  const draftRef = useRef(draft);
  const dirty = useRef(false);
  const saved = useRef(false);
  const saving = useRef(false);
  useEffect(() => {
    const stored = drafts.stored?.draft;
    if (!dirty.current && !duplicateOf && stored?.sport === sport && stored !== draftRef.current) {
      draftRef.current = stored;
      setDraftState(stored);
    }
  }, [drafts.stored, duplicateOf, sport]);
  const setDraft = (patch: Partial<SessionDraft> | ((d: SessionDraft) => SessionDraft)) => {
    if (saving.current || saved.current) return;
    dirty.current = true;
    setErrors(null);
    const next = typeof patch === "function" ? patch(draftRef.current) : { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraftState(next);
    void saveDraft(owner, next).catch(() => {
      if (draftRef.current === next && !saved.current) toast({ kind: "warn", title: "Brouillon non sauvegardé sur le téléphone" });
    });
  };

  const form = Sports.formOf(sport);
  const fam = Sports.familyOf(sport);
  const timer = drafts.timer;
  const running = !!timer.started;
  useEffect(() => {
    navigation.setOptions({ title: Sports.label(sport) });
  }, [navigation, sport]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  // Android back: leaving keeps the draft on the device; say so instead of losing the input silently.
  usePreventRemove(dirty.current, ({ data }) => {
    if (saved.current) return navigation.dispatch(data.action);
    Alert.alert("Quitter la saisie ?", "Ton brouillon reste sur ce téléphone : tu pourras le reprendre depuis l’onglet Séance.", [
      { text: "Continuer la saisie", style: "cancel" },
      { text: "Quitter", onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  const build = useMemo(() => buildSession(draft), [draft]);
  const preview = useMemo(() => {
    if (!build.val) return null;
    return EffortRules.effort({ sport, profile: Sports.profileOf(sport), unit: build.unit, val: build.val, details: build.details });
  }, [build, sport]);
  const historical = build.at ? EffortRules.isHistorical(build.at.getTime()) : false;
  const dur = draftDuration(draft);
  const km = num(draft.distance);

  // `now` ticks every second while the stopwatch runs, so this value refreshes.
  const ms = now >= 0 ? elapsedMs(timer) : 0;
  const clock = (() => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ""}${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  })();

  function useStopwatch() {
    const total = Math.round(ms / 1000);
    setDraft({ durH: total >= 3600 ? String(Math.floor(total / 3600)) : "", durM: String(Math.floor((total % 3600) / 60)), durS: String(total % 60), gpxDurationEdited: true });
    haptic("success");
  }

  function pickDate() {
    const current = new Date(`${draft.date}T${draft.time || "12:00"}:00`);
    DateTimePickerAndroid.open({
      value: Number.isNaN(current.getTime()) ? new Date() : current,
      mode: "date",
      maximumDate: new Date(),
      onChange: (e, d) => {
        if (e.type === "set" && d) setDraft({ date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` });
      },
    });
  }
  function pickTime() {
    const [h, m] = (draft.time || "12:00").split(":").map(Number);
    const value = new Date();
    value.setHours(h || 0, m || 0, 0, 0);
    DateTimePickerAndroid.open({
      value,
      mode: "time",
      is24Hour: true,
      onChange: (e, d) => {
        if (e.type === "set" && d) setDraft({ time: `${pad(d.getHours())}:${pad(d.getMinutes())}` });
      },
    });
  }

  async function importGpx() {
    const sequence = ++gpxRead.current;
    const current = () => sequence === gpxRead.current && gpxScope.current.owner === owner && gpxScope.current.sport === sport && !saved.current;
    try {
      const pick = await DocumentPicker.getDocumentAsync({ type: ["application/gpx+xml", "application/xml", "text/xml", "application/octet-stream"], copyToCacheDirectory: true });
      if (pick.canceled || !pick.assets?.[0]) return;
      const file = pick.assets[0];
      let source: string;
      try {
        if (!current()) return;
        if ((file.size ?? 0) > 15 * 1024 * 1024) return toast({ kind: "warn", title: "Fichier trop lourd", message: "Le GPX doit faire moins de 15 Mo." });
        source = await FileSystem.readAsStringAsync(file.uri);
      } finally {
        // DocumentPicker makes its own cache copy. Never delete the source supplied by a document provider.
        if (FileSystem.cacheDirectory && file.uri.startsWith(`${FileSystem.cacheDirectory}DocumentPicker/`)) {
          void FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => {});
        }
      }
      if (!current()) return;
      const result = Gpx.analyse(source);
      if (!result.ok) return toast({ kind: "warn", title: "GPX illisible", message: result.error });
      const filename = file.name.replace(/[/\\%?#\x00-\x1f]/g, "-");
      setGpxOriginal({ owner, sport, name: /\.gpx$/i.test(filename) ? filename : "titan-import.gpx", text: source });
      setDraft(d => applyGpxImport(d, result));
      toast({ kind: "ok", title: "Trace importée", message: `${Format.distance(result.distanceKm)} · ${result.points} points${result.ignoredPoints ? `, ${result.ignoredPoints} aberrants ignorés` : ""}.` });
    } catch {
      if (current()) toast({ kind: "warn", title: "GPX illisible", message: "Le fichier n’a pas pu être lu. Réessaie." });
    }
  }

  async function exportGpx() {
    if (!original || exportingGpx) return;
    const scope = gpxScope.current;
    setExportingGpx(true);
    try {
      await shareTextFile(original.name, original.text, "application/gpx+xml");
    } catch {
      if (gpxScope.current.owner === scope.owner && gpxScope.current.sport === scope.sport) {
        toast({ kind: "warn", title: "Export GPX impossible", message: "Vérifie qu’une application peut recevoir ce fichier, puis réessaie." });
      }
    } finally {
      if (gpxScope.current.owner === scope.owner && gpxScope.current.sport === scope.sport) setExportingGpx(false);
    }
  }

  async function save() {
    if (saving.current || saved.current) return;
    const submitted = draftRef.current;
    const b = buildSession(submitted);
    if (b.errors.length) {
      setErrors(b.errors[0]);
      haptic("error");
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    saving.current = true;
    ++gpxRead.current;
    try {
      const payload = await record.mutateAsync(submitted);
      saved.current = true;
      // A session saved from a GPS recording is linked to its route (same sport, within two days; nothing is guessed).
      if (payload.details.client_event_id) linkSavedSession(owner, sport, payload.details.client_event_id).then(() => flushRoutes(owner, (r) => routeSave(owner, r), (id, event) => routeLink(owner, id, event))).catch(() => {});
      await clearDraft(owner, submitted).catch(() => {});
      haptic("success");
      navigation.replace("SessionResult", { eventId: payload.details.client_event_id! });
    } catch (e) {
      const err = e as Error & { field?: string };
      setErrors({ field: err.field ?? null, message: err.message || "Séance non enregistrée." });
      toast({ kind: "err", title: "Séance non enregistrée", message: "La saisie est encore ouverte. Tu peux réessayer." });
    } finally {
      saving.current = false;
    }
  }

  const fieldError = (f: string) => (errors?.field === f ? errors.message : null);
  const durationBlock = (label = "Durée", optional = false) => (
    <View style={{ gap: 6 }}>
      <T variant="caption" tone="muted">
        {label}
        {optional ? " (facultatif)" : ""}
      </T>
      <View style={styles.row}>
        <Field compact value={draft.durH} onChangeText={(durH) => setDraft({ durH, gpxDurationEdited: true })} keyboardType="number-pad" suffix="h" placeholder="0" accessibilityLabel="Heures" testID="duration-h" />
        <Field compact value={draft.durM} onChangeText={(durM) => setDraft({ durM, gpxDurationEdited: true })} keyboardType="number-pad" suffix="min" placeholder="45" accessibilityLabel="Minutes" error={fieldError("duration") ? " " : null} testID="duration-m" />
        <Field compact value={draft.durS} onChangeText={(durS) => setDraft({ durS, gpxDurationEdited: true })} keyboardType="number-pad" suffix="s" placeholder="0" accessibilityLabel="Secondes" />
      </View>
      {fieldError("duration") ? (
        <T variant="caption" tone="err">
          {fieldError("duration")}
        </T>
      ) : null}
    </View>
  );

  return (
    <Screen
      ref={scroll}
      keyboard
      footer={
        <View style={{ gap: 6 }}>
          {errors ? (
            <T variant="small" tone="err" accessibilityRole="alert" accessibilityLiveRegion="assertive" numberOfLines={2}>
              {errors.message}
            </T>
          ) : null}
          <Button label={record.isPending ? "Enregistrement…" : "Enregistrer la séance"} icon="check" loading={record.isPending} onPress={save} testID="session-save" />
        </View>
      }
    >
      <View style={styles.sportHead}>
        <View style={[styles.famDot, { backgroundColor: familyColors[fam] }]} />
        <T variant="caption" tone="muted" style={{ flex: 1 }}>
          {Sports.FAMILY_LABEL[fam]} · {Sports.FORMS[form].label}
        </T>
        {GPS_SPORTS.has(sport) ? (
          <Tap onPress={() => navigation.navigate("GpsRecord", { sport })} accessibilityLabel="Enregistrer avec le GPS" testID="gps-open" style={styles.change}>
            <T variant="caption" color={colors.cy}>
              Enregistrer en GPS
            </T>
          </Tap>
        ) : null}
        <Tap onPress={() => navigation.goBack()} accessibilityLabel="Changer de sport" style={styles.change}>
          <T variant="caption" color={colors.cy}>
            Changer
          </T>
        </Tap>
      </View>

      <Section title="Quand">
        <Segmented
          value={draft.when}
          onChange={(when) => setDraft({ when })}
          options={[
            { value: "now", label: "Maintenant" },
            { value: "yesterday", label: "Hier" },
            { value: "other", label: "Autre jour" },
          ]}
          accessibilityLabel="Date de la séance"
        />
        {draft.when !== "now" ? (
          <View style={styles.row}>
            {draft.when === "other" ? <Button label={new Date(`${draft.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} kind="secondary" icon="calendar" onPress={pickDate} style={{ flex: 1.4 }} /> : null}
            <Button label={draft.time || "12:00"} kind="secondary" icon="clock" onPress={pickTime} style={{ flex: 1 }} />
          </View>
        ) : null}
        {fieldError("date") || fieldError("time") ? <T variant="caption" tone="err">{fieldError("date") || fieldError("time")}</T> : null}
        {historical ? (
          <T variant="caption" tone="warn">
            Séance de plus de 30 jours : elle rejoint ton journal comme historique, sans XP ni crédits (règle du serveur).
          </T>
        ) : null}
      </Section>

      <Section title="Mesures">
        {form === "distance" ? (
          <>
            <Button small kind="secondary" icon="route" label={draft.gpx ? `Trace GPX importée (${draft.gpx.points} points)` : "Importer un fichier GPX"} onPress={importGpx} />
            {draft.gpx ? <>
              {draft.gpx.timing === "missing" ? <T tone="muted">Pas de données de temps dans ce GPX.</T> :
                draft.gpx.movingMinutes ? <T tone="muted">Temps en mouvement du fichier : {Format.duration(draft.gpx.movingMinutes)}.</T> :
                <T tone="muted">Ce GPX ne fournit pas de durée sportive exploitable.</T>}
              {original ? <Button small kind="secondary" icon="share" label="Exporter le GPX original" loading={exportingGpx} onPress={exportGpx} /> :
                <T variant="caption" tone="muted">Sélectionne de nouveau le GPX original pour exporter la trace complète.</T>}
              <Button small kind="ghost" label="Repartir en saisie manuelle" onPress={() => {
                ++gpxRead.current;
                setGpxOriginal(null);
                setDraft(removeGpxImport);
              }} />
            </> : null}
            <Field label="Distance" value={draft.distance} onChangeText={(distance) => setDraft({ distance })} keyboardType="decimal-pad" suffix="km" placeholder="10" error={fieldError("distance")} testID="distance" />
            {durationBlock("Durée", true)}
            {km && dur ? (
              <T variant="small" tone="accent">
                {Sports.paceMode(sport) === "pace" ? `Allure ${Format.pace(km, dur)}` : `Vitesse ${Format.speed(km, dur)}`}
              </T>
            ) : null}
            {Sports.hasElevation(sport) ? <Field label="Dénivelé positif (facultatif)" value={draft.elevation} onChangeText={(elevation) => setDraft({ elevation })} keyboardType="number-pad" suffix="m" placeholder="0" /> : null}
          </>
        ) : form === "swim" ? (
          <>
            <Field label="Distance nagée" value={draft.meters} onChangeText={(meters) => setDraft({ meters })} keyboardType="number-pad" suffix="m" placeholder="1500" error={fieldError("meters")} testID="meters" />
            <Segmented
              value={draft.pool}
              onChange={(pool) => setDraft({ pool })}
              options={[
                { value: "25", label: "Bassin 25 m" },
                { value: "50", label: "Bassin 50 m" },
                { value: "open", label: "Eau libre" },
              ]}
              accessibilityLabel="Type de bassin"
            />
            {durationBlock("Durée", true)}
          </>
        ) : form === "strength" || form === "bodyweight" ? (
          <>
            <ExerciseEditor exercises={draft.exercises} onChange={(exercises) => setDraft({ exercises })} bodyweight={form === "bodyweight"} error={errors?.field === "exercises"} suggestions={[...new Set(logs.filter((l) => l.sport === sport).flatMap((l) => (l.details?.exercises || []).map((e) => e.name)))].slice(0, 8)} />
            {fieldError("exercises") ? <T variant="caption" tone="err">{fieldError("exercises")}</T> : null}
            {durationBlock("Durée de la séance", true)}
          </>
        ) : form === "climbing" ? (
          <>
            <Segmented
              value={draft.climbing.discipline}
              onChange={(discipline) => setDraft((d) => ({ ...d, climbing: { ...d.climbing, discipline, system: GRADE_SYSTEMS[discipline][0] } }))}
              options={[
                { value: "Bloc", label: "Bloc" },
                { value: "Voie", label: "Voie" },
              ]}
              accessibilityLabel="Discipline"
            />
            <Segmented
              value={draft.climbing.location}
              onChange={(location) => setDraft((d) => ({ ...d, climbing: { ...d.climbing, location } }))}
              options={[
                { value: "Salle", label: "En salle" },
                { value: "Extérieur", label: "En extérieur" },
              ]}
              accessibilityLabel="Lieu"
            />
            {draft.climbing.discipline === "Bloc" ? (
              <View style={styles.wrap}>
                {GRADE_SYSTEMS.Bloc.map((s) => (
                  <Chip key={s} label={s} selected={draft.climbing.system === s} onPress={() => setDraft((d) => ({ ...d, climbing: { ...d.climbing, system: s } }))} />
                ))}
              </View>
            ) : (
              <View style={styles.wrap}>
                {BELAYS.map((b) => (
                  <Chip key={b} label={b} selected={draft.climbing.belay === b} onPress={() => setDraft((d) => ({ ...d, climbing: { ...d.climbing, belay: d.climbing.belay === b ? "" : b } }))} />
                ))}
              </View>
            )}
            <View style={styles.row}>
              <Field compact label="Essais" value={draft.climbing.attempts} onChangeText={(attempts) => setDraft((d) => ({ ...d, climbing: { ...d.climbing, attempts } }))} keyboardType="number-pad" placeholder="8" />
              <Field compact label="Réussites" value={draft.climbing.successes} onChangeText={(successes) => setDraft((d) => ({ ...d, climbing: { ...d.climbing, successes } }))} keyboardType="number-pad" placeholder="5" error={fieldError("climbing.successes") ? " " : null} />
              <Field compact label="Meilleure cotation" value={draft.climbing.best} onChangeText={(best) => setDraft((d) => ({ ...d, climbing: { ...d.climbing, best } }))} autoCapitalize="none" placeholder={draft.climbing.system === "V-scale bloc" ? "V4" : "6a+"} error={fieldError("climbing.best") ? " " : null} />
            </View>
            {fieldError("climbing.successes") || fieldError("climbing.best") ? <T variant="caption" tone="err">{fieldError("climbing.successes") || fieldError("climbing.best")}</T> : null}
            {durationBlock("Durée")}
          </>
        ) : (
          <>
            {!["min", "h"].includes(Sports.unitOf(sport)) ? (
              <Field label={`Valeur (${Sports.unitOf(sport)})`} value={draft.value} onChangeText={(value) => setDraft({ value })} keyboardType="decimal-pad" error={fieldError("value")} hint="Ou indique seulement une durée." />
            ) : null}
            {durationBlock()}
          </>
        )}
      </Section>

      <SportMetricsEditor sport={sport} values={draft.extras} onChange={(extras) => setDraft({ extras })} plus={profile?.is_elite} error={errors?.field?.startsWith("extras.") ? errors.message : null} />

      <Card tone="flat" style={{ gap: space.s3 }}>
        <View style={styles.row}>
          <Icon name="timer" size={22} color={running ? colors.cy : colors.tx3} />
          <T variant="num" style={{ flex: 1 }} accessibilityLabel={`Chronomètre ${clock}`}>
            {clock}
          </T>
          <Button small kind={running ? "secondary" : "primary"} label={running ? "Pause" : ms ? "Reprendre" : "Démarrer"} icon={running ? "pause" : "play"} onPress={() => setStopwatch(owner, running ? { elapsed: elapsedMs(timer), started: null } : { elapsed: timer.elapsed, started: Date.now() })} />
        </View>
        {ms > 0 ? (
          <View style={styles.row}>
            <Button small kind="ghost" label="Remettre à zéro" onPress={() => setStopwatch(owner, { elapsed: 0, started: null })} style={{ flex: 1 }} />
            <Button small kind="secondary" label="Utiliser comme durée" onPress={useStopwatch} style={{ flex: 1.3 }} />
          </View>
        ) : (
          <T variant="caption" tone="faint">
            Le chrono continue même si tu quittes l’écran ou fermes l’application.
          </T>
        )}
      </Card>

      <Section title="Ressenti (RPE)">
        <RpeSelector value={draft.rpe} onChange={(rpe) => setDraft({ rpe })} />
        <T variant="caption" tone="faint">
          {draft.rpe ? `${draft.rpe}/10 · ${RPE_TEXT[draft.rpe]}` : "Facultatif. 5 = modéré par défaut pour le calcul de l’effort."}
        </T>
      </Section>

      <Field testID="session-note" label="Note (facultatif)" value={draft.note} onChangeText={(note) => setDraft({ note: note.slice(0, noteLimit(profile?.is_elite)) })} placeholder="Sensations, conditions, ce que tu veux retrouver…" multiline style={{ minHeight: 84, textAlignVertical: "top" }} hint={`${draft.note.length}/${noteLimit(profile?.is_elite)}`} />

      {preview ? (
        <Card tone="accent" style={{ gap: 6 }}>
          <View style={styles.row}>
            <Icon name="bolt" size={20} color={colors.cy} />
            <T variant="bodyStrong" style={{ flex: 1 }}>
              {historical ? "Historique : aucune XP" : `≈ ${Format.number(preview.xp)} XP`}
            </T>
          </View>
          <T variant="caption" tone="muted">
            {preview.estimated ? "Durée estimée d’après la distance ou les séries. " : ""}
            {Math.round(preview.counted)} min comptées × intensité {String(preview.intensity).replace(".", ",")}. Estimation : le serveur confirme l’XP réelle (plafonds 1 800/jour, 9 600/semaine).
          </T>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.s2, alignItems: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  sportHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  famDot: { width: 10, height: 10, borderRadius: 5 },
  change: { minHeight: TOUCH, paddingHorizontal: 8, justifyContent: "center" },
});
