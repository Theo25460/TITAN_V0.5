import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Group } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import { T } from "../../components/Text";
import { ToggleRow } from "../../components/Toggle";
import { useToast } from "../../components/Toast";
import { useOwner } from "../../data/auth";
import { useSavePrefs } from "../../data/hooks";
import { applyReminders, DEFAULT_REMINDERS, ensurePermission, type ReminderSettings } from "../../lib/reminders";
import { ownerKey, readJSON, writeJSON } from "../../lib/storage";
import { space } from "../../theme/tokens";

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** Reminders are off by default, personalised and never guilt-inducing (CDC: onboarding and notifications). */
export function NotificationsScreen() {
  const owner = useOwner();
  const toast = useToast();
  const savePrefs = useSavePrefs();
  const [s, setS] = useState<ReminderSettings | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    readJSON(ownerKey("reminders", owner), DEFAULT_REMINDERS).then(setS);
  }, [owner]);
  if (!s) return <Screen>{null}</Screen>;

  async function update(next: ReminderSettings) {
    if ((next.weeklyRecap || next.training) && !(await ensurePermission())) {
      setDenied(true);
      return;
    }
    setDenied(false);
    setS(next);
    await writeJSON(ownerKey("reminders", owner), next);
    try {
      await applyReminders(next);
      savePrefs.mutate({ prefs: { notifications: { weeklyRecap: next.weeklyRecap, training: next.training, days: next.days, hour: next.hour, minute: next.minute } } });
    } catch {
      toast({ kind: "err", title: "Rappels non programmés", message: "Android a refusé la programmation. Vérifie les autorisations de TITAN." });
    }
  }

  return (
    <Screen>
      <T tone="muted">Des rappels discrets, uniquement si tu les choisis. Ils restent sur ce téléphone : aucun envoi depuis un serveur.</T>
      <Group>
        <ToggleRow label="Récap de la semaine" hint="Le lundi à 9 h : volume, records et prochaine étape." value={s.weeklyRecap} onChange={(v) => update({ ...s, weeklyRecap: v })} />
        <ToggleRow label="Rappel d’entraînement" hint="Les jours et à l’heure de ton choix." value={s.training} onChange={(v) => update({ ...s, training: v })} last />
      </Group>
      {s.training ? (
        <View style={{ gap: space.s3 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {DAYS.map((d, i) => (
              <Chip key={d} label={d} selected={s.days.includes(i + 1)} onPress={() => update({ ...s, days: s.days.includes(i + 1) ? s.days.filter((x) => x !== i + 1) : [...s.days, i + 1].sort() })} />
            ))}
          </View>
          <Button
            kind="secondary"
            icon="clock"
            label={`À ${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`}
            onPress={() => {
              const value = new Date();
              value.setHours(s.hour, s.minute, 0, 0);
              DateTimePickerAndroid.open({ value, mode: "time", is24Hour: true, onChange: (e, d) => e.type === "set" && d && update({ ...s, hour: d.getHours(), minute: d.getMinutes() }) });
            }}
          />
        </View>
      ) : null}
      {denied ? (
        <View style={{ gap: space.s2 }}>
          <T variant="small" tone="warn">Les notifications de TITAN sont désactivées dans Android. Active-les dans les réglages du téléphone pour recevoir tes rappels.</T>
          <Button small kind="secondary" label="Ouvrir les réglages Android" onPress={() => Linking.openSettings()} />
        </View>
      ) : null}
    </Screen>
  );
}
