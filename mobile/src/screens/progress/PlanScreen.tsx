import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Field } from "../../components/Field";
import { Tap } from "../../components/Pressable";
import { Screen } from "../../components/Screen";
import { Section } from "../../components/Section";
import { Sheet } from "../../components/Sheet";
import { SportGrid, SportSearch } from "../../components/SportPicker";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Format, Sports } from "../../core";
import { usePrefs, useSavePrefs } from "../../data/hooks";
import { errorMessage } from "../../lib/errors";
import { useOnline } from "../../lib/network";
import { colors, radius, space } from "../../theme/tokens";

const DAYS: [string, string][] = [
  ["monday", "Lundi"],
  ["tuesday", "Mardi"],
  ["wednesday", "Mercredi"],
  ["thursday", "Jeudi"],
  ["friday", "Vendredi"],
  ["saturday", "Samedi"],
  ["sunday", "Dimanche"],
];

/** Weekly rhythm (cadence target, paused weeks) and planned week — the same preferences as the website QG/Prévoir. */
export function PlanScreen() {
  const prefs = usePrefs();
  const save = useSavePrefs();
  const toast = useToast();
  const online = useOnline();
  const [editing, setEditing] = useState<string | null>(null);
  const [minutes, setMinutes] = useState("");
  const thisWeek = Format.dateKey(Format.weekStart(new Date()));
  const paused = prefs.cadencePauses.includes(thisWeek);

  const persist = async (patch: Parameters<typeof save.mutateAsync>[0]["prefs"], ok: string) => {
    try {
      await save.mutateAsync({ prefs: patch });
      toast({ kind: "ok", title: ok });
    } catch (e) {
      toast({ kind: "err", title: "Non enregistré", message: errorMessage(e) });
    }
  };

  function setDay(key: string, sport: string | null) {
    const schedule = { ...(prefs.schedule || {}) };
    const old = schedule[key] || {};
    const m = Number(minutes.replace(",", "."));
    schedule[key] = sport ? { ...old, sport, minutes: m > 0 ? Math.min(600, Math.round(m)) : null, note: old.note || "" } : { ...old, sport: null, minutes: null, note: "" };
    setEditing(null);
    persist({ schedule }, sport ? "Jour planifié" : "Jour libéré");
  }

  return (
    <Screen>
      {!online ? <T variant="caption" tone="warn">Hors ligne : les réglages s’enregistrent avec une connexion.</T> : null}
      <Section title="Ma cadence">
        <Card style={{ gap: space.s3 }}>
          <T>Combien de jours actifs par semaine ? Une semaine qui atteint ce nombre est une semaine tenue.</T>
          <View style={styles.targets} accessibilityRole="radiogroup">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <Tap key={n} disabled={!online || save.isPending} onPress={() => persist({ weeklyGoalSessions: n }, `Cadence : ${n} jour${n > 1 ? "s" : ""} par semaine`)} accessibilityRole="radio" accessibilityState={{ checked: prefs.weeklyGoalSessions === n }} accessibilityLabel={`${n} jours`} style={[styles.target, prefs.weeklyGoalSessions === n && styles.targetOn]}>
                <T variant="h3" color={prefs.weeklyGoalSessions === n ? colors.cyInk : colors.tx}>
                  {n}
                </T>
              </Tap>
            ))}
          </View>
        </Card>
        <Card tone="flat" style={{ gap: space.s2 }}>
          <T variant="bodyStrong">{paused ? "Cette semaine est en pause" : "Semaine difficile ?"}</T>
          <T variant="small">Vacances, blessure, imprévu : une semaine en pause sort de ta cadence au lieu de compter comme manquée.</T>
          <Button small kind="secondary" label={paused ? "Reprendre cette semaine" : "Mettre cette semaine en pause"} disabled={!online} onPress={() => persist({ cadencePauses: paused ? prefs.cadencePauses.filter((p) => p !== thisWeek) : [...prefs.cadencePauses, thisWeek].slice(-52) }, paused ? "Semaine reprise" : "Semaine en pause")} />
        </Card>
      </Section>
      <Section title="Ma semaine type">
        <T variant="small">Planifie tes créneaux : le QG te propose la séance du jour.</T>
        {DAYS.map(([key, label]) => {
          const d = prefs.schedule?.[key];
          const sport = d?.sport && Sports.conf(d.sport) ? d.sport : null;
          return (
            <Card key={key} onPress={() => { setMinutes(d?.minutes ? String(d.minutes) : ""); setEditing(key); }} accessibilityLabel={`${label} : ${sport ? Sports.label(sport) : "repos"}`} style={styles.day}>
              <T variant="bodyStrong" style={{ width: 92 }}>
                {label}
              </T>
              <T variant="small" tone={sport ? "default" : "faint"} style={{ flex: 1 }}>
                {sport ? `${Sports.label(sport)}${d?.minutes ? ` · ${Format.duration(d.minutes)}` : ""}` : "Repos ou libre"}
              </T>
            </Card>
          );
        })}
      </Section>
      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={DAYS.find(([k]) => k === editing)?.[1]}>
        <Field label="Durée prévue (minutes, facultatif)" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />
        <SportSearch onPick={(s) => editing && setDay(editing, s)} />
        <SportGrid ids={[...new Set([...prefs.favoriteSports, ...Sports.POPULAR])].slice(0, 12)} onPick={(s) => editing && setDay(editing, s)} />
        <Chip label="Repos ce jour-là" icon="leaf" onPress={() => editing && setDay(editing, null)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  targets: { flexDirection: "row", gap: 6 },
  target: { flex: 1, height: 52, borderRadius: radius.r2, backgroundColor: colors.bg1, borderWidth: 1, borderColor: colors.line2, alignItems: "center", justifyContent: "center" },
  targetOn: { backgroundColor: colors.cy, borderColor: colors.cy },
  day: { flexDirection: "row", alignItems: "center", gap: space.s3, paddingVertical: space.s3 },
});
