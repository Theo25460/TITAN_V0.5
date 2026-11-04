import { StyleSheet, View } from "react-native";
import type { Cadence } from "../core";
import { colors } from "../theme/tokens";
import { T } from "./Text";

/** Eight weekly notches: held, current, partial, missed or paused. No streak to break. */
export function CadenceNotches({ cadence }: { cadence: Cadence }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${cadence.held} semaines tenues sur les ${cadence.window} dernières. Cette semaine : ${cadence.currentDays} jours actifs sur ${cadence.target}.`}>
      {cadence.weeks.map((w) => (
        <View key={w.start} style={styles.col}>
          <View style={[styles.notch, w.state === "held" && styles.held, w.state === "pause" && styles.pause, (w.state === "current" || w.state === "partial") && styles.partial]}>
            {w.state === "current" || w.state === "partial" ? <View style={[styles.fill, { height: `${w.fill}%` }]} /> : null}
          </View>
          <T variant="caption" tone={w.state === "current" ? "accent" : "faint"} style={{ fontSize: 10 }}>
            {w.state === "current" ? "Sem." : new Date(`${w.start}T12:00:00`).getDate()}
          </T>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 6 },
  col: { flex: 1, alignItems: "center", gap: 4 },
  notch: { width: "100%", height: 34, borderRadius: 8, backgroundColor: colors.bg4, overflow: "hidden", justifyContent: "flex-end", borderWidth: 1, borderColor: "transparent" },
  held: { backgroundColor: colors.cy },
  pause: { backgroundColor: "transparent", borderColor: colors.line3, borderStyle: "dashed" },
  partial: { backgroundColor: colors.bg3, borderColor: colors.cyLine },
  fill: { width: "100%", backgroundColor: colors.cyLine },
});
