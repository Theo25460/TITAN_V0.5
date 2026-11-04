import { useWindowDimensions, StyleSheet, View } from "react-native";
import { RPE_TEXT } from "../core/session";
import { colors, radius, TOUCH } from "../theme/tokens";
import { Tap } from "./Pressable";
import { T } from "./Text";

const GAP = 4;
const HORIZONTAL_PADDING = 32; // Screen uses 16dp on each side
const MAX_CONTENT_WIDTH = 688; // Screen maxWidth 720dp minus horizontal padding
const OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);

/**
 * RPE buttons must keep a >=48dp target even on compact phones and split-screen windows.
 * Width is the current window, not the device's physical size (foldable/multi-window safe).
 */
export function rpeColumns(windowWidth: number): number {
  if (!Number.isFinite(windowWidth)) return 2;
  const available = Math.min(MAX_CONTENT_WIDTH, Math.max(0, windowWidth - HORIZONTAL_PADDING));
  return Math.max(2, Math.min(5, Math.floor((available + GAP) / (TOUCH + GAP))));
}

export function RpeSelector({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  const { width } = useWindowDimensions();
  const columns = rpeColumns(width);
  const rows = Array.from({ length: Math.ceil(OPTIONS.length / columns) }, (_, i) => OPTIONS.slice(i * columns, (i + 1) * columns));

  return (
    <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Effort perçu de 1 à 10">
      {rows.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map((n) => (
            <Tap
              key={n}
              onPress={() => onChange(value === n ? null : n)}
              accessibilityRole="radio"
              accessibilityState={{ checked: value === n }}
              accessibilityLabel={`${n}, ${RPE_TEXT[n]}`}
              style={[styles.option, value === n && styles.selected, value !== null && n < value && { backgroundColor: colors.cySoft }]}
            >
              <T variant="bodyStrong" color={value === n ? colors.cyInk : colors.tx}>{n}</T>
            </Tap>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: GAP },
  row: { flexDirection: "row", gap: GAP },
  option: { flex: 1, minWidth: TOUCH, minHeight: TOUCH, borderRadius: radius.r1, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  selected: { backgroundColor: colors.cy, borderColor: colors.cy },
});
