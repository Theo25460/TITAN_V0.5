import { StyleSheet, View } from "react-native";
import { Format, Progress, Sports } from "../core";
import type { TrainingLog } from "../core/types";
import { colors, familyColors, space } from "../theme/tokens";
import { Icon } from "./Icon";
import { Tap } from "./Pressable";
import { T } from "./Text";

export function sessionHeadline(log: TrainingLog) {
  const ex = log.details?.exercises;
  if (log.unit === "km") return Format.distance(Number(log.val));
  if (log.unit === "m") return `${Format.number(Number(log.val))} m`;
  if (ex?.length) return `${ex.length} exercice${ex.length > 1 ? "s" : ""}`;
  if (log.unit === "min") return Format.duration(Number(log.val));
  if (log.unit === "h") return Format.duration(Number(log.val) * 60);
  return `${Format.number(Number(log.val))} ${log.unit || ""}`.trim();
}

export function SessionRow({ log, onPress }: { log: TrainingLog; onPress: () => void }) {
  const fam = Sports.familyOf(log.sport);
  const m = Progress.minutesOf(log);
  const pending = log.syncStatus && log.syncStatus !== "confirmed";
  const detail = [m.minutes ? `${Format.duration(m.minutes)}${m.estimated ? " est." : ""}` : null, log.syncStatus === "confirmed" && log.xp ? `+${log.xp} XP` : null].filter(Boolean).join(" · ");
  return (
    <Tap onPress={onPress} accessibilityLabel={`${Sports.label(log.sport)}, ${sessionHeadline(log)}, ${Format.relativeDay(log.date)}${pending ? ", en attente d’envoi" : ""}`} style={styles.tap}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: `${familyColors[fam]}22` }]}>
          <Icon name={Sports.FAMILY_ICON[fam]} size={20} color={familyColors[fam]} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T variant="bodyStrong" numberOfLines={1}>
            {Sports.label(log.sport)} · {sessionHeadline(log)}
          </T>
          <T variant="caption" tone="faint" numberOfLines={1}>
            {Format.relativeDay(log.date)} {Format.time(log.date)}
            {detail ? ` · ${detail}` : ""}
          </T>
        </View>
        {pending ? <Icon name={log.syncStatus === "error" ? "alert" : "offline"} size={18} color={log.syncStatus === "error" ? colors.err : colors.warn} /> : null}
        <Icon name="chevron" size={18} color={colors.tx4} />
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  tap: { borderRadius: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: space.s3, padding: space.s3, borderRadius: 14, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
