import { StyleSheet, View } from "react-native";
import { colors, TOUCH } from "../theme/tokens";
import { Icon } from "./Icon";
import { Tap } from "./Pressable";

export function Checkbox({ checked, onChange, children, accessibilityLabel, error }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; accessibilityLabel: string; error?: boolean }) {
  return (
    <Tap onPress={() => onChange(!checked)} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={accessibilityLabel} style={styles.row} haptics>
      <View style={[styles.box, checked && styles.on, error && !checked && { borderColor: colors.err }]}>{checked ? <Icon name="check" size={16} color={colors.cyInk} strokeWidth={2.6} /> : null}</View>
      <View style={{ flex: 1 }}>{children}</View>
    </Tap>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, alignItems: "center", minHeight: TOUCH, paddingVertical: 6 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: colors.line3, alignItems: "center", justifyContent: "center" },
  on: { backgroundColor: colors.cy, borderColor: colors.cy },
});
