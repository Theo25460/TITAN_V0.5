import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { colors, radius, space } from "../theme/tokens";
import { Tap } from "./Pressable";

type Tone = "default" | "accent" | "amber" | "flat";

export function Card({ children, style, tone = "default", onPress, accessibilityLabel, testID, ...rest }: ViewProps & { tone?: Tone; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const toneStyle = tone === "accent" ? styles.accent : tone === "amber" ? styles.amber : tone === "flat" ? styles.flat : null;
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
  card: { backgroundColor: colors.bg2, borderRadius: radius.r3, borderWidth: 1, borderColor: colors.line, padding: space.s4, overflow: "hidden" },
  accent: { borderColor: colors.cyLine, backgroundColor: "#0B1A1F" },
  amber: { borderColor: colors.amLine, backgroundColor: "#1A150B" },
  flat: { backgroundColor: colors.bg1 },
});
