import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { haptic } from "../lib/haptics";
import { useReducedMotion } from "../lib/motion";
import { colors, space, TOUCH } from "../theme/tokens";
import { Tap } from "./Pressable";
import { T } from "./Text";

const W = 52;
const H = 30;
const KNOB = 22;

/** TITAN's switch: a dark track that lights up cyan, a knob that slides (instantly with reduced motion). Not Android's preset switch. */
export function TitanSwitch({ value, onValueChange, disabled, label, hint, testID }: { value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean; label: string; hint?: string; testID?: string }) {
  const reduced = useReducedMotion();
  const x = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) x.setValue(value ? 1 : 0);
    else Animated.timing(x, { toValue: value ? 1 : 0, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [value, reduced, x]);
  return (
    <Tap
      haptics={false}
      disabled={disabled}
      onPress={() => {
        haptic("selection");
        onValueChange(!value);
      }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      testID={testID}
      style={styles.hit}
    >
      <Animated.View style={[styles.track, { backgroundColor: x.interpolate({ inputRange: [0, 1], outputRange: [colors.bg4, colors.cySoft] }), borderColor: x.interpolate({ inputRange: [0, 1], outputRange: [colors.line3, colors.cy] }) }]}>
        <Animated.View style={[styles.knob, { backgroundColor: x.interpolate({ inputRange: [0, 1], outputRange: [colors.tx3, colors.cy] }), transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [3, W - KNOB - 3 - 2] }) }] }]} />
      </Animated.View>
    </Tap>
  );
}

/** A labelled row with TITAN's switch. */
export function ToggleRow({ label, hint, value, onChange, disabled, last, testID }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; last?: boolean; testID?: string }) {
  return (
    <View style={[styles.row, !last && styles.border]}>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyStrong">{label}</T>
        {hint ? <T variant="small">{hint}</T> : null}
      </View>
      <TitanSwitch value={value} onValueChange={onChange} disabled={disabled} label={label} hint={hint} testID={testID} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.s3, minHeight: TOUCH + 16, paddingHorizontal: space.s4, paddingVertical: space.s3 },
  border: { borderBottomWidth: 1, borderBottomColor: colors.line },
  hit: { minWidth: TOUCH + 8, minHeight: TOUCH, alignItems: "center", justifyContent: "center", borderRadius: 24 },
  track: { width: W, height: H, borderRadius: H / 2, borderWidth: 1, justifyContent: "center" },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2 },
});
