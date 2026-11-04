import { useRef } from "react";
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, fonts, radius, TOUCH } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Tap } from "./Pressable";
import { T } from "./Text";

type Kind = "primary" | "secondary" | "ghost" | "danger" | "amber";

export function Button({ label, onPress, kind = "primary", icon, loading = false, disabled = false, small = false, style, accessibilityHint, testID }: {
  label: string;
  onPress?: () => void | Promise<unknown>;
  kind?: Kind;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}) {
  const palette = {
    primary: { bg: colors.cy, fg: colors.cyInk, border: colors.cy },
    secondary: { bg: colors.bg3, fg: colors.tx, border: colors.line2 },
    ghost: { bg: "transparent", fg: colors.cy, border: "transparent" },
    danger: { bg: colors.errSoft, fg: colors.err, border: "rgba(242,102,95,0.4)" },
    amber: { bg: colors.am, fg: "#1D1302", border: colors.am },
  }[kind];
  const busy = loading || disabled;
  // While an asynchronous action started by this button is still running, a second press is a double tap, not a second intention
  // (V12-41). Quick successive presses of a synchronous action (a "Suivant" button) are never swallowed.
  const inFlight = useRef(false);
  const press = onPress
    ? () => {
        if (inFlight.current) return;
        const result = onPress() as unknown;
        if (result && typeof (result as Promise<unknown>).then === "function") {
          inFlight.current = true;
          const done = () => {
            inFlight.current = false;
          };
          (result as Promise<unknown>).then(done, done);
        }
      }
    : undefined;
  return (
    <Tap
      testID={testID}
      onPress={busy ? undefined : press}
      disabled={busy}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: busy, busy: loading }}
      style={[styles.base, small && styles.small, { backgroundColor: palette.bg, borderColor: palette.border }, style]}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={palette.fg} size="small" /> : icon ? <Icon name={icon} size={small ? 18 : 20} color={palette.fg} strokeWidth={2} /> : null}
        <T variant="title" numberOfLines={2} style={[styles.label, small && { fontSize: 14 }]} color={palette.fg}>
          {label}
        </T>
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: TOUCH + 4, borderRadius: radius.r2, borderWidth: 1, paddingHorizontal: 18, justifyContent: "center", overflow: "hidden" },
  small: { minHeight: TOUCH, paddingHorizontal: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  label: { fontFamily: fonts.textHeavy, flexShrink: 1, textAlign: "center" },
});
