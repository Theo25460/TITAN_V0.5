import { StyleSheet, View } from "react-native";
import { haptic } from "../lib/haptics";
import { colors, radius, TOUCH } from "../theme/tokens";
import { Tap } from "./Pressable";
import { T } from "./Text";

export function Segmented<V extends string>({ options, value, onChange, accessibilityLabel }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void; accessibilityLabel?: string }) {
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
            style={[styles.item, on && styles.on]}
          >
            <T variant="caption" color={on ? colors.cyInk : colors.tx2} numberOfLines={1} center>
              {o.label}
            </T>
          </Tap>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", backgroundColor: colors.bg1, borderRadius: radius.r2, borderWidth: 1, borderColor: colors.line, padding: 3, gap: 3 },
  item: { flex: 1, minHeight: TOUCH, borderRadius: radius.r1 + 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, overflow: "hidden" },
  on: { backgroundColor: colors.cy },
});
