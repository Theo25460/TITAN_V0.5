import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Alert } from "../../components/Dialog";
import { Button } from "../../components/Button";
import { BarChart } from "../../components/Charts";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { Group, ListRow } from "../../components/ListRow";
import { Ring } from "../../components/Progress";
import { Screen } from "../../components/Screen";
import { stepsStatus } from "../../components/StepsCard";
import { T } from "../../components/Text";
import { ToggleRow } from "../../components/Toggle";
import { useToast } from "../../components/Toast";
import { useSteps } from "../../data/steps";
import { approxKm } from "../../lib/stepLedger";
import { GOAL_MAX, GOAL_MIN, GOAL_PRESETS, stepsText } from "../../lib/steps";
import { colors, space } from "../../theme/tokens";

const DAY = ["D", "L", "M", "M", "J", "V", "S"];
const km = (steps: number) => String(approxKm(steps)).replace(".", ",");

/** The steps, in one place (V12-01): today's ring, the goal, the week, and where the numbers come from. TITAN's own counter is the
    default way to count; Santé Connect stays available for people who already use it. */
export function StepsScreen() {
  const s = useSteps();
  const navigation = useNavigation() as unknown as { navigate: (n: string) => void };
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const v = s.view;
  const status = stepsStatus(s, Date.now());
  const done = v.ratio !== null && v.ratio >= 1;
  const trend = v.trend === "up" ? "En hausse sur la semaine" : v.trend === "down" ? "En baisse sur la semaine" : v.trend === "flat" ? "Stable sur la semaine" : null;

  const toggleOwn = async (on: boolean) => {
    if (on) {
      const r = await s.own.enable();
      if (r === "unsupported") toast({ kind: "warn", title: "Pas de capteur de pas", message: "Ce téléphone n’a pas de compteur de pas matériel." });
      else if (r === "blocked") toast({ kind: "warn", title: "Autorisation refusée", message: "Réactive « activité physique » pour TITAN dans les réglages d’Android." });
      else if (r === "denied") toast({ kind: "warn", title: "Autorisation nécessaire", message: "Android demande « activité physique » pour lire le capteur." });
      else toast({ kind: "ok", title: "Compteur activé", message: "TITAN compte tes pas pendant qu’il est ouvert et rattrape ceux faits en veille." });
    } else await s.own.disable();
  };

  return (
    <Screen>
      <Card style={{ alignItems: "center", gap: space.s3, paddingVertical: space.s6 }} testID="steps-hero">
        <Ring value={v.ratio ?? 0} size={168} stroke={12} color={done ? colors.ok : colors.cy}>
          <View style={{ alignItems: "center", paddingHorizontal: 12 }}>
            {v.today !== null ? (
              <T variant="display" numberOfLines={1} adjustsFontSizeToFit accessibilityLabel={`${stepsText(v.today)} pas aujourd’hui`}>
                {stepsText(v.today)}
              </T>
            ) : (
              <T tone="muted" center>
                Pas de chiffre
              </T>
            )}
            <T variant="caption" tone="faint">
              {v.goal ? `sur ${stepsText(v.goal)}` : "pas aujourd’hui"}
            </T>
          </View>
        </Ring>
        {v.today !== null ? (
          <T variant="small" center>
            {done ? "Objectif atteint. " : v.goal ? `Encore ${stepsText(Math.max(0, v.goal - v.today))} pas. ` : ""}≈ {km(v.today)} km
          </T>
        ) : null}
        <View style={styles.status}>
          {status.live ? <View style={styles.dot} /> : null}
          <T variant="caption" tone={status.level === "fresh" ? "accent" : "warn"} center testID="steps-freshness">
            {status.text}
          </T>
        </View>
        {s.own.partialFirstDay && s.source === "titan" && s.own.startedAt ? (
          <T variant="caption" tone="faint" center>
            Compté depuis {new Date(s.own.startedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} : les pas d’avant ne sont pas devinés.
          </T>
        ) : null}
        {s.own.estimatedToday > 0 ? (
          <T variant="caption" tone="faint" center>
            Dont environ {stepsText(s.own.estimatedToday)} pas répartis après une longue absence.
          </T>
        ) : null}
      </Card>

      <Group title="Objectif">
        <View style={styles.goal}>
          <View style={styles.chips}>
            {GOAL_PRESETS.map((g) => (
              <Chip key={g} label={stepsText(g)} selected={v.goal === g} onPress={() => { s.setGoal(g); setEditing(false); }} />
            ))}
          </View>
          {v.goal ? (
            editing ? (
              <View style={styles.chips}>
                <Chip label="−1 000" onPress={() => s.setGoal(Math.max(GOAL_MIN, v.goal! - 1000))} />
                <Chip label="+1 000" onPress={() => s.setGoal(Math.min(GOAL_MAX, v.goal! + 1000))} />
                <Chip label="Sans objectif" onPress={() => { s.setGoal(null); setEditing(false); }} />
              </View>
            ) : (
              <Button small kind="ghost" label="Ajuster finement" onPress={() => setEditing(true)} style={{ alignSelf: "flex-start" }} />
            )
          ) : (
            <T variant="caption" tone="faint">
              Choisis un objectif pour voir l’anneau se remplir. Il reste sur ton téléphone.
            </T>
          )}
        </View>
      </Group>

      <Group title="Cette semaine">
        <View style={{ padding: space.s4, gap: space.s2 }}>
          <BarChart
            data={v.week.map((w, i) => ({ label: DAY[new Date(`${w.day}T12:00:00`).getDay()]!, value: w.steps ?? 0, highlight: i === 6, display: w.steps === null ? "–" : stepsText(w.steps), detail: w.steps === null ? "pas de chiffre" : undefined }))}
            height={120}
            scale={false}
            accessibilityLabel={`Pas des sept derniers jours${v.weekAverage ? `, moyenne ${stepsText(v.weekAverage)}` : ""}`}
          />
          <T variant="caption" tone="faint">
            {trend ? `${trend} · ` : ""}
            {v.month.average ? `30 jours : ${stepsText(v.month.average)} par jour en moyenne (${v.month.days} jour${v.month.days > 1 ? "s" : ""} avec chiffre)` : "Pas encore d’historique sur 30 jours"}
          </T>
        </View>
      </Group>

      <Group title="D’où viennent les pas">
        <ToggleRow
          label="Compteur TITAN"
          hint={s.own.supported ? "Le capteur de pas de ton téléphone, sans compte tiers. Compte pendant que TITAN est ouvert et rattrape les pas faits en veille." : "Ce téléphone n’a pas de capteur de pas."}
          value={s.own.enabled}
          disabled={!s.own.supported}
          onChange={toggleOwn}
          testID="steps-own-toggle"
        />
        <ListRow icon="heart" title="Santé Connect" subtitle={s.connected ? "Connecté · les pas de ta montre ou de ton téléphone" : "Facultatif : pour les pas de ta montre"} onPress={() => navigation.navigate("HealthConnect")} last />
      </Group>

      {s.connected ? (
        <Button kind="secondary" icon="restore" label={s.syncing ? "Actualisation…" : "Actualiser depuis Santé Connect"} disabled={s.syncing} onPress={() => s.refresh(false)} testID="steps-refresh" />
      ) : null}
      {s.error ? (
        <T variant="caption" tone="warn" accessibilityRole="alert">
          {s.error}
        </T>
      ) : null}

      <Card tone="flat" style={{ gap: 6 }}>
        <View style={styles.status}>
          <Icon name="shield" size={18} color={colors.cy} />
          <T variant="bodyStrong">Honnête et privé</T>
        </View>
        <T variant="small">
          Si deux sources comptent la même journée, TITAN garde la plus élevée sans les additionner. Les pas ne créent ni séance ni récompense. Le compteur TITAN reste sur ce téléphone.
        </T>
        {s.own.startedAt ? (
          <Button
            small
            kind="ghost"
            label="Effacer les pas comptés par TITAN"
            onPress={() =>
              Alert.alert("Effacer les pas TITAN ?", "Le compteur s’arrête et les pas comptés sur ce téléphone sont effacés. Santé Connect n’est pas touché.", [
                { text: "Annuler", style: "cancel" },
                { text: "Effacer", style: "destructive", onPress: () => s.own.clear() },
              ])
            }
            style={{ alignSelf: "flex-start" }}
            testID="steps-clear"
          />
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.cy },
  goal: { padding: space.s4, gap: space.s3 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
