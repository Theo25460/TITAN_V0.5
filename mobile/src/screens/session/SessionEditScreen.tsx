import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "../../components/Button";
import { Field } from "../../components/Field";
import { Screen } from "../../components/Screen";
import { EmptyState } from "../../components/States";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Format, Sports } from "../../core";
import { num, type ExerciseDraft } from "../../core/session";
import type { SessionPatch } from "../../data/api";
import { useLogs, useUpdateSession } from "../../data/hooks";
import { errorMessage } from "../../lib/errors";
import type { RootParams } from "../../navigation/types";
import { space } from "../../theme/tokens";
import { ExerciseEditor } from "./ExerciseEditor";

/** Correction of a synchronised session through titan_update_training_session (revision check, server validation). */
export function SessionEditScreen({ navigation, route }: NativeStackScreenProps<RootParams, "SessionEdit">) {
  const { logs, archived } = useLogs();
  const update = useUpdateSession();
  const toast = useToast();
  const log = [...logs, ...archived].find((l) => l.id === route.params.id);
  const d = log?.details || {};
  const hasExercises = !!d.exercises?.length;
  const holds = d.exercises?.some((e) => e.kind === "hold");
  const [date, setDate] = useState(log ? new Date(log.date) : new Date());
  const [value, setValue] = useState(log && !hasExercises ? String(log.val).replace(".", ",") : "");
  const initialDur = Number(d.duration || d.val2) || 0;
  const [durM, setDurM] = useState(initialDur ? String(Math.round(initialDur)) : "");
  const [note, setNote] = useState(String(d.note || ""));
  const [exercises, setExercises] = useState<ExerciseDraft[]>(
    (d.exercises || []).map((e) => ({ name: e.name, variant: e.variant || "", kind: e.kind || "weighted", sets: (e.setRows || []).map((s) => ({ weight: String(s.weight ?? 0), reps: String(s.reps ?? ""), rir: s.rir === null || s.rir === undefined ? "" : String(s.rir), seconds: "" })) })),
  );
  const [error, setError] = useState<string | null>(null);
  if (!log) return <Screen><EmptyState title="Séance introuvable" /></Screen>;

  const unit = log.unit;
  const valueLabel = unit === "km" ? "Distance (km)" : unit === "m" ? "Distance (m)" : unit === "min" ? "Durée (min)" : `Valeur (${unit})`;

  function pick(mode: "date" | "time") {
    DateTimePickerAndroid.open({
      value: date,
      mode,
      is24Hour: true,
      maximumDate: mode === "date" ? new Date() : undefined,
      onChange: (e, next) => {
        if (e.type !== "set" || !next) return;
        const merged = new Date(date);
        if (mode === "date") merged.setFullYear(next.getFullYear(), next.getMonth(), next.getDate());
        else merged.setHours(next.getHours(), next.getMinutes(), 0, 0);
        setDate(merged);
      },
    });
  }

  async function save() {
    if (!log) return;
    setError(null);
    const patch: SessionPatch = {};
    if (Math.abs(date.getTime() - new Date(log.date).getTime()) > 30000) {
      if (date.getTime() > Date.now() + 60000) return setError("La date ne peut pas être dans le futur.");
      patch.date = date.toISOString();
    }
    if (!hasExercises && unit !== "min") {
      const v = num(value);
      if (!(v && v > 0)) return setError("Indique une valeur supérieure à zéro.");
      if (v !== Number(log.val)) patch.val = v;
    }
    const dm = num(durM);
    if (unit === "min") {
      if (!(dm && dm > 0 && dm <= 1440)) return setError("La durée va de 1 minute à 24 heures.");
      if (dm !== Number(log.val)) patch.val = dm;
    } else if ((dm ?? 0) !== initialDur) {
      if (dm !== null && (dm <= 0 || dm > 1440)) return setError("La durée va de 1 minute à 24 heures.");
      patch.duration = dm;
    }
    if (note.trim() !== String(d.note || "")) patch.note = note.trim();
    if (hasExercises && !holds) {
      const clean = exercises
        .filter((e) => e.name.trim())
        .map((e) => ({ name: e.name.trim(), variant: e.variant, setRows: e.sets.filter((s) => (num(s.reps) || 0) > 0).map((s) => ({ weight: num(s.weight) || 0, reps: Math.round(num(s.reps) || 0), rir: num(s.rir) })) }))
        .filter((e) => e.setRows.length);
      if (!clean.length) return setError("Garde au moins un exercice avec une série complète.");
      if (JSON.stringify(clean) !== JSON.stringify((d.exercises || []).map((e) => ({ name: e.name, variant: e.variant || "", setRows: (e.setRows || []).map((s) => ({ weight: s.weight || 0, reps: s.reps || 0, rir: s.rir ?? null })) })))) patch.exercises = clean;
    }
    if (!Object.keys(patch).length) return navigation.goBack();
    try {
      await update.mutateAsync({ log, patch });
      toast({ kind: "ok", title: "Séance corrigée" });
      navigation.goBack();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Screen
      keyboard
      footer={
        <View style={{ gap: 6 }}>
          {error ? <T variant="small" tone="err" accessibilityRole="alert">{error}</T> : null}
          <Button label="Enregistrer la correction" loading={update.isPending} onPress={save} />
        </View>
      }
    >
      <T variant="h2">{Sports.label(log.sport)}</T>
      <View style={{ flexDirection: "row", gap: space.s2 }}>
        <Button kind="secondary" icon="calendar" label={Format.longDate(date)} onPress={() => pick("date")} style={{ flex: 1.5 }} />
        <Button kind="secondary" icon="clock" label={Format.time(date)} onPress={() => pick("time")} style={{ flex: 1 }} />
      </View>
      {!hasExercises && unit !== "min" ? <Field label={valueLabel} value={value} onChangeText={setValue} keyboardType="decimal-pad" /> : null}
      <Field label={unit === "min" ? "Durée (minutes)" : "Durée en minutes (facultatif)"} value={durM} onChangeText={setDurM} keyboardType="decimal-pad" />
      {hasExercises ? holds ? <T variant="small">Les exercices de maintien se corrigent depuis le site pour l’instant.</T> : <ExerciseEditor exercises={exercises} onChange={setExercises} bodyweight={Sports.formOf(log.sport) === "bodyweight"} /> : null}
      <Field label="Note" value={note} onChangeText={setNote} multiline style={{ minHeight: 84, textAlignVertical: "top" }} />
      <T variant="caption" tone="faint">
        La correction ne modifie jamais l’XP ni les crédits déjà accordés.
      </T>
    </Screen>
  );
}
