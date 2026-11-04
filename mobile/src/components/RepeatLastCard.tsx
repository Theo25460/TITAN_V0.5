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

/** "Refaire ma dernière séance" (V12-13/32/33): one tap opens the normal form pre-filled with the previous values.
    The date and the draft are never reused silently and nothing is recorded until the player validates the form. */
export function RepeatLastCard({ log }: { log: TrainingLog }) {
  const navigation = useNavigation();
  const fam = Sports.familyOf(log.sport);
  const minutes = Progress.minutesOf(log).minutes;
  const summary = [sessionHeadline(log), minutes ? Format.duration(minutes) : null].filter(Boolean).join(" · ");
  return (
    <Card
      onPress={() => navigation.navigate("SessionForm", { sport: log.sport, duplicateOf: log.id })}
      accessibilityLabel={`Refaire ma dernière séance : ${Sports.label(log.sport)}, ${summary}. Les valeurs sont préremplies, tu les vérifies avant d’enregistrer.`}
      testID="repeat-last"
    >
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: `${familyColors[fam]}22` }]}>
          <Icon name="restore" size={22} color={familyColors[fam]} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T variant="bodyStrong">Refaire ma dernière séance</T>
          <T variant="small" numberOfLines={2}>
            {Sports.label(log.sport)} · {summary}
          </T>
          <T variant="caption" tone="faint">
            Valeurs préremplies, tu vérifies avant d’enregistrer.
          </T>
        </View>
        <Icon name="chevron" color={colors.tx3} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.s3 },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
