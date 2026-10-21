import { StyleSheet, Switch, View } from "react-native";
import { haptic } from "../lib/haptics";
import { colors, space, TOUCH } from "../theme/tokens";
import { T } from "./Text";

/** Native Android switch row. */
export function ToggleRow({ label, hint, value, onChange, disabled, last, testID }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; last?: boolean; testID?: string }) {
  return (
    <View style={[styles.row, !last && styles.border]}>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyStrong">{label}</T>
        {hint ? <T variant="small">{hint}</T> : null}
      </View>
      <Switch
        testID={testID}
        value={value}
        disabled={disabled}
        onValueChange={(v) => {
          haptic("selection");
          onChange(v);
        }}
        accessibilityLabel={label}
        accessibilityHint={hint}
        trackColor={{ false: colors.bg4, true: colors.cyLine }}
        thumbColor={value ? colors.cy : colors.tx3}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.s3, minHeight: TOUCH + 16, paddingHorizontal: space.s4, paddingVertical: space.s3 },
  border: { borderBottomWidth: 1, borderBottomColor: colors.line },
});
