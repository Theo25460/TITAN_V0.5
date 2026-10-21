import { Pressable as RNPressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { haptic } from "../lib/haptics";
import { colors } from "../theme/tokens";

/** Android ripple + light haptic feedback, the base of every tappable element. */
export function Tap({ style, onPress, haptics = true, rippleColor = "rgba(140,234,242,0.14)", borderless = false, ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; haptics?: boolean; rippleColor?: string; borderless?: boolean }) {
  return (
    <RNPressable
      android_ripple={{ color: rippleColor, borderless, foreground: true }}
      accessibilityRole={rest.accessibilityRole ?? "button"}
      onPress={(e) => {
        if (haptics) haptic("light");
        onPress?.(e);
      }}
      style={({ pressed }) => [style as ViewStyle, pressed && { opacity: 0.92 }, rest.disabled && { opacity: 0.45 }]}
      {...rest}
    />
  );
}
export const pressedOverlay = colors.bg3;
