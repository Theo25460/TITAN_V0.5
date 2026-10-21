/* A soft vertical darkening over artwork, so text stays readable without cutting the illustration with a hard band. */
import { useId } from "react";
import { StyleSheet } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { colors } from "../theme/tokens";

export function Shade({ from = 0, to = 0.88, start = 0.25, color = colors.bg }: { from?: number; to?: number; start?: number; color?: string }) {
  const id = `shade${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 1 1" pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={from} />
          <Stop offset={String(start)} stopColor={color} stopOpacity={from} />
          <Stop offset="1" stopColor={color} stopOpacity={to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="1" height="1" fill={`url(#${id})`} />
    </Svg>
  );
}
