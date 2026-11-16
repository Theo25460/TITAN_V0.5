import { useRef } from "react";
import { ActivityIndicator, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import { useSpace } from "../theme/space";
import { colors, fonts, radius, TOUCH } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Tap } from "./Pressable";
import { T } from "./Text";

/** « ink »: the button that sits on a slab of the space colour (dark ground, coloured label). */
type Kind = "primary" | "secondary" | "ghost" | "danger" | "amber" | "ink";

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
  // The primary button takes the colour of the space it is in: the same shape everywhere, and a colour that says where you are.
  const theme = useSpace();
  const palette = {
    primary: { bg: theme.accent, fg: theme.ink, border: theme.accent },
    secondary: { bg: colors.bg3, fg: colors.tx, border: colors.bg3 },
    ghost: { bg: "transparent", fg: theme.accent, border: "transparent" },
    danger: { bg: colors.errSoft, fg: colors.err, border: "rgba(242,102,95,0.4)" },
    amber: { bg: colors.am, fg: colors.amInk, border: colors.am },
    ink: { bg: theme.ink, fg: theme.accent, border: theme.ink },
  }[kind];
  const busy = loading || disabled;
  // While an asynchronous action started by this button is still running, a second press is a double tap, not a second intention
  // (V12-41). Quick successive presses of a synchronous action (a "Suivant" button) are never swallowed.
  const inFlight = useRef(false);
  // Two lines keep a row of buttons tidy at the default size. With a large system text size (A22: the longest labels were cut at
  // 200 %), the label wraps freely and the button grows: a truncated action is worse than a taller one.
  const { fontScale } = useWindowDimensions();
  const lines = fontScale > 1.3 ? undefined : 2;
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
        <T variant="title" numberOfLines={lines} style={[styles.label, small && { fontSize: 14 }]} color={palette.fg}>
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
  label: { fontFamily: fonts.textBold, flexShrink: 1, textAlign: "center" },
});
