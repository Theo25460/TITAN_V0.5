import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { useSpace } from "../theme/space";
import { colors, radius, space } from "../theme/tokens";
import { Tap } from "./Pressable";

/* A sheet: one tone above the ground, no outline. « plain » draws nothing at all (content on the ground, for a block that only
   needs the spacing); « ruled » is a block on the ground under a hairline, the way a list is set in a printed programme; « accent » and « amber » are washes for the one block of a screen that must stand out. */
type Tone = "default" | "accent" | "amber" | "flat" | "plain" | "ruled";

export function Card({ children, style, tone = "default", onPress, accessibilityLabel, testID, ...rest }: ViewProps & { tone?: Tone; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const theme = useSpace();
  const toneStyle = tone === "accent" ? { backgroundColor: theme.field } : tone === "amber" ? styles.amber : tone === "flat" ? styles.flat : tone === "plain" ? styles.plain : tone === "ruled" ? styles.ruled : null;
  if (onPress)
    return (
      <Tap onPress={onPress} accessibilityLabel={accessibilityLabel} testID={testID} style={[styles.card, toneStyle, style]}>
        {children}
      </Tap>
    );
  return (
    <View style={[styles.card, toneStyle, style]} accessibilityLabel={accessibilityLabel} testID={testID} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bg2, borderRadius: radius.r3, padding: space.s4, overflow: "hidden" },
  amber: { backgroundColor: "#1B160B" },
  flat: { backgroundColor: colors.bg1 },
  plain: { backgroundColor: "transparent", borderRadius: 0, padding: 0, overflow: "visible" },
  ruled: { backgroundColor: "transparent", borderRadius: 0, padding: 0, paddingTop: space.s4, overflow: "visible", borderTopWidth: 1, borderTopColor: colors.line2 },
});
