import { StyleSheet, View } from "react-native";
import { colors, radius, TOUCH } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Tap } from "./Pressable";
import { T } from "./Text";

export function Chip({ label, icon, selected = false, onPress, tone = "default", testID }: { label: string; icon?: IconName; selected?: boolean; onPress?: () => void; tone?: "default" | "amber" | "ok" | "warn" | "err"; testID?: string }) {
  const fg = selected ? colors.cyInk : tone === "amber" ? colors.am : tone === "ok" ? colors.ok : tone === "warn" ? colors.warn : tone === "err" ? colors.err : colors.tx2;
  const bg = selected ? colors.cy : tone === "amber" ? colors.amSoft : tone === "ok" ? colors.okSoft : tone === "warn" ? colors.warnSoft : tone === "err" ? colors.errSoft : colors.bg3;
  const content = (
    <View style={styles.row}>
      {icon ? <Icon name={icon} size={15} color={fg} strokeWidth={2} /> : null}
      <T variant="caption" color={fg} numberOfLines={1}>
        {label}
      </T>
    </View>
  );
  if (!onPress) return <View style={[styles.chip, { backgroundColor: bg }]}>{content}</View>;
  return (
    <Tap onPress={onPress} testID={testID} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={label} style={[styles.chip, styles.tappable, { backgroundColor: bg, borderColor: selected ? colors.cy : colors.line2 }]}>
      {content}
    </Tap>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, alignSelf: "flex-start", overflow: "hidden" },
  tappable: { minHeight: TOUCH, paddingHorizontal: 14, justifyContent: "center", borderWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
});
