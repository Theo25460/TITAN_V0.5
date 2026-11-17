/* A soft vertical darkening over artwork, so text stays readable without cutting the illustration with a hard band. */
import { useId } from "react";
import { StyleSheet } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { colors } from "../theme/tokens";

/** `from` holds down to `start`, then darkens to `to`, reached at `end` (the bottom by default) and held below it: with an early
    `end` the shade is a soft-edged dark plate, for text that must stay readable on the brightest part of a painting. */
export function Shade({ from = 0, to = 0.88, start = 0.25, end = 1, color = colors.bg }: { from?: number; to?: number; start?: number; end?: number; color?: string }) {
  const id = `shade${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    // An explicit size, like a painting: positioned by its four edges only, an <svg> keeps its own size in a browser (the preview).
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 1 1" pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={from} />
          <Stop offset={String(start)} stopColor={color} stopOpacity={from} />
          <Stop offset={String(end)} stopColor={color} stopOpacity={to} />
          <Stop offset="1" stopColor={color} stopOpacity={to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="1" height="1" fill={`url(#${id})`} />
    </Svg>
  );
}
