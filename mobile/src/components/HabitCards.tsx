/* Lot 8 « habitudes » — the habit features shown on the QG and in Progress:
   H4 « Mon créneau » (implementation intention), H5 « Juste 10 minutes », H7 the Sunday ritual, H8 the daily energy check-in,
   H9 the run of held weeks, H1 the year in squares and H10 the year projection. All local; nothing sent, nothing granted. */
import { useNavigation } from "@react-navigation/native";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Format, Sports, type Cadence } from "../core";
import type { TrainingLog } from "../core/types";
import { useOwner } from "../data/auth";
import { dayKey, energyAdvice, heldStreak, yearGrid, yearProjection } from "../lib/habits";
import { readIntention, writeIntention } from "../lib/intention";
import { ownerKey, readJSON, writeJSON } from "../lib/storage";
import { colors, space } from "../theme/tokens";
import { Button } from "./Button";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { Field } from "./Field";
import { T } from "./Text";

/** H5 + H4 + H9: the habit strip of the QG — the quick session, one's own slot, and the run of held weeks. */
export function HabitStrip({ logs, cadence, favorite }: { logs: TrainingLog[]; cadence: Cadence; favorite: string | null }) {
  const navigation = useNavigation();
  const owner = useOwner();
  const [intention, setIntention] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  // A late first read must never overwrite a slot the player has just saved.
  const touched = useRef(false);
  useEffect(() => {
    readIntention(owner).then((v) => {
      if (!touched.current) setIntention(v);
    });
  }, [owner]);
  const sport = favorite ?? logs.find((l) => l.sport && Sports.conf(l.sport))?.sport ?? "walking";
  const streak = heldStreak(cadence);
  return (
    <Card style={{ gap: space.s2 }} testID="qg-habits">
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.s2 }}>
        <View style={{ flex: 1 }}>
          <T variant="eyebrow" tone="accent">Mon créneau</T>
          <T variant="bodyStrong">{intention ?? "Quand est-ce que tu bouges ?"}</T>
        </View>
        <Button small kind="ghost" label={intention ? "Modifier" : "Le choisir"} onPress={() => { setText(intention ?? ""); setEditing(!editing); }} testID="habit-intention-edit" />
      </View>
      {editing ? (
        <View style={{ gap: 6 }}>
          <Field value={text} onChangeText={setText} maxLength={80} placeholder="Après le travail, je cours 20 minutes" testID="habit-intention" />
          <Button small label="Enregistrer mon créneau" onPress={async () => { touched.current = true; await writeIntention(owner, text); setIntention(text.trim() || null); setEditing(false); }} testID="habit-intention-save" />
          <T variant="caption" tone="faint">Lier ta séance à un moment précis de ta journée est la façon la plus sûre d’en faire une habitude. TITAN te le rappellera.</T>
        </View>
      ) : null}
      <Button kind="secondary" icon="timer" label={`Juste 10 minutes · ${Sports.label(sport)}`} onPress={() => navigation.navigate("SessionForm", { sport, quickMinutes: 10 })} testID="habit-quick" />
      {streak >= 2 ? <T variant="small" testID="habit-streak">{streak} semaines tenues d’affilée. Une pause déclarée ne casse rien.</T> : null}
    </Card>
  );
}

/** H7: on Sunday, prepare the week in 30 seconds (the weekly plan). */
export function SundayRitualCard({ now = new Date() }: { now?: Date }) {
  const navigation = useNavigation();
  if (now.getDay() !== 0) return null;
  return (
    <Card tone="accent" onPress={() => navigation.navigate("Plan")} accessibilityLabel="Prépare ta semaine en 30 secondes" testID="qg-sunday">
      <T variant="eyebrow" tone="accent">Rituel du dimanche</T>
      <T variant="bodyStrong">Prépare ta semaine en 30 secondes : tes jours, tes sports.</T>
    </Card>
  );
}

const LEVELS = [
  { v: 1, label: "Épuisé" },
  { v: 2, label: "Fatigué" },
  { v: 3, label: "Correct" },
  { v: 4, label: "En forme" },
  { v: 5, label: "Au top" },
];

/** H8: a 5-second daily check-in on the QG; the answer turns into a suggestion for today. Kept on the phone. */
export function EnergyCheckIn({ now = new Date() }: { now?: Date }) {
  const owner = useOwner();
  const key = ownerKey("energy", owner);
  const today = dayKey(now);
  const [level, setLevel] = useState<number | null>(null);
  useEffect(() => {
    readJSON<{ day: string; level: number } | null>(key, null).then((v) => setLevel(v?.day === today ? v.level : null));
  }, [key, today]);
  return (
    <Card style={{ gap: space.s2 }} testID="qg-energy">
      <T variant="eyebrow" tone="accent">Ton énergie aujourd’hui</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {LEVELS.map((l) => (
          <Chip key={l.v} label={l.label} selected={level === l.v} onPress={() => { setLevel(l.v); void writeJSON(key, { day: today, level: l.v }); }} />
        ))}
      </View>
      {level ? <T variant="small" testID="energy-advice">{energyAdvice(level)}</T> : null}
    </Card>
  );
}

/** H1 + H10: the last 53 weeks in squares, and the year projected at the current pace. */
export function YearSquares({ logs, now = new Date() }: { logs: TrainingLog[]; now?: Date }) {
  const grid = useMemo(() => yearGrid(logs, now), [logs, now]);
  const proj = useMemo(() => yearProjection(logs, now), [logs, now]);
  const shade = (m: number) => (m <= 0 ? colors.bg4 : m < 30 ? "#1F5E66" : m < 60 ? "#2A8F99" : m < 90 ? "#33B8C4" : colors.cy);
  return (
    <Card style={{ gap: space.s2 }} testID="year-squares">
      <T variant="eyebrow" tone="accent">Mon année en carrés</T>
      <View style={styles.grid} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {grid.weeks.map((w, i) => (
          <View key={i} style={styles.col}>
            {w.map((d) => (
              <View key={d.key} style={[styles.cell, { backgroundColor: d.future ? "transparent" : shade(d.minutes) }]} />
            ))}
          </View>
        ))}
      </View>
      <T variant="small">{Format.number(grid.activeDays)} jour{grid.activeDays > 1 ? "s" : ""} actif{grid.activeDays > 1 ? "s" : ""} sur les 12 derniers mois.</T>
      {proj ? <T variant="small" tone="muted" testID="year-projection">{proj.year} : {Format.number(proj.hours)} h d’effort. À ce rythme, {Format.number(proj.projected)} h au 31 décembre.</T> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", gap: 2, justifyContent: "space-between" },
  col: { flex: 1, gap: 2 },
  cell: { aspectRatio: 1, borderRadius: 1.5 },
});
