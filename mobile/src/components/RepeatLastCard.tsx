import { useNavigation } from "@react-navigation/native";
import { StyleSheet, View } from "react-native";
import { Format, Progress, Sports } from "../core";
import type { TrainingLog } from "../core/types";
import { colors, familyColors, space } from "../theme/tokens";
import { Card } from "./Card";
import { Icon } from "./Icon";
import { sessionHeadline } from "./SessionRow";
import { T } from "./Text";

/** The session worth offering again: the most recent one whose sport the catalogue still knows. */
export function lastSessionToRepeat(active: TrainingLog[]): TrainingLog | null {
  return active.find((l) => l.sport && Sports.conf(l.sport)) ?? null;
}

/** The latest session of each of the most recent distinct sports (AUD-15): after a run, the leg day stays one tap away. */
export function lastSessionsToRepeat(active: TrainingLog[], max = 3): TrainingLog[] {
  const out: TrainingLog[] = [];
  const seen = new Set<string>();
  for (const l of active) {
    if (out.length >= max) break;
    if (!l.sport || seen.has(l.sport) || !Sports.conf(l.sport)) continue;
    seen.add(l.sport);
    out.push(l);
  }
  return out;
}

/** "Refaire ma dernière séance" (V12-13/32/33): one tap opens the normal form pre-filled with the previous values.
    The date and the draft are never reused silently and nothing is recorded until the player validates the form. */
export function RepeatLastCard({ log, compact = false, title = "Refaire ma dernière séance", testID = "repeat-last" }: { log: TrainingLog; compact?: boolean; title?: string; testID?: string }) {
  const navigation = useNavigation();
  const fam = Sports.familyOf(log.sport);
  const minutes = Progress.minutesOf(log).minutes;
  const summary = [sessionHeadline(log), minutes ? Format.duration(minutes) : null].filter(Boolean).join(" · ");
  return (
    <Card
      tone="ruled"
      onPress={() => navigation.navigate("SessionForm", { sport: log.sport, duplicateOf: log.id })}
      accessibilityLabel={`${title} : ${Sports.label(log.sport)}, ${summary}. Les valeurs sont préremplies, tu les vérifies avant d’enregistrer.`}
      testID={testID}
    >
      <View style={styles.row}>
        <View style={styles.icon}>
          <Icon name="restore" size={22} color={familyColors[fam]} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T variant="bodyStrong">{title}</T>
          <T variant="small" numberOfLines={2}>
            {Sports.label(log.sport)} · {summary}
          </T>
          {compact ? null : (
            <T variant="caption" tone="faint">
              Valeurs préremplies, tu vérifies avant d’enregistrer.
            </T>
          )}
        </View>
        <Icon name="chevron" color={colors.tx3} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.s3 },
  icon: { width: 30, height: 44, alignItems: "flex-start", justifyContent: "center" },
});
