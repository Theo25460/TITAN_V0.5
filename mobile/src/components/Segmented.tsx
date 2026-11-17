import { StyleSheet, View } from "react-native";
import { haptic } from "../lib/haptics";
import { useSpace } from "../theme/space";
import { colors, radius, TOUCH } from "../theme/tokens";
import { Tap } from "./Pressable";
import { T } from "./Text";

export function Segmented<V extends string>({ options, value, onChange, accessibilityLabel }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void; accessibilityLabel?: string }) {
  const theme = useSpace();
  return (
    <View style={styles.row} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Tap
            key={o.value}
            haptics={false}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            onPress={() => {
              if (!on) haptic("selection");
              onChange(o.value);
            }}
            style={[styles.item, on && { backgroundColor: theme.accent }]}
          >
            <T variant="caption" color={on ? theme.ink : colors.tx2} numberOfLines={1} center>
              {o.label}
            </T>
          </Tap>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", backgroundColor: colors.bg2, borderRadius: radius.r2, padding: 3, gap: 3 },
  item: { flex: 1, minHeight: TOUCH, borderRadius: radius.r1 + 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, overflow: "hidden" },
});
